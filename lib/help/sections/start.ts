import type { HelpSection } from "../types";

export const startSection: HelpSection = {
  id: "getting-started",
  title: "Getting started",
  icon: "start",
  tagline: "Activate your account, set up the basics, find your way around.",
  articles: [
    {
      slug: "activate-payments",
      title: "Activate your account (business verification)",
      summary: "The one-time verification that turns on online payments and emails to your clients.",
      keywords: ["verify", "verification", "kyc", "finix", "underwriting", "activate", "approved", "invite code", "under review"],
      where: { label: "Activate", href: "/app/activate" },
      roles: "Account owner",
      blocks: [
        {
          type: "p",
          text: "Before WorkBench can take card and bank payments for you, the payment processor has to verify your business. It's a standard form, about 10 minutes, and only the **account owner** can fill it in.",
        },
        {
          type: "steps",
          note: "About 10 minutes, owner only",
          items: [
            "Open WorkBench. New accounts land on **Verify your business to activate your account**.",
            "Press `Start verification` (or `Continue verification` to pick up where you left off).",
            "Enter your legal business name and address, your EIN (or SSN if you're a sole proprietor), the owner's identity details, and the bank account for your payouts.",
            "Submit. You'll see **Verification submitted — you're in**, and you can use the app right away.",
            "Approval usually takes 1–2 business days. Until then, charging cards and sending emails to clients stay off.",
          ],
        },
        {
          type: "p",
          text: "Check where you stand in **Settings → Payments & accounting → Online Payments**. It shows **under review**, **enabled**, or a request for more information with a `Continue application` button.",
        },
        {
          type: "tip",
          text: "Joined with an invite code? You skipped this step. Online payments show as **Coming soon** until the business is verified.",
        },
        {
          type: "faq",
          items: [
            {
              q: "Why can't my clients see a Pay button?",
              a: "Online payments turn on when your business is approved. Until then the pay page says your business isn't taking online payments yet. You can still record cash, check and other payments with `Collect Payment`.",
            },
            {
              q: "Emails to clients fail with \"Email isn't set up on this server yet.\"",
              a: "Client emails switch on with approval too. In the meantime, use `Copy client link` on quotes and `Copy payment link` on invoices and send them yourself.",
            },
            {
              q: "The underwriter asked for more information.",
              a: "Press `Continue application` in the Online Payments card, answer what they asked for, and submit again.",
            },
          ],
        },
      ],
    },
    {
      slug: "first-week-setup",
      title: "Set up WorkBench in your first week",
      summary: "The short list that gets you from a new account to sending your first quote.",
      keywords: ["setup", "onboarding", "checklist", "new account", "getting started", "first steps"],
      where: { label: "Settings", href: "/app/settings" },
      roles: "Owners and admins",
      blocks: [
        {
          type: "steps",
          note: "Go top to bottom",
          items: [
            "**Verify your business** so you can take payments. See [Activate your account](/help/activate-payments).",
            "**Company info and timezone**: Settings → Company. The timezone decides what \"today\" means on your schedule and dashboard.",
            "**Branding**: add your logo and colors in Settings → Branding. Clients see them on quotes, invoices and the client portal.",
            "**Price book**: add your services and products in Settings → Services, so quotes and invoices fill themselves in.",
            "**Bring in your clients** with a CSV. See [Import your clients](/help/import-clients).",
            "**Add your team** and pick each person's role. See [Add team members](/help/add-team-members).",
            "**Booking page**: share your link or put the form on your website. See [Take bookings online](/help/online-booking).",
            "Send your first quote. See [Create and send a quote](/help/create-and-send-a-quote).",
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
          text: "The tab bar has Home and Schedule. Everything else is in **More**, grouped as Clients, Sales, Field work, Money and Business. Press and hold any item for quick actions like `New …`. The `+` button opens the Create sheet — client, lead, request, appointment, quote, job, task, call, message, invoice — and the More and Create sheets both close with a swipe down. **Call** and **Message** open a search box right there: type a name and tap it to call or message them. A red number on the `+` button (and on the Message tile and the Messages tile in More) is how many client messages are waiting; it goes down as soon as you open each conversation. The pill at the top-left names the page you came from, and tapping it goes exactly there; inside one section it just says Back.",
        },
        {
          type: "h",
          text: "Keyboard shortcuts",
        },
        {
          type: "list",
          items: [
            "`⌘ K` / `Ctrl K` opens the command palette: search anything and jump to it.",
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
      summary: "Personal to-dos with a due time and a reminder, and (for owners and admins) tasks handed to the team.",
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
          ],
        },
        {
          type: "h",
          text: "Reminders",
        },
        {
          type: "p",
          text: "A reminder arrives as a push notification and as a card in the bell, with a tap that opens the task. For a task with a date but no time, \"at the due time\" means 9:00 AM that day in your company's timezone. Reminders land within about five minutes of the time you picked.",
        },
        {
          type: "h",
          text: "Tasks for your team",
        },
        {
          type: "p",
          text: "Owners and admins see a **Team** tab with everyone's open tasks and can pick who a new task is for. Picking several people makes one task each, so each person can finish theirs and each gets their own reminder. The person hears about it with a push (\"Dave gave you a task\"). Everyone else can only create tasks for themselves.",
        },
        {
          type: "tip",
          text: "Overdue tasks sit in **Needs you** on Home until they're done or moved; they don't keep buzzing your phone.",
        },
        {
          type: "faq",
          items: [
            {
              q: "I didn't get the reminder.",
              a: "Reminders go to the devices where you've turned notifications on (Settings → My Profile, or the bell on your phone). If the task was already marked done before its time, no reminder is sent. The card still shows in the bell.",
            },
            {
              q: "Can I give a task to someone?",
              a: "Owners and admins can. Sales + Tech, Sales and Tech roles create tasks for themselves only.",
            },
            {
              q: "Where did my finished task go?",
              a: "To the **Done** tab, for 90 days. Tap its circle there to bring it back.",
            },
          ],
        },
      ],
    },
    {
      slug: "sticky-notes",
      title: "Sticky notes on Home",
      summary: "Square paper notes you can stick on any page: a scribble, a number, a reminder to yourself, or one the whole team sees.",
      keywords: ["sticky", "note", "post-it", "right click", "team", "hide notes", "expire", "resize", "any page"],
      where: { label: "Home", href: "/app/dashboard" },
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
            "**Team notes:** tick **Show it to the whole team** and everyone in the company sees the note on that page, with your initials in the corner. Each person can slide it around on their own screen. Only you (or an owner or admin) can edit or take it down.",
            "**Make a task:** turns the note into a task on your list (the first line becomes the title) and keeps the note.",
            "**Hide them:** right-click an empty spot and choose `Hide sticky notes` (or `Hide sticky notes everywhere` in the phone strip). `Show sticky notes` brings them back. It's per device.",
          ],
        },
        {
          type: "tip",
          text: "Ask Atlas: \"stick a note on the Patel job that it needs a permit\" puts one on that job's page after you confirm.",
        },
        {
          type: "faq",
          items: [
            {
              q: "I can't add another note.",
              a: "Each person can have 30 notes up, and the team board holds 30. Take one down first.",
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
          text: "Owners and admins are called **managers** in these guides. Managers see every lead and client. Only managers can delete, refund, charge a saved card, send payouts early, and open Expenses, Insights and QuickBooks.",
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
  ],
};
