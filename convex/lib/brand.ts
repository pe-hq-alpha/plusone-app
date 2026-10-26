/** The product's name, in one place (the frontend keeps its own copy in src/lib/brand.ts). */
export const BRAND = { name: "PlusOne", appTitle: "PlusOne Events: your plus one for every event", domain: "plusoneevents.site" } as const;

/** The name the activity feed shows for things the app did itself. */
export const APP_ACTOR = BRAND.name;

/** Whether an activity row was the app's own doing, for rows written before `actorKind`. */
export function isAppActor(row: { actorKind?: string; actorLabel: string }): boolean {
  if (row.actorKind) return row.actorKind === "app";
  return row.actorLabel === APP_ACTOR;
}
