import { useEffect, useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { encodeWav } from "../../convex/lib/wav";

type Props = {
  eventId?: Id<"events">;
  onText: (text: string) => void;
  disabled?: boolean;
};

/**
 * A small microphone button that sits beside a text box. People press to
 * speak, press again to stop, and the words appear in the box for them to
 * check and send. The recording is turned into text, then deleted.
 */
export function VoiceButton({ eventId, onText, disabled }: Props) {
  const uploadUrl = useMutation(api.voiceBrief.uploadUrl);
  const transcribe = useAction(api.voiceBrief.transcribe);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [recording, setRecording] = useState(false);
  const [working, setWorking] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hasUsed, setHasUsed] = useState(() => {
    try {
      return window.localStorage.getItem("voiceBriefUsed") === "1";
    } catch {
      return false;
    }
  });

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  useEffect(() => {
    const ok =
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof MediaRecorder !== "undefined" &&
      typeof AudioContext !== "undefined";
    setSupported(ok);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (supported === false || supported === null) return null;

  const maxSeconds = 120;

  function stopTracks() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function clearTimers() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  async function startRecording() {
    if (disabled || recording || working) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        void handleStop();
      };
      recorder.start();
      setRecording(true);
      startRef.current = Date.now();
      setSeconds(0);
      timerRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startRef.current) / 1000);
        setSeconds(Math.min(elapsed, maxSeconds));
      }, 250);
      timeoutRef.current = window.setTimeout(() => {
        if (recorderRef.current?.state === "recording") {
          setError("That was too long. Keep it under 2 minutes, or type it.");
          recorderRef.current.stop();
        }
      }, maxSeconds * 1000);
    } catch (e) {
      const err = e as DOMException;
      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
        setError("Allow the microphone to speak your plan, or type it.");
      } else {
        setError("The microphone didn't start. Try again, or type it.");
      }
      stopTracks();
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
    clearTimers();
    setRecording(false);
  }

  async function handleStop() {
    clearTimers();
    setRecording(false);
    const chunks = chunksRef.current.slice();
    chunksRef.current = [];
    const blob = new Blob(chunks, { type: recorderRef.current?.mimeType || "audio/webm" });
    // The microphone can go as soon as the recording is in hand; decoding doesn't need it.
    stopTracks();

    if (blob.size === 0) {
      setError("We didn't hear anything. Try again, or type it.");
      return;
    }

    setWorking(true);
    setError(null);
    let ctx: AudioContext | null = null;
    try {
      const arrayBuf = await blob.arrayBuffer();
      ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
      const channels: Float32Array[] = [];
      for (let i = 0; i < decoded.numberOfChannels; i++) {
        channels.push(decoded.getChannelData(i).slice(0));
      }
      const wav = encodeWav(channels, decoded.sampleRate, 16000);

      const url = await uploadUrl({});
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav as unknown as BodyInit });
      if (!res.ok) throw new Error("upload failed");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      const result = await transcribe({ storageId, ...(eventId ? { eventId } : {}) });
      const text = result.text?.trim();
      if (!text) {
        setError("We couldn't hear that. Try again, or type it.");
      } else {
        onText(text);
        try {
          window.localStorage.setItem("voiceBriefUsed", "1");
        } catch {
          // ignore
        }
        setHasUsed(true);
      }
    } catch (e) {
      if (e instanceof ConvexError && typeof e.data === "string") setError(e.data);
      else if (e instanceof Error && e.message === "upload failed") setError("We couldn't send that recording. Try again, or type it.");
      else setError("We couldn't hear that. Try again, or type it.");
    } finally {
      setWorking(false);
      if (ctx) {
        try {
          await ctx.close();
        } catch {
          // ignore
        }
      }
      stopTracks();
    }
  }

  const label = recording ? "Stop recording" : "Speak instead of typing";
  const status = recording ? `${formatTime(seconds)} · Recording` : working ? "Turning it into text…" : null;

  // `contents` lets the note and errors take a line of their own inside a flex row (the
  // planning chat's compose bar) as well as under a plain box, without widening the button.
  return (
    <span className="contents">
      <span className="inline-flex items-center gap-2">
        <button
          type="button"
          className={`btn-quiet btn-sm ${recording ? "bg-accent-soft text-accent" : ""}`}
          aria-label={label}
          disabled={Boolean(disabled && !recording) || working}
          onClick={() => {
            if (recording) stopRecording();
            else void startRecording();
          }}
        >
          <MicrophoneIcon recording={recording} />
          {recording ? "Stop" : "Speak"}
        </button>
        <span className="text-xs text-muted" aria-live="polite">
          {status}
        </span>
      </span>
      {error && (
        <span role="alert" className="order-last block basis-full text-xs text-bad">
          {error}
        </span>
      )}
      {!hasUsed && !error && !recording && !working && (
        <span className="order-last block basis-full text-xs text-quiet">Your recording is turned into text, then deleted.</span>
      )}
    </span>
  );
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function MicrophoneIcon({ recording }: { recording: boolean }) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z" fill={recording ? "currentColor" : "none"} />
      <path d="M19 10a7 7 0 0 1-14 0" />
      <path d="M12 19v3" />
      <path d="M8 22h8" />
    </svg>
  );
}
