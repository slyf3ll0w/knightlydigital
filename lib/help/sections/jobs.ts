import type { HelpSection } from "../types";
import { GALLERY, GALLERY_PRICE, PRO_CHIP, proTip } from "../plan-copy";

export const jobsSection: HelpSection = {
  id: "jobs",
  title: "Jobs & field work",
  icon: "jobs",
  tagline: "Schedule the work, send the crew, finish and invoice.",
  articles: [
    {
      slug: "create-a-job",
      title: "Create and assign a job",
      summary: "Add a job, pick who's doing it, and set the time the client is promised.",
      keywords: ["new job", "assign", "crew", "technician", "outsourced", "subcontractor", "arrival window", "anytime", "unassigned"],
      where: { label: "Jobs", href: "/app/jobs" },
      roles: "Owners, admins and Sales + Tech",
      blocks: [
        {
          type: "steps",
          items: [
            "Press `New` on the Jobs page (or convert an approved quote, or use the client page's create menu).",
            "Pick the client and the service address. Not in the list yet? `New client` at the bottom of the picker (or `Add \"<name>\" as a new client` once you've typed a name) opens a small sheet — first name, last name, phone, email — and `Add client` puts them straight on it.",
            "Add the services. A title is optional: WorkBench names the job after its services (\"Mow + Edge\") if you leave it blank.",
            "Set a date and time, or choose **Anytime**. Add an **Arrival window** if you promise one (like 8–10 am).",
            "Choose who's doing it under **Assign to**, or tick **Outsourced to a subcontractor**.",
            "Save. The assigned person sees it on their schedule and dashboard.",
          ],
        },
        {
          type: "tip",
          text: "If you're a one-person company, every job is assigned to you automatically.",
        },
        {
          type: "faq",
          items: [
            {
              q: "\"Pick who's doing this job, or mark it outsourced.\"",
              a: "A scheduled job needs someone on it. Choose a person under **Assign to**, or tick **Outsourced to a subcontractor**. Unscheduled jobs don't need anyone yet.",
            },
            {
              q: "A job isn't showing on someone's Google or Apple calendar.",
              a: "Calendar sync only includes jobs assigned to that person. Assign them on the job.",
            },
          ],
        },
      ],
    },
    {
      slug: "on-the-job",
      title: "On the job: on my way, clock in, photos, checklist",
      summary: "Everything a tech does from the job page, from heading out to getting the client's sign-off.",
      keywords: ["on my way", "directions", "apple maps", "google maps", "waze", "navigation", "clock in", "photos", "before after", "checklist", "signature", "sign-off", "review request", "notes"],
      where: { label: "Jobs", href: "/app/jobs" },
      blocks: [
        {
          type: "p",
          text: "Your next job is at the top of **Home** under **Up next**, with the buttons you need:",
        },
        {
          type: "list",
          items: [
            "`On my way` texts the client that you're heading over.",
            "`Directions` asks which app you want (Apple Maps, Google Maps or Waze; Apple Maps only on an iPhone) and starts the route from where you are. The app you picked last time is listed first.",
            "`Clock in` starts your time on the job. While you're clocked in, the card shows your timer plus `Photos` and `Checklist`.",
          ],
        },
        {
          type: "p",
          text: "On the job page itself you'll also find:",
        },
        {
          type: "list",
          items: [
            "**Photos**: tag them Photo, Before or After (up to 100 per job).",
            "**Checklist**: tick items off, or skip one with a reason.",
            "**Notes & Activity**: notes for the team and a history of everything that happened.",
            "`Collect signature` for the client's sign-off on the finished work.",
            "`Ask for review` sends your Google review link. Add the link under Settings → Branding & client experience → Review Requests first.",
          ],
        },
        {
          type: "tip",
          text: "No signal? Clock punches, notes, checklist ticks and status changes save on your phone and sync when you're back online.",
        },
        {
          type: "tip",
          text: `Job photos are included on every plan. **${GALLERY}** (${GALLERY_PRICE}, coming soon) adds photos stamped with who, when and where, before-and-after pairs with markup, a client gallery link and photo report PDFs.`,
        },
      ],
    },
    {
      slug: "complete-and-invoice-a-job",
      title: "Complete a job and invoice it",
      summary: "Complete job moves it to Requires Invoicing; Create invoice bills it.",
      keywords: ["complete", "finish", "requires invoicing", "closed", "reopen", "close without invoicing", "job status"],
      where: { label: "Jobs", href: "/app/jobs" },
      blocks: [
        {
          type: "p",
          text: "A job goes **Active** → **Requires Invoicing** → **Closed**.",
        },
        {
          type: "steps",
          items: [
            "When the work is done, press `Complete job`. Anyone still clocked in is clocked out.",
            "The job moves to **Requires Invoicing** and shows up under **Needs you** on the dashboard.",
            "Press `Create invoice`. The invoice copies the job's lines. Send it (see [Send an invoice](/help/send-an-invoice)).",
            "Once it's invoiced, the job is **Closed**.",
          ],
        },
        {
          type: "list",
          items: [
            "No invoice needed (warranty work, a freebie)? Use `Close job without invoicing` on the job page (or `Close without invoicing` in the row's ⋯ menu).",
            "Something came up? `Reopen job` puts it back to Active.",
            "Jobs billed by a recurring plan don't show the manual invoice buttons. The plan bills them.",
          ],
        },
        {
          type: "tip",
          text: "The **Profit margin** card on a job compares what you charged with labor (hours × each person's hourly cost) so you can see what the job really made.",
        },
      ],
    },
    {
      slug: "recurring-visits",
      title: "Set up recurring visits and plans",
      summary: "Weekly mowing, monthly pest control, quarterly filters: visits that schedule and bill themselves.",
      keywords: ["recurring", "repeat", "subscription", "maintenance plan", "weekly", "monthly", "autopay", "ready to bill", "visit series"],
      where: { label: "Recurring", href: "/app/subscriptions" },
      roles: "Owners and admins",
      blocks: [
        {
          type: "steps",
          items: [
            "Go to **Recurring** and press `New plan`.",
            "Pick the client, the services, and how often: every week, every 2 weeks, every month, every 3 months or every year.",
            "Choose how it bills (below), then save. WorkBench keeps about four weeks of visits on the schedule ahead of time.",
          ],
        },
        {
          type: "h",
          text: "Billing options",
        },
        {
          type: "list",
          items: [
            "**Monthly plan — auto-charge**: a flat price charged to the client's saved card every month, 3 months, 6 months or year. The first charge happens when the plan starts.",
            "**Bill for completed work**: a price per visit. Finished visits wait in **Ready to bill** until you press `Bill ready work`, or tick \"Bill each job automatically the moment it's completed.\"",
            "**No automatic billing**: the visits schedule themselves and you bill however you like.",
          ],
        },
        {
          type: "tip",
          text: "Selling a recurring service from your price book on a quote or invoice starts a plan automatically.",
        },
        {
          type: "faq",
          items: [
            {
              q: "An autopay charge failed.",
              a: "Temporary declines retry automatically after 1, 3 and 7 days. A hard decline (like a closed card) stops, and the client is emailed to update their card in the portal. Clients are also reminded about 30 days before a saved card expires.",
            },
            {
              q: "How do I pause or stop a plan?",
              a: "Open the plan and choose Pause or Cancel. `Run due now` bills anything that's due immediately.",
            },
          ],
        },
      ],
    },
  ],
};

export const scheduleSection: HelpSection = {
  id: "schedule",
  title: "Schedule & routes",
  icon: "schedule",
  tagline: "The calendar, appointments, calendar sync and route planning.",
  articles: [
    {
      slug: "use-the-schedule",
      title: "Use the Schedule",
      summary: "Month, week and day views, drag to reschedule, and the dispatch board.",
      keywords: ["calendar", "dispatch", "drag", "reschedule", "block time", "time off", "repeating", "recurring", "every week", "lunch", "double-booked", "day view", "week view", "by tech"],
      where: { label: "Schedule", href: "/app/schedule" },
      blocks: [
        {
          type: "video",
          src: "/video/tip-reschedule.mp4",
          poster: "/video/tip-reschedule-poster.jpg",
          title: "Reschedule with a drag (27 seconds, no sound)",
          text: "On the week view: grab a job, drag it to a new day and time (it snaps to 15 minutes), let go, and the toast that appears offers Undo.",
        },
        {
          type: "list",
          items: [
            "Switch between **Month**, **Week** and **Day**. In Day view, **By tech** shows one column per person, like a dispatch board. Phones open on Day.",
            "**Drag** a visit to move it, drag its bottom edge to change its length, or drag across empty space to create something. Hold `Shift` while dragging to copy. Everything snaps to 15 minutes.",
            "After every move you get an **Undo**, plus `Text client` / `Email client` to tell them about the change.",
            "`Block time` marks time off or shop days so nobody books over them. Tick **Repeats every week** and pick the days for things that happen every week (lunch, a standing appointment, Fridays off); booking forms show those times as taken, with your business hours left as they are. `Move the day` shifts a whole day's work. A block with an address is a stop on that person's route; errands and lunch added from **Routes** are blocks too, and show here once Optimize gives them a time.",
            "Open one day of a repeating block to change or remove just that day. **Edit every time** changes the whole rule, and **Remove → Every time** clears every day of it. The same list lives under Settings → Booking & forms → Scheduling rules → **Repeating blocks**.",
            "Chips flag anything that needs a look: **Awaiting approval**, **Double-booked**, **Unassigned**, **Subcontractor**.",
          ],
        },
        {
          type: "faq",
          items: [
            {
              q: "Today's date or times look off.",
              a: "The schedule runs on the company timezone in Settings → Company, not your device's. Fix it there.",
            },
            {
              q: "I see grey \"Busy in Google Calendar\" blocks.",
              a: "That's your own Google Calendar showing as busy time, so nobody books you then. You can turn it off in My Profile → Calendar sync.",
            },
          ],
        },
      ],
    },
    {
      slug: "appointments",
      title: "Book estimates and appointments",
      summary: "Phone calls, video calls and in-person estimates, separate from jobs.",
      keywords: ["appointment", "estimate visit", "consultation", "no-show", "video call", "phone call", "several people", "team members", "overlap", "drive time", "double-booked"],
      where: { label: "Appointments", href: "/app/appointments" },
      roles: "Owners, admins and sales roles",
      blocks: [
        {
          type: "p",
          text: "Appointments are for selling (an estimate visit, a call), not the work itself. Types are **Phone call**, **Video call** and **In person** (which needs an address).",
        },
        {
          type: "steps",
          items: [
            "Press `New appointment` on the Schedule or the Appointments page.",
            "Pick the client, the type, the time and who's going.",
            "Afterwards, press `Complete appointment`. WorkBench offers `Create quote` right away.",
          ],
        },
        {
          type: "p",
          text: "**Purpose** is optional. Your client sees it in their reminder texts and emails and on their client portal. Leave it blank and it says \"Estimate\". WorkBench remembers what you type: the next appointment starts with your last purpose, and tapping the box lists your recent ones. Job titles work the same way.",
        },
        {
          type: "p",
          text: "Other buttons: `Reschedule`, `Mark no-show`, `Cancel appointment` and `Reopen`.",
        },
        {
          type: "h",
          text: "The Appointments list",
        },
        {
          type: "p",
          text: "The Appointments page has a search box (client, purpose, address) and a filter: **Upcoming** (the default, soonest first), **Past**, **Cancelled** and **All**. Owners and admins also get **Mine** to see only the appointments they're on. The list shows 100 at a time, with pages below it. Right-click a row (press and hold on your phone) for `Open`, `Open in new tab`, `Copy link`, `Complete appointment`, `Mark no-show`, `Cancel appointment`, `Reopen`, `Create quote` and `Delete`.",
        },
        {
          type: "h",
          text: "Several people on one appointment",
        },
        {
          type: "p",
          text: "An appointment can have more than one person on it: an estimate where the owner brings a tech along, or a sales call two people sit in on. Owners, admins and Sales + Tech users pick them under **Team members** when booking or editing; a Sales user books appointments on themselves. The first person picked is the lead, and all of them get the heads-up push about an hour ahead. The appointment shows on each person's day in the Schedule and in their synced calendar, and dragging it in the Team view moves it for everyone on it.",
        },
        {
          type: "h",
          text: "Overlaps and drive time",
        },
        {
          type: "p",
          text: "While you pick a time, a line under the time fields warns when someone on the appointment already has a job, appointment or blocked-off time then, and, for in-person appointments, when they could not drive there from their previous stop in time or would be late to the next one (\"Sam drives about 25 min from Job #41, which ends at 2:00 PM, so they'd be 10 min late here\"). It is a heads-up, not a block: you can still save. The overlap lines also show after a save and when you drag an appointment on the Schedule; the drive-time line is only there while you pick a time. Drive times use the appointment's address (or the client's), so pick the client first.",
        },
        {
          type: "p",
          text: "**Client reminders** go out by themselves: about a day ahead (only for appointments booked at least a day ahead) and about an hour ahead, by email and — once texting is on — by text. The wording follows the type: a phone call says you will call them at their number, a video call includes the join link, and an in-person visit gives the arrival window. Untick **Remind client** on an appointment to keep it quiet. Whoever it is assigned to gets a push about an hour ahead either way. The appointment page shows what was sent and when.",
        },
        {
          type: "p",
          text: "**Confirmations.** When you book an appointment yourself, leave **Send the client a confirmation now** ticked and they get a \"you're booked\" text and email with the details and a calendar file the moment you save. Untick it for internal meetings or a client who already knows.",
        },
        {
          type: "p",
          text: "**Quiet hours.** Automatic reminder texts never go out between 9 PM and 8 AM in your time zone; a reminder that lands then goes by email instead. This only applies to the automatic reminders. Anything you send yourself — an invoice, a quote, a text from a client's thread, a confirmation — goes out right away, whatever the hour.",
        },
      ],
    },
    {
      slug: "calendar-sync",
      title: "Sync with Google, Apple or Outlook Calendar",
      summary: "See your WorkBench jobs in your own calendar, and block booking when you're busy.",
      keywords: ["google calendar", "apple calendar", "outlook", "ics", "subscribe", "sync", "ical", "busy time"],
      where: { label: "My Profile", href: "/app/settings/profile" },
      blocks: [
        {
          type: "p",
          text: "Calendar sync is set up per person in **My Profile → Calendar sync**. There are two ways:",
        },
        {
          type: "list",
          items: [
            "**Connect Google Calendar** (best): changes show up within seconds. You can also **Show my Google events here as busy time** so customers can't book over them, and choose whether your team sees the event names.",
            "**Subscribe link**: a read-only link for Google, Apple or Outlook. Paste it into your calendar app's \"subscribe\" or \"add by URL\" option. Google only refreshes these every several hours and Apple about hourly.",
          ],
        },
        {
          type: "faq",
          items: [
            {
              q: "A job is missing from my calendar.",
              a: "Only jobs assigned to you are included. Check that you're on the job. If you use the subscribe link, give your calendar app a few hours to refresh.",
            },
            {
              q: "I think my subscribe link was shared by mistake.",
              a: "Press `New link`. The old one stops working right away.",
            },
          ],
        },
      ],
    },
    {
      slug: "plan-routes",
      title: "Plan and optimize routes",
      summary: "See each tech's day on a map, add supply runs, lunch and tasks to it, and order the stops by drive time.",
      plan: PRO_CHIP,
      keywords: ["route", "map", "optimize", "drive time", "directions", "no pin", "route manager", "google maps", "errand", "supply house", "supply run", "dump", "lunch", "break", "places", "add a stop", "day ends"],
      where: { label: "Routes", href: "/app/routes" },
      blocks: [
        proTip("Route Manager"),
        {
          type: "tip",
          text: "Route Manager is in **beta**: it works, and it is still being refined. If a day doesn't optimize the way you expect, tell us from Help → Report a bug.",
        },
        {
          type: "p",
          text: "A route is everything one person drives to in a day: client visits, in-person appointments, blocked time with an address, and the stops that aren't clients — a supply run, the dump, a parts drop-off, a task with a place, and lunch. Each kind has its own stamp in the list (**Errand**, **Break**, **Task**), and errands and tasks get square pins on the map.",
        },
        {
          type: "steps",
          items: [
            "Open **Routes** and pick the day (use the arrows or the date picker). Filter to one person if you like.",
            "Press `+` on someone's card to add a stop: an **Errand**, a **Task** or **Lunch**. Pick a saved place or type an address, say how long it takes, and either let Optimize place it, give it a window (\"between 9 and 11\"), or set a time. An errand can be marked **Before this job** so the parts are on the truck first.",
            "Press `Optimize`. Set when the day starts and whether to end back at the shop (or wherever that person's day ends). Lock any stop that has to stay where it is.",
            "Check the preview. Errands land inside their window and ahead of the job they're for; lunch is slotted in from your company setting if that person has no break that day. If you want, tick \"Text or email the clients whose time changes.\"",
            "Press `Apply new order`. Nothing changes until you do.",
          ],
        },
        {
          type: "list",
          items: [
            "**Places** (the warehouse button on the map, or `/app/routes/places`): save your supply houses, the dump and the yard once. They show up first when anyone adds a stop. Anyone can add a place; owners and admins archive them.",
            "**Tick it off:** errands, breaks and tasks have a circle on the route — tap it when it's done. `Remove` takes an errand off the day; `Skip` drops today's lunch.",
            "**Lunch on the route:** Settings → Booking & forms → Scheduling rules sets the length and window (30 minutes between 11:30 and 1:00 unless you change it; \"No automatic lunch\" turns it off). Someone who already has a break on the day keeps theirs.",
            "**Where the day ends:** on the Team page each person can end at the shop, back where they started (their start address), or wherever the last stop is. Optimize counts the drive back accordingly.",
            "**Tasks with a place:** a task with an address (Tasks → `Add a place`) shows on that person's route on its due day. A task with a time holds that time; one set to Anytime gets slotted by Optimize.",
          ],
        },
        {
          type: "p",
          text: "You can also drag a stop to reorder it, or drop it on another person to hand it over. `Navigate` on a stop opens Google Maps (Apple Maps on Apple devices), and you can send a whole route to Google Maps, copy its link or print it.",
        },
        {
          type: "faq",
          items: [
            {
              q: "Optimize is greyed out, or a stop says \"No pin\".",
              a: "Optimize needs at least one stop it may place — a mapped job, a flexible errand or task, or lunch. Stops with a set time are kept where they are and listed under \"Kept at their time\". \"No pin\" means the address couldn't be found: edit it to a full street address with a city. A place with no pin can be fixed on the Places page.",
            },
            {
              q: "Lunch didn't show up in the preview.",
              a: "Lunch only goes in when the day runs past the start of the window (a day that ends at 11 has no lunch), when the company setting isn't \"No automatic lunch\", and when the person doesn't already have a break on the day. Lunch is saved on the day when you apply, not before.",
            },
            {
              q: "The errand landed after the job I picked under \"Before this job\".",
              a: "Optimize never does that on its own; it can only happen when you drag the order by hand and the preview warns you, or when that job was locked at a time the errand can't beat — move the lock or the errand's window.",
            },
            {
              q: "I can't optimize someone else's day.",
              a: "Techs can only optimize their own day, and Sales can't optimize. Managers can do anyone's. Anyone can add a stop to their own day; owners, admins and office staff can add to anyone's.",
            },
          ],
        },
      ],
    },
  ],
};
