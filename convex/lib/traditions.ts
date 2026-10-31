import type { EventType } from "./validators";
import type { CeremonyKind, VendorNeedKey } from "./vocab";

/**
 * The events of the day PlusOne suggests, checked by hand: for a wedding by its style, and
 * for every other kind of event by what it usually holds. The planning conversation offers
 * them to pick from and the host's own words always win; anything Muse Spark suggests beyond
 * these is marked as a suggestion. A style is only ever chosen by the host, never assumed.
 */

export type CatalogueEvent = {
  /** Unique within its list. */
  key: string;
  name: string;
  /** Other names families use for it, which the conversation recognises. */
  aka?: string[];
  /** One line on what it is, for a host who doesn't know. */
  significance: string;
  kind?: CeremonyKind;
  /** Days from the main day: -1 the day before, 1 the day after. */
  offset: number;
  /** When it usually starts, 24-hour "HH:MM". */
  startTime: string;
  /** Share of the overall guest list it usually draws. */
  guestShare: number;
  needs: VendorNeedKey[];
  /** Offered already ticked; the rest are offered unticked. */
  isDefault: boolean;
};

export type Missed = { title: string; need: VendorNeedKey; why: string };

export type Tradition = {
  id: string;
  label: string;
  /** Words that name it in a host's message. */
  aliases: string[];
  events: CatalogueEvent[];
  oftenMissed: Missed[];
};

const ev = (
  key: string,
  name: string,
  offset: number,
  startTime: string,
  guestShare: number,
  needs: VendorNeedKey[],
  significance: string,
  opts: { kind?: CeremonyKind; aka?: string[]; isDefault?: boolean } = {},
): CatalogueEvent => ({ key, name, offset, startTime, guestShare, needs, significance, isDefault: opts.isDefault ?? true, ...(opts.kind ? { kind: opts.kind } : {}), ...(opts.aka ? { aka: opts.aka } : {}) });

const SOUTH_MISSED: Missed[] = [
  { title: "Nadaswaram and thavil", need: "live_band", why: "Played through the muhurtham; booked early in season" },
  { title: "Return gifts (thamboolam bags)", need: "gifting", why: "For every family that attends" },
  { title: "Rooms for out-of-town family", need: "accommodation", why: "Halls fill their rooms first" },
  { title: "Transport for elders", need: "transport", why: "Between the hall, the temple and the house" },
];

export const TRADITIONS: Tradition[] = [
  {
    id: "tamil_brahmin",
    label: "Tamil Brahmin (Iyer, Iyengar)",
    aliases: ["iyer", "iyengar", "tamil brahmin", "tambram"],
    events: [
      ev("vratham", "Vratham", -1, "07:00", 0.3, ["officiant", "catering"], "Prayers by each family the morning before", { kind: "puja", isDefault: false }),
      ev("janavasam", "Janavasam", -1, "17:00", 0.6, ["decor", "transport", "live_band"], "The groom's welcome procession the evening before", { kind: "procession", aka: ["mappillai azhaippu"], isDefault: false }),
      ev("nichayathartham", "Nichayathartham", -1, "18:30", 0.7, ["officiant", "decor", "catering", "photography"], "The formal engagement between the families", { kind: "engagement", aka: ["nischayathartham", "nichayam"] }),
      ev("reception", "Reception", -1, "19:30", 1, ["venue", "decor", "catering", "photography", "sound_lighting", "makeup_hair"], "Guests meet the couple, with dinner", { kind: "reception" }),
      ev("kashi_yatra", "Kashi Yatra", 0, "06:30", 0.6, ["photography"], "The groom's mock pilgrimage, turned back by the bride's father", { kind: "procession" }),
      ev("oonjal", "Oonjal", 0, "07:00", 0.7, ["decor", "photography"], "The couple on the swing, with songs and coloured rice", { aka: ["unjal"] }),
      ev("muhurtham", "Muhurtham", 0, "07:30", 1, ["venue", "officiant", "catering", "decor", "photography", "videography", "live_band", "makeup_hair"], "Kanyadanam, the mangalyam tied, saptapadi", { kind: "fire", aka: ["kalyanam", "mangalya dharanam"] }),
      ev("nalangu", "Nalangu", 0, "15:00", 0.4, ["photography"], "Light-hearted games between the couple", { isDefault: false }),
    ],
    oftenMissed: [{ title: "Vadhyar (priest) and samagri", need: "officiant", why: "Booked for both days, with the items for each rite" }, ...SOUTH_MISSED],
  },
  {
    id: "tamil",
    label: "Tamil",
    aliases: ["tamil", "chettiar", "mudaliar", "pillai", "nadar", "gounder", "vanniyar"],
    events: [
      ev("pandha_kaal", "Pandha kaal muhurtham", -2, "08:00", 0.2, ["officiant", "decor"], "The pandal post is set, to begin the wedding", { kind: "puja", aka: ["pandhakaal"], isDefault: false }),
      ev("nichayathartham", "Nichayathartham", -1, "18:00", 0.7, ["decor", "catering", "photography"], "The formal engagement between the families", { kind: "engagement", aka: ["nichayam"] }),
      ev("reception", "Reception", -1, "19:30", 1, ["venue", "decor", "catering", "photography", "sound_lighting", "makeup_hair"], "Guests meet the couple, with dinner", { kind: "reception" }),
      ev("muhurtham", "Muhurtham", 0, "08:00", 1, ["venue", "officiant", "catering", "decor", "photography", "videography", "live_band", "makeup_hair"], "The thali is tied, with the wedding feast after", { kind: "fire", aka: ["thali kattu", "kalyanam"] }),
    ],
    oftenMissed: [{ title: "Priest", need: "officiant", why: "For the muhurtham" }, ...SOUTH_MISSED],
  },
  {
    id: "telugu",
    label: "Telugu",
    aliases: ["telugu", "andhra", "telangana"],
    events: [
      ev("pellikuthuru", "Pellikuthuru and Pellikoduku", -1, "09:00", 0.4, ["decor", "photography", "makeup_hair"], "Turmeric and blessings for the bride and the groom", { kind: "haldi" }),
      ev("mehendi", "Mehendi", -1, "16:00", 0.4, ["mehndi_artist", "decor", "music"], "Henna for the bride and family", { kind: "mehndi", isDefault: false }),
      ev("snathakam", "Snathakam and Kasi Yatra", 0, "08:00", 0.5, ["officiant", "photography"], "The groom's sacred thread, then his mock pilgrimage", { kind: "procession" }),
      ev("muhurtham", "Muhurtham: Jeelakarra Bellam and Talambralu", 0, "11:00", 1, ["venue", "officiant", "catering", "decor", "photography", "videography", "live_band", "makeup_hair"], "Cumin and jaggery, the mangalsutra, rice showered on each other", { kind: "fire", aka: ["jeelakarra bellam", "talambralu"] }),
      ev("reception", "Reception", 1, "19:00", 1, ["venue", "decor", "catering", "photography", "sound_lighting"], "Guests meet the couple, with dinner", { kind: "reception" }),
    ],
    oftenMissed: [{ title: "Pandit", need: "officiant", why: "Muhurtham times are set by the pandit" }, ...SOUTH_MISSED.slice(1)],
  },
  {
    id: "kerala",
    label: "Kerala (Malayali)",
    aliases: ["kerala", "malayali", "nair", "ezhava", "menon"],
    events: [
      ev("mehendi", "Mehendi", -1, "17:00", 0.4, ["mehndi_artist", "decor"], "Henna for the bride and family", { kind: "mehndi", isDefault: false }),
      ev("muhurtham", "Muhurtham (thali kettu)", 0, "10:00", 1, ["venue", "officiant", "decor", "photography", "videography", "live_band", "makeup_hair"], "The thali is tied, often at a temple", { kind: "temple", aka: ["thali kettu", "kalyanam"] }),
      ev("sadya", "Sadya", 0, "12:00", 1, ["catering"], "The wedding feast on banana leaf", { kind: "dinner" }),
      ev("reception", "Reception", 0, "18:30", 0.9, ["venue", "decor", "catering", "photography", "sound_lighting"], "Guests meet the couple in the evening", { kind: "reception" }),
    ],
    oftenMissed: [{ title: "Chenda melam", need: "live_band", why: "For the bride's and groom's arrival" }, ...SOUTH_MISSED.slice(1)],
  },
  {
    id: "north_indian",
    label: "North Indian",
    aliases: ["north indian", "hindi", "up", "bihari", "rajasthani"],
    events: [
      ev("roka", "Roka or engagement", -2, "18:00", 0.5, ["decor", "catering", "photography"], "The families seal the match", { kind: "engagement", aka: ["sagai", "tilak"], isDefault: false }),
      ev("haldi", "Haldi", -1, "10:00", 0.4, ["decor", "photography", "catering"], "Turmeric for the bride and the groom", { kind: "haldi" }),
      ev("mehndi", "Mehndi", -1, "14:00", 0.5, ["mehndi_artist", "decor", "music", "catering"], "Henna, songs and the family together", { kind: "mehndi" }),
      ev("sangeet", "Sangeet", -1, "19:30", 0.8, ["venue", "music", "sound_lighting", "decor", "catering", "photography"], "Music and dance by both families", { kind: "sangeet" }),
      ev("baraat", "Baraat and jaimala", 0, "19:00", 0.9, ["live_band", "transport", "decor", "photography"], "The groom's procession, then the garlands", { kind: "procession", aka: ["varmala", "jaimala"] }),
      ev("pheras", "Pheras", 0, "22:00", 0.8, ["officiant", "decor", "catering", "photography", "videography"], "The seven rounds of the fire", { kind: "fire", aka: ["phere", "saat phere"] }),
      ev("vidaai", "Vidaai", 1, "05:00", 0.4, ["transport", "photography"], "The bride's farewell to her family", { aka: ["bidaai"], isDefault: false }),
      ev("reception", "Reception", 1, "19:30", 1, ["venue", "decor", "catering", "photography", "sound_lighting"], "Guests meet the couple, with dinner", { kind: "reception" }),
    ],
    oftenMissed: [
      { title: "Pandit", need: "officiant", why: "For the pheras and the muhurat" },
      { title: "Dhol and band for the baraat", need: "live_band", why: "Booked separately from the DJ" },
      { title: "Ghodi or car for the groom", need: "transport", why: "For the baraat" },
      { title: "Rooms for out-of-town family", need: "accommodation", why: "Booked early in season" },
    ],
  },
  {
    id: "punjabi",
    label: "Punjabi or Sikh",
    aliases: ["punjabi", "sikh", "anand karaj"],
    events: [
      ev("chunni", "Chunni", -2, "17:00", 0.4, ["decor", "catering"], "The groom's family gift the bride her chunni", { kind: "engagement", isDefault: false }),
      ev("mehndi", "Mehndi", -1, "14:00", 0.5, ["mehndi_artist", "decor", "music", "catering"], "Henna, songs and the family together", { kind: "mehndi" }),
      ev("sangeet", "Sangeet", -1, "19:30", 0.8, ["venue", "music", "sound_lighting", "decor", "catering"], "Music and dance by both families", { kind: "sangeet" }),
      ev("jaggo", "Jaggo", -1, "22:30", 0.5, ["live_band"], "A late-night procession with lamps and dhol", { isDefault: false }),
      ev("chooda", "Chooda and vatna", 0, "06:30", 0.3, ["photography", "makeup_hair"], "The bride's bangles and turmeric", { kind: "haldi" }),
      ev("anand_karaj", "Anand Karaj", 0, "10:00", 1, ["officiant", "catering", "photography", "videography", "transport"], "The four laavan at the gurdwara", { kind: "gurdwara", aka: ["laavan"] }),
      ev("doli", "Doli", 0, "16:00", 0.4, ["transport", "photography"], "The bride's farewell", { aka: ["vidaai"], isDefault: false }),
      ev("reception", "Reception", 0, "20:00", 1, ["venue", "decor", "catering", "photography", "sound_lighting", "bar"], "The party, with dinner", { kind: "reception" }),
    ],
    oftenMissed: [
      { title: "Dhol players", need: "live_band", why: "For the baraat and the jaggo" },
      { title: "Granthi and ragis", need: "officiant", why: "For the Anand Karaj" },
      { title: "Bar", need: "bar", why: "For the reception, with licences" },
    ],
  },
  {
    id: "bengali",
    label: "Bengali",
    aliases: ["bengali", "bangali"],
    events: [
      ev("aiburobhaat", "Aiburobhaat", -1, "13:00", 0.4, ["catering"], "The last meal as unmarried, with family", { kind: "dinner", isDefault: false }),
      ev("gaye_holud", "Gaye holud", 0, "08:00", 0.4, ["photography", "decor"], "Turmeric for the bride", { kind: "haldi" }),
      ev("biye", "Biye", 0, "19:00", 1, ["venue", "officiant", "catering", "decor", "photography", "videography", "makeup_hair"], "Shubho drishti, mala badal, saat paak and sampradan", { kind: "fire", aka: ["shubho drishti", "mala badal", "saat paak"] }),
      ev("bashi_biye", "Bashi biye", 1, "09:00", 0.3, ["officiant"], "The morning-after rituals", { isDefault: false }),
      ev("bou_bhaat", "Bou bhaat", 2, "19:30", 1, ["venue", "catering", "decor", "photography", "sound_lighting"], "The reception at the groom's", { kind: "reception", aka: ["boubhat"] }),
    ],
    oftenMissed: [
      { title: "Purohit", need: "officiant", why: "For the biye and bashi biye" },
      { title: "Shehnai", need: "live_band", why: "Played through the evening" },
    ],
  },
  {
    id: "gujarati_marwari",
    label: "Gujarati or Marwari",
    aliases: ["gujarati", "marwari", "rajasthani", "jain"],
    events: [
      ev("mandap_muhurat", "Mandap muhurat", -2, "09:00", 0.3, ["officiant", "decor"], "Prayers as the mandap goes up", { kind: "puja", isDefault: false }),
      ev("pithi", "Pithi", -1, "10:00", 0.4, ["decor", "photography", "catering"], "Turmeric for the bride and the groom", { kind: "haldi", aka: ["haldi"] }),
      ev("mehndi", "Mehndi", -1, "15:00", 0.5, ["mehndi_artist", "decor", "music", "catering"], "Henna, songs and the family together", { kind: "mehndi" }),
      ev("garba", "Garba or sangeet", -1, "20:00", 0.8, ["venue", "music", "live_band", "sound_lighting", "decor", "catering"], "Dandiya and garba, or a sangeet", { kind: "sangeet", aka: ["dandiya", "sangeet"] }),
      ev("baraat", "Baraat", 0, "17:00", 0.9, ["live_band", "transport", "photography"], "The groom's procession", { kind: "procession", aka: ["jaan"] }),
      ev("hasta_milap", "Hasta milap and pheras", 0, "19:00", 1, ["venue", "officiant", "catering", "decor", "photography", "videography"], "The hands joined and the rounds of the fire", { kind: "fire" }),
      ev("reception", "Reception", 1, "19:30", 1, ["venue", "decor", "catering", "photography", "sound_lighting"], "Guests meet the couple, with dinner", { kind: "reception" }),
    ],
    oftenMissed: [
      { title: "Maharaj and pandit", need: "officiant", why: "For the mandap and the pheras" },
      { title: "Jain or no-onion kitchen", need: "catering", why: "Often a separate counter" },
    ],
  },
  {
    id: "christian",
    label: "Christian",
    aliases: ["christian", "church", "catholic", "syrian christian", "csi"],
    events: [
      ev("rehearsal_dinner", "Rehearsal dinner", -1, "19:30", 0.3, ["catering"], "Close family and the wedding party, the night before", { kind: "dinner", isDefault: false }),
      ev("church", "Church wedding", 0, "11:00", 1, ["officiant", "decor", "photography", "videography", "live_band", "makeup_hair", "attire"], "The service, vows and rings", { kind: "church", aka: ["holy matrimony", "nuptial mass"] }),
      ev("reception", "Reception", 0, "18:30", 1, ["venue", "catering", "decor", "photography", "sound_lighting", "cake"], "Toasts, the cake and dinner", { kind: "reception" }),
    ],
    oftenMissed: [
      { title: "Choir", need: "live_band", why: "For the service" },
      { title: "Wedding cake", need: "cake", why: "Cut at the reception" },
      { title: "Banns and the church booking", need: "officiant", why: "Weeks ahead" },
    ],
  },
  {
    id: "muslim",
    label: "Muslim (Nikah)",
    aliases: ["muslim", "nikah", "islamic"],
    events: [
      ev("manjha", "Manjha or haldi", -2, "17:00", 0.3, ["decor", "photography"], "Turmeric for the bride", { kind: "haldi", aka: ["maayun"], isDefault: false }),
      ev("mehndi", "Mehndi", -1, "18:00", 0.5, ["mehndi_artist", "decor", "music", "catering"], "Henna and songs", { kind: "mehndi" }),
      ev("nikah", "Nikah", 0, "13:00", 0.8, ["officiant", "decor", "catering", "photography"], "The marriage contract, with the qazi", { kind: "nikah" }),
      ev("rukhsati", "Rukhsati", 0, "18:00", 0.4, ["transport", "photography"], "The bride's farewell", { isDefault: false }),
      ev("walima", "Walima", 1, "19:30", 1, ["venue", "catering", "decor", "photography", "sound_lighting"], "The groom's family's feast", { kind: "reception" }),
    ],
    oftenMissed: [
      { title: "Qazi", need: "officiant", why: "For the nikah and the nikahnama" },
      { title: "Separate seating", need: "decor", why: "If the families prefer it" },
    ],
  },
  {
    id: "civil",
    label: "Civil or Western",
    aliases: ["civil", "court", "registered", "western", "white wedding"],
    events: [
      ev("rehearsal_dinner", "Rehearsal dinner", -1, "19:30", 0.3, ["catering"], "Close family and the wedding party", { kind: "dinner", isDefault: false }),
      ev("ceremony", "Ceremony", 0, "16:00", 1, ["officiant", "decor", "photography", "videography", "makeup_hair", "attire"], "Vows and the signing", { kind: "signing", aka: ["registration", "vows"] }),
      ev("reception", "Reception", 0, "18:30", 1, ["venue", "catering", "decor", "photography", "sound_lighting", "cake", "bar"], "Drinks, toasts, the cake and dancing", { kind: "reception" }),
    ],
    oftenMissed: [
      { title: "Registrar or celebrant", need: "officiant", why: "Booked with the paperwork" },
      { title: "Wedding cake", need: "cake", why: "Cut at the reception" },
    ],
  },
];

/** The events every other kind of event usually holds, offered to pick from. */
export const TYPE_EVENTS: Record<Exclude<EventType, "wedding">, CatalogueEvent[]> = {
  birthday: [
    ev("pooja", "Pooja or temple visit", 0, "08:00", 0.3, ["officiant"], "A morning prayer, often for a milestone birthday", { kind: "puja", isDefault: false }),
    ev("cake", "Cake cutting", 0, "18:30", 1, ["cake", "decor", "photography"], "The cake and the wishes", { kind: "dinner" }),
    ev("dinner", "Dinner", 0, "19:30", 1, ["venue", "catering", "sound_lighting"], "The meal with everyone", { kind: "dinner" }),
    ev("games", "Games and entertainment", 0, "17:30", 0.6, ["entertainment"], "A magician, games or a host for the children", { isDefault: false }),
  ],
  housewarming: [
    ev("griha_pravesam", "Griha pravesam pooja", 0, "06:30", 0.6, ["officiant", "decor"], "Entering the new home, with the homam", { kind: "puja", aka: ["griha pravesh", "gruhapravesam"] }),
    ev("lunch", "Lunch", 0, "12:30", 1, ["catering"], "The meal for everyone who comes", { kind: "dinner" }),
    ev("evening", "Evening get-together", 0, "18:30", 0.5, ["catering", "sound_lighting"], "Friends and colleagues in the evening", { kind: "dinner", isDefault: false }),
  ],
  naming_ceremony: [
    ev("naming", "Naming ceremony", 0, "10:00", 0.8, ["officiant", "decor", "photography"], "The baby's name is given", { kind: "puja", aka: ["namakaranam", "naamkaran", "aqiqah", "christening"] }),
    ev("lunch", "Lunch", 0, "12:30", 1, ["catering"], "The meal for family and friends", { kind: "dinner" }),
  ],
  pooja: [
    ev("pooja", "Pooja", 0, "08:00", 0.8, ["officiant", "decor"], "The prayers and the homam", { kind: "puja", aka: ["homam", "havan"] }),
    ev("prasadam", "Lunch and prasadam", 0, "12:30", 1, ["catering"], "The meal after the prayers", { kind: "dinner" }),
  ],
  baby_shower: [
    ev("ceremony", "Baby shower ceremony", 0, "10:00", 0.8, ["decor", "photography", "gifting"], "Blessings for the mother-to-be", { kind: "puja", aka: ["seemantham", "valaikappu", "godh bharai", "baby shower"] }),
    ev("lunch", "Lunch", 0, "12:30", 1, ["catering"], "The meal for everyone who comes", { kind: "dinner" }),
  ],
  anniversary: [
    ev("dinner", "Dinner", 0, "19:30", 1, ["venue", "catering", "decor", "photography"], "The celebration meal", { kind: "dinner" }),
    ev("cake", "Cake cutting", 0, "19:00", 1, ["cake"], "The cake and a toast", { isDefault: false }),
    ev("vows", "Renewal of vows", 0, "18:00", 0.6, ["officiant", "photography"], "The couple's vows again", { isDefault: false }),
  ],
  engagement: [
    ev("engagement", "Engagement ceremony", 0, "18:00", 0.9, ["officiant", "decor", "photography", "makeup_hair"], "Rings exchanged, the families together", { kind: "engagement", aka: ["nichayathartham", "roka", "sagai", "ring ceremony"] }),
    ev("dinner", "Dinner", 0, "19:30", 1, ["venue", "catering", "sound_lighting"], "The meal with everyone", { kind: "dinner" }),
  ],
  graduation: [
    ev("ceremony", "Graduation ceremony", 0, "10:00", 0.6, ["photography"], "The ceremony itself", { kind: "signing", isDefault: false }),
    ev("party", "Celebration", 0, "19:00", 1, ["venue", "catering", "sound_lighting"], "The party after", { kind: "dinner" }),
  ],
  office_party: [
    ev("welcome", "Welcome and lamp lighting", 0, "17:00", 1, ["decor", "emcee"], "Opening the evening", { isDefault: false }),
    ev("games", "Games and activities", 0, "17:30", 0.8, ["entertainment", "emcee"], "Team games or a quiz", { isDefault: false }),
    ev("awards", "Awards", 0, "18:30", 1, ["emcee", "sound_lighting"], "Recognising the year's work", { isDefault: false }),
    ev("dinner", "Dinner", 0, "19:30", 1, ["venue", "catering", "sound_lighting", "music"], "The meal and music", { kind: "dinner" }),
  ],
  team_offsite: [
    ev("day_one", "Day one sessions", 0, "10:00", 1, ["venue", "catering", "event_staff"], "Talks and workshops", {}),
    ev("activity", "Team activity", 0, "15:30", 1, ["entertainment"], "Something to do together", { isDefault: false }),
    ev("dinner", "Team dinner", 0, "19:30", 1, ["catering", "sound_lighting"], "The evening together", { kind: "dinner" }),
    ev("day_two", "Day two sessions", 1, "10:00", 1, ["venue", "catering"], "Talks and workshops", { isDefault: false }),
  ],
  product_launch: [
    ev("welcome", "Registration and welcome", 0, "17:00", 1, ["event_staff", "decor"], "Guests arrive and are greeted", {}),
    ev("launch", "Launch presentation", 0, "18:00", 1, ["venue", "sound_lighting", "emcee"], "The reveal", {}),
    ev("networking", "Demos and networking", 0, "19:00", 1, ["catering", "bar"], "Guests try it and talk", { kind: "dinner" }),
  ],
  conference: [
    ev("registration", "Registration", 0, "08:30", 1, ["event_staff"], "Badges and welcome", {}),
    ev("keynote", "Keynote and sessions", 0, "09:30", 1, ["venue", "sound_lighting", "emcee"], "The talks", {}),
    ev("lunch", "Lunch", 0, "13:00", 1, ["catering"], "The break", { kind: "dinner" }),
    ev("networking", "Networking evening", 0, "18:00", 0.7, ["catering", "bar", "music"], "Drinks and conversation", { kind: "dinner", isDefault: false }),
  ],
  college_fest: [
    ev("inauguration", "Inauguration", 0, "10:00", 0.6, ["decor", "sound_lighting", "emcee"], "Opening the fest", {}),
    ev("competitions", "Competitions", 0, "11:00", 1, ["event_staff"], "Events and contests", {}),
    ev("pro_show", "Pro show", 0, "19:00", 1, ["sound_lighting", "live_band", "event_staff"], "The evening concert", {}),
  ],
  community_festival: [
    ev("pooja", "Pooja or opening", 0, "09:00", 0.6, ["officiant", "decor"], "Opening the festival", { kind: "puja" }),
    ev("cultural", "Cultural programme", 0, "17:00", 1, ["sound_lighting", "emcee", "entertainment"], "Performances", {}),
    ev("food", "Food stalls", 0, "18:00", 1, ["catering"], "Food for everyone", { kind: "dinner" }),
    ev("fireworks", "Lighting and fireworks", 0, "20:00", 1, ["fireworks", "sound_lighting"], "The evening's finale", { isDefault: false }),
  ],
  party: [
    ev("welcome", "Welcome drinks", 0, "18:30", 1, ["bar", "decor"], "Guests arrive", { isDefault: false }),
    ev("dinner", "Dinner", 0, "19:30", 1, ["venue", "catering"], "The meal", { kind: "dinner" }),
    ev("music", "Music and dancing", 0, "20:30", 1, ["music", "sound_lighting"], "The party", { kind: "sangeet" }),
  ],
};

/** The wedding style a host's words name, if any: "an Iyer wedding" → Tamil Brahmin. */
export function traditionNamed(text: string): Tradition | null {
  const t = ` ${text.toLowerCase()} `;
  let best: { tr: Tradition; len: number } | null = null;
  for (const tr of TRADITIONS) {
    for (const a of tr.aliases) {
      if (t.includes(` ${a} `) || t.includes(` ${a}-`) || t.includes(` ${a},`)) {
        if (!best || a.length > best.len) best = { tr, len: a.length };
      }
    }
  }
  return best?.tr ?? null;
}

export const traditionById = (id: string | undefined | null): Tradition | null => TRADITIONS.find((t) => t.id === id) ?? null;

/** The events to offer: a wedding's by its style, any other kind's by its type. */
export function catalogueFor(eventType: EventType, traditionId?: string | null): CatalogueEvent[] {
  if (eventType === "wedding") return traditionById(traditionId)?.events ?? [];
  return TYPE_EVENTS[eventType] ?? [];
}

/** Evening events call for sound and lighting: a sangeet, a reception, a dinner, or anything from 5 pm. */
export function wantsSoundAndLighting(e: { kind?: CeremonyKind; startTime?: string }): boolean {
  if (e.kind === "sangeet" || e.kind === "reception") return true;
  const hour = Number((e.startTime ?? "").split(":")[0]);
  return Number.isFinite(hour) && hour >= 17;
}
