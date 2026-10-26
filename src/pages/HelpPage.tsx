import { useMemo, useState } from "react";
import { HELP_TOPICS } from "../lib/help";

/** Help: a search across every answer, then the topics, each question opening in place. */
export function HelpPage() {
  const [query, setQuery] = useState("");
  const topics = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return HELP_TOPICS;
    return HELP_TOPICS.map((t) => ({
      ...t,
      entries: t.entries.filter((e) => words.every((w) => `${e.ask} ${e.answer}`.toLowerCase().includes(w))),
    })).filter((t) => t.entries.length);
  }, [query]);

  return (
    <div className="max-w-[48rem]">
      <h1 className="text-[2.2rem] leading-tight">Help</h1>
      <label className="mt-4 block">
        <span className="sr-only">Search help</span>
        <input type="search" className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search help, e.g. quotes, RSVP, currency" />
      </label>
      {!query && (
        <nav aria-label="Topics" className="mt-4 flex flex-wrap gap-2">
          {HELP_TOPICS.map((t) => (
            <a key={t.topic} href={`#${slug(t.topic)}`} className="rounded-full bg-cream px-3 py-1 text-sm text-muted shadow-[inset_0_0_0_1px_var(--color-line)] hover:text-accent">
              {t.topic}
            </a>
          ))}
        </nav>
      )}
      <div className="mt-6 grid gap-8">
        {topics.length === 0 && <p className="text-sm text-muted">Nothing matches that. Try another word, or use Share feedback in the sidebar.</p>}
        {topics.map((t) => (
          <section key={t.topic} id={slug(t.topic)} aria-labelledby={`${slug(t.topic)}-h`} className="scroll-mt-6">
            <h2 id={`${slug(t.topic)}-h`} className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">{t.topic}</h2>
            <div className="mt-2 border-t border-line">
              {t.entries.map((e) => (
                <details key={e.ask} className="group border-b border-line py-3.5" open={Boolean(query)}>
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-medium text-ink marker:hidden">
                    {e.ask}
                    <span className="mt-0.5 text-quiet transition group-open:rotate-90" aria-hidden="true">›</span>
                  </summary>
                  <p className="mt-2 leading-relaxed text-muted">{e.answer}</p>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
