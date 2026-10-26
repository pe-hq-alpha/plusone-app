/**
 * What a family would like PlusOne to handle for them, chosen while setting up a plan.
 * It colours plan writing and leans the order of "This week" without overriding anything
 * urgent. Stored on `weddings.helpWith`.
 */
export const HELP_WITH = [
  { key: "find", label: "Finding the right vendors", leans: "book" },
  { key: "chase", label: "Writing to vendors and chasing replies", leans: "reply" },
  { key: "weigh", label: "Weighing quotes against the budget", leans: "choose" },
  { key: "guests", label: "Invitations and guest replies", leans: "rsvp" },
  { key: "schedule", label: "Settling the days and timings", leans: "times" },
  { key: "family", label: "Keeping the family updated", leans: null },
  { key: "ground", label: "Someone on the ground to visit and book", leans: null },
] as const;

export type HelpWithKey = (typeof HELP_WITH)[number]["key"];
export const HELP_WITH_KEYS = new Set<string>(HELP_WITH.map((h) => h.key));

/** The labels for the keys a wedding chose, for a prompt or a summary. */
export function helpWithLabels(keys: readonly string[] | undefined): string[] {
  return (keys ?? []).map((k) => HELP_WITH.find((h) => h.key === k)?.label).filter((l): l is NonNullable<typeof l> => Boolean(l));
}
