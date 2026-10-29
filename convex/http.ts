import { httpRouter } from "convex/server";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { components, internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { verifySvix } from "./lib/svix";
import { extractEmail } from "./lib/text";
import { checkDigestUnsubscribe } from "./appEmails";
import { parseVisit, sameSecret } from "./lib/visits";
import type { Id } from "./_generated/dataModel";

const http = httpRouter();

auth.addHttpRoutes(http);

/**
 * AgentMail -> Svix webhook. Verify, claim (dedupe on message_id), schedule the
 * heavy ingest in a node action, and return 200 fast so Svix does not retry.
 */
http.route({
  path: "/agentmail/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const rawBody = await request.text();
    const secret = process.env.AGENTMAIL_WEBHOOK_SECRET;
    // Without the secret nothing can be verified, so nothing is accepted: an unsigned
    // request here could plant a reply in any event's inbox.
    if (!secret) {
      console.error("AGENTMAIL_WEBHOOK_SECRET is not set; refusing the webhook");
      return new Response("webhook secret not configured", { status: 503 });
    }
    if (!(await verifySvix(secret, request.headers, rawBody))) {
      return new Response("invalid signature", { status: 401 });
    }

    let payload: WebhookPayload;
    try {
      payload = JSON.parse(rawBody) as WebhookPayload;
    } catch {
      return new Response("invalid json", { status: 400 });
    }
    if (payload.event_type !== "message.received" || !payload.message) {
      return json({ ok: true, ignored: payload.event_type ?? "unknown" });
    }
    const m = payload.message;
    if (!m.message_id || !m.inbox_id) return new Response("missing message_id/inbox_id", { status: 400 });

    const rawFrom = m.from_ ?? m.from;
    const fromAddress = extractEmail(Array.isArray(rawFrom) ? rawFrom[0] : rawFrom);
    const webhookEventId = payload.event_id ?? `evt_${m.message_id}`;

    const claim = await ctx.runMutation(internal.inbound.claim, {
      agentmailMessageId: m.message_id,
      webhookEventId,
      inboxId: m.inbox_id,
      threadId: m.thread_id ?? undefined,
      fromAddress,
    });
    if (claim.status === "duplicate") return json({ ok: true, duplicate: true });

    await ctx.scheduler.runAfter(0, internal.agentmail.ingestInbound, {
      inboundEventId: claim.inboundEventId,
      eventId: claim.eventId ?? undefined,
      inboxId: m.inbox_id,
      messageId: m.message_id,
      threadId: m.thread_id ?? undefined,
      fromAddress,
      subject: (m.subject ?? "(no subject)").slice(0, 500),
      text: m.text ?? undefined,
      html: m.html ? m.html.slice(0, 200_000) : undefined,
      extractedText: m.extracted_text ?? undefined,
      attachments: (m.attachments ?? []).slice(0, 10).map((a) => ({
        attachmentId: a.attachment_id,
        filename: a.filename ?? undefined,
        contentType: a.content_type ?? undefined,
        size: typeof a.size === "number" ? a.size : undefined,
        inline: a.inline ?? undefined,
      })),
    });
    return json({ ok: true });
  }),
});

// Static site catch-all must be registered LAST so exact routes above win.
// (PostHog's /ingest proxy lives on Cloudflare, in functions/ingest, which knows each visitor's country.)

/** One click from the bottom of the weekly update (and mail apps' own Unsubscribe button). */
const unsubscribe = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const memberId = url.searchParams.get("u") ?? "";
  const token = url.searchParams.get("t") ?? "";
  const valid = url.searchParams.get("topic") === "digest" && /^[a-z0-9]{20,40}$/.test(memberId) && (await checkDigestUnsubscribe(memberId, token));
  if (valid) await ctx.runMutation(internal.digest.stop, { memberId: memberId as Id<"members"> });
  const page = (title: string, body: string) =>
    // The site's own night colours: ink ground, marigold for the one line that matters.
    `<!doctype html><html lang="en"><head><title>${title} · PlusOne Events</title>` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"></head>` +
    `<body style="margin:0;min-height:100vh;background:#11141c;color:#e8eaf0;font:16px/1.6 'Helvetica Neue',Arial,sans-serif">` +
    `<main style="max-width:30rem;padding:18vh 20px 0;margin:0 auto"><p style="margin:0 0 20px;font:400 22px Georgia,serif">Plus<i style="color:#f4b53a">One</i></p>` +
    `<h1 style="margin:0 0 10px;font:400 30px Georgia,serif;color:#f4b53a">${title}</h1><p style="margin:0;color:#b3b7c3">${body}</p></main></body></html>`;
  return new Response(
    valid ? page("You won't get the weekly update again.", "You'll still hear about your own events: replies from vendors and guests, and anything you ask for.") : page("That link didn't work.", "It may be incomplete. Try it again from the email, or reply to any email from us."),
    { status: valid ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8" } },
  );
});
http.route({ path: "/email/unsubscribe", method: "GET", handler: unsubscribe });
http.route({ path: "/email/unsubscribe", method: "POST", handler: unsubscribe });

/**
 * The visit log: one page load, sent by the Cloudflare middleware (functions/_middleware.ts)
 * with the shared secret. Without VISIT_LOG_SECRET nothing is accepted.
 */
http.route({
  path: "/visit",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.VISIT_LOG_SECRET;
    if (!secret) return new Response("not configured", { status: 503 });
    if (!sameSecret(request.headers.get("x-visit-secret") ?? "", secret)) {
      return new Response("unauthorized", { status: 401 });
    }
    const raw = await request.text();
    if (raw.length > 8192) return new Response("too large", { status: 413 });
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return new Response("invalid json", { status: 400 });
    }
    const visit = parseVisit(body, Date.now());
    if (!visit) return new Response("invalid visit", { status: 400 });
    const { stored } = await ctx.runMutation(internal.visits.record, visit);
    return json({ ok: true, stored }, stored ? 200 : 429);
  }),
});

/** For the uptime check: 200 when the backend and its database answer. */
http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const status = await ctx.runQuery(internal.health.status, {});
    return new Response(JSON.stringify({ ok: true, ...status }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }),
});

registerStaticRoutes(http, components.staticHosting);

export default http;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

type WebhookPayload = {
  event_type?: string;
  event_id?: string;
  message?: {
    inbox_id?: string;
    thread_id?: string | null;
    message_id?: string;
    from_?: string | string[];
    from?: string | string[];
    to?: string[];
    subject?: string | null;
    text?: string | null;
    html?: string | null;
    extracted_text?: string | null;
    attachments?: {
      attachment_id: string;
      filename?: string | null;
      content_type?: string | null;
      size?: number | null;
      inline?: boolean | null;
    }[];
  };
};
