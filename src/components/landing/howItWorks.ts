import { BRAND } from "../../lib/brand";
/**
 * The five steps, as the landing page lists them.
 *
 * These lines describe what PlusOne actually does today, and they are the only
 * hand-written description of the product left in the app: the walkthrough people
 * see after signing up points at the real screen instead. Change something in the
 * product and change it here in the same commit.
 */
export const steps = [
  {
    title: "Talk it through",
    line: "Say what you're planning in your own words; it asks what it needs and checks it with you.",
  },
  {
    title: "Say who you need",
    line: "Tick what you're still looking for; anything booked is left alone.",
  },
  {
    title: `${BRAND.name} finds them`,
    line: "Real vendor sites and review pages, read and ranked.",
  },
  {
    title: "Confirm once",
    line: "Every email sent for you, and quietly chased.",
  },
  {
    title: "Compare and book",
    line: "Replies become quotes side by side. You choose.",
  },
];
