import type { HelpSection } from "../types";

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
            "Pick the client and the service address.",
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
      keywords: ["on my way", "directions", "clock in", "photos", "before after", "checklist", "signature", "sign-off", "review request", "notes"],
      where: { label: "Jobs", href: "/app/jobs" },
      blocks: [
        {
          type: "p",
          text: "Your next job is at the top of **Home** under **Up next**, with the buttons you need:",
        },
        {
          type: "list",
          items: [
            "`On My Way` texts the client that you're heading over.",
            "`Directions` opens your maps app.",
            "`Clock In` starts your time on the job. While you're clocked in, the card shows your timer plus `Photos` and `Checklist`.",
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
            "`Ask for review` sends your Google review link. Add the link in Settings → Branding first.",
          ],
        },
        {
          type: "tip",
          text: "No signal? Clock punches, notes, checklist ticks and status changes save on your phone and sync when you're back online.",
        },
      ],
    },
    {
      slug: "complete-and-invoice-a-job",
      title: "Complete a job and invoice it",
      summary: "Complete Job moves it to Requires Invoicing; Create Invoice bills it.",
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
            "When the work is done, press `Complete Job`. Anyone still clocked in is clocked out.",
            "The job moves to **Requires Invoicing** and shows up under **Needs you** on the dashboard.",
            "Press `Create Invoice`. The invoice copies the job's lines. Send it (see [Send an invoice](/help/send-an-invoice)).",
            "Once it's invoiced, the job is **Closed**.",
          ],
        },
        {
          type: "list",
          items: [
            "No invoice needed (warranty work, a freebie)? Use `Close Job without invoicing` in the ⋯ menu.",
            "Something came up? `Reopen Job` puts it back to Active.",
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
            "**Bill for completed work**: a price per visit. Finished visits wait in **Ready to bill** until you press `Bill Ready Work`, or tick \"Bill each job automatically the moment it's completed.\"",
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
      keywords: ["calendar", "dispatch", "drag", "reschedule", "block time", "time off", "double-booked", "day view", "week view", "by tech"],
      where: { label: "Schedule", href: "/app/schedule" },
      blocks: [
        {
          type: "list",
          items: [
            "Switch between **Month**, **Week** and **Day**. In Day view, **By tech** shows one column per person, like a dispatch board. Phones open on Day.",
            "**Drag** a visit to move it, drag its bottom edge to change its length, or drag across empty space to create something. Hold `Shift` while dragging to copy. Everything snaps to 15 minutes.",
            "After every move you get an **Undo**, plus `Text client` / `Email client` to tell them about the change.",
            "`Block Time` marks time off or shop days so nobody books over them. `Move the day` shifts a whole day's work.",
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
      keywords: ["appointment", "estimate visit", "consultation", "no-show", "video call", "phone call"],
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
            "Press `New Appointment` on the Schedule or the Appointments page.",
            "Pick the client, the type, the time and who's going.",
            "Afterwards, press `Complete Appointment`. WorkBench offers `Create Quote` right away.",
          ],
        },
        {
          type: "p",
          text: "Other buttons: `Reschedule`, `Mark No-show`, `Cancel Appointment` and `Reopen`.",
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
      summary: "See each tech's day on a map and reorder stops by drive time.",
      keywords: ["route", "map", "optimize", "drive time", "directions", "no pin", "route manager", "google maps"],
      where: { label: "Routes", href: "/app/schedule/map" },
      blocks: [
        {
          type: "steps",
          items: [
            "Open **Routes** and pick the day (use the arrows or the date picker). Filter to one person if you like.",
            "Press `Optimize`. Set when the day starts and whether it's a round trip. Lock any stop that has to stay where it is.",
            "Check the preview. If you want, tick \"Text or email the clients whose time changes.\"",
            "Press `Apply new order`. Nothing changes until you do.",
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
              a: "Optimizing needs at least 2 stops that are on the map. \"No pin\" means the address couldn't be found. Edit it to a full street address with a city.",
            },
            {
              q: "I can't optimize someone else's day.",
              a: "Techs can only optimize their own day, and Sales can't optimize. Managers can do anyone's.",
            },
          ],
        },
      ],
    },
  ],
};
