export type HelpEntry = { ask: string; answer: string };

/** Help, by topic: what people planning an event ask about each part of PlusOne. */
export const HELP_TOPICS: { topic: string; entries: HelpEntry[] }[] = [
  {
    topic: "Your plan and its parts",
    entries: [
      {
        ask: "Where did the parts of my event come from?",
        answer: "From what you told us at the start: the kind of event, your dates and roughly how many people are coming. A birthday might have a lunch and an evening party, an offsite a few sessions and a dinner, a wedding its ceremonies. Each part arrives with the vendors it tends to need and its share of the budget and headcount. None of it is fixed. Rename any part, remove it, or add your own under Plan.",
      },
      {
        ask: "How do I move something to another day?",
        answer: "Under Plan, drag its card to the day you want. Its date follows the day, and dropping it after the last day adds a day to the event. You can also change its date, time and place on its own page.",
      },
      {
        ask: "What's on each part's page?",
        answer: "Everything for that one part of the event: when and where, headcount and budget, what it means or what it's for, its own to-do list and its own Space. Once its Space has pictures, it can suggest a palette from them, and the one you keep becomes that part's colours.",
      },
      {
        ask: "How is the budget split?",
        answer: "By what each part usually costs: a dinner for everyone takes more than a small pooja at home. Change any part's share and the rest adjust, so they always add up to your total.",
      },
      {
        ask: "What can the Assistant help with?",
        answer: "Ask it anything about your event in your own words: what's urgent, what's due this month, how the budget looks. It knows your days, your budget and the vendors you've found. When it suggests a change, you see it as a card and nothing happens until you confirm. Anything it has been asked to remember is listed, and you can remove any of it.",
      },
      {
        ask: "What does Today show?",
        answer: "Where things stand, read straight from your plan: what PlusOne has done, what it is doing now, what is waiting on you, and what it will pick up next. Waiting on you means a vendor needing your answer, quotes ready to choose between, something usually booked by this point, or people still to reply. Compare holds every quote side by side, and To-dos is your own checklist.",
      },
    ],
  },
  {
    topic: "Finding vendors",
    entries: [
      {
        ask: "What is a vendor need?",
        answer: "One thing you have to book, like a caterer, a decorator, a photographer or a sound system, with its budget and the days it covers. Your plan suggests the first ones. Add, rename or remove them on the Vendors page.",
      },
      {
        ask: "How are vendors found?",
        answer: "PlusOne searches the open web for vendors in your city who do what you need, then reads their own websites, down to the contact and pricing pages, for prices, style and contact details. Cards appear as each site is read. They're ranked on reviews, on price against your budget and on how well they fit what you described.",
      },
      {
        ask: "Can I add a vendor I already know?",
        answer: "Yes. Under the results, add them by name with their email or website. They sit alongside the others and can be written to in the same way.",
      },
      {
        ask: "One caterer for some days, another for the rest?",
        answer: "Split the need by day, or tick only the days a vendor is for. Quotes and headcounts follow the days you choose, and each part gets its share of the budget.",
      },
      {
        ask: "Why can't I remove a need?",
        answer: "Once a vendor has been booked for it, or a real email has gone out about it, it stays so that the conversation and the money aren't lost. Needs that were only researched can be removed freely.",
      },
    ],
  },
  {
    topic: "Writing to vendors and the inbox",
    entries: [
      {
        ask: "Who writes to the vendors?",
        answer: "PlusOne writes a personal letter to each vendor you choose, built from your dates, headcount, budget and the feel you described. In Settings, choose how much you want to see first: every letter before it goes, or the shortlist once, with one letter in full, after which sending, chasing and reading replies happen without you.",
      },
      {
        ask: "What address do vendors see?",
        answer: "Your event has its own email inbox, and letters go from there. Replies come back to it and appear in Inbox, so your personal email stays out of it.",
      },
      {
        ask: "What if a vendor doesn't reply?",
        answer: "After three days of quiet they get a polite nudge, up to three times. If there's still nothing, the conversation is marked as needing you.",
      },
      {
        ask: "How do I know a reply needs me?",
        answer: "The number beside Inbox counts the conversations waiting on you: a question only you can answer, a vendor who has gone quiet, or a quote to check. Opening one marks its replies as read.",
      },
      {
        ask: "Can PlusOne look over a contract?",
        answer: "Send the contract to your event's inbox. PlusOne reads it and lists anything worth a second look, quoting the line each point comes from.",
      },
      {
        ask: "How do I stop writing to a vendor?",
        answer: "Mark them as not to be contacted from their conversation, after a phone call for instance, and nothing more is sent to them. A vendor who asks not to be written to is never contacted again.",
      },
    ],
  },
  {
    topic: "Quotes, budget and dues",
    entries: [
      {
        ask: "Where do quotes come from?",
        answer: "From vendors' replies. Each reply is read line by line and its prices put in the same units, per plate, per piece or per day, so quotes for one need sit side by side. Anything left out of a quote is flagged. When a reading looks uncertain it waits for you: if it's right, put it in the plan; if not, dismiss it and it never touches your numbers.",
      },
      {
        ask: "A quote went in by itself and it's wrong.",
        answer: "Undo it from the conversation. The need, the conversation and the budget go back to how they were, and the quote waits for you to check it. A quote you have booked on stays.",
      },
      {
        ask: "What do planned, committed and paid mean?",
        answer: "Planned is what you expect to spend, committed is what you've agreed to, and paid is what has already gone out. Booking a vendor commits their quote. Costs that aren't vendors, such as outfits, return gifts or travel, can be added to the budget by hand.",
      },
      {
        ask: "How do I keep track of payments?",
        answer: "Booking a vendor adds their deposit and balance to what's due. Add any other payment or deadline yourself, such as a final menu or a final headcount. Mark a payment as paid and it counts towards the budget.",
      },
    ],
  },
  {
    topic: "Guests, invitations and RSVPs",
    entries: [
      {
        ask: "How do I add people?",
        answer: "Type them in, paste a list, or upload a spreadsheet or PDF. A list you hand over comes back as rows to check, and anyone already on your list with the same email is left as they are.",
      },
      {
        ask: "How do invitations work?",
        answer: "Choose who is invited to which parts of the event, then send. Each person gets one email from your event's inbox, and a reminder is one email too. They can simply reply in their own words, and their answers, numbers and food needs land on the list by themselves.",
      },
      {
        ask: "Can I send invitations my own way?",
        answer: "Yes. Everyone on the list has a personal RSVP link. Copy it and send it by message, WhatsApp or however you like. It shows only the parts of the event they're invited to.",
      },
      {
        ask: "Someone told me their answer on the phone.",
        answer: "Set it yourself on the list, for one part of the event or for everything they're invited to.",
      },
    ],
  },
  {
    topic: "Your event website",
    entries: [
      {
        ask: "What goes on the website?",
        answer: "One page for the people you've invited: what's happening, with times and places, what to wear, travel and stay, and anything else you want to say. Start it from your plan and change any of it.",
      },
      {
        ask: "When can people see it?",
        answer: "Only once you publish it. Until then it's visible only to the people planning with you, and you can take it down at any time. Only the owner can publish it.",
      },
      {
        ask: "Can I show some parts of the event and not others?",
        answer: "Choose which appear on the public page. A personal RSVP link always shows the parts that person is invited to, whatever the public page shows.",
      },
    ],
  },
  {
    topic: "Spaces",
    entries: [
      {
        ask: "What is a Space?",
        answer: "One open board for the whole event, with a zone for each part of it. Put your own pictures on it, links from Instagram, Pinterest, TikTok or anywhere else, notes, colours and the vendors you like, and drag them where they belong: anything in a part\'s zone belongs to that part, and anything outside the zones is for the whole event. Drag the empty board to move around, and pinch or Ctrl-scroll to zoom.",
      },
      {
        ask: "Can I save things straight from my phone?",
        answer: "Yes. Add PlusOne to your home screen, then use your phone's Share button on a post or page and choose PlusOne. Pick the Space it belongs in and add a caption if you like.",
      },
      {
        ask: "Can PlusOne find our colours in a Space?",
        answer: "Once a zone has pictures, ask for a palette with Colours from the pictures. It looks at the colours that actually appear and suggests a few, the truest first. Pick one and it becomes that part's palette, or the colours for the whole event. Nothing changes until you pick.",
      },
      {
        ask: "How do I tidy a Space?",
        answer: "Drag anything anywhere, Shift-click to pick up several at once, and drag a zone by its name to move it with everything in it. A selected card has a handle to make it bigger. Delete takes what you selected off the board, and a picture you uploaded is deleted with it.",
      },
    ],
  },
  {
    topic: "Planning together and sharing",
    entries: [
      {
        ask: "How do others join the plan?",
        answer: "From People, make an invite link and choose what they can do: a planner can edit and send, a viewer can only look. Send the link yourself or have it emailed. Unused links expire, and you can cancel one before it's used.",
      },
      {
        ask: "Can family or colleagues see the plan without an account?",
        answer: "Yes, with a read-only link. It shows the days, who's booked, what's due and how many are coming, and money only if you choose. Emails, people's names and vendors' contact details are never on it. Turn a link off and it stops working straight away.",
      },
      {
        ask: "Can I see who changed what?",
        answer: "History lists every change, who made it and when. Nothing in it can be edited.",
      },
    ],
  },
  {
    topic: "The team behind PlusOne",
    entries: [
      {
        ask: "Is PlusOne only an app?",
        answer: "No. The app does the searching, writing and reading, and a team in India is coming for the parts an app can't do: visiting venues, sitting in on tastings, negotiating and keeping vendors to their word. It helps most when you're planning from another city or country.",
      },
      {
        ask: "What does PlusOne cost?",
        answer: "Nothing until we launch: Basic, the complete planning app that plans with you, does the running around and lines up every quote, is free to use until then, and moves to an introductory monthly price at launch. Premium, where a person from the PlusOne team plans it with you and is on call any time, opens after that. Both come with instant help from our support team. For now, PlusOne doesn't handle payments to vendors: you pay them directly. The Pricing page has the prices.",
      },
      {
        ask: "How do I get help from the team?",
        answer: "Reply to any email from PlusOne, or use Share feedback at the foot of the page, and tell us about your event. The first families and teams get help as the team starts.",
      },
    ],
  },
  {
    topic: "Printing",
    entries: [
      {
        ask: "Can I print the plan?",
        answer: "Print gives you one clean page: the days, the vendors, what's due and how many are coming. Leave out money or vendors' contact details first if it's for someone else, then print it or save it as a PDF from your browser.",
      },
    ],
  },
  {
    topic: "Emails from PlusOne",
    entries: [
      {
        ask: "What is the weekly update?",
        answer: "A short email each Friday: what's coming up, what changed and anything waiting on you. Quiet weeks send nothing. Settings shows this week's update before it goes.",
      },
      {
        ask: "How do I stop it?",
        answer: "Turn it off in Settings, or use the link at the bottom of any update. Everyone planning the event chooses for themselves, so turning yours off doesn't affect anyone else's.",
      },
    ],
  },
  {
    topic: "Privacy, your data and leaving",
    entries: [
      {
        ask: "Who can see our information?",
        answer: "Only the people you invite to plan, and what you choose to share through a read-only link or your published website. Vendors see only the letters sent to them. Your account details are never shared with them. The privacy page sets out what we keep and why.",
      },
      {
        ask: "Can I download everything?",
        answer: "The owner can download the whole event as one file from Settings: the days, vendors, every email, quotes, the budget, the people invited, to-dos and Spaces. Uploaded files are listed by name.",
      },
      {
        ask: "How do I delete an event?",
        answer: "In Settings, type the event's name to confirm. Everything in it goes: days, vendors, conversations, quotes, the people invited and stored files. It can't be undone.",
      },
      {
        ask: "Can we close our account?",
        answer: "From your account page. An event you own alone is deleted with you. One you share with another owner, or were only invited to, stays for the others, and you're removed from it.",
      },
    ],
  },
];
