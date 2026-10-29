import { useState } from "react";
import { callHref, whatsappHref } from "../lib/contact";

/**
 * WhatsApp and Call for a vendor: WhatsApp opens with the first message written, Call
 * dials. A sample vendor has no number, so nobody real is ever messaged; its buttons say
 * what would happen instead.
 */
export function ContactLinks({
  phone,
  whatsapp,
  text,
  sample = false,
  className = "",
}: {
  phone?: string;
  whatsapp?: string;
  text: string;
  sample?: boolean;
  className?: string;
}) {
  const [note, setNote] = useState(false);
  if (sample) {
    return (
      <span className={`inline-flex flex-wrap items-center gap-x-2 ${className}`}>
        <button type="button" className="underline decoration-line hover:text-accent" onClick={() => setNote((n) => !n)}>
          WhatsApp
        </button>
        <button type="button" className="underline decoration-line hover:text-accent" onClick={() => setNote((n) => !n)}>
          Call
        </button>
        {note && (
          <span role="status" className="basis-full text-[11px] font-normal text-quiet">
            A sample vendor, so nothing opens. On a real event, WhatsApp opens with your message ready to send.
          </span>
        )}
      </span>
    );
  }
  const chat = whatsappHref(whatsapp ?? phone, text);
  const call = callHref(phone ?? whatsapp);
  if (!chat && !call) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-2 ${className}`}>
      {chat && (
        <a href={chat} target="_blank" rel="noreferrer" className="underline decoration-line hover:text-accent">
          WhatsApp
        </a>
      )}
      {call && (
        <a href={call} className="underline decoration-line hover:text-accent">
          Call
        </a>
      )}
    </span>
  );
}
