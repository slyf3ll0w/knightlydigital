import {
  EXTRA_SEAT_CENTS,
  FREE_PLAN_NAME,
  FULL_SHOP,
  INCLUDED_SEATS,
  PLANS,
  formatCents,
} from "../../plans";
import type { HelpSection } from "../types";

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
      slug: "notifications",
      title: "Turn on notifications",
      summary: "Get pushes for new leads, bookings, payments, messages and calls on each device.",
      keywords: ["notifications", "push", "alerts", "bell", "not getting notifications", "add to home screen"],
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
          text: "You'll be told about new requests and leads, bookings, chat messages, payments (and failed ones), when a client views a quote, invoice or agreement, your next job (with On My Way and Directions buttons), and missed calls and voicemails on your business line.",
        },
        {
          type: "faq",
          items: [
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
      summary: "What's free, what each add-on includes, and how processing fees work.",
      keywords: ["price", "pricing", "plan", "cost", "subscription", "billing", "core", "voice", "pro", "max", "upgrade", "users", "seats"],
      blocks: [
        {
          type: "list",
          items: [
            `**${FREE_PLAN_NAME}** is free: the whole app (booking, scheduling, quotes, invoicing, payments, client portal, team chat) for ${INCLUDED_SEATS} users, then ${formatCents(EXTRA_SEAT_CENTS)} per extra user a month. It's paid for by processing fees when clients pay you: 2.9% + 30¢ per card payment, 0.75% per bank payment.`,
            `**${PLANS.DISPATCH.name}** (${formatCents(PLANS.DISPATCH.monthlyCents)}/month): your business phone line, with calls in the app, voicemail, texting and Atlas call notes.`,
            `**${PLANS.SHOP.name}** (${formatCents(PLANS.SHOP.monthlyCents)}/month): unlimited users, estimate tools, Route Manager, automations, agreements, team map, timesheets, QuickBooks, and more Atlas tokens.`,
            `**${FULL_SHOP.name}** (${formatCents(FULL_SHOP.monthlyCents)}/month): ${PLANS.DISPATCH.name} and ${PLANS.SHOP.name} together.`,
            `**${PLANS.JOBSITE.name}** (job photos) is coming soon.`,
          ],
        },
        {
          type: "p",
          text: "Every account also gets 10,000 Atlas tokens a month free. Full details are on the [pricing page](https://workbenchfsm.com/pricing).",
        },
        {
          type: "p",
          text: `The ${PLANS.DISPATCH.name} plan is managed in Settings → Phone & texting, and billing runs through Livery, our payments partner.`,
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
            "Open **Help & Feedback** from the menu (on this page, use the buttons at the bottom).",
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
      keywords: ["iphone", "ios", "android", "app store", "google play", "download", "mobile app", "face id", "app lock"],
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
