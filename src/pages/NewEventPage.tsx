import { useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Link, useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { toCreateArgs, withDefaults, type Facts } from "../../convex/lib/wizard";
import { PlusOneLockup } from "../components/brand/Wordmarks";
import { record } from "../lib/analytics/client";
import { EVENTS } from "../lib/analytics/events";
import { BRAND } from "../lib/brand";
import "../styles/planning-chat.css";
import { ThemeFooter } from "../components/ui/ThemeFooter";

const EXAMPLES = [
  "Amma's 60th in Chennai in January, a homam at home and lunch for about 120",
  "A griha pravesam for our new flat in Whitefield, early February",
  "Our office Diwali party in Gurugram, about 150 people",
];

const LABEL: Record<string, string> = { eventType: "What it is", host: "Who is hosting", city: "Where", date: "When", guests: "How many", budget: "Budget" };

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const say = (e: unknown) => (e instanceof ConvexError && typeof e.data === "string" ? e.data : "That didn't go through. Try again in a moment.");

/**
 * Planning something new, as a conversation: the host says what they're planning in their
 * own words, and PlusOne asks for what it still needs, reads back what it gathered and
 * points out anything that can't be right, until the host has confirmed every line. Then
 * the plan is built. The full form stays one click away.
 */
export function NewEventPage() {
  const chat = useQuery(api.planningChat.mine);
  const send = useAction(api.planningChat.send);
  const reset = useMutation(api.planningChat.reset);
  const create = useMutation(api.events.create);
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState<"sending" | "building" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const placeholder = useMemo(() => EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)], []);

  const messages = chat?.messages ?? [];
  const started = messages.length > 1;
  // After a read-back, one tap confirms it all.
  const last = messages.at(-1);
  const lastIsReadBack = last?.from === "plusone" && last.text.includes("Let me check I have this right");

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, pending]);

  async function submit(words: string) {
    const content = words.trim();
    if (!content || busy) return;
    if (!started) record(EVENTS.setupStarted, { mode: "conversation" });
    setError(null);
    setPending(content);
    setText("");
    setBusy("sending");
    try {
      await send({ text: content, today: today() });
    } catch (e) {
      setError(say(e));
      setText(content);
    } finally {
      setPending(null);
      setBusy(null);
      inputRef.current?.focus();
    }
  }

  async function build() {
    if (!chat?.ready) return;
    setError(null);
    setBusy("building");
    try {
      const { facts } = withDefaults(JSON.parse(chat.facts) as Facts);
      const eventId = await create(toCreateArgs(facts, { country: facts.currency === "INR" ? "India" : undefined }));
      await reset({});
      navigate(`/e/${eventId}?welcome=1`);
    } catch (e) {
      setError(say(e));
      setBusy(null);
    }
  }

  return (
    <main id="main" className="pc">
      <header className="pc__top">
        <Link to="/" className="text-[1.3rem]" aria-label={`${BRAND.name} home`}>
          <PlusOneLockup />
        </Link>
        <div className="flex items-center gap-4 text-sm">
          {started && (
            <button type="button" className="text-muted underline-offset-4 hover:text-accent hover:underline" onClick={() => void reset({})} disabled={busy !== null}>
              Start again
            </button>
          )}
          <Link to="/new/manual" className="text-muted underline-offset-4 hover:text-accent hover:underline">
            Fill it in by hand
          </Link>
        </div>
      </header>

      <div className="pc__grid">
        <section className="pc__talk" aria-label={`Planning with ${BRAND.name}`}>
          <h1 className="pc__title">Let&rsquo;s plan your event</h1>
          <ol className="pc__messages" aria-live="polite">
            {messages.map((m, i) => (
              <li key={i} className={`pc__msg pc__msg--${m.from}`}>
                {m.from === "plusone" && <span className="pc__who">{BRAND.name}</span>}
                <p>{m.text}</p>
              </li>
            ))}
            {pending && (
              <li className="pc__msg pc__msg--host">
                <p>{pending}</p>
              </li>
            )}
            {busy === "sending" && (
              <li className="pc__msg pc__msg--plusone pc__msg--thinking" aria-label="Reading what you wrote">
                <span className="pc__who">{BRAND.name}</span>
                <span className="pc__dots" aria-hidden="true"><i /><i /><i /></span>
              </li>
            )}
          </ol>
          <div ref={endRef} />

          {error && <p role="alert" className="mt-3 text-sm text-bad">{error}</p>}

          {chat?.ready ? (
            <div className="pc__ready">
              <button type="button" className="btn-primary" onClick={() => void build()} disabled={busy !== null}>
                {busy === "building" ? "Setting out your plan…" : "Build the plan"}
              </button>
              <span className="text-sm text-muted">Or tell me what to change.</span>
            </div>
          ) : (
            lastIsReadBack &&
            !busy && (
              <div className="pc__quick" role="group" aria-label="Quick replies">
                <button type="button" onClick={() => void submit("Yes, that's all correct.")}>Yes, that's right</button>
                <button type="button" onClick={() => inputRef.current?.focus()}>Something's off</button>
              </div>
            )
          )}

          <form
            className="pc__compose"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(text);
            }}
          >
            <label htmlFor="pc-input" className="sr-only">Your reply</label>
            <textarea
              id="pc-input"
              ref={inputRef}
              rows={started ? 2 : 3}
              className="input pc__input"
              value={text}
              maxLength={1200}
              placeholder={started ? "Your answer" : `For example: ${placeholder}`}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit(text);
                }
              }}
              autoFocus
            />
            <button type="submit" className="btn-primary btn-sm" disabled={!text.trim() || busy !== null}>
              Send
            </button>
          </form>
        </section>

        <aside className="pc__card" aria-label="What I have so far">
          <h2 className="pc__card-title">So far</h2>
          <ul>
            {(chat?.lines ?? []).map((l) => (
              <li key={l.field} className={`pc__line ${l.confirmed ? "is-confirmed" : l.text ? "is-known" : ""}`}>
                <span className="pc__tick" aria-hidden="true">{l.confirmed && <Check size={13} strokeWidth={2.2} />}</span>
                <span className="min-w-0">
                  <span className="pc__label">{LABEL[l.field]}</span>
                  <span className="pc__value">{l.text ?? "Not yet"}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="pc__hint">
            {chat?.ready ? "Everything is confirmed." : "A tick means you've confirmed it. Nothing is set up until you build the plan."}
          </p>
        </aside>
      </div>
      <ThemeFooter className="mt-10" />
    </main>
  );
}
