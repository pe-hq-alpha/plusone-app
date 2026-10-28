import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Nudge vendors who have gone quiet; escalate after three nudges.
crons.hourly("vendor follow-ups", { minuteUTC: 7 }, internal.followups.tick, {});

// Clear out old demos, old inbound-email records and searches that died mid-run.
crons.interval("housekeeping", { hours: 1 }, internal.housekeeping.sweep, {});

// Fridays, morning in the Americas and evening in India.
crons.cron("weekly update", "0 14 * * 5", internal.digest.weekly, {});

// Visits older than 180 days, every night at 03:30 UTC.
crons.cron("visit log retention", "30 3 * * *", internal.visits.prune, {});

// Each city's price ranges from listed vendors' published prices.
crons.interval("price bands", { hours: 6 }, internal.marketplace.bands.recompute, {});

export default crons;
