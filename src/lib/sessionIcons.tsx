import {
  Award,
  Baby,
  Balloon,
  Bell,
  BookOpen,
  Briefcase,
  Bus,
  Cake,
  Camera,
  Church,
  Coffee,
  Drama,
  Drum,
  Flame,
  Flower2,
  Footprints,
  Gem,
  Gift,
  GraduationCap,
  HandHeart,
  Heart,
  House,
  KeyRound,
  Lamp,
  Landmark,
  Megaphone,
  Mic,
  Moon,
  Music,
  Palette,
  PartyPopper,
  Presentation,
  Rocket,
  Sparkles,
  Star,
  Sun,
  Tent,
  Ticket,
  Trophy,
  Users,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import type { EventType } from "../../convex/lib/validators";

/** Every icon is drawn at this stroke so it sits with the hairline set. */
export const ICON_STROKE = 1.5;

const ICONS = {
  balloon: [Balloon, "Balloons"],
  cake: [Cake, "Cake"],
  gift: [Gift, "Gifts"],
  party: [PartyPopper, "Party"],
  star: [Star, "Star"],
  baby: [Baby, "Little one"],
  key: [KeyRound, "New keys"],
  home: [House, "Home"],
  lamp: [Lamp, "Lamp"],
  flame: [Flame, "Fire"],
  flowers: [Flower2, "Flowers"],
  bell: [Bell, "Bell"],
  temple: [Landmark, "Temple"],
  church: [Church, "Church"],
  book: [BookOpen, "Scripture"],
  blessing: [HandHeart, "Blessing"],
  heart: [Heart, "Heart"],
  ring: [Gem, "Ring"],
  procession: [Footprints, "Procession"],
  canopy: [Tent, "Canopy"],
  food: [Utensils, "Meal"],
  tea: [Coffee, "Tea and coffee"],
  music: [Music, "Music"],
  drum: [Drum, "Drums"],
  stage: [Drama, "Performance"],
  art: [Palette, "Art"],
  morning: [Sun, "Morning"],
  evening: [Moon, "Evening"],
  photos: [Camera, "Photos"],
  work: [Briefcase, "Work"],
  talk: [Mic, "Talk"],
  workshop: [Presentation, "Workshop"],
  team: [Users, "Team"],
  launch: [Rocket, "Launch"],
  news: [Megaphone, "Announcement"],
  award: [Award, "Awards"],
  trophy: [Trophy, "Contest"],
  ticket: [Ticket, "Entry"],
  study: [GraduationCap, "Graduation"],
  travel: [Bus, "Travel"],
  sparkle: [Sparkles, "Something else"],
} satisfies Record<string, [LucideIcon, string]>;

export type IconKey = keyof typeof ICONS;

/** The picker, in rows a host can scan: celebration, home and faith, food and stage, work. */
export const ICON_ROWS: { title: string; keys: IconKey[] }[] = [
  { title: "Celebrate", keys: ["balloon", "cake", "gift", "party", "star", "baby", "heart", "ring", "photos"] },
  { title: "Home and faith", keys: ["key", "home", "lamp", "flame", "flowers", "bell", "temple", "church", "book", "blessing", "procession", "canopy"] },
  { title: "Food, music and stage", keys: ["food", "tea", "music", "drum", "stage", "art", "morning", "evening", "travel"] },
  { title: "Work and campus", keys: ["work", "talk", "workshop", "team", "launch", "news", "award", "trophy", "ticket", "study", "sparkle"] },
];

export function iconLabel(key: IconKey): string {
  return ICONS[key][1];
}

export function iconComponent(key: IconKey): LucideIcon {
  return ICONS[key][0];
}

const isIconKey = (k: string | undefined): k is IconKey => Boolean(k && k in ICONS);

// Words in a part's name, and the icon they suggest. First match wins, so the specific comes before the general.
const FROM_NAME: [RegExp, IconKey][] = ([
  [/cake|birthday|bday/, "cake"],
  [/griha|pravesh|pravesam|housewarming|house warming|gruhapravesam/, "key"],
  [/homam|havan|hawan|yagna|agni|sacred fire|pheras?/, "flame"],
  [/pooja|puja|aarti|satyanarayan|ganapati/, "lamp"],
  [/naming|namakaran|cradle|baby|valaikappu|godh|seemantham/, "baby"],
  [/keynote|talk|panel|speech|fireside/, "talk"],
  [/workshop|training|breakout|session|demo/, "workshop"],
  [/launch|unveil|reveal/, "launch"],
  [/award|felicitation|prize/, "award"],
  [/hackathon|contest|competition|quiz|tournament/, "trophy"],
  [/offsite|team|town hall|all hands|standup/, "team"],
  [/registration|check in|entry|gate/, "ticket"],
  [/convocation|graduation|farewell/, "study"],
  [/breakfast|lunch|dinner|feast|sadhya|meal|banquet|buffet/, "food"],
  [/tea|coffee|high tea|snacks/, "tea"],
  [/sangeet|dj|music|concert|band|garba|dandiya/, "music"],
  [/baraat|procession/, "procession"],
  [/dhol|dholki/, "drum"],
  [/haldi|mehndi|mehendi/, "flowers"],
  [/engagement|roka|nichayathartham|ring/, "ring"],
  [/nikah|anand karaj|scripture/, "book"],
  [/church|mass/, "church"],
  [/temple|gurdwara/, "temple"],
  [/chuppah|mandap/, "canopy"],
  [/blessing|ashirvad/, "blessing"],
  [/reception|party|celebration|bash|mixer/, "party"],
  [/dance|drama|cultural|performance|skit/, "stage"],
  [/photo|portrait/, "photos"],
  [/travel|transfer|bus|pickup/, "travel"],
  [/morning|sunrise/, "morning"],
  [/night|evening/, "evening"],
] as [RegExp, IconKey][]).map(([re, key]) => [new RegExp(`\\b(?:${re.source})\\b`), key]);

const BY_TYPE: Partial<Record<EventType, IconKey>> = {
  birthday: "balloon",
  housewarming: "key",
  naming_ceremony: "baby",
  pooja: "lamp",
  anniversary: "heart",
  engagement: "ring",
  baby_shower: "baby",
  graduation: "study",
  office_party: "party",
  team_offsite: "team",
  product_launch: "launch",
  conference: "talk",
  college_fest: "stage",
  community_festival: "flowers",
  party: "party",
  wedding: "heart",
};

/** The icon to draw for a part: the one the host chose, else what its name suggests, else the event's own. */
export function sessionIcon(session: { icon?: string; kind?: string; name: string }, eventType?: EventType): LucideIcon {
  if (isIconKey(session.icon)) return ICONS[session.icon][0];
  const words = ` ${`${session.kind ?? ""} ${session.name}`.toLowerCase().replace(/[^a-z]+/g, " ")} `;
  const hit = FROM_NAME.find(([re]) => re.test(words));
  const key = hit?.[1] ?? (eventType && BY_TYPE[eventType]) ?? "sparkle";
  return ICONS[key][0];
}
