import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  activityActorKind,
  styleFormality,
  activityRefsValidator,
  activityType,
  attachmentValidator,
  chatRole,
  chatStatus,
  contractStatus,
  eventType,
  extractedValidator,
  flagSeverity,
  importStatus,
  linkPreviewValidator,
  messageDirection,
  messageKind,
  messageStatus,
  packageValidator,
  priceUnit,
  quoteLine,
  replyClassification,
  researchStatus,
  role,
  routedAs,
  sendMode,
  rsvpStatus,
  sessionRsvp,
  slotStatus,
  threadStatus,
} from "./lib/validators";

/**
 * Field validators are exported so `lib/docs.ts` can build exact document
 * validators for `returns` without duplicating the shapes.
 */

export const eventFields = {
  name: v.string(),
  host: v.string(),
  coHost: v.string(),
  startDate: v.string(), // YYYY-MM-DD
  endDate: v.string(),
  city: v.string(),
  /** Optional neighbourhood / district inside the city, e.g. "Bandra West", "Park Slope". */
  area: v.optional(v.string()),
  country: v.optional(v.string()),
  currency: v.string(),
  totalBudget: v.number(),
  /** The host's own words for the occasion ("Amma's 60th"), shown beside its type. */
  occasionLabel: v.optional(v.string()),
  /** The company, college or community holding a work or community event. */
  organisation: v.optional(v.string()),
  /** What kind of event this is; missing is read as a general event (lib/occasion eventTypeOf). */
  eventType: v.optional(eventType),
  styleSummary: v.optional(v.string()),
  inspirationUrl: v.optional(v.string()),
  /** Inspiration in the couple's own words, when there is no link to point at. */
  inspirationNotes: v.optional(v.string()),
  /** Pictures the couple chose during onboarding; they start the wedding's Space. */
  inspirationImages: v.optional(v.array(v.id("_storage"))),
  /** How the couple describe the feel they want; shapes vendor searches and email tone. */
  styleVibes: v.optional(v.array(v.string())),
  stylePalette: v.optional(v.string()),
  styleFormality: v.optional(styleFormality),
  /** Whether PlusOne sends the vendor emails itself. New events start in "review"; unset (older events) means it does. */
  sendMode: v.optional(sendMode),
  inboxId: v.optional(v.string()),
  inboxAddress: v.optional(v.string()),
  createdBy: v.id("users"),
  /** A sample wedding for a guest: fictional vendors, and email is simulated rather than sent. */
  demo: v.optional(v.boolean()),
  /** Short things the couple told the assistant that no other screen holds. */
  assistantNotes: v.optional(v.array(v.string())),
  /** Older chat, boiled down, so a long conversation keeps its thread cheaply. */
  assistantSummary: v.optional(v.string()),

  /** About how many guests overall, before any one ceremony is counted. */
  guestEstimate: v.optional(v.number()),
  /** What they would like PlusOne to handle for them (keys in lib/helpWith.ts). */
  helpWith: v.optional(v.array(v.string())),
  /** Anything else they told us while setting up, in their words. */
  helpNotes: v.optional(v.string()),
  /** Unused; kept so existing documents validate. The venue is now an ordinary vendor need. */
  venueStatus: v.optional(v.union(v.literal("yes"), v.literal("no"), v.literal("considering"))),
  /** Unused; kept so existing documents validate. A booked venue is the venue need's booked vendor. */
  venueName: v.optional(v.string()),
  /** The first pass over a new plan: ceremony descriptions and first to-dos. */
  generation: v.optional(v.union(v.literal("running"), v.literal("done"), v.literal("failed"))),
};

export const memberFields = {
  eventId: v.id("events"),
  userId: v.id("users"),
  role,
  invitedEmail: v.optional(v.string()),
  /** Who they are to the couple ("Priya's mother", "Our planner"). Display only, never access. */
  relationship: v.optional(v.string()),
  /** The invite they came in on, so removing them also closes it. */
  inviteId: v.optional(v.id("invites")),
  /** The weekly update email: unset means on for the couple, off for everyone else. */
  digest: v.optional(v.boolean()),
  lastDigestAt: v.optional(v.number()),
};

export const inviteFields = {
  eventId: v.id("events"),
  token: v.string(),
  role,
  email: v.optional(v.string()),
  createdBy: v.id("users"),
  acceptedBy: v.optional(v.id("users")),
  acceptedAt: v.optional(v.number()),
  /** Who the invite is for, carried onto the member when they join. */
  relationship: v.optional(v.string()),
  /** A link works once, for 7 days. Older rows without this expire 7 days after creation. */
  expiresAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
};

/** Where something sits on the event's board, in board units (pixels at 100%). */
export const boardRect = v.object({ x: v.number(), y: v.number(), w: v.number(), h: v.number() });

export const sessionFields = {
  eventId: v.id("events"),
  name: v.string(),
  dayIndex: v.number(),
  date: v.string(),
  guestCount: v.number(),
  budget: v.number(),
  color: v.string(),
  order: v.number(),
  description: v.optional(v.string()),
  /** The part's own key, e.g. "sangeet" or "nikah". */
  key: v.optional(v.string()),
  /** What it means, in a sentence or two the couple reads. */
  significance: v.optional(v.string()),
  /** Rites that happen inside it, shown for meaning only. */
  rites: v.optional(v.array(v.object({ name: v.string(), gloss: v.string() }))),
  icon: v.optional(v.string()),
  /** The kind of ceremony (lib/vocab CEREMONY_KINDS); picks its picture and icon. */
  kind: v.optional(v.string()),
  startTime: v.optional(v.string()), // HH:MM
  endTime: v.optional(v.string()),
  location: v.optional(v.string()),
  /**
   * The palette kept for this part in its Space, as the entry labelled "Palette" (spaces.keepPalette).
   */
  choices: v.optional(v.array(v.object({ label: v.string(), value: v.string(), colors: v.optional(v.array(v.object({ name: v.string(), hex: v.string() }))) }))),
  /** This part's zone on the event's board; laid out automatically until someone moves it. */
  zone: v.optional(boardRect),
};

/** One model call, written after every call through `convex/lib/models.ts`. Counts and cost only, never the prompt or the answer. */
export const modelCallFields = {
  /** What the call was for, e.g. "planSearch" or "readRsvp". */
  feature: v.string(),
  provider: v.union(v.literal("meta"), v.literal("claude")),
  model: v.string(),
  inputTokens: v.number(),
  /** Includes reasoning tokens, which are billed as output. */
  outputTokens: v.number(),
  /** At list price; absent for a model with no known price. */
  costUsd: v.optional(v.number()),
  /** Meta was chosen but could not answer, so Claude did. */
  fellBack: v.boolean(),
  /** The event the call was for, when there is one; "Under the hood" lists an event's calls. */
  eventId: v.optional(v.id("events")),
  /** How long the call took, retries and fallback included. */
  durationMs: v.optional(v.number()),
};

export const vendorSlotFields = {
  eventId: v.id("events"),
  sessionIds: v.array(v.id("sessions")),
  category: v.string(),
  title: v.string(),
  budget: v.number(),
  status: slotStatus,
  bookedVendorId: v.optional(v.id("vendors")),
  notes: v.optional(v.string()),
};

export const vendorFields = {
  eventId: v.id("events"),
  slotId: v.optional(v.id("vendorSlots")),
  name: v.string(),
  website: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  city: v.optional(v.string()),
  category: v.string(),
  startingPrice: v.optional(v.number()),
  /** What that price is for: a total, or a per-person / per-hour rate. */
  priceUnit: v.optional(priceUnit),
  /** Currency of `startingPrice` as found on the vendor's own page — NOT the wedding's currency. */
  priceCurrency: v.optional(v.string()),
  priceNotes: v.optional(v.string()),
  packages: v.array(packageValidator),
  capacity: v.optional(v.string()),
  ratingText: v.optional(v.string()),
  /** Service area / address exactly as the vendor's own pages state it. Never geocoded. */
  serviceArea: v.optional(v.string()),
  highlights: v.array(v.string()),
  sourceUrls: v.array(v.string()),
  summary: v.optional(v.string()),
  shortlisted: v.boolean(),
  scrapedAt: v.number(),
  // Phase 2b: evidence gathered from review directories, contact pages and ranking.
  rating: v.optional(v.number()), // out of 5, only ever from a scraped review page
  reviewCount: v.optional(v.number()),
  reviewSource: v.optional(v.string()),
  reviewHighlights: v.array(v.string()),
  contactFormUrl: v.optional(v.string()),
  hasContactFormOnly: v.optional(v.boolean()),
  /** A picture for the vendor's card: their own site's preview picture, never copied. */
  imageUrl: v.optional(v.string()),
  score: v.optional(v.number()), // 0-100, written by claude.rankVendors
  rankReason: v.optional(v.string()),
  isTopPick: v.optional(v.boolean()),
  pagesRead: v.array(v.string()), // the urls actually scraped for this vendor
  /** The PlusOne Partner listing this vendor is, matched on website. */
  profileId: v.optional(v.id("vendorProfiles")),
};

// ---------------------------------------------------------------- PlusOne Partner

/** What an offering's price is for: the same units Compare reads quotes in (lib/comparable Basis). */
export const offeringUnit = v.union(v.literal("per_person"), v.literal("per_piece"), v.literal("per_day"), v.literal("total"));
export const profileStatus = v.union(v.literal("pending"), v.literal("verified"), v.literal("rejected"), v.literal("suspended"));
export const profileSource = v.union(v.literal("plusone_added"), v.literal("vendor_signup"));

/**
 * A vendor on PlusOne Partner. "plusone_added" listings hold public facts only (name,
 * category, city, website) until the vendor claims them; a vendor's own sign-up is
 * hidden from families until a person in Ops verifies it.
 */
export const vendorProfileFields = {
  name: v.string(),
  /** The same strings as VENDOR_CATEGORIES (lib/vendorNeeds). */
  categories: v.array(v.string()),
  /** The city as the vendor wrote it, for display. */
  city: v.string(),
  /** The city it is searched under (lib/marketplace cityKey). */
  cityKey: v.string(),
  serviceArea: v.optional(v.array(v.string())),
  /** Canonical, https://host (lib/text canonicalWebsite): the key seeded and claimed listings match on. */
  website: v.optional(v.string()),
  email: v.optional(v.string()),
  /** E.164, for calling and WhatsApp. */
  phone: v.optional(v.string()),
  whatsapp: v.optional(v.string()),
  languages: v.optional(v.array(v.string())),
  about: v.optional(v.string()),
  photoIds: v.optional(v.array(v.id("_storage"))),
  source: profileSource,
  /** The account that runs this listing, once claimed or signed up. */
  ownerUserId: v.optional(v.id("users")),
  status: profileStatus,
  statusReason: v.optional(v.string()),
  statusAt: v.number(),
  joinedAt: v.number(),
  /** Events done through PlusOne; sets the level (New, Trusted, Top). */
  completedEvents: v.number(),
  /** A sample vendor for the guest demo, modelled on published prices: shown only on sample events, never to a real family. */
  sample: v.optional(v.boolean()),
};

export const vendorOfferingFields = {
  profileId: v.id("vendorProfiles"),
  category: v.string(),
  title: v.string(),
  unit: offeringUnit,
  price: v.number(),
  currency: v.string(),
  includes: v.array(v.string()),
  excludes: v.optional(v.array(v.string())),
  /** Whether the price already includes GST; missing when the vendor hasn't said. */
  taxIncluded: v.optional(v.boolean()),
  minQty: v.optional(v.number()),
  maxQty: v.optional(v.number()),
};

export const vendorClaimFields = {
  profileId: v.id("vendorProfiles"),
  userId: v.id("users"),
  method: v.union(v.literal("domain_email"), v.literal("manual")),
  status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
  /** What the vendor told us to prove it's theirs, for a manual check. */
  note: v.optional(v.string()),
  createdAt: v.number(),
  decidedAt: v.optional(v.number()),
  decidedBy: v.optional(v.id("users")),
};

/** One Ops decision on a listing, never edited: the record of who verified what, on what evidence. */
export const vettingReviewFields = {
  profileId: v.id("vendorProfiles"),
  reviewerId: v.id("users"),
  /** Each check and whether it passed: "Website is theirs", "GST number matches". */
  checks: v.array(v.object({ label: v.string(), passed: v.boolean() })),
  evidence: v.array(v.object({ label: v.string(), url: v.string() })),
  outcome: profileStatus,
  notes: v.optional(v.string()),
  at: v.number(),
};

/**
 * A family's need, sent to Partner vendors so they answer it on the standard sheet. It
 * carries what a vendor needs to price it (occasion, date, guests, area) and never the
 * family's contact details or budget.
 */
export const vendorBriefFields = {
  eventId: v.id("events"),
  slotId: v.id("vendorSlots"),
  category: v.string(),
  /** The need as the family's plan names it: "Lunch for the 60th". */
  title: v.string(),
  occasion: v.string(),
  city: v.string(),
  cityKey: v.string(),
  area: v.optional(v.string()),
  date: v.string(),
  guests: v.optional(v.number()),
  /** The unit offers are priced in, from the category's standard sheet. */
  unit: offeringUnit,
  notes: v.optional(v.string()),
  /** From a sample event: shown only to the sample vendors, never to real ones. */
  demo: v.boolean(),
  status: v.union(v.literal("open"), v.literal("closed")),
  openedAt: v.number(),
};

/** One sheet line in an offer, in the shape lib/standardSheet readQuote gives a quote. */
export const offerLine = v.object({
  key: v.string(),
  status: v.union(v.literal("priced"), v.literal("included"), v.literal("extra"), v.literal("unstated")),
  amount: v.optional(v.number()),
});

/** A Partner vendor's answer to a brief, priced on the standard sheet's lines. */
export const vendorOfferFields = {
  briefId: v.id("vendorBriefs"),
  profileId: v.id("vendorProfiles"),
  eventId: v.id("events"),
  slotId: v.id("vendorSlots"),
  category: v.string(),
  unit: offeringUnit,
  /** The main price, per unit. */
  price: v.number(),
  /** How many units it is priced for (plates, pieces, days); 1 for an all-in price. */
  quantity: v.number(),
  currency: v.string(),
  /** What the main price covers, in the vendor's words. */
  covers: v.optional(v.string()),
  lines: v.array(offerLine),
  /** price × quantity plus every line priced inside it. */
  total: v.number(),
  notes: v.optional(v.string()),
  status: v.union(v.literal("sent"), v.literal("withdrawn")),
  submittedAt: v.number(),
};

/** A city's price range for one category in one unit, from pooled prices with no names. */
export const priceBandFields = {
  category: v.string(),
  unit: offeringUnit,
  /** A cityKey. */
  city: v.string(),
  currency: v.string(),
  count: v.number(),
  p25: v.number(),
  p50: v.number(),
  p75: v.number(),
  p90: v.number(),
  /** Counts sample vendors' prices too: for sample events only. Real families see bands from real prices. */
  sample: v.boolean(),
  computedAt: v.number(),
};

export const researchRunFields = {
  eventId: v.id("events"),
  slotId: v.id("vendorSlots"),
  query: v.string(),
  /** "Find more options": skip every website already found for this need. */
  more: v.optional(v.boolean()),
  /** The searches PlusOne actually ran, so the couple can see their style in them. */
  queries: v.optional(v.array(v.string())),
  /** Neighbourhood to bias this one search towards; overrides the wedding's area. */
  area: v.optional(v.string()),
  status: researchStatus,
  step: v.string(),
  foundCount: v.number(),
  error: v.optional(v.string()),
  startedAt: v.number(),
  finishedAt: v.optional(v.number()),
};

export const threadFields = {
  eventId: v.id("events"),
  vendorId: v.id("vendors"),
  slotId: v.id("vendorSlots"),
  agentmailThreadId: v.optional(v.string()),
  status: threadStatus,
  lastInboundMessageId: v.optional(v.string()),
  lastOutboundAt: v.optional(v.number()),
  lastInboundAt: v.optional(v.number()),
  nextFollowUpAt: v.optional(v.number()),
  followUpCount: v.number(),
  attentionReason: v.optional(v.string()),
  /** What the vendor needs from the couple that PlusOne could not answer itself. */
  pendingQuestion: v.optional(v.string()),
  /** Set once PlusOne has asked about an over-budget quote, so it asks only once. */
  negotiatedAt: v.optional(v.number()),
};

export const messageFields = {
  eventId: v.id("events"),
  threadId: v.optional(v.id("threads")),
  guestId: v.optional(v.id("guests")),
  direction: messageDirection,
  kind: messageKind,
  status: messageStatus,
  fromAddress: v.string(),
  toAddress: v.string(),
  subject: v.string(),
  bodyText: v.string(),
  agentmailMessageId: v.optional(v.string()),
  agentmailThreadId: v.optional(v.string()),
  attachments: v.array(attachmentValidator),
  classification: v.optional(replyClassification),
  extracted: v.optional(extractedValidator),
  idempotencyKey: v.optional(v.string()),
  errorMessage: v.optional(v.string()),
  sentAt: v.optional(v.number()),
  receivedAt: v.optional(v.number()),
};

export const quoteFields = {
  /** The attachment the prices were read from, when they were in a PDF rather than the email. */
  fromAttachment: v.optional(v.string()),
  eventId: v.id("events"),
  slotId: v.id("vendorSlots"),
  vendorId: v.id("vendors"),
  threadId: v.id("threads"),
  messageId: v.id("messages"),
  total: v.number(),
  deposit: v.optional(v.number()),
  currency: v.string(),
  includes: v.array(v.string()),
  excludes: v.array(v.string()),
  validUntil: v.optional(v.string()),
  redFlags: v.array(v.string()),
  summary: v.string(),
  /** The priced lines as the vendor wrote them, so quotes in different shapes can be compared. */
  lines: v.optional(v.array(quoteLine)),
  /** How many people the vendor priced for, when they said ("for 120 guests"). */
  headcountAssumed: v.optional(v.number()),
  /** Whether the total already includes tax (GST); missing when the reply didn't say. */
  taxIncluded: v.optional(v.boolean()),
  /**
   * Whether the quote has changed the plan. Missing means applied (every quote from
   * before this existed). "waiting": read from a reply but held for the couple to check;
   * "dismissed": the couple said the reading was wrong.
   */
  state: v.optional(v.union(v.literal("applied"), v.literal("waiting"), v.literal("dismissed"))),
  /** Why a quote is waiting rather than applied, in words the couple reads. */
  heldBecause: v.optional(v.string()),
  /** The plan as it was just before this quote applied, so it can be undone. */
  before: v.optional(v.object({ threadStatus: threadStatus, slotStatus: slotStatus, committed: v.number() })),
  appliedAt: v.optional(v.number()),
};

/**
 * Something due: a payment to a vendor (deposit, balance) or a deadline they set (final
 * menu, guest count). Paying one counts towards the budget's paid figure.
 */
export const dueFields = {
  eventId: v.id("events"),
  slotId: v.optional(v.id("vendorSlots")),
  vendorId: v.optional(v.id("vendors")),
  kind: v.union(v.literal("payment"), v.literal("deadline")),
  label: v.string(),
  amount: v.optional(v.number()),
  /** The day it's due, YYYY-MM-DD. */
  dueDate: v.string(),
  /** When it was paid or done. */
  doneAt: v.optional(v.number()),
  /** Added by booking a vendor, from their quote. */
  fromBooking: v.optional(v.boolean()),
};

/** Who has read which conversation, and when: one row per person per conversation. */
export const threadReadFields = {
  eventId: v.id("events"),
  threadId: v.id("threads"),
  userId: v.id("users"),
  readAt: v.number(),
};

export const budgetLineFields = {
  eventId: v.id("events"),
  sessionId: v.optional(v.id("sessions")),
  slotId: v.optional(v.id("vendorSlots")),
  label: v.string(),
  planned: v.number(),
  committed: v.number(),
  paid: v.number(),
};

export const guestFields = {
  eventId: v.id("events"),
  name: v.string(),
  email: v.optional(v.string()),
  side: v.optional(v.string()),
  partySize: v.number(),
  rsvp: rsvpStatus,
  attendingCount: v.number(),
  dietary: v.optional(v.string()),
  /**
   * Food allergies and intolerances, one per entry: the allergen, how serious, and who,
   * e.g. "Peanuts, severe (David)". Kept apart from preferences such as vegetarian,
   * because a caterer has to plan for these.
   */
  allergies: v.optional(v.array(v.string())),
  sessionIds: v.array(v.id("sessions")),
  lastInvitedAt: v.optional(v.number()),
  lastRemindedAt: v.optional(v.number()),
  notes: v.optional(v.string()),
  /** The secret in the guest's own RSVP link (/r/<token>); made when first needed. */
  rsvpToken: v.optional(v.string()),
  /**
   * The guest's answer for each ceremony they're invited to, from their RSVP link, an
   * emailed reply or the couple, and when. `rsvp` and `attendingCount` are worked out from
   * these (convex/lib/rsvp.ts), so the link and an email can never disagree.
   */
  sessionRsvps: v.optional(v.array(sessionRsvp)),
  /** When they last answered, by any route. */
  respondedAt: v.optional(v.number()),
};

/**
 * The couple's public wedding website: nothing shows until they publish,
 * and then only the sections they turn on. The address has a random part, so it can't be
 * guessed, and search engines are told not to list it.
 */
export const eventSiteFields = {
  eventId: v.id("events"),
  slug: v.string(),
  published: v.boolean(),
  welcome: v.optional(v.string()),
  story: v.optional(v.string()),
  travel: v.optional(v.string()),
  showSchedule: v.boolean(),
  showTravel: v.boolean(),
  showRsvp: v.boolean(),
  /** Ceremonies kept off the public schedule (a family-only one, say). */
  hiddenSessionIds: v.array(v.id("sessions")),
  /** The gift list on the site; shown unless the couple turns it off. */
  showGifts: v.optional(v.boolean()),
  /** "No gifts, please": the site says so politely and lists nothing. */
  noGifts: v.optional(v.boolean()),
  /** How the couple feels about cash gifts (shagun, moi, a honeymoon fund), in their words. */
  cashGiftNote: v.optional(v.string()),
  updatedAt: v.number(),
};

/**
 * Something the couple would like as a gift. Guests choose one from their own RSVP link,
 * so others see it's taken; the site shows that it's taken, never who took it.
 */
export const giftFields = {
  eventId: v.id("events"),
  title: v.string(),
  note: v.optional(v.string()),
  /** Where it's sold; http or https only. */
  link: v.optional(v.string()),
  /** Roughly what it costs, in the wedding's currency. */
  price: v.optional(v.number()),
  order: v.number(),
  reservedByGuestId: v.optional(v.id("guests")),
  reservedAt: v.optional(v.number()),
};

export const taskFields = {
  eventId: v.id("events"),
  title: v.string(),
  dueAt: v.optional(v.number()),
  sessionId: v.optional(v.id("sessions")),
  done: v.boolean(),
  autoSource: v.optional(v.string()),
  slotId: v.optional(v.id("vendorSlots")),
  order: v.optional(v.number()),
};

export const chatMessageFields = {
  eventId: v.id("events"),
  userId: v.optional(v.id("users")),
  role: chatRole,
  content: v.string(),
  /** Where in the app a question was asked ("the Budget page", "the Mehndi ceremony"). */
  context: v.optional(v.string()),
  toolCalls: v.optional(
    v.array(
      v.object({
        name: v.string(),
        args: v.any(),
        result: v.optional(v.any()),
        status: v.string(),
      }),
    ),
  ),
  status: v.optional(chatStatus),
};

export const activityFields = {
  eventId: v.id("events"),
  actorUserId: v.optional(v.id("users")),
  actorLabel: v.string(),
  /** Who the actor is, so code never has to compare display labels. Older rows lack it. */
  actorKind: v.optional(activityActorKind),
  type: activityType,
  text: v.string(),
  refs: v.optional(activityRefsValidator),
};

export const inboundEventFields = {
  agentmailMessageId: v.string(),
  webhookEventId: v.string(),
  inboxId: v.string(),
  threadId: v.optional(v.string()),
  fromAddress: v.string(),
  routedAs,
  eventId: v.optional(v.id("events")),
  error: v.optional(v.string()),
  processedAt: v.optional(v.number()),
};

export const contractCheckFields = {
  eventId: v.id("events"),
  storageId: v.id("_storage"),
  filename: v.string(),
  vendorId: v.optional(v.id("vendors")),
  status: contractStatus,
  summary: v.optional(v.string()),
  flags: v.array(
    v.object({
      severity: flagSeverity,
      clause: v.string(),
      why: v.string(),
    }),
  ),
};

export const importFields = {
  eventId: v.id("events"),
  storageId: v.optional(v.id("_storage")),
  filename: v.optional(v.string()),
  rawText: v.optional(v.string()),
  status: importStatus,
  preview: v.optional(v.any()),
  error: v.optional(v.string()),
};

/**
 * One picture or link kept in a Space: a ceremony's Space when `eventId` is set, the
 * wedding's own Space when it is not. Pictures are the couple's own uploads (`storageId`)
 * or, in the demo, pictures shipped with the app (`src`). Links keep the address and the
 * site's own preview, plus our copy of its picture so the thumbnail outlives the link.
 */
export const spaceItemFields = {
  eventId: v.id("events"),
  sessionId: v.optional(v.id("sessions")),
  kind: v.union(v.literal("image"), v.literal("link"), v.literal("note"), v.literal("swatch"), v.literal("vendor")),
  storageId: v.optional(v.id("_storage")),
  src: v.optional(v.string()),
  url: v.optional(v.string()),
  source: v.optional(v.union(v.literal("instagram"), v.literal("tiktok"), v.literal("pinterest"), v.literal("youtube"), v.literal("web"))),
  preview: v.optional(linkPreviewValidator),
  /** Our own copy of the preview's picture: social sites' picture links expire, and so do screenshots. */
  previewStorageId: v.optional(v.id("_storage")),
  previewStatus: v.optional(v.union(v.literal("pending"), v.literal("ready"), v.literal("failed"))),
  caption: v.optional(v.string()),
  /** A note's words. */
  text: v.optional(v.string()),
  /** A colour swatch: its value and the name the family gave it. */
  hex: v.optional(v.string()),
  colorName: v.optional(v.string()),
  /** A vendor pinned to the board. */
  vendorId: v.optional(v.id("vendors")),
  /** Where it sits on the board, and how wide; unplaced items are laid out in their part's zone. */
  x: v.optional(v.number()),
  y: v.optional(v.number()),
  w: v.optional(v.number()),
  /** Position in its Space, smallest first. */
  order: v.number(),
  addedBy: v.optional(v.id("users")),
};


export default defineSchema({
  ...authTables,

  /** Convex Auth's own fields (demo guests), plus the Clerk user an account signs in as. */
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    clerkId: v.optional(v.string()),
    /** When they ticked "I agree" at sign-in, and which version of the Terms and Privacy Policy (lib/terms). */
    termsAcceptedAt: v.optional(v.number()),
    termsVersion: v.optional(v.string()),
    /** PlusOne's own team: reviewers verify vendors in Ops; admins also see spend. Set by hand (marketplace/ops setStaffRole). */
    staffRole: v.optional(v.union(v.literal("admin"), v.literal("reviewer"))),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_clerkId", ["clerkId"]),

  events: defineTable(eventFields).index("by_inboxId", ["inboxId"]).index("by_demo", ["demo"]),

  /**
   * A wedding being set up but not yet created, one per user, so onboarding can be
   * left and picked up again on any device. Deleted when the wedding is created.
   */
  /**
   * The planning conversation that sets up a new event: what was said on both sides, and
   * what has been gathered and confirmed so far. One per person; gone once the event is built.
   */
  planningChats: defineTable({
    userId: v.id("users"),
    messages: v.array(v.object({ from: v.union(v.literal("plusone"), v.literal("host")), text: v.string(), at: v.number() })),
    /** ChatState and the last Step, as JSON (convex/lib/planningChat.ts). */
    state: v.string(),
    step: v.string(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  onboardingDrafts: defineTable({
    userId: v.id("users"),
    /** "Anita & Sam", for the home page's "continue" prompt. */
    name: v.string(),
    step: v.number(),
    /** The onboarding form's own state, as JSON; only the page that wrote it reads it. */
    state: v.string(),
    pictures: v.array(v.id("_storage")),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  members: defineTable(memberFields)
    .index("by_eventId", ["eventId"])
    .index("by_userId", ["userId"])
    .index("by_eventId_and_userId", ["eventId", "userId"]),

  invites: defineTable(inviteFields)
    .index("by_token", ["token"])
    .index("by_eventId", ["eventId"]),

  sessions: defineTable(sessionFields).index("by_eventId", ["eventId"]),

  spaceItems: defineTable(spaceItemFields)
    .index("by_eventId", ["eventId"])
    .index("by_eventId_and_sessionId_and_order", ["eventId", "sessionId", "order"]),


  vendorSlots: defineTable(vendorSlotFields)
    .index("by_eventId", ["eventId"])
    .index("by_eventId_and_status", ["eventId", "status"]),

  vendors: defineTable(vendorFields)
    .index("by_eventId", ["eventId"])
    .index("by_slotId", ["slotId"])
    .index("by_slotId_and_score", ["slotId", "score"])
    .index("by_eventId_and_website", ["eventId", "website"]),

  vendorProfiles: defineTable(vendorProfileFields)
    .index("by_cityKey_and_status", ["cityKey", "status"])
    .index("by_status", ["status"])
    .index("by_website", ["website"])
    .index("by_ownerUserId", ["ownerUserId"]),

  vendorOfferings: defineTable(vendorOfferingFields).index("by_profileId", ["profileId"]),

  vendorClaims: defineTable(vendorClaimFields)
    .index("by_profileId", ["profileId"])
    .index("by_userId", ["userId"])
    .index("by_status", ["status"]),

  vettingReviews: defineTable(vettingReviewFields).index("by_profileId", ["profileId"]),

  priceBands: defineTable(priceBandFields).index("by_category_and_unit_and_city_and_sample", ["category", "unit", "city", "sample"]),

  vendorBriefs: defineTable(vendorBriefFields)
    .index("by_slotId", ["slotId"])
    .index("by_category_and_cityKey_and_status", ["category", "cityKey", "status"]),

  vendorOffers: defineTable(vendorOfferFields)
    .index("by_eventId", ["eventId"])
    .index("by_briefId_and_profileId", ["briefId", "profileId"])
    .index("by_profileId", ["profileId"]),

  researchRuns: defineTable(researchRunFields)
    .index("by_slotId", ["slotId"])
    .index("by_eventId", ["eventId"])
    .index("by_status_and_startedAt", ["status", "startedAt"]),

  threads: defineTable(threadFields)
    .index("by_eventId", ["eventId"])
    .index("by_vendorId", ["vendorId"])
    .index("by_slotId", ["slotId"])
    .index("by_agentmailThreadId", ["agentmailThreadId"])
    .index("by_status_and_nextFollowUpAt", ["status", "nextFollowUpAt"]),

  messages: defineTable(messageFields)
    .index("by_threadId", ["threadId"])
    .index("by_eventId", ["eventId"])
    .index("by_agentmailMessageId", ["agentmailMessageId"])
    .index("by_idempotencyKey", ["idempotencyKey"])
    .index("by_guestId", ["guestId"]),

  dues: defineTable(dueFields)
    .index("by_eventId", ["eventId"])
    .index("by_eventId_and_dueDate", ["eventId", "dueDate"])
    .index("by_vendorId", ["vendorId"])
    .index("by_slotId", ["slotId"]),

  threadReads: defineTable(threadReadFields)
    .index("by_eventId", ["eventId"])
    .index("by_threadId_and_userId", ["threadId", "userId"]),

  quotes: defineTable(quoteFields)
    .index("by_slotId", ["slotId"])
    .index("by_eventId", ["eventId"])
    .index("by_vendorId", ["vendorId"]),

  budgetLines: defineTable(budgetLineFields)
    .index("by_eventId", ["eventId"])
    .index("by_slotId", ["slotId"]),

  /** A pasted or uploaded guest list, waiting to be checked before it becomes guests. */
  guestImports: defineTable(importFields).index("by_eventId", ["eventId"]),

  guests: defineTable(guestFields)
    .index("by_eventId", ["eventId"])
    .index("by_eventId_and_email", ["eventId", "email"])
    .index("by_rsvpToken", ["rsvpToken"]),

  eventSites: defineTable(eventSiteFields)
    .index("by_eventId", ["eventId"])
    .index("by_slug", ["slug"]),

  gifts: defineTable(giftFields)
    .index("by_eventId", ["eventId"])
    .index("by_eventId_and_reservedByGuestId", ["eventId", "reservedByGuestId"]),

  /**
   * A read-only link to the plan: for a parent or a venue who
   * shouldn't need an account. Anyone with the link sees a summary, never emails, guests'
   * names or vendors' contacts; money only if the couple chose. Revoking deletes it.
   */
  shareLinks: defineTable({
    eventId: v.id("events"),
    token: v.string(),
    /** Who it's for, so the couple knows which to revoke: "Mum and Dad". */
    label: v.string(),
    showMoney: v.boolean(),
    createdBy: v.id("users"),
  })
    .index("by_eventId", ["eventId"])
    .index("by_token", ["token"]),

  /** What couples tell the team: bugs, ideas, anything. Write-only from the app; the team reads it in the dashboard. */
  feedback: defineTable({
    eventId: v.optional(v.id("events")),
    userId: v.id("users"),
    category: v.union(v.literal("bug"), v.literal("idea"), v.literal("general")),
    message: v.string(),
    page: v.optional(v.string()),
  }).index("by_userId", ["userId"]),

  tasks: defineTable(taskFields).index("by_eventId", ["eventId"]).index("by_sessionId", ["sessionId"]),

  chatMessages: defineTable(chatMessageFields).index("by_eventId", ["eventId"]).index("by_userId", ["userId"]),

  activity: defineTable(activityFields).index("by_eventId", ["eventId"]),

  inboundEvents: defineTable(inboundEventFields)
    .index("by_agentmailMessageId", ["agentmailMessageId"])
    .index("by_webhookEventId", ["webhookEventId"]),

  /** Addresses PlusOne must never write to again, across every event. */
  doNotContact: defineTable({
    address: v.string(),
    reason: v.union(v.literal("asked_to_stop"), v.literal("added_by_host")),
    /** Where the request came from, for the record. */
    eventId: v.optional(v.id("events")),
    threadId: v.optional(v.id("threads")),
  }).index("by_address", ["address"]),

  contractChecks: defineTable(contractCheckFields).index("by_eventId", ["eventId"]),

  /** One page load on the site, recorded by the Cloudflare middleware; kept 180 days (see visits.ts). */
  /** Model spend for PlusOne Admin and the field notes. */
  modelCalls: defineTable(modelCallFields).index("by_provider", ["provider"]).index("by_eventId", ["eventId"]),

  visits: defineTable({
    at: v.number(),
    ip: v.string(),
    host: v.string(),
    /** Path only, never the query string. */
    path: v.string(),
    method: v.string(),
    userAgent: v.optional(v.string()),
    /** The referring site's host name only. */
    referrer: v.optional(v.string()),
    country: v.optional(v.string()),
    city: v.optional(v.string()),
    region: v.optional(v.string()),
    asn: v.optional(v.number()),
    asOrganization: v.optional(v.string()),
    /** This browser's id, from the site's first-party `po_vid` cookie. */
    visitorId: v.optional(v.string()),
    /** The signed-in Clerk user, verified from the session by the middleware. */
    clerkUserId: v.optional(v.string()),
    /** A guess from the user agent. */
    isBot: v.boolean(),
    /** A hint, not proof: a VPN, proxy, Tor, relay or cloud network. */
    likelyProxy: v.boolean(),
  })
    .index("by_at", ["at"])
    .index("by_ip_and_at", ["ip", "at"])
    .index("by_visitorId_and_at", ["visitorId", "at"])
    .index("by_clerkUserId_and_at", ["clerkUserId", "at"]),

  /** A browser (visitor id) seen signed in as an account, so its anonymous visits resolve to it. */
  visitorLinks: defineTable({
    visitorId: v.string(),
    clerkUserId: v.string(),
    firstSeen: v.number(),
    lastSeen: v.number(),
  })
    .index("by_visitorId", ["visitorId"])
    .index("by_clerkUserId", ["clerkUserId"])
    .index("by_lastSeen", ["lastSeen"]),
});
