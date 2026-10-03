import type { HelpSection } from "../types";
import { CORE, EXTRA_SEAT, MAX, PRO, PRO_CHIP, PRO_PRICE, SEATS_INCLUDED, proTip } from "../plan-copy";

export const teamSection: HelpSection = {
  id: "team",
  title: "Team & time",
  icon: "team",
  tagline: "Add your crew, track hours, see who's where, and chat.",
  articles: [
    {
      slug: "add-team-members",
      title: "Add team members",
      summary: "Add someone, pick their role, and share their sign-in yourself.",
      keywords: ["invite", "add user", "online", "last seen", "active", "employee", "crew", "technician", "new member", "password", "deactivate", "seat", "one device", "in use on another device", "shared login", "use it here"],
      where: { label: "Team & roles", href: "/app/settings/team" },
      roles: "Owners and admins",
      blocks: [
        {
          type: "steps",
          items: [
            "Go to **Settings → Team & roles** and press `Add Member`.",
            "Enter their name, email and phone, pick a **role** (see [Roles](/help/roles-and-permissions)), and set a **starting password** (8+ characters).",
            "Save, then **send them their email and password yourself**. They sign in at workbenchfsm.com or in the app.",
          ],
        },
        {
          type: "warn",
          text: "New team members don't get an invite email. Text or tell them their sign-in. (Someone who already has a WorkBench login joins with their existing password and gets an email heads-up.)",
        },
        {
          type: "h",
          text: "Per-person settings",
        },
        {
          type: "list",
          items: [
            "**$/hr** labor cost, used for job profit. Techs never see it.",
            "**Bookable online**: whether customers can book them. See [Take bookings online](/help/online-booking).",
            "**Working hours**, used for online booking and Find a Time.",
            "`Reset password`, `Deactivate` and `Reactivate`. Deactivating keeps their history.",
          ],
        },
        {
          type: "h",
          text: "Who's online",
        },
        {
          type: "p",
          text: "Under each person's email you'll see a green dot and **Online now** when they have WorkBench open in front of them, or **Last seen** with how long ago (a hollow dot means earlier today). A tab in the background or the phone app in a pocket doesn't count as online. **Never signed in** means they haven't used their login yet.",
        },
        {
          type: "h",
          text: "One device at a time",
        },
        {
          type: "p",
          text: `A login works on **one device at a time**. Open WorkBench on a second device while the first is in use and you'll see **This login is in use on …** with a \`Use it here\` button, which moves the login over; the first device shows the same screen the next time someone touches it. A device that has been idle for a few minutes lets go on its own, so moving from your phone to your computer takes at most one tap. Everyone on the crew should have their own login — it's also what puts timesheets, calls and notifications on the right person. **${PRO}** and **${MAX}** lift this: one login can be used on several devices at once.`,
        },
        {
          type: "tip",
          text: "Admins can add and edit Sales + Tech, Sales and Tech members. Only owners manage other owners and admins.",
        },
        {
          type: "tip",
          text: `**${CORE}** (free) includes ${SEATS_INCLUDED} users. Each extra user is ${EXTRA_SEAT}. **${PRO}** (${PRO_PRICE}) and **${MAX}** include unlimited users. See [Plans and pricing](/help/plans-and-pricing).`,
        },
      ],
    },
    {
      slug: "clock-in-and-timesheets",
      title: "Clock in and out, and timesheets",
      summary: "Track time on jobs, fix missed punches, and see labor cost.",
      plan: `${PRO_CHIP} (timesheets)`,
      keywords: ["clock in", "clock out", "time clock", "hours", "timesheet", "payroll", "gps", "labor cost", "forgot to clock out"],
      where: { label: "Timesheets", href: "/app/timesheets" },
      roles: "Everyone except Sales",
      blocks: [
        { type: "tip", text: `Clocking in and out works on every plan. The weekly **Timesheets** page, labor cost on jobs and the payroll CSV are part of **${PRO}** (${PRO_PRICE}), along with unlimited users and the team map. See [Plans and pricing](/help/plans-and-pricing).` },
        {
          type: "list",
          items: [
            "`Clock In` from the job page or the **Up next** card on Home, and `Clock Out` when you're done. Completing the job clocks you out too.",
            "Clocking in somewhere new closes your last entry automatically.",
            "If location is allowed, one GPS stamp is saved with each punch. It isn't continuous tracking.",
            "No signal? The punch is saved on your phone and syncs when you're back online.",
            "A forgotten clock-out is capped at 12 hours.",
          ],
        },
        {
          type: "p",
          text: "**Timesheets** shows the week: your hours, or everyone's for managers. Managers can `Add time entry` and edit or delete entries (with a reason), and download a CSV for payroll. Managers reach Timesheets from **Overview**.",
        },
        {
          type: "tip",
          text: "Hours × each person's $/hr shows up as labor on the job's **Profit margin** card.",
        },
      ],
    },
    {
      slug: "team-map",
      title: "See your team on the map",
      summary: "Live positions of everyone who's clocked in.",
      plan: PRO_CHIP,
      keywords: ["team map", "location", "where is", "tracking", "gps"],
      where: { label: "Team map", href: "/app/team-map" },
      roles: "Owners and admins",
      blocks: [
        proTip("The team map"),
        {
          type: "p",
          text: "The **Team map** (from Overview) shows where everyone who's clocked in is right now. Location is only shared while someone is on the clock with WorkBench open, and never after they clock out. The **On the clock** card on Home shows who's working and for how long.",
        },
      ],
    },
    {
      slug: "team-chat",
      title: "Team chat",
      summary: "One Everyone channel, plus direct messages and groups.",
      keywords: ["chat", "team chat", "message team", "group", "dm", "direct message"],
      where: { label: "Team Chat", href: "/app/chat" },
      blocks: [
        {
          type: "p",
          text: "Every company has an **Everyone** channel. Press `New chat` for a direct message or a named group, and use `Add people` or `Leave Group` inside it. You can edit and delete your own messages.",
        },
        {
          type: "p",
          text: "Team chat appears once your company has at least two people.",
        },
      ],
    },
  ],
};

export const portalSection: HelpSection = {
  id: "client-portal",
  title: "Client portal",
  icon: "portal",
  tagline: "What your clients see, and how to get them in.",
  articles: [
    {
      slug: "client-portal",
      title: "Give clients their portal",
      summary: "Clients see visits, quotes, invoices and messages in one place, with no password to remember.",
      keywords: ["portal", "client hub", "customer portal", "portal link", "magic link", "client login", "request reschedule"],
      where: { label: "Clients", href: "/app/contacts" },
      blocks: [
        {
          type: "steps",
          items: [
            "Open the client's page and find the **Client portal** card.",
            "Press `Email portal access` (they need an email on file), or `Copy portal link` to send it yourself.",
          ],
        },
        {
          type: "p",
          text: "In the portal, clients can:",
        },
        {
          type: "list",
          items: [
            "See their open balance, next visit and anything waiting on them on **Home**.",
            "Approve quotes, pay invoices, and save cards (and pick one for autopay).",
            "Sign agreements.",
            "Ask to reschedule a visit, and send a **New Request** for more work.",
            "Message you on the **Messages** tab. Replies show up in your [inbox](/help/messages-inbox).",
          ],
        },
        {
          type: "p",
          text: "Clients can always get a fresh link from your portal login page by entering their email. `Reset Link` turns off old links if one was shared by mistake.",
        },
        {
          type: "tip",
          text: "Requests from existing clients in the portal never put them back on the Leads board. They're treated as repeat business.",
        },
      ],
    },
  ],
};

export const reportsSection: HelpSection = {
  id: "business",
  title: "Reports & accounting",
  icon: "reports",
  tagline: "Insights, expenses and QuickBooks.",
  articles: [
    {
      slug: "insights",
      title: "Read your Insights",
      summary: "Revenue, profit, what's owed, and where your work comes from.",
      keywords: ["insights", "reports", "revenue", "profit", "analytics", "win rate", "aging", "receivables", "lead source"],
      where: { label: "Overview", href: "/app/business" },
      roles: "Owners and admins",
      blocks: [
        {
          type: "p",
          text: "Open **Overview → Insights** and pick 30 days, 90 days, 12 months or 2 years. You'll see:",
        },
        {
          type: "list",
          items: [
            "**Collected revenue**, **Expenses** and **Profit**. Revenue counts when money is collected, not when invoices are sent.",
            "**Receivables aging**: what's owed, grouped as current, 1–30, 31–60, 61–90 and 90+ days late.",
            "Your lead pipeline and **win rate**, plus breakdowns **by lead source**, **by service** and **by area**.",
          ],
        },
      ],
    },
    {
      slug: "track-expenses",
      title: "Track expenses",
      summary: "Log costs, including ones that repeat every month, so profit is real.",
      keywords: ["expense", "cost", "receipt", "recurring expense", "rent", "insurance", "log expense"],
      where: { label: "Overview", href: "/app/business" },
      roles: "Owners and admins",
      blocks: [
        {
          type: "steps",
          items: [
            "Open **Overview → Expenses** and press `Log Expense`.",
            "Enter a description, category, amount and date.",
            "Tick **Repeat this every month** for rent, insurance or software, and it's logged automatically on that day each month. Stop it any time with `Stop repeating`.",
          ],
        },
        {
          type: "tip",
          text: "Or just tell Atlas: \"log $1,200 rent every month on the 1st.\"",
        },
      ],
    },
    {
      slug: "quickbooks",
      title: "Connect QuickBooks Online",
      summary: "Send clients, invoices, payments and expenses to QuickBooks automatically.",
      plan: PRO_CHIP,
      keywords: ["quickbooks", "qbo", "accounting", "sync", "bookkeeper", "intuit", "reconnect"],
      where: { label: "QuickBooks", href: "/app/settings/quickbooks" },
      roles: "Owners and admins",
      blocks: [
        { type: "tip", text: `QuickBooks sync is part of **${PRO}** (${PRO_PRICE}). If your bookkeeper or accountant sent you to WorkBench, we turn QuickBooks on free on ${CORE}: mention it when you sign up, or call us.` },
        {
          type: "steps",
          items: [
            "Go to **Settings → Payments & accounting → QuickBooks Online**.",
            "Press `Connect to QuickBooks` and sign in to your QuickBooks company.",
            "That's it. WorkBench syncs every night, and you can press `Sync now` any time.",
          ],
        },
        {
          type: "list",
          items: [
            "Sync is **one way**, from WorkBench to QuickBooks: clients (matched by name), sent and paid invoices, payments, and expenses.",
            "Invoice lines post to one item called **WorkBench Services**.",
            "Refunds, deletions and returned bank payments update QuickBooks too.",
          ],
        },
        {
          type: "faq",
          items: [
            {
              q: "\"QuickBooks needs to be reconnected.\"",
              a: "QuickBooks disconnects apps that haven't synced in about 100 days, or if the connection was revoked. Press connect again. Anything that failed retries on the next sync.",
            },
            {
              q: "My QuickBooks has duplicate customers.",
              a: "Clients are matched by name. If a client's name is spelled differently in the two systems, QuickBooks gets a new customer. Make the names match, then merge the duplicate in QuickBooks.",
            },
          ],
        },
      ],
    },
  ],
};
