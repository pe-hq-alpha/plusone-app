/**
 * A held-out set for the missing-charge evaluation, written independently of the tuned set and the rules
 * under test: its author never read evalQuotes.ts, evalReading.ts or the standard-sheet regexes. The event
 * is a 60th birthday lunch for 120 guests in Chennai on 30 January 2027. A charge is expected when the quote
 * never mentions it, or says it is extra without an amount or rate; it is settled when the quote includes it,
 * prices it with an amount or rate (a percentage counts), or says it isn't offered or isn't needed. Every
 * charge key here is usually charged on top, so every key a quote does not settle is expected.
 */
import type { EvalGroup } from "./evalQuotes";

export const HELD_OUT_GROUPS: EvalGroup[] = [
  {
    category: "Catering",
    quotes: [
      {
        // Tanglish; GST has a rate, transport is extra with no amount, crockery never mentioned.
        vendor: "Annapoorani Kitchens",
        text: "Vanakkam sir 🙏\nAmma 60th lunch ku quote anuppuren\n120 pax veg buffet – 2 sweet, 3 poriyal, sambar, rasam, kootu, curd rice, ice cream\nRs 450 per plate = Rs 54,000/-\nService boys 6 per, each Rs 800 = 4,800\nWater bottle 300ml namma provide pannuvom, included\nTransport extra pannanum, amount naan apram solren\nGST separate-a 5%\nAdvance 30% venum sir",
        expected: ["transport", "crockery"],
      },
      {
        // A table pasted as text; nearly complete, only water is silent.
        vendor: "Sri Kamatchi Caterers",
        text: "Item | Qty | Rate | Amount\nVeg buffet (2 sweets, 3 curries, rice varieties) | 120 | 520 | 62,400\nLive dosa counter | 1 | 9,000 | 9,000\nServing staff (8 nos) | 8 | 700 | 5,600\nPlates, tumblers, chafing dishes | - | - | Included\nDelivery to venue | - | - | 2,500\nSub total | | | 79,500\nGST @5% | | | 3,975\nGrand total | | | 83,475",
        expected: ["water"],
      },
      {
        // Fully in Tamil script; GST and water are "separate" with no amount.
        vendor: "Thanjai Virundhu Samayal",
        text: "வணக்கம். 120 பேருக்கு மதிய விருந்து (சைவம்):\nஒரு தட்டுக்கு ₹480\nமொத்தம் ₹57,600\nபரிமாறும் ஆட்கள் எங்கள் பொறுப்பு, தனி கட்டணம் இல்லை.\nகுடிநீர் கேன் தனி கட்டணம்.\nஜிஎஸ்டி தனி.",
        expected: ["gst", "transport", "crockery", "water"],
      },
      {
        // Two packages in lakh notation; everything settled.
        vendor: "Mylai Feast Co.",
        text: "Dear Sir/Madam,\nThank you for the enquiry. Two options for 120 guests:\n\nPackage A (Non-veg) – Rs 1,25,000\nPackage B (Veg) – Rs 96,000\n\nBoth packages include:\n* service boys (1 per 15 guests)\n* crockery & cutlery, steel tumblers\n* mineral water 200ml bottles\n\nConveyance: Rs 3,000\nAll prices inclusive of GST.\n\nRegards,\nMylai Feast Co.",
        expected: [],
      },
      {
        // "k" amounts and synonyms: "taxes extra" with no rate, plates rental priced.
        vendor: "Velachery Vasantham Catering",
        text: "Rate 550/head veg menu = 66k\nStaff 10k\nVessels and plates rental 4k\nTaxes extra\nPls confirm by next week, Jan dates are filling up",
        expected: ["gst", "transport", "water"],
      },
      {
        // Negations: no water, no crockery needed, free transport; extra staff "at actuals".
        vendor: "Kovai Ruchi Outdoor Catering",
        text: "Hi, quote for 30 Jan:\n- Veg lunch (14 items) @ Rs 600 per head x 120 = Rs 72,000\n- 2 supervisors free; extra service boys as required at actuals\n- We don't supply water, customer to arrange\n- Hall has its own crockery so we won't bring plates\n- No transport charge within city limits\n- GST 18%\nThanks",
        expected: ["service_staff"],
      },
    ],
  },
  {
    category: "Venue",
    quotes: [
      {
        // Tanglish; AC priced per hour, EB charges extra by meter with no rate, overtime silent.
        vendor: "Lakshmi Narayana Mahal",
        text: "Sir hall rent 4 hrs (11am to 3pm) Rs 45,000/-\nAC hall dhaan, AC charges 2,500 per hour separate\nEB charges meter reading padi extra\nCleaning namma included\nGST 18% extra\nBooking ku 25% advance",
        expected: ["electricity", "overtime"],
      },
      {
        // "No AC" negation; nearly complete, only GST silent.
        vendor: "Thiruvanmiyur Community Hall",
        text: "Non-AC mini hall, capacity 150\nRs 18,000 for the day (6am–6pm)\nNo AC.\nEB included in rent; generator backup Rs 3,500 if needed\nCleaning Rs 1,500\nExtra hours Rs 1,000/hr",
        expected: ["gst"],
      },
      {
        // Tamil script; electricity has a per-unit rate, overtime silent.
        vendor: "Kalaivani Thirumana Mandapam",
        text: "மண்டபம் வாடகை ₹65,000 (காலை 7 மணி முதல் மாலை 4 மணி வரை).\nஏசி கட்டணம் சேர்த்து.\nமின் கட்டணம் யூனிட்டுக்கு ₹12.\nசுத்தம் செய்ய ₹2,000.\nஜிஎஸ்டி 18%.",
        expected: ["overtime"],
      },
      {
        // A list of amenities in lakh notation that never touches the usual extras.
        vendor: "The Ivory Pavilion Banquets",
        text: "Banquet hall – Rs 1,10,000 incl. AC\n- Valet parking\n- Green room for the family\n- Stage with basic backdrop\n- 150 chairs + 15 round tables\nAdvance 50%, balance one week before the event.",
        expected: ["gst", "electricity", "cleaning", "overtime"],
      },
      {
        // Two options; housekeeping and extra hours priced, power extra with no rate, GST silent.
        vendor: "Palm Grove Lawns & Hall",
        text: "Option 1: Garden lawn, Rs 35k, non-AC (shamiana included)\nOption 2: AC hall, Rs 55k, AC included\nFor both options:\n• housekeeping Rs 3k\n• beyond 4 hrs Rs 5,000 per hour\n• power consumption extra",
        expected: ["gst", "electricity"],
      },
    ],
  },
  {
    category: "Decor & Florals",
    quotes: [
      {
        // Tanglish; "GST illa" settles GST, lights are extra with no amount.
        vendor: "Malligai Poo Decorators",
        text: "Stage decoration fresh flowers + 60 balloon arch – 28k\nLights extra, decoration fixing charges included\nTransport namma vandi la, no charge\nGST illa sir, cash payment\nEvent morning 6 mani ku team varum",
        expected: ["lighting"],
      },
      {
        // Tamil script; transport ("vehicle cost") separate with no amount, setup and GST silent.
        vendor: "Nandhini Malar Alangaram",
        text: "மேடை அலங்காரம் (பூ மாலை, பின்னணி திரை) ₹35,000\nவிளக்கு அலங்காரம் ₹6,000\nவண்டி செலவு தனி.",
        expected: ["gst", "transport", "setup"],
      },
      {
        // A long itemised bullet list with "/-" amounts; everything settled.
        vendor: "Gold Thread Event Styling",
        text: "Theme: gold & ivory\n• Entrance arch with marigold & roses – 12,000/-\n• Stage backdrop 20x10 ft – 22,000/-\n• Table centrepieces x 15 – 7,500/-\n• Photo booth – 6,000/-\n• Decoration fixing & removal – 4,000/-\n• Fairy lights + 4 par lights – 5,500/-\n• Conveyance (tempo) – 2,000/-\nTotal 59,000/- + 18% GST",
        expected: [],
      },
      {
        // Sparse "k" amounts; "labour & van extra" means setup and transport extra with no amount.
        vendor: "Rangoli Florals Adyar",
        text: "Backdrop 15k, flower garlands 8k, balloons 4k\nTotal 27k\nLabour & van extra",
        expected: ["gst", "transport", "setup", "lighting"],
      },
      {
        // Packages; lighting and setup included, transport priced by distance, GST silent.
        vendor: "Sundari Stage Works",
        text: "Silver ₹45,000: stage + entrance, warm white lighting included\nGold ₹70,000: adds ceiling drapes and LED wall-wash lights\nSetup by our team on event morning, included in both\nDelivery within Chennai city limits free; ECR/OMR beyond 25 km ₹1,500",
        expected: ["gst"],
      },
    ],
  },
  {
    category: "Photographer",
    quotes: [
      {
        // Tanglish with a Tamil-script sign-off; "photo book", "no drone", "extra hours"; GST silent.
        vendor: "Kaveri Frames Studio",
        text: "Hi! Candid + traditional, 1 photographer 1 videographer, 5 hrs – Rs 38,000\n40 page photo book included\nDrone venaam nu sonneenga, so no drone\nExtra hours 3k per hour\nTravel Chennai la free\nநன்றி!",
        expected: ["gst"],
      },
      {
        // A table pasted as text; soft copies only, album never mentioned.
        vendor: "Shutterleaf Photography",
        text: "Service | Price\nCandid photography (4 hrs) | 25,000\nTraditional video | 18,000\nDrone coverage | 8,000\nEdited photos (soft copy) | Included\nTotal | 51,000",
        expected: ["gst", "travel", "overtime", "album"],
      },
      {
        // Tamil script; travel separate with no amount, GST silent.
        vendor: "Ilakkiya Studios",
        text: "புகைப்படம் + வீடியோ, 6 மணி நேரம்: ₹42,000\nஆல்பம் (30 பக்கம்) ₹9,000\nகூடுதல் நேரம் ஒரு மணிக்கு ₹2,500\nட்ரோன் இல்லை\nபோக்குவரத்து செலவு தனியாக",
        expected: ["gst", "travel"],
      },
      {
        // A long WhatsApp package in lakh notation; conveyance "NA", everything settled.
        vendor: "Marina Light Pictures",
        text: "Hi ma'am, for amma's 60th:\nPremium package Rs 1,15,000/- incl. GST\n- 2 candid + 1 traditional photographer\n- cinematic teaser (2 min)\n- drone (weather permitting)\n- 2 albums, 40 sheets each\n- coverage 7am to 3pm; beyond that Rs 4,000/- per hr\nOutstation conveyance: NA, venue is in Chennai\nParking + lunch for the team to be provided by client.",
        expected: [],
      },
    ],
  },
];
