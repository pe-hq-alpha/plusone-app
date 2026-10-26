#!/usr/bin/env node
// One-off: registers an AgentMail webhook pointing at your Convex deployment.
// Usage: AGENTMAIL_API_KEY=... node scripts/agentmail-setup.mjs https://<deployment>.convex.site [pod-id]
// With a pod id, the webhook only hears about that pod's inboxes, so production and dev
// never receive each other's mail. Use the same id as the deployment's AGENTMAIL_POD_ID.
// Prints the webhook secret ONCE to stdout. Set it with:
//   npx convex env set AGENTMAIL_WEBHOOK_SECRET=<secret>
import { AgentMailClient } from "agentmail";

const site = process.argv[2];
const podId = process.argv[3];
if (!site || !/^https:\/\//.test(site)) {
  console.error("Usage: node scripts/agentmail-setup.mjs https://<deployment>.convex.site [pod-id]");
  process.exit(1);
}
if (!process.env.AGENTMAIL_API_KEY) {
  console.error("Set AGENTMAIL_API_KEY in the environment for this command only.");
  process.exit(1);
}
const am = new AgentMailClient({ apiKey: process.env.AGENTMAIL_API_KEY });
const url = `${site.replace(/\/$/, "")}/agentmail/webhook`;

const existing = await am.webhooks.list();
const items = existing.webhooks ?? existing.items ?? [];
const dup = items.find((w) => w.url === url);
if (dup) {
  console.log(`Webhook already exists for ${url} (id ${dup.webhookId ?? dup.webhook_id}).`);
  console.log("Secrets are only shown at creation. Delete it in the AgentMail dashboard to rotate.");
  process.exit(0);
}
const created = await am.webhooks.create({ url, eventTypes: ["message.received"], ...(podId ? { podIds: [podId] } : {}) });
console.log(`Created webhook ${created.webhookId ?? created.webhook_id} -> ${url}${podId ? ` (pod ${podId} only)` : ""}`);
console.log(`AGENTMAIL_WEBHOOK_SECRET=${created.secret}`);
