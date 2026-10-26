import { BRAND } from "./brand";
import { isWedding, theEvent } from "./occasion";
import type { EventType } from "./validators";
import { escapeHtml } from "./entities";

/**
 * PlusOne's own email to the people planning: the Friday weekly update. It is written
 * once as a list of blocks and rendered twice, as table-based HTML for mail clients and
 * as plain text.
 */

export type DigestData = {
  firstName: string;
  eventName: string;
  eventType?: EventType;
  appUrl: string;
  unsubscribeUrl: string;
  daysToGo: number;
  comingUp: string[];
  changed: string[];
  waiting: string[];
};

type Email = { subject: string; html: string; text: string };

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

type Block =
  | { kind: "para"; text: string }
  | { kind: "section"; title: string; items: string[] }
  | { kind: "action"; label: string; url: string }
  | { kind: "signoff"; closing: string; names: string };

type Letter = {
  subject: string;
  /** The short line most inboxes show beside the subject. */
  preheader: string;
  blocks: Block[];
  /** Words for the footer's stop link, when the email has one. */
  stopLabel?: string;
  stopUrl?: string;
};

const ACCENT = "#1f2a5c";
const CREAM = "#f6efe4";
const PAPER = "#fffcf7";
const INK = "#1c1f29";
const MUTED = "#5c5f68";
const RULE = "#e7dccb";
const SERIF = "Georgia, 'Times New Roman', Times, serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

export { escapeHtml };

function blockHtml(b: Block): string {
  switch (b.kind) {
    case "para":
      return `<p style="margin:0 0 16px;font-family:${SANS};font-size:16px;line-height:1.6;color:${INK};">${escapeHtml(b.text)}</p>`;
    case "section":
      return (
        `<p style="margin:24px 0 8px;font-family:${SERIF};font-size:18px;line-height:1.3;color:${ACCENT};">${escapeHtml(b.title)}</p>` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 8px;">` +
        b.items
          .map(
            (item) =>
              `<tr><td valign="top" width="18" style="padding:6px 0;font-family:${SANS};font-size:15px;line-height:1.5;color:${ACCENT};">&#8226;</td>` +
              `<td style="padding:6px 0;font-family:${SANS};font-size:15px;line-height:1.5;color:${INK};border-bottom:1px solid ${RULE};">${escapeHtml(item)}</td></tr>`,
          )
          .join("") +
        `</table>`
      );
    case "action":
      return (
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 24px;"><tr>` +
        `<td align="center" bgcolor="${ACCENT}" style="border-radius:999px;background:${ACCENT};">` +
        `<a href="${escapeHtml(b.url)}" target="_blank" style="display:inline-block;padding:13px 28px;font-family:${SANS};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:999px;">${escapeHtml(b.label)}</a>` +
        `</td></tr></table>`
      );
    case "signoff":
      return (
        `<p style="margin:24px 0 0;font-family:${SANS};font-size:16px;line-height:1.6;color:${INK};">${escapeHtml(b.closing)}<br>` +
        `<span style="font-family:${SERIF};font-size:17px;color:${ACCENT};">${escapeHtml(b.names)}</span></p>`
      );
  }
}

function blockText(b: Block): string {
  switch (b.kind) {
    case "para":
      return b.text;
    case "section":
      return `${b.title.toUpperCase()}\n${b.items.map((i) => `  * ${i}`).join("\n")}`;
    case "action":
      return `${b.label}: ${b.url}`;
    case "signoff":
      return `${b.closing}\n${b.names}`;
  }
}

function render(letter: Letter): Email {
  const stop =
    letter.stopUrl && letter.stopLabel
      ? `<br><a href="${escapeHtml(letter.stopUrl)}" style="color:${MUTED};text-decoration:underline;">${escapeHtml(letter.stopLabel)}</a>`
      : "";

  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting">` +
    `<title>${escapeHtml(letter.subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:${CREAM};">` +
    // The preheader: shown in the inbox list, hidden in the opened email.
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${CREAM};">${escapeHtml(letter.preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${CREAM}" style="background:${CREAM};"><tr><td align="center" style="padding:32px 16px;">` +
    `<!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">` +
    `<tr><td style="padding:0 4px 20px;font-family:${SERIF};font-size:26px;line-height:1;color:${ACCENT};letter-spacing:0.01em;">${escapeHtml(BRAND.name)}</td></tr>` +
    `<tr><td bgcolor="${PAPER}" style="background:${PAPER};border:1px solid ${RULE};border-radius:14px;padding:32px 28px;">` +
    letter.blocks.map(blockHtml).join("") +
    `</td></tr>` +
    `<tr><td style="padding:20px 4px 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${MUTED};">` +
    `<span style="font-family:${SERIF};font-size:14px;color:${ACCENT};">${escapeHtml(BRAND.name)}</span>${stop}` +
    `</td></tr></table>` +
    `<!--[if mso]></td></tr></table><![endif]-->` +
    `</td></tr></table></body></html>`;

  const footer = [BRAND.name, letter.stopUrl && letter.stopLabel ? `${letter.stopLabel}: ${letter.stopUrl}` : ""].filter(Boolean).join("\n");
  const text = [...letter.blocks.map(blockText), "--", footer].join("\n\n") + "\n";

  return { subject: letter.subject, html, text };
}

const hello = (name: string) => (name.trim() ? `Hello ${name.trim()},` : "Hello,");

// ---------------------------------------------------------------------------
// The weekly update
// ---------------------------------------------------------------------------

function countdown(d: DigestData): string {
  const days = d.daysToGo;
  // A wedding is "the wedding"; anything else goes by its own name.
  const what = isWedding(d) ? theEvent(d) : d.eventName;
  if (days <= 0) return isWedding(d) ? "The wedding is here." : "The day is here.";
  if (days === 1) return `One day until ${what}.`;
  return `${days} days until ${what}.`;
}

/** The Friday update for one person, or null when there is nothing worth telling them. */
export function digestEmail(d: DigestData): Email | null {
  if (d.comingUp.length === 0 && d.changed.length === 0 && d.waiting.length === 0) return null;

  const n = d.waiting.length;
  const subject =
    n === 0
      ? `${d.eventName}: your week ahead`
      : `${d.eventName}: ${n === 1 ? "one thing needs" : `${n} things need`} you this week`;

  const blocks: Block[] = [
    { kind: "para", text: hello(d.firstName) },
    { kind: "para", text: `${countdown(d)} Here is where things stand this week.` },
  ];
  if (d.waiting.length) blocks.push({ kind: "section", title: "Waiting on you", items: d.waiting });
  if (d.comingUp.length) blocks.push({ kind: "section", title: "Coming up", items: d.comingUp });
  if (d.changed.length) blocks.push({ kind: "section", title: "Since last week", items: d.changed });
  blocks.push({ kind: "action", label: "Open your plan", url: d.appUrl });

  return render({
    subject,
    preheader: countdown(d),
    blocks,
    stopLabel: "Turn off the weekly update",
    stopUrl: d.unsubscribeUrl,
  });
}
