import type { HelpSection } from "../types";
import { CORE, EXTRA_SEAT, MAX, PLANS_PAGE_LINK, PRO, PRO_CHIP, PRO_GATE_LINE, PRO_PRICE, SEATS_INCLUDED, proTip } from "../plan-copy";

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
      keywords: ["invite", "add user", "online", "last seen", "active", "employee", "crew", "technician", "new member", "password", "deactivate", "seat", "one device", "in use on another device", "shared login", "use it here", "profile", "contact info", "team member profile"],
      where: { label: "Team & roles", href: "/app/settings/team" },
      roles: "Owners and admins",
      blocks: [
        {
          type: "steps",
          items: [
            "Go to **Settings → Team & roles** and press `Add member`.",
            "Enter their name, email and phone, pick a **role** (see [Roles](/help/roles-and-permissions)), and set a **starting password** (8+ characters).",
            "Save, then **send them their email and password yourself**. They sign in at workbenchfsm.com or in the app.",
          ],
        },
        {
          type: "warn",
          text: "New team members don't get an invite email. Text or tell them their sign-in. (Someone who already has a WorkBench login joins with their existing password and gets an email heads-up.)",
        },
        {
          type: "tip",
          text: "The starting password is theirs to change. Until they set their own (Settings → My Profile, or Forgot password), it only works at your company: if another business later adds the same email to its team, that password is dropped and they get an email to set a new one — so nobody can sign in to someone else's company with a password a manager typed. The same happens when they open a company of their own, and the first time they sign in with Google or Apple the starting password simply stops working.",
        },
        {
          type: "h",
          text: "Someone's profile",
        },
        {
          type: "p",
          text: "Tap anyone on the list (their name, or an empty part of their row) to open their profile: photo, role, when they were last on, email and phone. `Call` and `Email` open your phone's dialer and mail app, and `Message` opens a direct message with them in Team Chat. The settings below are in the profile too.",
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
            "**Working hours**, used for online booking and Find a Time. In the same panel: where they **start the day from** (home or the shop) and where they **end the day** — the shop, back where they started, or wherever the last stop is — which the route optimizer counts as the drive back.",
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
          text: `A login works on **one device at a time**. Open WorkBench on a second device while the first is in use and you'll see **This login is in use on …** with a \`Use it here\` button, which moves the login over; the first device shows the same screen the next time someone touches it. A device that has been idle for a few minutes lets go on its own, and signing out lets go at once, so moving from your phone to your computer takes at most one tap. **Calls win:** answering or placing a call on the business line moves the login to that device by itself, and the screen never covers a device with a call ringing or in progress, so a call is never interrupted. Everyone on the crew should have their own login — it's also what puts timesheets, calls and notifications on the right person. **${PRO}** and **${MAX}** lift this: one login can be used on several devices at once.`,
        },
        {
          type: "tip",
          text: "Admins can add and edit Sales + Tech, Sales and Tech members. Only owners manage other owners and admins.",
        },
        {
          type: "tip",
          text: `**${CORE}** (free) includes ${SEATS_INCLUDED} people. Adding or reactivating someone past that shows a message with an \`Add a person\` link: each extra person is ${EXTRA_SEAT}, bought by the owner on ${PLANS_PAGE_LINK}. **${PRO}** (${PRO_PRICE}) and **${MAX}** include unlimited people. See [Manage your plan](/help/manage-your-plan).`,
        },
      ],
    },
    {
      slug: "clock-in-and-timesheets",
      title: "Clock in and out, and timesheets",
      summary: "Track time on jobs, fix missed punches, and see labor cost.",
      plan: PRO_CHIP,
      keywords: ["clock in", "clock out", "time clock", "hours", "timesheet", "payroll", "gps", "labor cost", "forgot to clock out"],
      where: { label: "Timesheets", href: "/app/timesheets" },
      roles: "Everyone except Sales",
      blocks: [
        proTip("Clocking in and out, the weekly Timesheets page and labor cost on jobs"),
        { type: "p", text: `${PRO_GATE_LINE} On ${CORE} the job page has no \`Clock in\` button and the Profit margin card has no Labor line; time already logged is kept and shows again when ${PRO} is on.` },
        {
          type: "list",
          items: [
            "`Clock in` from the job page or the **Up next** card on Home, and `Clock out` when you're done. Completing the job clocks you out too.",
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
      keywords: ["chat", "team chat", "message team", "group", "dm", "direct message", "photo", "picture", "video", "attach", "drag and drop", "paste", "screenshot", "group photo", "group picture", "cover photo"],
      where: { label: "Team Chat", href: "/app/chat" },
      blocks: [
        {
          type: "p",
          text: "Every company has an **Everyone** channel. Press `New chat` for a direct message or a named group, and use `Add people` or `Leave group` inside it. You can also start a direct message from someone's profile on **Settings → Team & roles**. You can edit and delete your own messages.",
        },
        {
          type: "h",
          text: "Photos and videos",
        },
        {
          type: "list",
          items: [
            "Press `Attach a photo` (the picture button beside the message box) and pick one or more photos or videos. They wait as thumbnails above the box — nothing is sent yet.",
            "On a computer you can also drag files onto the conversation and drop them, or paste a screenshot or copied picture with **Ctrl+V** (**⌘V** on a Mac). They land in the same spot.",
            "Type under them if you like, then press **Send**. Each file goes out as its own message, in order, and your words go with the first one. The × on a thumbnail takes it back out. Up to 10 per send; only photos and videos can be sent.",
            "Files can be up to 25 MB. Photos are resized on your device before they're sent.",
            "Tap a photo to open it full size, or use its save button to keep a copy.",
            "Photos and videos stay in the chat for a week. After that the message shows that the photo has expired, so save anything you want to keep.",
            "Deleting your message deletes its photo too.",
          ],
        },
        {
          type: "h",
          text: "Group photo",
        },
        {
          type: "p",
          text: "In a group, press the **⋮** button at the top and choose `Add group photo`. It shows beside the group in the chat list and at the top of the conversation for everyone in it. Anyone in the group can change it or take it off from the same menu. Unlike photos sent in the chat, the group photo doesn't expire.",
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
      keywords: ["portal", "client hub", "customer portal", "portal link", "magic link", "client login", "portal login page", "login button", "website login", "request reschedule"],
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
            "Approve quotes, pay invoices by card or bank, and save cards (and pick one for autopay).",
            "Sign agreements.",
            "Ask to reschedule a visit, and send a **New request** for more work.",
            "Message you on the **Messages** tab. Replies show up in your [inbox](/help/messages-inbox).",
          ],
        },
        {
          type: "h",
          text: "A client login button for your website",
        },
        {
          type: "p",
          text: "Your portal login page is one link for every client: workbenchfsm.com/portal/ followed by your company's web address. A client types their email there and gets their own portal link, with no password. Copy it from **Settings → Booking & forms → Client login for your website**, or from `Copy client login page` at the bottom of any client's **Client portal** card, and put it behind a \"Client login\" button on your site.",
        },
        {
          type: "p",
          text: "Clients can always get a fresh link from that page. `Reset link` turns off old links if one was shared by mistake.",
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
        {
          type: "p",
          text: "Press `Lead sources` on the **By lead source** card for the full report: leads, wins and money collected for each source. See [See where your leads come from](/help/lead-sources).",
        },
      ],
    },
    {
      slug: "lead-sources",
      title: "See where your leads come from",
      summary: "Every lead is filed under a source, and one report shows which sources bring in work.",
      keywords: ["lead source", "lead sources", "where leads come from", "google ads", "advertising", "marketing", "referral", "attribution", "utm", "ad click", "win rate by source", "which ad"],
      where: { label: "Overview", href: "/app/business" },
      roles: "Owners and admins",
      blocks: [
        {
          type: "p",
          text: "Open **Overview → Insights** and press `Lead sources` on the **By lead source** card. Pick 30 days, 90 days or 12 months. Each source gets one row:",
        },
        {
          type: "list",
          items: [
            "**Leads**: how many came in from that source in the period.",
            "**Quoted**: how many of them were sent a quote.",
            "**Won**: how many became clients, with the **Win rate** beside it.",
            "**Collected**: everything those leads have paid so far, including money that came in after the period ended.",
          ],
        },
        {
          type: "p",
          text: "Press a source to see the leads behind it, and press a lead to open their page.",
        },
        { type: "h", text: "How a lead gets its source" },
        {
          type: "list",
          items: [
            "**From a form on your website**: filed automatically by how the visitor got to your site. A click on a Google ad is **Google Ads**, a Google search is **Google search**, a link from Facebook is **Facebook**, and someone who typed your address is **Website (direct)**. The lead's page shows what is known under **Lead source**: the campaign, the search term and the first page they saw. It still works when they look around your site first, or come back within 90 days.",
            "**From your booking page link**: filed the same way when the link says where it was shared; otherwise it reads **Online booking** or **Website estimate**.",
            "**Added by hand**: pick the source from the list on the client, lead or job form. Pick **Something else…** to type a new one, and it joins your list.",
            "**From a call**: when you save an unknown caller, tap an answer under **How did they hear about you?** Left alone, the source is **Phone call**.",
          ],
        },
        {
          type: "tip",
          text: "Or just ask Atlas: \"where are my leads coming from this month?\"",
        },
        {
          type: "p",
          text: "Running Google ads? WorkBench can report the payments from those leads back to Google. See [Tell Google Ads which clicks paid](/help/report-paid-jobs-to-google-ads).",
        },
        {
          type: "faq",
          items: [
            {
              q: "What does Untracked mean?",
              a: "Nobody said where that lead came from. Open the lead and pick a source to move it.",
            },
            {
              q: "Why does my Google Business Profile show up as Google search?",
              a: "A click from your profile looks like any other Google visit. Add `?utm_source=gbp` to the end of the website link in your profile and those leads are filed as **Google Business Profile**.",
            },
            {
              q: "Someone called after seeing my ad. Why isn't that Google Ads?",
              a: "A phone call doesn't carry the ad click. Ask how they heard about you and tap the answer when you save them.",
            },
            {
              q: "Do my older leads change?",
              a: "No. They keep the source they had. Spellings of the same source, like \"google ads\" and \"Google Ads\", are counted together.",
            },
            {
              q: "Do I need to change the form code on my website?",
              a: "No. A form embedded with WorkBench's code does this already.",
            },
          ],
        },
      ],
    },
    {
      slug: "report-paid-jobs-to-google-ads",
      title: "Tell Google Ads which clicks paid",
      summary: "Report the payments from your Google Ads leads back to Google, so it goes after clicks that become paid work.",
      keywords: ["google ads", "connect google ads", "offline conversions", "conversion import", "paid jobs", "gclid", "ad click", "data manager", "https", "conversions.csv", "smart bidding", "advertising", "sample row", "next is grey", "advisor", "conversion action"],
      where: { label: "Overview", href: "/app/business" },
      roles: "Owners and admins",
      blocks: [
        {
          type: "p",
          text: "Google Ads normally only knows that someone clicked your ad and filled in a form. With this on, it also learns which of those clicks paid you, and how much. WorkBench keeps a private file of the payments made by leads who came from a Google ad, and Google Ads reads that file by itself once a day.",
        },
        {
          type: "p",
          text: "The file holds the ad click ID, the amount and the time of each payment from the last 90 days. It never holds a name, email, phone number or address.",
        },
        { type: "h", text: "Open the page" },
        {
          type: "p",
          text: "Open **Overview → Insights**, press `Lead sources` on the **By lead source** card, then press **Report paid jobs to Google Ads** at the bottom.",
        },
        { type: "h", text: "The quick way: Connect Google Ads" },
        {
          type: "p",
          text: "If the page shows a `Connect Google Ads` button, that is all you need. Press it, sign in with the Google account you use for Google Ads, and tick both boxes on Google's screen. WorkBench adds a conversion action named **WorkBench paid job** to your account and sends the payments by itself, several times a day. If your sign-in can reach more than one Google Ads account, pick the one to report to.",
        },
        {
          type: "p",
          text: "The page then shows the account, when payments were last sent, and `Send now`. `Disconnect` stops it. If you don't see the button, use the steps below.",
        },
        { type: "h", text: "By hand, part 1: create the conversion action" },
        {
          type: "p",
          text: "You do this once, on a computer, signed in to Google Ads. On the WorkBench page press `Turn on` under the by-hand section first: it shows everything below with `Copy` buttons.",
        },
        {
          type: "steps",
          items: [
            "In Google Ads open **Advisor**, Google's own assistant.",
            "On the WorkBench page press `Copy message` under Part 1, paste it into Advisor and send it.",
            "Advisor shows the conversion action it will create, named **WorkBench paid job**. Press **Apply**.",
          ],
        },
        {
          type: "tip",
          text: "No Advisor in your account? Press **No Advisor in your account? Do it by hand** on the WorkBench page for the three steps that do the same thing.",
        },
        { type: "h", text: "By hand, part 2: connect the file" },
        {
          type: "steps",
          items: [
            "**Choose the source.** In Google Ads open **Tools → Data manager** and press **Connect a data source**. Search for **HTTPS** and pick it. Choose **Direct connection** and the use **Conversions**.",
            "**Connect a source.** Paste the **File address**, **User name** and **Password** from the WorkBench page. If asked how to sign in, choose **Basic authentication**. Press **Next**.",
            "**Select data.** Google shows **conversions.csv**. Leave Filter alone and press **Next**. If Next is grey, see the first question below.",
            "**Map fields.** Match Google's fields to the file's columns: **Google Click ID (GCLID)** is `gclid`, **Conversion date and time** is `conversion_time`, **Conversion value** is `conversion_value`. If Google asks for them, **Currency** is `currency` and **Conversion action** is `conversion_name`. Leave the rest empty and press **Next**.",
            "**Schedule and finish.** Set it to run every day, name the connection, and press **Finish**.",
          ],
          note: "Google changes its menus from time to time. If a name here doesn't match your screen, look for the closest one, or ask us (see below).",
        },
        { type: "h", text: "Check it is working" },
        {
          type: "p",
          text: "Connected with the button: the page shows **Last sent** and how many payments went. By hand: the page shows when the file was **Last fetched**, and after Google's first run that time moves forward every day. Either way, payments show in Google Ads under the conversion action about a day later.",
        },
        { type: "h", text: "Stuck? Ask us" },
        {
          type: "p",
          text: "At the bottom of the page, `Ask for help` sends us a message with where your setup stands, and we reply by email. `Book a free setup call` puts time on our calendar to do it with you.",
        },
        {
          type: "tip",
          text: "Or just ask Atlas: \"is Google being told about my paid jobs?\"",
        },
        {
          type: "faq",
          items: [
            {
              q: "The Next button is grey on Select data. What do I do?",
              a: "Your file has no payments in it yet, and Google can't read an empty file. On the WorkBench page press `Add a sample row` under Select data in Part 2, then in Google press **Replace**, choose the file again, and Next will work. The sample row is one made-up payment of $1.00 with a click ID that isn't real. It leaves the file after 2 hours, and Google counts nothing from it.",
            },
            {
              q: "Which payments are reported?",
              a: "Payments on invoices for clients who first came in through a form on your website after clicking a Google ad, within 90 days of that click. A deposit and the balance are reported as two payments.",
            },
            {
              q: "Why is a payment missing?",
              a: "Google only accepts a payment within 90 days of the ad click. Some iPhone clicks hide the click ID, so those can't be reported. And a lead who called you, or who was typed in by hand, has no ad click saved. The page shows how many payments were left out.",
            },
            {
              q: "What happens when I refund a payment?",
              a: "The file shows the lower amount, but Google keeps the amount it counted first.",
            },
            {
              q: "What does Connect Google Ads let WorkBench do in my account?",
              a: "Add the one conversion action and send it payments: the ad click ID, the amount and the time. WorkBench does not change your campaigns, budgets or bidding. You can remove its access any time with `Disconnect`, or from your Google account's security page.",
            },
            {
              q: "Someone else has my file address. What now?",
              a: "Press `New address`. The old address stops working right away. Paste the new one into Google Ads.",
            },
            {
              q: "Does this change what my clients see?",
              a: "No. Nothing is sent to clients, and nothing about them leaves WorkBench except the ad click ID, the amount and the time.",
            },
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
            "Open **Overview → Expenses** and press `Log expense`.",
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
      keywords: ["quickbooks", "qbo", "accounting", "sync", "bookkeeper", "intuit", "reconnect", "connect quickbooks", "quickbooks connected"],
      where: { label: "QuickBooks", href: "/app/settings/quickbooks" },
      roles: "Owners and admins",
      blocks: [
        { type: "tip", text: `Connecting QuickBooks is part of **${PRO}** (${PRO_PRICE}; also in **${MAX}**) — the owner adds it on ${PLANS_PAGE_LINK}, see [Plans and pricing](/help/plans-and-pricing). A QuickBooks you connected before keeps syncing on ${CORE}. If your bookkeeper or accountant sent you to WorkBench, we turn QuickBooks on free on ${CORE}: mention it when you sign up, or message us from the Help Center.` },
        {
          type: "steps",
          items: [
            "Go to **Settings → Payments & accounting → QuickBooks Online**.",
            "Press `Connect to QuickBooks` and sign in to your QuickBooks company. On your phone the sign-in opens in your browser; when it says **QuickBooks connected**, close it and come back to the app.",
            "That's it. Invoices, payments and refunds go over as they happen, everything else within the hour, and you can press `Sync now` any time.",
          ],
        },
        {
          type: "list",
          items: [
            "Sync is **one way**, from WorkBench to QuickBooks: clients (matched by name), sent and paid invoices, payments, refunds, quotes and expenses.",
            "Invoice lines post to one item called **WorkBench Services**; card surcharges post to **Card Processing Surcharges**.",
            "A refund becomes a **Refund receipt** in QuickBooks. The payment keeps its full amount, so the deposit and the refund each match a line on your bank feed.",
            "Deleting an invoice or payment removes it from QuickBooks. Archiving an unpaid invoice **voids** it there (the number stays, the amounts go to zero); reopening it puts the amounts back. A returned bank payment comes off too.",
            "Want the same invoice numbers in QuickBooks? Turn on **Custom transaction numbers** there, under Settings → Sales. Otherwise QuickBooks numbers them itself.",
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
