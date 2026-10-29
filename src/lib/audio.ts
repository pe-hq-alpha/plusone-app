import { encodeWav } from "../../convex/lib/wav";

/**
 * Any recording the browser can play (a voice note, a phone's call recording in m4a or mp3)
 * as the 16 kHz mono WAV Muse Voice Transcribe takes.
 */
export async function toWav16k(recording: Blob): Promise<Uint8Array> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData((await recording.arrayBuffer()).slice(0));
    const channels: Float32Array[] = [];
    for (let i = 0; i < decoded.numberOfChannels; i++) channels.push(decoded.getChannelData(i).slice(0));
    return encodeWav(channels, decoded.sampleRate, 16000);
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

/** A call's turns as plain text, a line per turn: "Speaker A: …". */
export function callText(vendor: string, turns: { speaker?: string; text: string }[]): string {
  const lines = turns.filter((t) => t.text.trim()).map((t) => `${t.speaker ? `Speaker ${t.speaker}` : "Speaker"}: ${t.text.trim()}`);
  return `A recorded call with ${vendor}, speaker by speaker:\n${lines.join("\n")}`;
}
