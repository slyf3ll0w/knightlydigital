import { RATES_LINE } from "../plan-copy";
import type { HelpSection } from "../types";
import {
  ANNUAL_TERM,
  ATLAS_FREE,
  ATLAS_FULL,
  ATLAS_FULL_PRICE,
  CORE,
  EXTRA_SEAT,
  EXTRA_SEAT_MO,
  GALLERY,
  GALLERY_PRICE,
  HOW_TO_ADD_PRO,
  MAX,
  MAX_PRICE,
  PAYMENT_GRACE,
  PLANS_PAGE,
  PLANS_PAGE_LINK,
  PRO,
  PRO_GATE_LINE,
  PRO_PRICE,
  SEATS_INCLUDED,
  VOICE,
  VOICE_PRICE,
  VOICE_SETUP,
} from "../plan-copy";

export const settingsSection: HelpSection = {
  id: "account",
  title: "Settings & account",
  icon: "settings",
  tagline: "Branding, notifications, plans, and more than one company.",
  articles: [
    {
      slug: "branding",
      title: "Add your logo and colors",
      summary: "Make quotes, invoices, emails, the portal and the app look like your business.",
      keywords: ["logo", "brand", "colors", "font", "branding", "primary color", "review link", "google review"],
      where: { label: "Settings", href: "/app/settings" },
      roles: "Owners and admins",
      blocks: [
        {
          type: "steps",
          items: [
            "Go to **Settings → Branding & client experience**.",
            "Upload your logo and pick your **primary** color (buttons, headers) and **secondary** color (small highlights). You can also pick a font.",
            "Add your Google review link here so `Ask for review` works.",
          ],
        },
        {
          type: "p",
          text: "Your colors show up everywhere: on client-facing pages and emails, and in WorkBench itself for your whole team.",
        },
      ],
    },
    {
      slug: "business-name-and-web-address",
      title: "Your business name, legal name and web address",
      summary: "What clients see you as, the entity on paper, and the address in your links.",
      keywords: ["business name", "legal name", "DBA", "doing business as", "trade name", "own name", "sole proprietor", "web address", "slug", "booking link", "portal link", "rename"],
      where: { label: "Business info", href: "/app/settings?s=company" },
      roles: "Owners and admins",
      blocks: [
        {
          type: "p",
          text: "**Business name** is what clients see everywhere: texts and emails, quotes and invoices, your booking page and client portal, the caller ID on your business line and its voicemail greeting. Put the name your clients know you by here. If you work under your own name, use your own name.",
        },
        {
          type: "p",
          text: "**Legal business name** is the entity on paper, when it differs — an LLC that trades under a brand, or under the owner's name. It goes on your texting registration and payments paperwork, and clients never see it unless you turn on **Show the legal name on quotes, invoices and agreements**, which adds it in the footer of PDFs and on the agreement page. Leave it blank when both names are the same.",
        },
        {
          type: "steps",
          items: [
            "Go to **Settings → Company → Business info**.",
            "Type the name clients should see under **Business name**, and the registered entity under **Legal business name** (or leave it blank).",
            "Optional: switch on **Show the legal name on quotes, invoices and agreements**.",
            "Optional: change **Web address**, the last part of your booking and portal links. Old links keep working — they forward to the new address.",
          ],
        },
        {
          type: "list",
          items: [
            "Renaming the business updates your business line too: the STOP and HELP auto-replies, and the caller ID name when you never customised it. Check both in **Settings → Phone & texting**.",
            "If your texting registration was already approved under the old name, nothing changes for your clients' texts — the brand on file stays as filed. Only a future re-file uses the legal name here, with the business name as the trading name.",
            "The web address allows lower-case letters, numbers and dashes, at least 3 characters, and it has to be free.",
          ],
        },
      ],
    },
    {
      slug: "notifications",
      title: "Turn on notifications",
      summary: "Get pushes for new leads, bookings, payments, messages and calls on each device.",
      keywords: ["notifications", "push", "alerts", "bell", "not getting notifications", "add to home screen", "email me too", "notification emails", "stop emails", "email these notifications", "notification card", "quote approved"],
      where: { label: "My Profile", href: "/app/settings/profile" },
      blocks: [
        {
          type: "steps",
          items: [
            "Go to **My Profile → Notifications on this device** and press `Turn on`.",
            "Allow notifications when your phone or browser asks.",
            "Repeat on each device you use. The setting is per device.",
          ],
        },
        {
          type: "p",
          text: "You'll be told about new requests and leads, bookings, chat messages, payments (and failed ones), when a client views a quote, invoice or agreement, when a client approves a quote, your next job (with On My Way and Directions buttons), and missed calls and voicemails on your business line.",
        },
        {
          type: "p",
          text: "With WorkBench open in a browser, the same notification arrives as a card at the top of the page the moment it is sent — on every open tab, not only the one in front. A card leaves on its own after a few seconds once you have seen it, and after 45 seconds at most. Nothing is lost when it goes: every notification is kept in the **bell** for 30 days.",
        },
        {
          type: "p",
          text: "Tapping a notification opens the page it is about — a new text opens that conversation — inside the app you already have open, without reloading it. If your phone has just woken up and has no signal yet, you may briefly see an **Opening…** card; it goes through on its own once the connection is back.",
        },
        {
          type: "h",
          text: "Emails too, or push only",
        },
        {
          type: "p",
          text: "New requests, client messages and bookings also go to your company's notification inbox by email. Once a device of yours has notifications on, that email is skipped so you don't hear the same thing twice. **My Profile → Email me too** changes this for you: `Only when push is off` (the default), `Always`, or `Never`. To stop these emails for the whole company — a team that reads them on their phones — switch off **Email these notifications** under **Settings → Company → Business info → Notifications inbox**; pushes and the bell carry on.",
        },
        {
          type: "faq",
          items: [
            {
              q: "I turned on notifications and the emails stopped.",
              a: "That's the default: push replaces the email once a phone or browser of yours has notifications on. Pick `Always` under My Profile → Email me too to get both.",
            },
            {
              q: "Why does a notification start with a company name?",
              a: "Only when your login belongs to more than one company, so you know which one is talking. With a single company the name is left off.",
            },
            {
              q: "Notifications don't work on my iPhone in Safari.",
              a: "Apple only allows web notifications for sites added to your Home Screen. In Safari, tap Share → Add to Home Screen, open WorkBench from there, and turn notifications on. Or use the WorkBench FSM app from the App Store, which doesn't need this.",
            },
            {
              q: "I cleared the bell and now things are gone.",
              a: "The bell is a recent-activity list, and clearing it only hides items on that device. Nothing is deleted.",
            },
          ],
        },
      ],
    },
    {
      slug: "switch-companies",
      title: "Use more than one company",
      summary: "Belong to several businesses with one login and switch between them.",
      keywords: ["switch company", "multiple companies", "second business", "account switcher", "new company"],
      blocks: [
        {
          type: "p",
          text: "Tap your profile picture at the top and pick a company. WorkBench reloads as that company. Your role can be different in each one. `New company` starts another business under the same login.",
        },
      ],
    },
    {
      slug: "plans-and-pricing",
      title: "Plans and pricing",
      summary: "What's free, what each paid plan adds, what a Core account sees on a Pro feature, and how processing fees work.",
      keywords: ["price", "pricing", "plan", "cost", "subscription", "billing", "core", "voice", "pro", "max", "gallery", "upgrade", "add-on", "users", "seats", "people", "atlas full", "tokens", "see plans", "part of pro", "locked", "pro chip"],
      where: { label: "Plans", href: PLANS_PAGE },
      blocks: [
        {
          type: "p",
          text: `**${CORE}** is free and is the whole app. Everything else is a plan you add when you want it on ${PLANS_PAGE_LINK}, priced per company, not per person. How to add, switch and cancel one is in [Manage your plan](/help/manage-your-plan).`,
        },
        {
          type: "h",
          text: "What each plan adds",
        },
        {
          type: "list",
          note: "Pick what you need",
          items: [
            `**${CORE}** (free): booking, scheduling, jobs, quotes, invoicing, card and bank payments, recurring billing, the client portal, team chat, your own tasks and sticky notes, and ${ATLAS_FREE} Atlas tokens a month, for ${SEATS_INCLUDED} people. Each extra person is ${EXTRA_SEAT}.`,
            `**${VOICE}** (${VOICE_PRICE}, plus a one-time ${VOICE_SETUP} number setup): your business phone number, with calls in the app, voicemail, texting from the number, and Atlas call notes. Unlimited talk and text for normal business use (see [Unlimited talk and text on the Voice plan](/help/voice-plan-limits)). See [Get your business phone number](/help/set-up-business-line).`,
            `**${PRO}** (${PRO_PRICE}): unlimited people, [estimate tools](/help/build-an-estimate-tool), [Route Manager (beta)](/help/plan-routes), [automations](/help/build-an-automation), [agreements](/help/send-an-agreement), the [team map](/help/team-map), [clock-in, timesheets and labor cost](/help/clock-in-and-timesheets), [QuickBooks sync](/help/quickbooks), [tasks for your team](/help/tasks-and-reminders), [team sticky notes](/help/sticky-notes), and **Atlas Full** (${ATLAS_FULL} Atlas tokens a month).`,
            `**${MAX}** (${MAX_PRICE}): ${VOICE} and ${PRO} together, for less than both.`,
            `**${GALLERY}** (${GALLERY_PRICE}, coming soon): job photos stamped with who, when and where, before-and-after pairs, client galleries and photo reports. It joins ${MAX} at no extra charge for anyone already on it.`,
            `**Atlas Full** on its own (${ATLAS_FULL_PRICE}): ${ATLAS_FULL} Atlas tokens a month, if Atlas is the only extra you want. See [Atlas tokens and limits](/help/atlas-tokens).`,
          ],
        },
        {
          type: "h",
          text: "How to add one",
        },
        {
          type: "list",
          items: [
            `**${VOICE}**, **${PRO}** and **${MAX}**: ${HOW_TO_ADD_PRO}`,
            `**Atlas Full** on its own: message us from the Help Center and we switch it on for you.`,
            `Paying yearly costs ${ANNUAL_TERM}.`,
            `A plan can also be switched on for you by us — it then reads **Included** on the Plans page, with nothing to pay.`,
          ],
        },
        {
          type: "h",
          text: `What ${CORE} sees on a ${PRO} feature`,
        },
        {
          type: "p",
          text: `${PRO_GATE_LINE} Nothing you built is lost: automations you already turned on keep running, a QuickBooks you already connected keeps syncing, your time entries stay, and the people already on your team stay signed in.`,
        },
        {
          type: "p",
          text: `**${VOICE}** works the same way for the phone line: without it the Call and Text buttons use your own phone, and the Calls and Messages pages say what the plan adds, with a \`See the plan\` link.`,
        },
        {
          type: "h",
          text: "Processing fees",
        },
        {
          type: "p",
          text: `${RATES_LINE} Payments run through your own Square account, so the fee comes out on Square's side before the payout; the fee shown in WorkBench is an estimate and your Square dashboard has the exact amount on each payment. Full details are on the [pricing page](https://workbenchfsm.com/pricing).`,
        },
      ],
    },
    {
      slug: "manage-your-plan",
      title: "Manage your plan",
      summary: "Add Voice, Pro or Max, pay monthly or yearly, add people, change the card, cancel or resume — all on Settings → Plans.",
      keywords: ["subscribe", "subscription", "buy", "checkout", "upgrade", "downgrade", "annual", "yearly", "monthly", "cancel plan", "resume", "keep it", "card on file", "replace card", "card failed", "card didn't go through", "receipt", "invoice for my plan", "add a person", "seat", "extra user", "switch to max", "prorated", "setup fee", "included"],
      where: { label: "Plans", href: PLANS_PAGE },
      roles: "Account owner (admins can look)",
      blocks: [
        {
          type: "p",
          text: `**Settings → Plans** is the one place for plans. The top card says what you're on — **${CORE}** always, plus **${VOICE}**, **${PRO}** or **${MAX}** when you have them. **Included** next to a plan means we switched it on for your account at no charge; **previous billing** means an older ${VOICE} subscription that still runs through our earlier billing system. Only the account owner can add or change plans; admins can see the page. What each plan adds is in [Plans and pricing](/help/plans-and-pricing).`,
        },
        {
          type: "h",
          text: "Add a plan",
        },
        {
          type: "steps",
          note: "Two taps once the card is in",
          items: [
            `Go to **Settings → Plans**. Pick **Monthly** or **Annual · 2 months free** at the top — annual is ${ANNUAL_TERM}, and each card shows the price per term.`,
            `Press \`Add ${VOICE}\`, \`Add ${PRO}\` or \`Add ${MAX}\` (\`Switch to ${MAX}\` when you already have one of the two).`,
            "The first time, type your card into the sheet. It's Square's own secure card form; WorkBench never sees the number. Later plans just confirm against the card on file.",
            `Press \`Start …\`. The plan is on at once — the card reads **On** with its renewal date — and Square emails you the receipt.`,
          ],
        },
        {
          type: "list",
          items: [
            `**One-time number setup:** the first ${VOICE} or ${MAX} subscription for a company with no business number yet adds the ${VOICE_SETUP} setup fee, shown on the card as **+ ${VOICE_SETUP} one-time setup**. It covers buying the number and its carrier registration. A company that already has a number isn't charged it.`,
            `**${GALLERY}** says **Coming soon** — it can't be added yet.`,
            "**Receipts and invoices** come from Square (Block, Inc.) by email each time the card is charged; WorkBench doesn't send its own.",
          ],
        },
        {
          type: "h",
          text: "Switch monthly and annual, or go up to Max",
        },
        {
          type: "list",
          items: [
            "**Monthly → annual (or back):** flip the toggle at the top and the plan's card offers `Switch to annual` / `Switch to monthly`. Confirm in the sheet. Square prorates the change — you're credited for what's left of the old term.",
            `**${PRO} → ${MAX}:** press \`Switch to ${MAX}\` on the ${MAX} card. Prorated the same way; the ${PRO} (and ${VOICE}) card then reads **Part of ${MAX}**.`,
          ],
        },
        {
          type: "h",
          text: "Add people",
        },
        {
          type: "p",
          text: `${CORE} includes ${SEATS_INCLUDED} people. The **People** card shows how many you have of how many. \`Add a person · ${EXTRA_SEAT_MO}\` buys one more seat, billed monthly on the same card; \`Remove\` ends a paid seat at the close of its month. On ${PRO} and ${MAX} people are unlimited and the buttons disappear. Adding or reactivating someone on **Settings → Team & roles** past the limit shows the same message, with an \`Add a person\` link that brings you here.`,
        },
        {
          type: "h",
          text: "Change the card",
        },
        {
          type: "p",
          text: "One card pays for everything. Under **Card on file**, `Add a card` or `Replace` opens the card sheet; `Save card` moves every plan to the new card and removes the old one.",
        },
        {
          type: "h",
          text: "Cancel or resume",
        },
        {
          type: "list",
          items: [
            "`Cancel` on a plan's card ends it at the **end of the period you paid for** — the card reads **Ends <date>** and everything in the plan keeps working until then. Nothing is refunded for the rest of the term.",
            "Changed your mind before that date? Press `Keep it` and the plan carries on as before.",
            `Once the plan that gives you ${VOICE} has ended, your business number starts a 30-day countdown before it's released — see [Get your business phone number](/help/set-up-business-line).`,
          ],
        },
        {
          type: "h",
          text: "When a card doesn't go through",
        },
        {
          type: "p",
          text: `Square retries the charge on its own. You get a notification (**card didn't go through**), the Plans page shows a red line with a \`Replace card\` button, and the plan's card reads **Card failing**. Replace the card and the next retry clears it. If a renewal is still unpaid ${PAYMENT_GRACE} after its date, the plan's features pause until it is — your data stays, and paying brings everything back.`,
        },
        {
          type: "faq",
          items: [
            {
              q: "The Add buttons are greyed out.",
              a: "If the page says online checkout isn't switched on yet, message us from the Help Center and we set your plan up by hand. If you're not the account owner, ask the owner — the page says so under the top card.",
            },
            {
              q: "Can I pay by bank or invoice instead of a card?",
              a: "Plans are charged to a card through Square. Message us from the Help Center if that won't work for you.",
            },
            {
              q: "My Voice plan says \"previous billing\" — what does that mean?",
              a: "You subscribed before plans moved to this page, and that subscription still bills the old way. It keeps working as it is; message us from the Help Center if you'd like it moved onto your card here.",
            },
            {
              q: "I was on Max — does the Gallery add cost later?",
              a: `No. ${GALLERY} joins ${MAX} at no extra charge for anyone already on it when it ships.`,
            },
          ],
        },
      ],
    },
    {
      slug: "report-a-bug",
      title: "Report a bug or suggest a feature",
      summary: "Tell the WorkBench team, and follow what happens to it.",
      keywords: ["bug", "feedback", "feature request", "idea", "support", "contact support", "roadmap", "broken"],
      where: { label: "Help & Feedback", href: "/app/support" },
      blocks: [
        {
          type: "steps",
          items: [
            "Open **Help Center** from the menu and use the buttons at the bottom of it (on this page they're right below). Or open **Help & Feedback** directly.",
            "Choose `Report a bug` or `Suggest a feature`.",
            "Say what happened and what you expected, and where it happened if you can. Then send it.",
          ],
        },
        {
          type: "p",
          text: "Your tickets stay on that page with their status: **Under review**, **Planned**, **Fixed** / **Done**, or **Not planned**, plus any reply from the team. Planned ideas show up on the Upcoming Features board, linked from the bottom of Home.",
        },
      ],
    },
  ],
};

export const mobileSection: HelpSection = {
  id: "mobile",
  title: "Mobile apps & offline",
  icon: "mobile",
  tagline: "WorkBench on iPhone and Android, and working without signal.",
  articles: [
    {
      slug: "mobile-apps",
      title: "Get the iPhone and Android apps",
      summary: "Download WorkBench FSM and sign in with the same account.",
      keywords: ["iphone", "ios", "android", "app store", "google play", "download", "mobile app", "face id", "app lock", "in use on another device", "use it here"],
      blocks: [
        {
          type: "list",
          items: [
            "**iPhone**: search the App Store for **WorkBench FSM**.",
            "**Android**: search Google Play for **WorkBench**.",
            "Sign in with the same email and password (or Google / Apple).",
          ],
        },
        {
          type: "p",
          text: "The apps update themselves. New features show up without a store update. Turn on **App lock** in My Profile to open the app with Face ID or your fingerprint.",
        },
        {
          type: "tip",
          text: "On iPhone, the app can ring for business-line calls even when it's closed. Allow the microphone when asked.",
        },
        {
          type: "p",
          text: "A login works on one device at a time. If your computer still has WorkBench open when you open the phone app, the phone shows **This login is in use on …** — press `Use it here` and carry on; the computer shows the same screen the next time you touch it. Answering a call on the phone moves the login there on its own, so a call is never cut off by this. See [Add team members](/help/add-team-members).",
        },
      ],
    },
    {
      slug: "siri",
      title: "Hands-free with Siri (iPhone)",
      summary: "Clock in, get directions, complete a job, and call or text your next client without touching your phone.",
      keywords: ["siri", "hey siri", "voice", "hands free", "shortcuts", "shortcuts app", "clock in by voice", "directions", "apple maps", "spotlight", "complete job", "on my way"],
      blocks: [
        {
          type: "p",
          text: "With the iPhone app installed and signed in, Siri can run WorkBench for you while you drive or work. Say **\"Hey Siri\"** and one of the phrases below, ending with **with WorkBench** or **in WorkBench**. Nothing to set up: the phrases are ready the moment the app is installed, and they appear in the Shortcuts app and Spotlight too.",
        },
        {
          type: "list",
          note: "Try these first",
          items: [
            "**\"Clock me in with WorkBench\"** / **\"Clock me out with WorkBench\"** — clocks in to your next job, or out of the one you're on. Siri says the job's name back.",
            "**\"Next job in WorkBench\"** — opens your next job in the app.",
            "**\"Directions to my next job in WorkBench\"** — opens Apple Maps to the job's address (or the client's).",
            "**\"What's my day look like in WorkBench\"** — reads today's schedule.",
            "**\"What's my next job in WorkBench\"** — the job, the client, and when.",
            "**\"What's my time on this job in WorkBench\"** — how long you've been clocked in.",
            "**\"Complete my job in WorkBench\"** — marks the job you're on complete, the same as the `Complete job` button. If checklist tasks are still open, Siri tells you.",
            "**\"Call my next client with WorkBench\"** / **\"Text my next client with WorkBench\"** — reaches the client of your next job. For a text, Siri asks what to say.",
            "**\"Call Maria Lopez with WorkBench\"** / **\"Text Maria Lopez with WorkBench\"** — any client by name. Siri asks who if it didn't catch the name.",
            "**\"Tell my next client I'm on my way with WorkBench\"** — sends your **On my way** text and notes it on the job.",
            "**\"Call back my last missed call with WorkBench\"** — returns the last missed call on your business line.",
            "**\"Add a note in WorkBench\"** — Siri asks for the note and adds it to the job you're clocked into.",
          ],
        },
        {
          type: "h",
          text: "Calls and texts",
        },
        {
          type: "p",
          text: "Siri does what the app's own Call and Text buttons do. With a business line, a call rings **your cell first**; answer, press 1, and the customer is dialed from your business number. A text goes out from the line and lands in the client's thread on the **Messages** page — for owners, admins and sales roles, who can send from the line in the app too. Without a line, for a tech account, or for a client who can't be texted (no number, or they texted STOP), Siri asks to open WorkBench, then opens your phone's dialer or Messages app with the number and the text filled in, so the call or text comes from your own number.",
        },
        {
          type: "faq",
          items: [
            {
              q: "Siri says \"Open WorkBench and sign in first.\"",
              a: "The app is signed out. Open the app, sign in, and try again.",
            },
            {
              q: "Siri says I have no job to clock into.",
              a: "Your next job is the one you're clocked into, else today's anytime job, else the next scheduled job whose time hasn't passed — the same stop Home shows as **Up next** — among the jobs assigned to you (or to no one). Give the job a date or assign yourself to it. Sales accounts have no jobs to clock into.",
            },
            {
              q: "Siri opens the app instead of doing it quietly.",
              a: "Only Next job, Directions, and calls or texts that go from your own phone (no business line, a tech account, or a client who can't be texted) bring the app forward. Everything else answers without opening it.",
            },
            {
              q: "The phrases don't work at all.",
              a: "Siri shortcuts need iOS 16.4 or later and the WorkBench FSM app from the App Store, not the website added to your Home Screen. Check Settings → Siri & Search → WorkBench and make sure the app is allowed.",
            },
          ],
        },
        {
          type: "tip",
          text: "Siri may ask \"Clock in with WorkBench?\" the first time you use a phrase. Say yes once and it stops asking.",
        },
      ],
    },
    {
      slug: "offline-mode",
      title: "Working without signal",
      summary: "What you can see and do offline, and how changes sync.",
      keywords: ["offline", "no signal", "no internet", "sync", "queued", "saved data"],
      blocks: [
        {
          type: "p",
          text: "When you lose signal, a pill says **Offline — saved data** and you can still open Home, the Jobs list, the Schedule, and today's and tomorrow's jobs.",
        },
        {
          type: "list",
          items: [
            "**These save and sync later**: clocking in and out, notes, checklist ticks, job status changes and sign-offs. You'll see \"N changes queued\" and a `Sync now` button.",
            "**These need signal**: routes, creating new records, and payments.",
          ],
        },
        {
          type: "tip",
          text: "Open your day's jobs once while you have signal. That's what WorkBench keeps for offline.",
        },
      ],
    },
  ],
};
