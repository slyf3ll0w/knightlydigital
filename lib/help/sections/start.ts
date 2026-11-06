import type { HelpSection } from "../types";
import { PRO, proTip } from "../plan-copy";

export const startSection: HelpSection = {
  id: "getting-started",
  title: "Getting started",
  icon: "start",
  tagline: "Turn on online payments, set up the basics, find your way around.",
  articles: [
    {
      slug: "activate-payments",
      title: "Turn on online payments (connect Square)",
      summary: "Sign-up ends with a short payment setup: pick who pays the card fee and connect Square, and clients can pay from their pay links.",
      keywords: ["square", "connect square", "online payments", "turn on payments", "pay button", "card payments", "ach", "bank payments", "activate", "verify", "verification", "square account", "bank account", "link bank", "payout account", "set up payments", "payment setup", "sign up", "create a square account", "who pays the card fee"],
      where: { label: "Settings → Payments & accounting", href: "/app/settings" },
      roles: "Account owner",
      blocks: [
        {
          type: "p",
          text: "Card and bank (ACH) payments in WorkBench run through your own **Square** account. Connect it once and every invoice pay link, quote deposit and client-portal payment goes straight to Square, then pays out to your bank on Square's schedule. Only the **account owner** can connect it, and there is no application or waiting period on our side.",
        },
        {
          type: "p",
          text: "**Signing up ends on the payment-setup screen**, and the app opens the moment Square is connected. It's two choices on one page, and a new account comes back to it until it's done. The same screen is `Walk me through it` on the Online Payments card and **Set up online payments** on the Home checklist, so an account that was opened with an invite code can do it later.",
        },
        {
          type: "steps",
          note: "A couple of minutes, owner only",
          items: [
            "**Who pays the card fee?** Pick one of the two cards. **Your client pays a service fee** — added at checkout and shown before they pay, so the full invoice amount reaches you. **You pay the processing fee** — your clients see no fee and Square's fee comes out of each payment. Each card shows its rates and what a $500 payment looks like; see [The service fee](/help/card-surcharging). You can change this later under **Settings → Payments & accounting → Service fee**.",
            "**Create your Square account.** Press `Create your Square account`. It opens Square's free sign-up on WorkBench's rates for the model you just picked, in a new tab — a few minutes; Square asks for your business details, the owner's identity and the bank account to pay you out to. Your money goes to this account, so it's yours, made for your business. Then come back to WorkBench.",
            "**Finish setup.** Press `Finish setup` and sign in to the Square account you just made.",
            "Approve the access Square lists. WorkBench needs to take payments, issue refunds, keep cards on file for your clients, and read your payouts and disputes so they show on the Payments page; it never sees card numbers.",
            "You land back on **Square is connected** with your business name — press `Open WorkBench`. From that moment pay links show a **Pay** button. (Connecting from Settings instead lands you back on the Online Payments card with **Connected to** your business name.)",
            "Link the bank account Square should pay you out to. Until you do, clients can pay but the money sits in your Square balance — the Home checklist, the Online Payments card and a reminder on Home all say **Add your bank account to Square** with a button that opens the right page in Square: Settings → Account & Settings → Banking → Bank Accounts → Add Bank Account. Square verifies it (instantly through your bank login, or within a couple of business days) and emails a confirmation link to open within 24 hours. The reminder leaves on its own once Square confirms it, or press `I've added it — check again`.",
          ],
        },
        {
          type: "p",
          text: "The Online Payments card in Settings shows the Square business and location your money goes to. `Check connection` confirms Square still accepts the link; `Disconnect` removes it, and pay links stop offering online payment until you connect again. Before you connect, the card lists both of Square's sign-up links — one per fee model — with **Your setting** on the one that matches your Service fee switch.",
        },
        {
          type: "tip",
          text: "Once connected, the **Payments** page shows every payment, your payouts to the bank, any disputes and revenue reports, read live from your Square account — see [Your Payments page](/help/payments-page). The things that stay Square-only (instant transfer, deposit schedule, bank accounts) are links at the bottom of each tab.",
        },
        {
          type: "tip",
          text: "Connected Square a while ago? The Payments page and the Online Payments card may ask you once to **Reconnect Square** so WorkBench can read your payouts and disputes. It's the same sign-in as the first time, one click, and nothing else changes — payments keep working meanwhile.",
        },
        {
          type: "faq",
          items: [
            {
              q: "Why can't my clients see a Pay button?",
              a: "Square isn't connected yet, or it was disconnected. Open **Settings → Payments & accounting** and press `Connect Square`. You can still record cash, check and other payments with `Collect payment` in the meantime.",
            },
            {
              q: "I signed up and WorkBench keeps bringing me back to the payment-setup screen.",
              a: "That's the last step of signing up: the app opens once your Square account is linked. Pick who pays the card fee, create your Square account from the button, then press `Finish setup` and sign in to it. Only the account owner can do it — a teammate who signs in before then sees a note to ask the owner. Have an invite code from us? `Have an invite code?` on that screen skips the step, and you connect Square later from Settings.",
            },
            {
              q: "I connected Square in another tab (or on my phone it opened the browser) and the screen didn't move on.",
              a: "Come back to the WorkBench tab or app — the screen checks again whenever it comes into view. If it still says to connect, refresh it.",
            },
            {
              q: "Square sent me back and the card says the connection didn't complete.",
              a: "Start again from the Online Payments card. Either the link had expired or access was declined on the Square side; approve every permission Square lists.",
            },
            {
              q: "It says that Square account is already connected to another WorkBench company.",
              a: "A Square account can be connected to one WorkBench company at a time. Disconnect it from the other company first, or connect a different Square account.",
            },
            {
              q: "The card says Square hasn't renewed this connection lately.",
              a: "Press `Check connection`. If it fails, press `Disconnect` and then `Connect Square` again. Payments you already took are not affected.",
            },
          ],
        },
      ],
    },
    {
      slug: "first-week-setup",
      title: "Set up WorkBench in your first week",
      summary: "The Get started checklist on Home walks you from a new account to your first quote and job.",
      keywords: ["setup", "onboarding", "checklist", "get started", "new account", "getting started", "first steps", "business hours"],
      where: { label: "Home", href: "/app/dashboard" },
      roles: "Owners and admins",
      blocks: [
        {
          type: "p",
          text: "A new account opens with a **Get started** checklist at the top of **Home**. Each step links to the right page and ticks itself off as you go: nothing to mark done by hand. `Hide` takes it off Home; **Settings → Company → `Show on Home`** brings it back. Once the core steps are done it leaves on its own.",
        },
        {
          type: "steps",
          note: "Go top to bottom",
          items: [
            "**Set up online payments**: pick who pays the card fee and connect your Square account — done already if you did it when you signed up. See [Turn on online payments](/help/activate-payments).",
            "**Link your bank account in Square**: Square pays you out to it; until then money waits in your Square balance. The step ticks itself once Square confirms the account.",
            "**Add your services** (or **Review your prices** if your price book came pre-loaded): Settings → Services, so quotes, jobs and invoices fill themselves in.",
            "**Fill in your business details**: phone, address, logo and brand color under Settings → Company. They go on your booking page and every document. The timezone there decides what \"today\" means on your schedule.",
            "**Set your business hours**: they live in Settings → Booking & forms. Booking and scheduling use them to know when you're open. Times you're busy every week inside those hours (lunch, a standing appointment) go under **Repeating blocks** right below.",
            "**Add your first client**: type one in, or bring your list over with a CSV. See [Import your clients](/help/import-clients).",
            "**Send your first quote**. See [Create and send a quote](/help/create-and-send-a-quote).",
            "**Schedule your first job**: it lands on your calendar and your phone.",
            "**Share your booking page**: copy the link for your website, Google profile or texts. See [Take bookings online](/help/online-booking).",
            "Optional: **Add your team** (see [Add team members](/help/add-team-members)) and **Install the app on your phone** (see [Get the app](/help/mobile-apps)).",
          ],
        },
        {
          type: "tip",
          text: "Atlas can do most of this for you. Try \"add a service called Drain cleaning for $189\" or \"build me a booking form for free estimates\".",
        },
      ],
    },
    {
      slug: "find-your-way-around",
      title: "Find your way around (and keyboard shortcuts)",
      summary: "Where everything lives on desktop and on your phone, plus the shortcuts that save clicks.",
      keywords: ["navigation", "menu", "sidebar", "more", "shortcuts", "keyboard", "command palette", "search", "cmd k", "ctrl k"],
      blocks: [
        {
          type: "h",
          text: "On a computer",
        },
        {
          type: "p",
          text: "The sidebar has Home, Schedule, Clients, Quotes, Jobs and Invoices at the top, then groups: **Work** (Leads, Requests, Estimates, Messages, Calls, Appointments, Routes, Tasks, Agreements, Timesheets), **Money** (Payments, Recurring) and **Business** (Overview, Automations, Services, Booking & forms, Team & roles). You only see what your role can open.",
        },
        {
          type: "h",
          text: "On your phone",
        },
        {
          type: "p",
          text: "The tab bar has Home and Schedule. Everything else is in **More**, grouped as Clients, Sales, Field work, Money and Business. Press and hold any item for quick actions like `New …`. The `+` button opens the Create sheet — client, lead, request, appointment, quote, job, task, call, message, invoice — and the More and Create sheets both close with a swipe down. **Call** and **Message** open a search box right there: type a name and tap it to call or message them. A red number on **More** (and on the Messages tile inside it) is how many client messages are waiting; it goes down as soon as you open each conversation. The pill at the top-left names the page you came from, and tapping it goes exactly there; inside one section it just says Back.",
        },
        {
          type: "h",
          text: "Keyboard shortcuts",
        },
        {
          type: "list",
          items: [
            "`⌘K` / `Ctrl+K` opens the command palette: search anything and jump to it.",
            "`?` shows every shortcut.",
            "`g` then a letter goes somewhere: `g` `s` Schedule, `g` `c` Clients, `g` `q` Quotes, `g` `j` Jobs, `g` `i` Invoices, `g` `l` Leads, `g` `k` Tasks.",
            "`n` then a letter creates something: `n` `c` client, `n` `q` quote, `n` `j` job, `n` `i` invoice, `n` `a` appointment, `n` `t` task.",
            "On the Schedule: `T` jumps to today, `←` `→` step through days, `N` starts a new job.",
          ],
        },
        {
          type: "faq",
          items: [
            {
              q: "A link sent me back to the Dashboard.",
              a: "That page isn't open to your role. For example, techs don't see Quotes or Invoices, and Sales doesn't see Timesheets. Ask an owner or admin to change your role if you need it.",
            },
          ],
        },
      ],
    },
    {
      slug: "tasks-and-reminders",
      title: "Tasks & reminders",
      summary: "Personal tasks with a due time and a reminder, and (for owners and admins) tasks handed to the team.",
      keywords: ["task", "to-do", "todo", "reminder", "remind me", "assign", "follow up", "call back", "overdue", "checklist"],
      where: { label: "Tasks", href: "/app/tasks" },
      blocks: [
        {
          type: "p",
          text: "A task is a note to yourself with a date: \"call Mrs. Patel back Tuesday\", \"order the filter\", \"pick up the permit\". It isn't a job and it isn't the job checklist (that stays on the job as the close-out list). Tasks live under **Tasks**, and the ones due today or overdue also show on **Home**.",
        },
        {
          type: "steps",
          items: [
            "Open **Tasks** and press `New task` (or `+` → `Task` on your phone, or `n` `t` on a keyboard).",
            "Type what needs doing. Add notes if there's more to say.",
            "Pick a **Due** date, and a time or leave it on **Anytime**.",
            "Choose a **Reminder**: at the due time, 15 minutes, 1 hour or 1 day before, or pick your own time. A task with no date can still take a custom reminder.",
            "If the task happens somewhere — \"drop the permit at the city office\" — press `Add a place`, pick a saved place or type the address, and say how long it takes. It then shows on your route for that day (see [Plan and optimize routes](/help/plan-routes)).",
            "Tick **High priority** if it has to happen. Press `Add task`.",
          ],
        },
        {
          type: "list",
          items: [
            "**Finish a task:** tap the circle. On your phone you can also swipe a row left for `Done` or `Delete`.",
            "**Edit:** tap the row, then `Edit`. Everything can change; only owners and admins can change who a task is for.",
            "**Groups:** Overdue, Today, Tomorrow, Later and No date. Done tasks move to the **Done** tab, where you can untick one by mistake.",
            "**From a client or job page:** the Create menu's `Task` starts one already linked to that client or job, so the link shows on the task.",
            "**Link a client:** in the editor press `Link a client`, type a name and pick the client or lead the task is about. The link shows on the task row and opens their page; the × on the chip removes it.",
          ],
        },
        {
          type: "h",
          text: "Reminders",
        },
        {
          type: "p",
          text: "A reminder arrives as a push notification and as a card in the bell, with a tap that opens the task. If none of your devices has notifications on, it comes to your login email instead (your **Email me too** choice in Settings → My Profile wins either way). For a task with a date but no time, \"at the due time\" means 9:00 AM that day in your company's timezone. Reminders land within about five minutes of the time you picked.",
        },
        {
          type: "h",
          text: "Tasks for your team",
        },
        {
          type: "p",
          text: "Owners and admins see a **Team** tab with everyone's open tasks and can pick who a new task is for. Picking several people makes one task each, so each person can finish theirs and each gets their own reminder. The person hears about it with a push (\"Dave gave you a task\"). Everyone else can only create tasks for themselves.",
        },
        proTip("Giving tasks to your team"),
        {
          type: "tip",
          text: "Overdue tasks sit in **Needs you** on Home until they're done or moved; they don't keep buzzing your phone. A reminder set for a time that has already passed doesn't fire at all.",
        },
        {
          type: "faq",
          items: [
            {
              q: "I didn't get the reminder.",
              a: "Reminders go to the devices where you've turned notifications on (Settings → My Profile, or the bell on your phone); with no such device they're emailed to your login address, unless you or your company turned notification emails off. If the task was already marked done before its time, no reminder is sent. The card still shows in the bell.",
            },
            {
              q: "Can I give a task to someone?",
              a: `Owners and admins can, on the ${PRO} plan (or Max). Without it the **Team** tab and the who-it's-for picker don't show, and the menu marks Tasks with a small **${PRO}** chip; the owner adds ${PRO} on Settings → Plans. Sales + Tech, Sales and Tech roles create tasks for themselves only.`,
            },
            {
              q: "Where did my finished task go?",
              a: "To the **Done** tab, for 90 days — your own finished tasks. Owners and admins can switch Done to `Team` to see everyone's. Tap its circle there to bring it back.",
            },
          ],
        },
      ],
    },
    {
      slug: "sticky-notes",
      title: "Sticky notes",
      summary: "Square paper notes you can stick on any page: a scribble, a number, a reminder to yourself, or one the whole team sees.",
      keywords: ["sticky", "note", "post-it", "right click", "team", "hide notes", "expire", "resize", "any page", "home"],
      where: { label: "Any page (Home to start)", href: "/app/dashboard" },
      blocks: [
        {
          type: "p",
          text: "Notes are for the things that aren't tasks yet: a supplier's number, \"the Smith job needs a 40 ft ladder\", a scribble from a call. A note sticks to the page you put it on — a job, a client, a quote, Home — right where you stuck it, and you can slide it around or drag its corner to resize it.",
        },
        {
          type: "steps",
          items: [
            "On a computer, right-click an empty spot on any page (not on a button or a row) and choose `Stick a note here`. On your phone, open **Notes on this page** at the top of the screen and press `+`.",
            "Write on it. Up to 400 characters, no formatting; web addresses become links.",
            "Pick a paper color and a size (S, M, L), and if it should come down by itself: end of today, tomorrow, in a week, or a day you pick. Press `Stick it`.",
          ],
        },
        {
          type: "list",
          items: [
            "**Edit or take down:** tap the note. `Take down` removes it; an expiring note comes down on its own.",
            `**Team notes** (${PRO}): tick **Show it to the whole team** and everyone in the company sees the note on that page, with your initials in the corner. Each person can slide it around on their own screen. Only you (or an owner or admin) can edit or take it down. Your own notes are free on every plan.`,
            "**Make a task:** press `Make a task` on the note and it turns into a task on your list (the first line becomes the title); the note stays.",
            "**Hide them:** right-click an empty spot and choose `Hide sticky notes` (or `Hide sticky notes everywhere` in the phone strip). `Show sticky notes` brings them back. It's per device.",
          ],
        },
        proTip("Team sticky notes"),
        {
          type: "tip",
          text: "Ask Atlas: \"stick a note on the Patel job that it needs a permit\" puts one on that job's page after you confirm.",
        },
        {
          type: "faq",
          items: [
            {
              q: "I can't add another note.",
              a: "Each person can have 30 notes up, and the team can have 30 shared notes up. Take one down first.",
            },
            {
              q: "A teammate's note moved on my screen.",
              a: "Positions are per person; only you move what you see. If a note changed, the author edited it.",
            },
            {
              q: "Right-click doesn't offer a note.",
              a: "It only works on empty space: not on a button, a link, a row, a field, or while text is selected. Try the blank area beside a card.",
            },
          ],
        },
      ],
    },
    {
      slug: "roles-and-permissions",
      title: "Roles: who can see and do what",
      summary: "Owner, Admin, Sales + Tech, Sales and Tech, and what each one can open.",
      keywords: ["role", "permissions", "access", "owner", "admin", "tech", "technician", "sales", "can't see"],
      where: { label: "Team & roles", href: "/app/settings/team" },
      blocks: [
        {
          type: "list",
          items: [
            "**Owner**: everything, including managing other owners and admins.",
            "**Admin**: everything except managing owners and admins.",
            "**Sales + Tech**: sales and field work combined. The full job board, invoices and payments, but only the leads and clients assigned to them. No settings or team access.",
            "**Sales**: their assigned leads, requests and quotes, and converting them to jobs. Sees invoices and payments only if **Sales can see invoices & payments** is on. Doesn't clock in.",
            "**Tech**: their assigned jobs and schedule. No prices anywhere, and no Clients, Leads, Quotes or Invoices lists. They do see contact info for clients on their own jobs.",
          ],
        },
        {
          type: "p",
          text: "Owners and admins are called **managers** in these guides. Managers see every lead and client. Only managers can delete, refund, charge a saved card, and open Expenses, Insights and QuickBooks.",
        },
        {
          type: "faq",
          items: [
            {
              q: "A salesperson can't find a client.",
              a: "Sales and Sales + Tech only see clients assigned to them. Open the client as a manager and assign them to that person.",
            },
            {
              q: "My tech can't see prices on a job.",
              a: "That's on purpose. Techs never see pricing. Change their role to Sales + Tech if they need it.",
            },
          ],
        },
      ],
    },
    {
      slug: "free-invoice-estimate-tools",
      title: "The free invoice and estimate generators",
      summary: "Make an invoice or estimate at workbenchfsm.com/tools with no account, download or email it, and bring it into WorkBench with one click.",
      keywords: ["free invoice generator", "free estimate generator", "invoice template", "estimate template", "invoice maker", "quote generator", "pdf", "tools", "free tools", "get paid online", "draft", "invoice came with me", "sign up with an invoice", "logo", "template by trade", "email it", "email the invoice", "send the invoice", "viewed", "verification code", "report it"],
      roles: "Anyone — no account needed",
      blocks: [
        {
          type: "p",
          text: "The **free tools** on the WorkBench website make a professional invoice or estimate in your browser. Download it as a PDF, or email it to the client straight from the page and see when they open it. There is no account to open and no watermark, and you can make as many PDFs as you like. The PDF is rendered by the same engine that prints real WorkBench invoices and quotes, so it looks exactly like one. Every trade has a template page with its usual line items already filled in (open **Templates by trade** on the tools page); the prices on those are starting points for you to edit, not ours.",
        },
        {
          type: "steps",
          items: [
            "Open [workbenchfsm.com/tools](/tools) and pick the **invoice generator** or the **estimate generator**, or a trade template.",
            "**Your business**: name (the only required field), contact details, `Add your logo` (a PNG or JPG) and a **Color** for the header rule and total.",
            "**Bill to** / **Prepared for**: the client's name and address.",
            "**Details**: the document number, the date, and the due date (invoice) or the valid-through date (estimate).",
            "**Line items**: what you did, quantity and price, with an optional description under each. On an estimate, tick **Optional for the client** on anything they can leave off.",
            "**Tax, discount and message**: sales tax as a percent, a discount as a percent or an amount, a deposit on an estimate, and the note printed at the bottom.",
            "Press `Download PDF`. The preview on the right is what you get. Or press `Email it` to send it to the client from the page — see below.",
          ],
        },
        {
          type: "tip",
          text: "The page saves what you type in that browser, so a refresh or a closed tab doesn't lose it. `Start over` clears it. Nothing is stored on our side unless you email the document or open an account with it.",
        },
        { type: "h", text: "Emailing it to the client" },
        {
          type: "p",
          text: "`Email it` sends the document to your client from the page, with a **View** button that opens it in their browser and a PDF link under it. The email comes from **your business name via WorkBench**, and when the client replies, the reply lands in your inbox. The first time, the page checks that the email address is really yours — we send a six-digit code, you type it in, and that browser remembers you for a month.",
        },
        {
          type: "steps",
          items: [
            "Fill in the document (your business name and one priced line are the minimum) and press `Email it`.",
            "**Your email**: the address the client will reply to. Press `Send me a code`, open the code email, and type the six digits. You do this once per browser, not per invoice.",
            "**To**: the client's address (filled in from **Bill to** when you typed one there). `Add another address` sends it to a second person; **Send a copy to me** puts you on the email too.",
            "Press `Send the invoice`. The page confirms who it went to, and **See what they see** opens the client's copy.",
          ],
        },
        {
          type: "p",
          text: "Under the buttons, **Emailed from here** lists every document you sent from that browser with a **Viewed** stamp once the client opens it (and **Not opened yet** until then). The client's copy stays online for 60 days; the PDF is always on it.",
        },
        {
          type: "list",
          items: [
            "The free tool sends up to **five documents a day**, to up to **two addresses** each. The email itself is a fixed letter — your name, the total, the View button — so the only thing you write is the document.",
            "Every client copy carries a small **Report it** link. A client who says they never asked for the document stops that email address from sending through the free tool, so send only to people who expect it.",
            "A WorkBench account has no sending limit, and its emails carry a **Pay** button and automatic reminders — that is what `Get paid online` sets up, with the document and the client already in the account.",
          ],
        },
        { type: "h", text: "Bringing it into WorkBench" },
        {
          type: "p",
          text: "Beside the download is `Get paid online` (on an estimate, `Send it for e-signature`). It opens the sign-up form with your business name, email and phone already filled in, and the document comes with you: the moment the account opens, the invoice is in **Invoices** as a draft (an estimate is in **Quotes** — WorkBench calls estimates quotes), the client is saved under **Clients**, your logo is the company logo, and the tax rate you used is the default sales tax. A new account goes through the payment-setup screen first — see [Turn on online payments](/help/activate-payments) — and the invoice is waiting when you land in the app.",
        },
        {
          type: "list",
          items: [
            "Open the invoice and press `Send to client` to email or text a pay link, or open the quote and send it for approval and signature — see [Send an invoice](/help/send-an-invoice) and [Create and send a quote](/help/create-and-send-a-quote).",
            "The document gets your account's next number, not the number typed on the website, so your numbering stays in one sequence. Everything else — lines, prices, discount, tax, deposit, message — comes across as typed.",
            "The link that carries the document in works for two weeks and once. If it expires, make the PDF again and press the button again.",
          ],
        },
        {
          type: "faq",
          items: [
            {
              q: "I pressed Get paid online but I already have a WorkBench account.",
              a: "The button opens a new company. To use the document in an existing account, sign in and make the invoice or quote there; the free tool has no way to add to an account that already exists. (A signed-in Google login with no company yet can use it: the company opens on that login.)",
            },
            {
              q: "The PDF says Estimate but the app says Quote.",
              a: "Same thing. The website uses the word most people search for; inside WorkBench a quote is what the client approves and signs, and it converts to the job and the invoice.",
            },
            {
              q: "My logo won't upload.",
              a: "Use a PNG or JPG. Large files are shrunk automatically, but a very large or unusual format is refused — export it from your design tool at around 600 pixels wide.",
            },
            {
              q: "Why do I have to enter a code before I can email it?",
              a: "The email goes out under your business name with replies to your address, so the page makes sure the address is yours first. It is one code per browser, good for a month — not one per invoice. If the code hasn't arrived in a minute, check spam, then press `Use a different email` and try again; a code expires after ten minutes.",
            },
            {
              q: "The client says the email never came.",
              a: "Ask them to check spam for an email from your business name via WorkBench, and check **Emailed from here** on the tool page: if the row says **Viewed**, someone opened it. Open **See what they see** and send the client that link directly, or download the PDF and attach it yourself.",
            },
            {
              q: "I've sent today's five. Now what?",
              a: "Download the PDF and send it from your own email, or press `Get paid online`: a free WorkBench account sends as many as you like, each with a pay link and reminders, and this document comes with you.",
            },
            {
              q: "Can clients pay the PDF?",
              a: "Not from the PDF, and not from the emailed copy either — both are documents with no payment button. Paying by card or bank transfer from a link needs the invoice in a WorkBench account with Square connected, which is what `Get paid online` sets up.",
            },
          ],
        },
      ],
    },
  ],
};
