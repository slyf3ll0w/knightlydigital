import type { HelpSection } from "../types";
import { ATLAS_FREE, ATLAS_FULL, ATLAS_FULL_PRICE, MAX, PRO, PRO_CHIP, PRO_PRICE, proTip } from "../plan-copy";

export const automationsSection: HelpSection = {
  id: "automations",
  title: "Automations",
  icon: "automations",
  tagline: "When this happens, do that, so follow-ups run themselves.",
  articles: [
    {
      slug: "build-an-automation",
      title: "Build an automation",
      summary: "Pick a trigger, add conditions, waits and actions, test it, and turn it on.",
      plan: PRO_CHIP,
      keywords: ["automation", "workflow", "rule", "trigger", "action", "zapier", "when then", "follow up automatically", "dry run"],
      where: { label: "Automations", href: "/app/automations" },
      roles: "Owners and admins",
      blocks: [
        proTip("Automations"),
        {
          type: "p",
          text: "An automation is one **trigger** (something that happens) followed by steps: **Only continue if…** conditions, **Wait** steps, and **actions**.",
        },
        {
          type: "steps",
          items: [
            "Go to **Automations** and press `New`. The fastest way is to describe it to Atlas: \"When a quote is sent, wait 3 days, then email the client if it's still not approved.\" Or start from a built-in example.",
            "Check the trigger card. There are triggers for leads, requests, appointments, quotes, jobs, invoices, payments, calls, messages, agreements and more, plus **on a schedule**, **a webhook is received**, and **you press Run on a record**.",
            "Add conditions and waits (up to 60 days) and your actions, like email or text the client, notify the team, move a lead, create a draft quote, or push to QuickBooks.",
            "Press `Dry run · last 30 days` to see what it would have done. Nothing is sent.",
            "Press `Turn it on`.",
          ],
        },
        {
          type: "h",
          text: "Good ones to start with",
        },
        {
          type: "list",
          note: "Start with one of these",
          items: [
            "Nudge a client whose quote has sat unanswered for 5 days.",
            "Ask for a review the day after a job is completed.",
            "Tell the owner when an invoice over $500 goes past due.",
            "Text back a missed call.",
            "A Monday 8 am summary to the team.",
          ],
        },
        {
          type: "p",
          text: "On a phone you can see your automations, pause them and check their runs. Editing the cards is done on a computer.",
        },
      ],
    },
    {
      slug: "automation-limits",
      title: "What automations can't do (and why one didn't fire)",
      summary: "Limits, run history, and the usual reasons a rule skipped.",
      plan: PRO_CHIP,
      keywords: ["didn't fire", "not working", "skipped", "failed", "paused", "limits", "run history", "run automation"],
      where: { label: "Automations", href: "/app/automations" },
      roles: "Owners and admins",
      blocks: [
        {
          type: "list",
          items: [
            "Automations never move money, delete, archive, or change team members.",
            "Up to **30 rules** per company and **300 runs a day**.",
            "A rule fires at most once per record per event, and automations can't trigger each other.",
            "Time-based triggers (like \"invoice 7 days overdue\") are checked every hour, so they can land up to an hour late.",
            "**Text the client** only sends service messages. Wording that sounds like a promotion is skipped.",
          ],
        },
        {
          type: "p",
          text: "Open a rule to see its run history. Each run is **ok**, **skipped** (with the reason), **failed**, or **waiting** on a later step.",
        },
        {
          type: "p",
          text: "Rules with the trigger **you press Run on a record** add a `Run automation` option to client, job, quote and invoice pages for managers.",
        },
        {
          type: "faq",
          items: [
            {
              q: "My automation hasn't fired.",
              a: "Check that it isn't **Paused**, that its conditions actually match (use the dry run), and whether it already fired for that record. Texts need texting turned on. Emails need your business approved for payments.",
            },
          ],
        },
      ],
    },
  ],
};

export const atlasSection: HelpSection = {
  id: "atlas",
  title: "Atlas (AI assistant)",
  icon: "atlas",
  tagline: "Ask questions about your business, or hand off the busywork.",
  articles: [
    {
      slug: "what-atlas-can-do",
      title: "What Atlas can do",
      summary: "Ask about your numbers, have it draft and update records, and approve every change.",
      keywords: ["atlas", "ai", "assistant", "chat", "ask", "bot", "gpt"],
      blocks: [
        {
          type: "video",
          src: "/video/tip-ask-atlas.mp4",
          poster: "/video/tip-ask-atlas-poster.jpg",
          title: "Ask Atlas anything (26 seconds, no sound)",
          text: "On a phone: ask Atlas who owes you money and it answers from your real numbers; then ask it to move a job, and the change waits on a Needs your OK card until you press Save changes.",
        },
        {
          type: "p",
          text: "Atlas is the assistant built into WorkBench. It reads your real data and can do almost anything you can do in the app. On a computer, open it with the Atlas button at the bottom-right. On a phone, it's the **Ask Atlas** row on Home and at the top of **More**.",
        },
        {
          type: "h",
          text: "Things to try",
        },
        {
          type: "list",
          note: "Try one of these",
          items: [
            "\"Who owes me money?\" or \"How did we do last month?\"",
            "\"Quote the Hendersons for a spring cleanup and email it.\"",
            "\"Move Tuesday's jobs for Mike to Wednesday and text the clients.\"",
            "\"Reformat every client's phone number.\" Bulk changes land as one card.",
            "\"Build me a booking form for free estimates.\" or \"Write a service agreement.\"",
            "\"How do I refund a payment?\" Atlas answers from this Help Center.",
          ],
        },
        {
          type: "h",
          text: "You approve every change",
        },
        {
          type: "p",
          text: "Atlas never changes anything by itself. Each change shows up as a card with `Skip` and a confirm button. Amber cards **move real money** and red ones are **permanent** (some ask you to type a name first). Similar changes are grouped, so `Confirm all` handles a batch. For multi-step jobs, Atlas carries on by itself after you confirm.",
        },
        {
          type: "tip",
          text: `Every account gets ${ATLAS_FREE} Atlas tokens a month free. **Atlas Full** (${ATLAS_FULL} a month) comes with ${PRO} and ${MAX}, or ${ATLAS_FULL_PRICE} on its own. See [Atlas tokens and limits](/help/atlas-tokens). Owners can rename the assistant in Settings → Automations & assistant.`,
        },
        {
          type: "p",
          text: "A few things Atlas sends you to a page for: uploading photos or a logo, importing a CSV, adding a new card, and connecting payments or QuickBooks.",
        },
      ],
    },
    {
      slug: "atlas-tokens",
      title: "Atlas tokens and limits",
      summary: "The free monthly allowance, what uses it, and what happens when it runs out.",
      keywords: ["tokens", "usage", "limit", "used up", "meter", "breather", "atlas full", "cost"],
      blocks: [
        {
          type: "list",
          items: [
            `Every account gets **${ATLAS_FREE} Atlas tokens free each month**, refilled on the 1st.`,
            `**Atlas Full** is **${ATLAS_FULL} tokens a month**. It comes with the **${PRO}** plan (${PRO_PRICE}) and **${MAX}**, or costs ${ATLAS_FULL_PRICE} on its own. Its tokens refill on your billing day.`,
            "Each reply shows how many tokens it used.",
            "Call notes, building estimate tools and drafting automation text also use tokens.",
            "When they're gone, Atlas says so and opens again when the meter refills. Everything else in WorkBench keeps working.",
            "Using Atlas every day? Atlas Full is the way to stop running out. Call or email us to switch it on.",
          ],
        },
        {
          type: "faq",
          items: [
            {
              q: "\"The assistant needs a breather.\"",
              a: "There's a short-term limit on how many messages a company can send in a few minutes and in a day. Wait a few minutes and try again.",
            },
            {
              q: "Where did my conversation go?",
              a: "Chats live in the browser tab. Closing the tab or pressing `New chat` starts fresh. Anything Atlas did is saved on your records.",
            },
          ],
        },
      ],
    },
  ],
};

export const estimatorSection: HelpSection = {
  id: "estimator",
  title: "Estimate tools",
  icon: "estimator",
  tagline: "Price jobs the same way every time, onsite or on your website.",
  articles: [
    {
      slug: "build-an-estimate-tool",
      title: "Build an estimate tool",
      summary: "Describe how you price a job (or snap your price sheet) and Atlas builds a calculator.",
      plan: PRO_CHIP,
      keywords: ["estimator", "calculator", "pricing tool", "price sheet", "estimate tool", "build"],
      where: { label: "Estimates", href: "/app/estimates" },
      roles: "Owners and admins build; sales roles run them",
      blocks: [
        proTip("Estimate tools"),
        {
          type: "steps",
          items: [
            "Go to **Estimates** and press `Build an estimate tool`.",
            "Describe how you price the work, like \"driveways by square foot, $8 a foot, $400 minimum, +15% for stamped.\" Or press **Have a price sheet? Attach a photo**.",
            "Press `Build it` and watch Atlas draft the questions and math, then test it.",
            "Try it with a real job and adjust. You can edit any part by hand or ask Atlas to change it, and restore an earlier version at any time.",
          ],
        },
        {
          type: "tip",
          text: "Building uses Atlas tokens once. Running the tool afterwards is free.",
        },
        {
          type: "faq",
          items: [
            {
              q: "My price sheet photo won't upload.",
              a: "Use a JPEG or PNG. iPhone photos in HEIC format need to be shared as JPEG.",
            },
          ],
        },
      ],
    },
    {
      slug: "run-an-estimate-onsite",
      title: "Price a job onsite and measure from the map",
      summary: "Answer the tool's questions, measure on a satellite map, and turn the result into a quote.",
      plan: PRO_CHIP,
      keywords: ["measure", "map", "satellite", "square feet", "area", "length", "onsite", "run estimate"],
      where: { label: "Estimates", href: "/app/estimates" },
      blocks: [
        {
          type: "steps",
          items: [
            "Open the tool from **Estimates** (or pick `Use an estimate tool` on a new quote).",
            "Answer its questions. For a map question, tap the corners of the area on the satellite view. Tap the first corner again or press `Close shape` to finish, and use `Undo` or `Clear` to fix it.",
            "Check the price and turn it into a quote.",
          ],
        },
        {
          type: "p",
          text: "Everyone who sells can run tools. Only managers can build or edit them.",
        },
      ],
    },
    {
      slug: "estimate-tool-on-your-website",
      title: "Put an estimate tool on your website",
      summary: "Let visitors price the job themselves and come in as leads.",
      plan: PRO_CHIP,
      keywords: ["website", "instant quote", "web form", "publish", "embed", "lead form", "online estimate"],
      where: { label: "Estimates", href: "/app/estimates" },
      roles: "Owners and admins",
      blocks: [
        {
          type: "steps",
          items: [
            "Open a tool and choose **Publish as a web form**.",
            "Pick what visitors see: the **exact estimate**, **a range**, or **no price**.",
            "Pick when to ask for their name and contact details: before the form, after the questions, or after they see the price.",
            "Choose what each submission creates: a lead and request, plus a draft quote or a quote emailed for approval.",
            "Copy the link, or the embed code for your site.",
          ],
        },
        {
          type: "p",
          text: "Visitors with a ZIP code outside your service area still come in as a request, just without a price.",
        },
      ],
    },
    {
      slug: "estimate-tool-library",
      title: "Share and borrow tools in the Library",
      summary: "Start from another business's tool, then set your own rates.",
      plan: PRO_CHIP,
      keywords: ["library", "share", "template", "borrow", "rates to confirm"],
      where: { label: "Library", href: "/app/estimates/library" },
      blocks: [
        {
          type: "p",
          text: "The **Library** has tools other WorkBench businesses shared. When you add one, every rate goes under **Rates to confirm**, so you set your own numbers before using it. Share one of yours with `Share to the Library`.",
        },
      ],
    },
  ],
};
