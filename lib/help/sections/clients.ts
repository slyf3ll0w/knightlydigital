import type { HelpSection } from "../types";

export const clientsSection: HelpSection = {
  id: "clients",
  title: "Clients",
  icon: "clients",
  tagline: "Your customer list: add, import, organize, archive.",
  articles: [
    {
      slug: "add-a-client",
      title: "Add a client, lead or contact",
      summary: "The difference between the three, and how to add each one.",
      keywords: ["new client", "customer", "lead", "contact", "subcontractor", "supplier", "create client"],
      where: { label: "Clients", href: "/app/contacts" },
      blocks: [
        {
          type: "p",
          text: "When you press `New` on the Clients page, you choose what kind of record it is:",
        },
        {
          type: "list",
          items: [
            "**Lead**: someone who might hire you. They go on the [Leads board](/help/leads-pipeline) until you win or lose them.",
            "**Client**: someone you already work for. They skip the board.",
            "**Contact**: a sub, supplier or referral partner. They sit on the **Contacts** tab and become a client when you schedule them a job.",
          ],
        },
        {
          type: "p",
          text: "Add as much as you know: name, phone, email, service addresses, and extra people (a spouse or property manager). Press `Save`.",
        },
        {
          type: "p",
          text: "From a client's page, the create menu starts anything for them: a request, appointment, quote, agreement, job, invoice or payment. You'll also find their pipeline card, client portal link, saved cards and custom fields there.",
        },
        {
          type: "tip",
          text: "Need to track something WorkBench doesn't have a field for, like a gate code or pet name? Add it under Settings → Client custom fields and it appears on every client.",
        },
      ],
    },
    {
      slug: "import-clients",
      title: "Import your clients from a spreadsheet",
      summary: "Bring your list over from Jobber, Housecall Pro or any CSV, and undo it if something looks wrong.",
      keywords: ["import", "csv", "spreadsheet", "excel", "jobber", "housecall pro", "migrate", "switch", "duplicates", "undo import"],
      where: { label: "Import clients", href: "/app/contacts" },
      roles: "Owners and admins",
      blocks: [
        {
          type: "steps",
          items: [
            "Export your clients as a CSV from your old software or spreadsheet. (There's a template on the import page if you're starting from scratch.)",
            "Go to **Clients → Import** (or Settings → Import clients) and upload the file.",
            "Match each column to a WorkBench field. Anything that doesn't fit can become a new custom field with `+ Create custom field…`.",
            "Choose whether they come in as **Leads** or **Active clients**, who they're assigned to, and what to do with duplicates: `Skip the row` or `Update their info`. Duplicates are matched by email or phone.",
            "Press `Import N Clients`.",
          ],
        },
        {
          type: "tip",
          text: "Exports from Jobber and Housecall Pro map their columns automatically.",
        },
        {
          type: "p",
          text: "Made a mistake? **Undo this import** removes the clients it created. Anyone you've already started work for is kept.",
        },
      ],
    },
    {
      slug: "archive-or-delete-a-client",
      title: "Archive or delete a client",
      summary: "Why WorkBench asks you to archive clients with history instead of deleting them.",
      keywords: ["delete client", "remove", "archive", "archived", "restore", "can't delete"],
      where: { label: "Clients", href: "/app/contacts" },
      roles: "Owners and admins can delete",
      blocks: [
        {
          type: "p",
          text: "**Archive** hides a client from your lists but keeps every quote, job and invoice. You can find them again on the **Archived** tab.",
        },
        {
          type: "p",
          text: "**Delete** is permanent and only works for clients with no history.",
        },
        {
          type: "faq",
          items: [
            {
              q: "\"This client has quotes, jobs, or billing history — archive them instead.\"",
              a: "Deleting would wipe their paperwork and payment records. Archive them instead: they disappear from your lists and nothing is lost.",
            },
            {
              q: "I can't find a client I know is there.",
              a: "Check the **Archived** and **Contacts** tabs. If you're in the Sales or Sales + Tech role, you only see clients assigned to you, so ask a manager to assign them.",
            },
          ],
        },
      ],
    },
    {
      slug: "export-clients",
      title: "Export your clients",
      summary: "Download your whole client list as a CSV.",
      keywords: ["export", "download", "csv", "backup"],
      where: { label: "Clients", href: "/app/contacts" },
      roles: "Owners and admins",
      blocks: [
        {
          type: "p",
          text: "On the Clients page, press `Export CSV`. You get a spreadsheet of your clients and their contact details. Atlas can also export other lists, like \"export every invoice from last year\".",
        },
      ],
    },
  ],
};

export const leadsSection: HelpSection = {
  id: "leads",
  title: "Leads, requests & booking",
  icon: "leads",
  tagline: "Catch every inquiry and move it from new to won.",
  articles: [
    {
      slug: "leads-pipeline",
      title: "Use the Leads board",
      summary: "Stages, automatic moves, and winning or losing a lead.",
      keywords: ["pipeline", "kanban", "board", "stages", "won", "lost", "converted", "contacted", "no answer", "sales pipeline"],
      where: { label: "Leads", href: "/app/leads" },
      roles: "Managers see every lead; sales roles see their own",
      blocks: [
        {
          type: "p",
          text: "Every lead is a card on the board. The default stages are **New**, **Contacted**, **Estimate Scheduled** and **Quote Sent**, with **Converted** pinned at the end. Each card shows how many days it's been in its stage.",
        },
        {
          type: "p",
          text: "Press `New Lead` to add one yourself. Only a first name is needed; the last name is optional. Press `+ More details` to add their email, company, address, lead source and notes too. Leads in **New** are counted on the Leads badge and under **Needs you** on Home.",
        },
        {
          type: "p",
          text: "The bell shows a **New lead** for leads that came in on their own, from a form, a call or a connected lead source. Leads you or your team add by hand don't go to the bell. A lead leaves the bell as soon as its card moves out of **New**.",
        },
        {
          type: "h",
          text: "Cards move by themselves",
        },
        {
          type: "list",
          items: [
            "A new request puts the person in **New**.",
            "A call that connects (either direction) or a text from Messages moves them to **Contacted**.",
            "Booking an appointment moves them to **Estimate Scheduled**, and sending a quote moves them to **Quote Sent**.",
            "An approved quote, their first job or first invoice **wins** the lead: they become an active client and land in Converted.",
          ],
        },
        {
          type: "p",
          text: "Automatic moves only go forward. A card you've moved further along is never dragged back.",
        },
        {
          type: "h",
          text: "Moving cards yourself",
        },
        {
          type: "p",
          text: "Drag a card to another stage, or drop it on **Won — now a client** or **Lost**. On a phone, use the card's menu: `Move to`, `Mark won`, `Mark lost` (with an optional reason). Lost archives a new lead. For a returning client it just takes them off the board, and they come back with a **Repeat** badge the next time they send a request.",
        },
        {
          type: "h",
          text: "Change the stages",
        },
        {
          type: "p",
          text: "Settings → Lead pipeline lets you rename, recolor, reorder, add (up to 12) and delete stages. Deleting a stage moves its cards to the first one. You can also connect ad platforms there with a lead webhook URL.",
        },
        {
          type: "tip",
          text: "Want to see who didn't pick up? Add a **No answer** stage *before* Contacted and set its trigger to \"You call and they don't pick up.\"",
        },
      ],
    },
    {
      slug: "online-booking",
      title: "Take bookings online",
      summary: "Share your booking page or put a form on your website so customers can book or ask for work.",
      keywords: ["booking page", "book online", "website form", "embed", "widget", "schedule online", "request form", "bookable online", "free estimate"],
      where: { label: "Booking & forms", href: "/app/settings/booking" },
      roles: "Owners and admins",
      blocks: [
        {
          type: "steps",
          items: [
            "Go to **Settings → Booking & forms**.",
            "Add what customers can book or ask for. Under **Book a time**: a Phone call, Video call, Visit (like a \"Free estimate\") or Service from your price book. Under **Just ask**: a Message form.",
            "For each item choose **Customer picks a time** or **They ask, you follow up**, and **Confirm instantly** or **Hold for approval**.",
            "Optional: take a deposit or full payment at booking.",
            "Press `Copy link` to share your booking page, or `Embed on your website` for code to paste into your site.",
          ],
        },
        {
          type: "p",
          text: "Customers can book from 4 hours out to 30 days ahead by default. Change that under **Scheduling rules**.",
        },
        {
          type: "p",
          text: "When someone books, they get a confirmation email with a calendar file, and a confirmation text as well once texting is on (if they ticked the text-message box, or are already a client who takes texts). Reschedules and cancellations send the same way, and reminders follow before the appointment.",
        },
        {
          type: "faq",
          items: [
            {
              q: "Customers see a request form instead of open times.",
              a: "Nobody on your team is bookable. Go to Settings → Team & roles and turn on **Bookable online** for the people who take these appointments, and check their **Working hours**.",
            },
            {
              q: "The times offered look wrong.",
              a: "Times come from each bookable person's working hours, their existing jobs and appointments, and (if they connected it) busy time in their Google Calendar. Check the company timezone in Settings → Company too.",
            },
            {
              q: "I can't choose Hold for approval.",
              a: "Holding isn't available when payment is taken at booking. Switch payment to **Nothing at booking** first.",
            },
          ],
        },
      ],
    },
    {
      slug: "handle-requests",
      title: "Handle new requests and held bookings",
      summary: "Turn a request into a quote or job, and approve or decline bookings that are waiting on you.",
      keywords: ["requests", "needs approval", "accept", "decline", "booking approval", "inquiry", "website lead"],
      where: { label: "Requests", href: "/app/requests" },
      blocks: [
        {
          type: "p",
          text: "Everything customers send (booking forms, website forms, estimate tools, portal requests) lands in **Requests**. Statuses are **New**, **Needs approval**, **Converted** and **Archived**.",
        },
        {
          type: "list",
          items: [
            "Use `Convert to Quote` or `Convert to Job` to start the work.",
            "A held booking shows a banner saying the time is held on your schedule. Press `Accept and Schedule` to confirm it, or `Decline` to free the slot. Either way the customer is emailed.",
            "`Archive` requests that don't need anything.",
          ],
        },
        {
          type: "tip",
          text: "New website leads go to whoever is set in **Website leads go to** under Settings → Team & roles (the owner by default).",
        },
      ],
    },
  ],
};
