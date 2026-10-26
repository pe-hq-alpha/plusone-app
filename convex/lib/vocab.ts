// The fixed vocabulary of an event's parts: the vendor needs a part can create and the
// kinds of ceremony that pick its picture and icon. Shared by the web app and the server.

/** The vendor needs a ceremony can create. Each maps to one vendor category in the app. */
export const VENDOR_NEEDS = {
  venue: { category: "Venue", title: "Venue" },
  catering: { category: "Catering", title: "Catering" },
  photography: { category: "Photographer", title: "Photography" },
  videography: { category: "Videographer", title: "Videography" },
  decor: { category: "Decor & Florals", title: "Decor & florals" },
  music: { category: "Music/DJ", title: "Music / DJ" },
  live_band: { category: "Live band", title: "Live band" },
  entertainment: { category: "Entertainment", title: "Entertainment" },
  sound_lighting: { category: "AV & sound", title: "Sound & lighting" },
  officiant: { category: "Officiant", title: "Officiant" },
  celebrant: { category: "Celebrant", title: "Celebrant" },
  makeup_hair: { category: "Makeup & Hair", title: "Makeup & hair" },
  mehndi_artist: { category: "Mehndi artist", title: "Mehndi artist" },
  attire: { category: "Attire", title: "Outfits" },
  cake: { category: "Cake", title: "Cake & desserts" },
  bar: { category: "Bar", title: "Bar" },
  transport: { category: "Transport", title: "Transport" },
  stationery: { category: "Stationery", title: "Invitations" },
  fireworks: { category: "Fireworks", title: "Fireworks" },
  childcare: { category: "Childcare", title: "Childcare" },
  rentals: { category: "Rentals", title: "Tents, chairs & rentals" },
  gifting: { category: "Gifting", title: "Return gifts" },
  accommodation: { category: "Accommodation", title: "Stay" },
  event_staff: { category: "Event staff", title: "Event staff" },
  emcee: { category: "Emcee", title: "Emcee" },
} as const;

export type VendorNeedKey = keyof typeof VENDOR_NEEDS;
export const VENDOR_NEED_KEYS = Object.keys(VENDOR_NEEDS) as [VendorNeedKey, ...VendorNeedKey[]];

/** What kind of ceremony a part is, which drives its default icon. */
export const CEREMONY_KINDS = [
  "haldi",
  "mehndi",
  "sangeet",
  "procession",
  "fire",
  "nikah",
  "gurdwara",
  "chuppah",
  "church",
  "engagement",
  "puja",
  "dinner",
  "reception",
  "tea",
  "temple",
  "signing",
] as const;
export type CeremonyKind = (typeof CEREMONY_KINDS)[number];
