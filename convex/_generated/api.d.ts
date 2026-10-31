/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activity from "../activity.js";
import type * as agent from "../agent.js";
import type * as agentmail from "../agentmail.js";
import type * as analytics from "../analytics.js";
import type * as appEmails from "../appEmails.js";
import type * as assistant from "../assistant.js";
import type * as auth from "../auth.js";
import type * as budget from "../budget.js";
import type * as copilot from "../copilot.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as demo from "../demo.js";
import type * as demoBirthday from "../demoBirthday.js";
import type * as demoHousewarming from "../demoHousewarming.js";
import type * as demoOfficeParty from "../demoOfficeParty.js";
import type * as digest from "../digest.js";
import type * as doNotContact from "../doNotContact.js";
import type * as drafts from "../drafts.js";
import type * as dues from "../dues.js";
import type * as evals from "../evals.js";
import type * as evalsCost from "../evalsCost.js";
import type * as events from "../events.js";
import type * as exports from "../exports.js";
import type * as feedback from "../feedback.js";
import type * as firecrawl from "../firecrawl.js";
import type * as followups from "../followups.js";
import type * as gifts from "../gifts.js";
import type * as guestImport from "../guestImport.js";
import type * as guests from "../guests.js";
import type * as health from "../health.js";
import type * as housekeeping from "../housekeeping.js";
import type * as http from "../http.js";
import type * as inbound from "../inbound.js";
import type * as invites from "../invites.js";
import type * as leads from "../leads.js";
import type * as leadsRun from "../leadsRun.js";
import type * as lib_accounts from "../lib/accounts.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_brand from "../lib/brand.js";
import type * as lib_budget from "../lib/budget.js";
import type * as lib_ceremonyPlan from "../lib/ceremonyPlan.js";
import type * as lib_charges from "../lib/charges.js";
import type * as lib_claude from "../lib/claude.js";
import type * as lib_colours from "../lib/colours.js";
import type * as lib_comparable from "../lib/comparable.js";
import type * as lib_demoGifts from "../lib/demoGifts.js";
import type * as lib_demoKit from "../lib/demoKit.js";
import type * as lib_disposableEmail from "../lib/disposableEmail.js";
import type * as lib_docs from "../lib/docs.js";
import type * as lib_emailTemplates from "../lib/emailTemplates.js";
import type * as lib_entities from "../lib/entities.js";
import type * as lib_evalHeldOut from "../lib/evalHeldOut.js";
import type * as lib_evalQuotes from "../lib/evalQuotes.js";
import type * as lib_evalReading from "../lib/evalReading.js";
import type * as lib_evalScore from "../lib/evalScore.js";
import type * as lib_evalSystems from "../lib/evalSystems.js";
import type * as lib_glimmer from "../lib/glimmer.js";
import type * as lib_glimmerEval from "../lib/glimmerEval.js";
import type * as lib_helpWith from "../lib/helpWith.js";
import type * as lib_inboxName from "../lib/inboxName.js";
import type * as lib_kinds from "../lib/kinds.js";
import type * as lib_leads from "../lib/leads.js";
import type * as lib_links from "../lib/links.js";
import type * as lib_marketplace from "../lib/marketplace.js";
import type * as lib_meta from "../lib/meta.js";
import type * as lib_modelCost from "../lib/modelCost.js";
import type * as lib_modelShared from "../lib/modelShared.js";
import type * as lib_models from "../lib/models.js";
import type * as lib_occasion from "../lib/occasion.js";
import type * as lib_optOut from "../lib/optOut.js";
import type * as lib_photoTags from "../lib/photoTags.js";
import type * as lib_places from "../lib/places.js";
import type * as lib_planningChat from "../lib/planningChat.js";
import type * as lib_pools from "../lib/pools.js";
import type * as lib_priceList from "../lib/priceList.js";
import type * as lib_quoteHold from "../lib/quoteHold.js";
import type * as lib_recordedRun from "../lib/recordedRun.js";
import type * as lib_regions from "../lib/regions.js";
import type * as lib_rsvp from "../lib/rsvp.js";
import type * as lib_sam from "../lib/sam.js";
import type * as lib_scrapePolicy from "../lib/scrapePolicy.js";
import type * as lib_searchTerms from "../lib/searchTerms.js";
import type * as lib_sessionOrder from "../lib/sessionOrder.js";
import type * as lib_sparkOpen from "../lib/sparkOpen.js";
import type * as lib_standardSheet from "../lib/standardSheet.js";
import type * as lib_svix from "../lib/svix.js";
import type * as lib_templates from "../lib/templates.js";
import type * as lib_terms from "../lib/terms.js";
import type * as lib_text from "../lib/text.js";
import type * as lib_tidy from "../lib/tidy.js";
import type * as lib_unzip from "../lib/unzip.js";
import type * as lib_uploads from "../lib/uploads.js";
import type * as lib_uptime from "../lib/uptime.js";
import type * as lib_validators from "../lib/validators.js";
import type * as lib_vendorNeeds from "../lib/vendorNeeds.js";
import type * as lib_venue from "../lib/venue.js";
import type * as lib_visits from "../lib/visits.js";
import type * as lib_vocab from "../lib/vocab.js";
import type * as lib_voice from "../lib/voice.js";
import type * as lib_voiceWords from "../lib/voiceWords.js";
import type * as lib_wav from "../lib/wav.js";
import type * as lib_whatsapp from "../lib/whatsapp.js";
import type * as lib_wizard from "../lib/wizard.js";
import type * as lib_wonder from "../lib/wonder.js";
import type * as maintenance from "../maintenance.js";
import type * as marketplace_bands from "../marketplace/bands.js";
import type * as marketplace_briefs from "../marketplace/briefs.js";
import type * as marketplace_changes from "../marketplace/changes.js";
import type * as marketplace_checks from "../marketplace/checks.js";
import type * as marketplace_directory from "../marketplace/directory.js";
import type * as marketplace_listings from "../marketplace/listings.js";
import type * as marketplace_offers from "../marketplace/offers.js";
import type * as marketplace_ops from "../marketplace/ops.js";
import type * as marketplace_partner from "../marketplace/partner.js";
import type * as marketplace_photos from "../marketplace/photos.js";
import type * as marketplace_priceList from "../marketplace/priceList.js";
import type * as marketplace_samples from "../marketplace/samples.js";
import type * as marketplace_tidy from "../marketplace/tidy.js";
import type * as marketplace_vendors from "../marketplace/vendors.js";
import type * as members from "../members.js";
import type * as messages from "../messages.js";
import type * as modelCalls from "../modelCalls.js";
import type * as modelTasks from "../modelTasks.js";
import type * as openWeights from "../openWeights.js";
import type * as outreach from "../outreach.js";
import type * as places from "../places.js";
import type * as planningChat from "../planningChat.js";
import type * as quotes from "../quotes.js";
import type * as rateLimits from "../rateLimits.js";
import type * as research from "../research.js";
import type * as sessions from "../sessions.js";
import type * as shareLinks from "../shareLinks.js";
import type * as sharedQuotes from "../sharedQuotes.js";
import type * as site from "../site.js";
import type * as slots from "../slots.js";
import type * as spaces from "../spaces.js";
import type * as staticHosting from "../staticHosting.js";
import type * as tasks from "../tasks.js";
import type * as thisWeek from "../thisWeek.js";
import type * as threads from "../threads.js";
import type * as uploads from "../uploads.js";
import type * as uptime from "../uptime.js";
import type * as users from "../users.js";
import type * as vendors from "../vendors.js";
import type * as venueView from "../venueView.js";
import type * as visits from "../visits.js";
import type * as voiceBrief from "../voiceBrief.js";
import type * as webCache from "../webCache.js";
import type * as whatsapp from "../whatsapp.js";
import type * as workflows from "../workflows.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  agent: typeof agent;
  agentmail: typeof agentmail;
  analytics: typeof analytics;
  appEmails: typeof appEmails;
  assistant: typeof assistant;
  auth: typeof auth;
  budget: typeof budget;
  copilot: typeof copilot;
  crons: typeof crons;
  dashboard: typeof dashboard;
  demo: typeof demo;
  demoBirthday: typeof demoBirthday;
  demoHousewarming: typeof demoHousewarming;
  demoOfficeParty: typeof demoOfficeParty;
  digest: typeof digest;
  doNotContact: typeof doNotContact;
  drafts: typeof drafts;
  dues: typeof dues;
  evals: typeof evals;
  evalsCost: typeof evalsCost;
  events: typeof events;
  exports: typeof exports;
  feedback: typeof feedback;
  firecrawl: typeof firecrawl;
  followups: typeof followups;
  gifts: typeof gifts;
  guestImport: typeof guestImport;
  guests: typeof guests;
  health: typeof health;
  housekeeping: typeof housekeeping;
  http: typeof http;
  inbound: typeof inbound;
  invites: typeof invites;
  leads: typeof leads;
  leadsRun: typeof leadsRun;
  "lib/accounts": typeof lib_accounts;
  "lib/auth": typeof lib_auth;
  "lib/brand": typeof lib_brand;
  "lib/budget": typeof lib_budget;
  "lib/ceremonyPlan": typeof lib_ceremonyPlan;
  "lib/charges": typeof lib_charges;
  "lib/claude": typeof lib_claude;
  "lib/colours": typeof lib_colours;
  "lib/comparable": typeof lib_comparable;
  "lib/demoGifts": typeof lib_demoGifts;
  "lib/demoKit": typeof lib_demoKit;
  "lib/disposableEmail": typeof lib_disposableEmail;
  "lib/docs": typeof lib_docs;
  "lib/emailTemplates": typeof lib_emailTemplates;
  "lib/entities": typeof lib_entities;
  "lib/evalHeldOut": typeof lib_evalHeldOut;
  "lib/evalQuotes": typeof lib_evalQuotes;
  "lib/evalReading": typeof lib_evalReading;
  "lib/evalScore": typeof lib_evalScore;
  "lib/evalSystems": typeof lib_evalSystems;
  "lib/glimmer": typeof lib_glimmer;
  "lib/glimmerEval": typeof lib_glimmerEval;
  "lib/helpWith": typeof lib_helpWith;
  "lib/inboxName": typeof lib_inboxName;
  "lib/kinds": typeof lib_kinds;
  "lib/leads": typeof lib_leads;
  "lib/links": typeof lib_links;
  "lib/marketplace": typeof lib_marketplace;
  "lib/meta": typeof lib_meta;
  "lib/modelCost": typeof lib_modelCost;
  "lib/modelShared": typeof lib_modelShared;
  "lib/models": typeof lib_models;
  "lib/occasion": typeof lib_occasion;
  "lib/optOut": typeof lib_optOut;
  "lib/photoTags": typeof lib_photoTags;
  "lib/places": typeof lib_places;
  "lib/planningChat": typeof lib_planningChat;
  "lib/pools": typeof lib_pools;
  "lib/priceList": typeof lib_priceList;
  "lib/quoteHold": typeof lib_quoteHold;
  "lib/recordedRun": typeof lib_recordedRun;
  "lib/regions": typeof lib_regions;
  "lib/rsvp": typeof lib_rsvp;
  "lib/sam": typeof lib_sam;
  "lib/scrapePolicy": typeof lib_scrapePolicy;
  "lib/searchTerms": typeof lib_searchTerms;
  "lib/sessionOrder": typeof lib_sessionOrder;
  "lib/sparkOpen": typeof lib_sparkOpen;
  "lib/standardSheet": typeof lib_standardSheet;
  "lib/svix": typeof lib_svix;
  "lib/templates": typeof lib_templates;
  "lib/terms": typeof lib_terms;
  "lib/text": typeof lib_text;
  "lib/tidy": typeof lib_tidy;
  "lib/unzip": typeof lib_unzip;
  "lib/uploads": typeof lib_uploads;
  "lib/uptime": typeof lib_uptime;
  "lib/validators": typeof lib_validators;
  "lib/vendorNeeds": typeof lib_vendorNeeds;
  "lib/venue": typeof lib_venue;
  "lib/visits": typeof lib_visits;
  "lib/vocab": typeof lib_vocab;
  "lib/voice": typeof lib_voice;
  "lib/voiceWords": typeof lib_voiceWords;
  "lib/wav": typeof lib_wav;
  "lib/whatsapp": typeof lib_whatsapp;
  "lib/wizard": typeof lib_wizard;
  "lib/wonder": typeof lib_wonder;
  maintenance: typeof maintenance;
  "marketplace/bands": typeof marketplace_bands;
  "marketplace/briefs": typeof marketplace_briefs;
  "marketplace/changes": typeof marketplace_changes;
  "marketplace/checks": typeof marketplace_checks;
  "marketplace/directory": typeof marketplace_directory;
  "marketplace/listings": typeof marketplace_listings;
  "marketplace/offers": typeof marketplace_offers;
  "marketplace/ops": typeof marketplace_ops;
  "marketplace/partner": typeof marketplace_partner;
  "marketplace/photos": typeof marketplace_photos;
  "marketplace/priceList": typeof marketplace_priceList;
  "marketplace/samples": typeof marketplace_samples;
  "marketplace/tidy": typeof marketplace_tidy;
  "marketplace/vendors": typeof marketplace_vendors;
  members: typeof members;
  messages: typeof messages;
  modelCalls: typeof modelCalls;
  modelTasks: typeof modelTasks;
  openWeights: typeof openWeights;
  outreach: typeof outreach;
  places: typeof places;
  planningChat: typeof planningChat;
  quotes: typeof quotes;
  rateLimits: typeof rateLimits;
  research: typeof research;
  sessions: typeof sessions;
  shareLinks: typeof shareLinks;
  sharedQuotes: typeof sharedQuotes;
  site: typeof site;
  slots: typeof slots;
  spaces: typeof spaces;
  staticHosting: typeof staticHosting;
  tasks: typeof tasks;
  thisWeek: typeof thisWeek;
  threads: typeof threads;
  uploads: typeof uploads;
  uptime: typeof uptime;
  users: typeof users;
  vendors: typeof vendors;
  venueView: typeof venueView;
  visits: typeof visits;
  voiceBrief: typeof voiceBrief;
  webCache: typeof webCache;
  whatsapp: typeof whatsapp;
  workflows: typeof workflows;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  emailPool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"emailPool">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  actionCache: import("@convex-dev/action-cache/_generated/component.js").ComponentApi<"actionCache">;
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
  staticHosting: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"staticHosting">;
};
