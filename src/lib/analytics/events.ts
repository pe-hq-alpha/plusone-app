/**
 * Every event the app sends, and nothing else (autocapture is off). Names and safe
 * scalars only: never a name, an email, an amount or anything a family wrote. Names
 * read as "area.action". The server sends its own from convex/analytics.ts.
 *
 * Path to a plan: intro.seen → setup.started → account.created → setup.finished →
 * plan.first_pass.
 */
export const EVENTS = {
  introSeen: "intro.seen",
  setupStarted: "setup.started",
  accountCreated: "account.created",
  demoOpened: "demo.opened",
  appActive: "app.active",
  ceremonyOpened: "ceremony.opened",
  thisWeekOpened: "this_week.opened",
  giftAdded: "gift.added",
  giftReserved: "gift.reserved",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
