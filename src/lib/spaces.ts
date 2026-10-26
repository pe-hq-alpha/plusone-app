import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";

type Ceremony = NonNullable<FunctionReturnType<typeof api.events.get>>["sessions"][number];

/** The palette a part of the event has kept in its Space (stored as the "Palette" entry of `choices`). */
export const keptPalette = (c: Ceremony) => c.choices?.find((x) => x.label === "Palette");

/** "the event's Space", "the Lunch's Space". */
export const spaceLabel = (ceremony?: string) => (ceremony ? `the ${ceremony}'s Space` : "the event's Space");
