import {
  DISPATCH_MINUTES_INCLUDED,
  DISPATCH_OVERAGE_CENTS,
  DISPATCH_SETUP_CENTS,
  DISPATCH_TEXTS_INCLUDED,
  PLANS,
  formatCents,
} from "../../plans";
import type { HelpSection } from "../types";
import { MAX, VOICE_CHIP } from "../plan-copy";

const VOICE = `${PLANS.DISPATCH.name} plan`;
const VOICE_CHIP_LABEL = VOICE_CHIP;

export const phoneSection: HelpSection = {
  id: "phone",
  title: "Business phone line",
  icon: "phone",
  tagline: "Your own business number: calls in the app, voicemail, call notes.",
  articles: [
    {
      slug: "set-up-business-line",
      title: "Get your business phone number",
      summary: "Pick a local or toll-free number, choose where calls ring, and set your voicemail.",
      keywords: ["phone number", "business number", "voice", "local number", "toll-free", "ring through", "forwarding", "caller id", "voicemail greeting"],
      where: { label: "Phone & texting", href: "/app/settings?s=phone" },
      plan: VOICE_CHIP_LABEL,
      roles: "Owners and admins (only the owner can subscribe)",
      blocks: [
        {
          type: "p",
          text: `The business line is part of the **${VOICE}** (${formatCents(PLANS.DISPATCH.monthlyCents)}/month plus a one-time ${formatCents(DISPATCH_SETUP_CENTS)} setup, with ${DISPATCH_TEXTS_INCLUDED} texts and ${DISPATCH_MINUTES_INCLUDED} minutes a month included). Without it, the free Call and Text buttons keep working from your own phone. **${MAX}** includes Voice together with Pro.`,
        },
        {
          type: "steps",
          items: [
            "Go to **Settings → Phone & texting**. If you don't have the plan yet, the owner presses `Subscribe`.",
            "Choose **Local number** (most customers answer these) or **Toll-free (8xx) number**, and type the area code you want.",
            "Enter **Ring calls through to**: the cell phone that should ring when nobody answers in the app.",
            "Press `Get a number`. Calls work as soon as the number is live.",
            "Optional: set a **Caller ID name** (up to 15 letters) and write your own **Voicemail greeting**.",
            "Each person who takes calls turns on **My Profile → Calls in the app**. See [Answer and make calls in the app](/help/calls-in-the-app).",
          ],
        },
        {
          type: "tip",
          text: "Texting from the number needs a one-time carrier registration. See [Register your number for texting](/help/register-for-texting). Calls don't need it.",
        },
        {
          type: "faq",
          items: [
            {
              q: "My caller ID name doesn't show on people's phones.",
              a: "Carriers take a few days to pick it up, and many cell carriers ignore caller ID names altogether. Registering the number free at freecallerregistry.com helps with the big cell carriers.",
            },
            {
              q: "The card says my plan ended and the number will be released.",
              a: "Your subscription lapsed. Resubscribe before the date shown to keep the number, or email us before then if you want to move it to another provider.",
            },
          ],
        },
      ],
    },
    {
      slug: "how-calls-ring",
      title: "How incoming calls ring",
      summary: "Who rings first, when your cell rings, and when callers go to voicemail.",
      keywords: ["ring", "ringing", "incoming call", "press 1", "whisper", "voicemail", "missed call", "cell rings"],
      where: { label: "Calls", href: "/app/calls" },
      plan: VOICE_CHIP_LABEL,
      blocks: [
        {
          type: "steps",
          items: [
            "Everyone signed in with **Calls in the app** turned on rings first, in the browser or the iPhone app, for about 15 seconds.",
            "If nobody picks up, your **ring-through cell** rings for about 25 seconds, showing your business number. When you answer, a voice says who's calling and asks you to **press 1** to take it.",
            "If nobody takes it, the caller hears your greeting and can leave a voicemail (up to 3 minutes). You get a notification.",
          ],
        },
        {
          type: "p",
          text: "The \"press 1\" step is on purpose: it stops your cell's own voicemail from answering a customer.",
        },
        {
          type: "list",
          items: [
            "Pressing `Decline` in the app sends the caller on to your cell or voicemail.",
            "With no ring-through number saved, calls go straight to voicemail.",
            "The Android app doesn't ring for calls yet. Android phones get calls as the ring-through cell.",
          ],
        },
      ],
    },
    {
      slug: "calls-in-the-app",
      title: "Answer and make calls in the app",
      summary: "Take calls on your computer or iPhone, call customers from your business number, and use the call screen.",
      keywords: ["softphone", "call in app", "browser calls", "dial", "keypad", "call back", "hold", "mute", "call from line", "outgoing"],
      where: { label: "Calls", href: "/app/calls" },
      plan: VOICE_CHIP_LABEL,
      roles: "Everyone except Tech",
      blocks: [
        {
          type: "steps",
          items: [
            "Go to **My Profile → Calls in the app** and press `Turn on`. Allow the microphone when your browser asks.",
            "Reload the page. The Calls page now says the line rings here first.",
            "To call someone, press `Call in app` on their client page, `Call back` on a call, or use the keypad on the **Calls** page. Customers always see your business number.",
          ],
        },
        {
          type: "p",
          text: "During a call you can **Mute**, **Hold** (they hear hold music), use the **Keypad** for phone menus, and **Hang up**. The call screen also lets you save an unknown caller as a lead or client, start a quote, appointment, job or invoice for them, and type **Notes** that save as you go.",
        },
        {
          type: "p",
          text: "If Calls in the app is off, calling from the line rings **your cell first**. Answer, press 1, and WorkBench dials the customer from your business number.",
        },
        {
          type: "h",
          text: "The Calls page",
        },
        {
          type: "p",
          text: "Filter by **All**, **Missed**, **Voicemail** and **Outgoing**. Missed calls and new voicemails are bold with a red dot, and voicemails play right in the list. Each row shows how long the call lasted.",
        },
        {
          type: "faq",
          note: "Calls ringing your cell? Look here",
          items: [
            {
              q: "Calls ring my cell instead of the app.",
              a: "Check that Calls in the app is on and that you reloaded the page afterwards. The tab has to stay open and signed in, and only one tab per browser holds the line (another tab may have it). The app gets about 15 seconds before the cell rings. The Tech role can't use calls in the app.",
            },
            {
              q: "\"Calling from the line is paused on our side for a moment.\"",
              a: "It's a problem on WorkBench's side, not yours. Use your phone for that call and try the line again later.",
            },
            {
              q: "The page says \"Save your ring-through number again.\"",
              a: "Your line is on plain call forwarding. Saving the ring-through number again turns on call announcements, voicemail and calling from the app.",
            },
          ],
        },
      ],
    },
    {
      slug: "fix-call-audio",
      title: "Fix call audio (they can't hear me)",
      summary: "Microphone problems, one-way audio, and the Test it button.",
      keywords: ["can't hear", "one-way audio", "microphone", "mic", "no sound", "echo", "headset", "test it", "blocked", "vpn"],
      where: { label: "Calls", href: "/app/calls" },
      plan: VOICE_CHIP_LABEL,
      blocks: [
        {
          type: "p",
          text: "When a customer can't hear you, the problem is almost always your computer's microphone, not the line.",
        },
        {
          type: "steps",
          note: "Start with Test it",
          items: [
            "On the **Calls** page, find **Microphone**, pick the mic you actually talk into, and press `Test it`.",
            "Speak. \"We heard you\" means it works. \"Nothing came through\" or \"isn't producing any audio\" means try another mic in the list.",
            "Check the mic's own mute switch, and close other apps that might be using it (Zoom, Teams, a recorder).",
            "If your browser blocked the microphone, click the icon left of the address bar, allow the microphone for this site, and reload. On a phone: Settings → WorkBench → Microphone.",
          ],
        },
        {
          type: "p",
          text: "WorkBench also watches the mic during a call and shows a warning if your voice isn't getting out.",
        },
        {
          type: "faq",
          items: [
            {
              q: "The test works but callers still can't hear me.",
              a: "A VPN or strict office firewall can block call audio. Turn the VPN off or try another network.",
            },
            {
              q: "I'm using a Bluetooth headset and it sounds bad or silent.",
              a: "Some headsets only send your voice in \"hands-free\" mode. Pick the headset's hands-free input in the mic list, or use the computer's built-in mic.",
            },
          ],
        },
      ],
    },
    {
      slug: "atlas-call-notes",
      title: "Let Atlas take call notes",
      summary: "Atlas transcribes the call and writes a summary on the client's record.",
      keywords: ["transcribe", "transcript", "call notes", "summary", "record call", "atlas notes"],
      where: { label: "Calls", href: "/app/calls" },
      plan: VOICE_CHIP_LABEL,
      blocks: [
        {
          type: "steps",
          items: [
            "Before or during a call, press `Let Atlas take notes` on the call screen.",
            "Atlas listens from the moment the call connects. Press `Stop and write the notes` when you're done, or just hang up.",
            "The summary appears on the call and the client's record a moment later.",
          ],
        },
        {
          type: "warn",
          text: "In some states you have to tell the other person the call is being transcribed. The call screen reminds you.",
        },
        {
          type: "list",
          items: [
            "If the caller isn't saved yet, Atlas holds the transcript until you save them as a lead or client (or you press `Discard the transcript`).",
            "Notes use Atlas tokens, and they can't start when this month's tokens are used up.",
          ],
        },
      ],
    },
    {
      slug: "voice-plan-limits",
      title: "Texts and minutes on the Voice plan",
      summary: "What's included each month and what happens past it.",
      keywords: ["minutes", "texts included", "overage", "usage", "cost", "voice plan price"],
      plan: VOICE_CHIP_LABEL,
      blocks: [
        {
          type: "list",
          items: [
            `${DISPATCH_TEXTS_INCLUDED} texts and ${DISPATCH_MINUTES_INCLUDED} minutes are included every month.`,
            `Past that, each text or minute is ${DISPATCH_OVERAGE_CENTS}¢.`,
            "Toll-free numbers are free for callers, but every incoming minute counts.",
            "Carrier registration fees for texting are covered by your plan.",
          ],
        },
      ],
    },
  ],
};

export const textingSection: HelpSection = {
  id: "texting",
  title: "Texting & messages",
  icon: "texting",
  tagline: "Text from your business number and keep every conversation in one inbox.",
  articles: [
    {
      slug: "register-for-texting",
      title: "Register your number for texting",
      summary: "The one-time carrier registration, what you need, and how long it takes.",
      keywords: ["10dlc", "registration", "a2p", "brand", "campaign", "ein", "sole proprietor", "verify for texting", "toll-free verification", "texting approval"],
      where: { label: "Phone & texting", href: "/app/settings?s=phone" },
      plan: VOICE_CHIP_LABEL,
      roles: "Owners and admins",
      blocks: [
        {
          type: "p",
          text: "US carriers require every business that texts customers to register first. You do it once, from the same Phone & texting card, after you have a number. Calls work the whole time.",
        },
        {
          type: "h",
          text: "Before you start, have these ready",
        },
        {
          type: "list",
          note: "Most rejections start here",
          items: [
            "A **booking form with the phone field on**. The texting consent checkbox sits under it, and carriers check it. See [Take bookings online](/help/online-booking).",
            "**Registered business (has an EIN):** your legal name, EIN and address **exactly** as on your IRS letter (CP575 or 147C), including \"LLC\" or \"Inc.\"",
            "**A contact email at your own domain with a person's name** (like jane@yourbusiness.com). Gmail, Outlook and group inboxes like info@ or contact@ are refused by the carriers.",
            "**Sole proprietor (no EIN):** any email works. A PIN is texted to your mobile, and you have 24 hours to enter it.",
            "Your business phone, email, address and at least one service filled in, because carriers look at your public business page.",
          ],
        },
        {
          type: "steps",
          items: [
            "Press `Register for texting` (toll-free numbers: `Verify for texting`).",
            "Choose **Registered business** or **Sole proprietor** and fill in the form. The website is optional. Leave it blank to use your WorkBench business page.",
            "Submit. Local numbers usually take **1–3 business days** (up to 7). Toll-free takes **1–2 weeks**.",
            "When it's approved, the card says **Texting is on**.",
          ],
        },
        {
          type: "p",
          text: "The full checklist, with the most common reasons carriers say no, is at [workbenchfsm.com/texting-registration](https://workbenchfsm.com/texting-registration).",
        },
      ],
    },
    {
      slug: "texting-registration-status",
      title: "What your texting registration status means",
      summary: "Queued, checking, verifying, reviewing, approved or rejected, and what to do.",
      keywords: ["pending", "rejected", "queued", "under review", "brand pending", "campaign pending", "check now", "resubmit", "carriers didn't approve"],
      where: { label: "Phone & texting", href: "/app/settings?s=phone" },
      plan: VOICE_CHIP_LABEL,
      blocks: [
        {
          type: "list",
          note: "Find the words on your card",
          items: [
            "**Your registration is queued**: it files by itself, usually within the hour.",
            "**We're checking your details before filing**: a WorkBench person looks it over first, usually the same business day. You can still `Edit the details`.",
            "**Verifying your business with the carrier registry**: the first check on your EIN and legal name. Sole proprietors see **Waiting on your verification PIN**.",
            "**Carriers are reviewing your texting registration** (or **Toll-free verification is under review**): the long wait, usually a few days.",
            "**Texting is on**: you're approved and texts go out from your number.",
            "**The carriers didn't approve texting**: the reason is shown word for word. Fix what it names and press `Edit and resubmit`.",
            "**The carriers sent the texting application back**: the issue is on WorkBench's side, and we're fixing it. You don't need to do anything.",
          ],
        },
        {
          type: "p",
          text: "Press `Check now` on any pending card to ask for the latest status. You're also notified by email and push whenever it changes.",
        },
        {
          type: "p",
          text: "While you wait, reminders and links go out by email, and the free Text button on jobs still works from your own phone.",
        },
        {
          type: "faq",
          items: [
            {
              q: "It was rejected because of my email.",
              a: "Carriers refuse free email (Gmail, Outlook, Yahoo) and group inboxes (info@, contact@, sales@) for registered businesses. Use a named address at your own domain. If you don't have a domain yet, [the texting registration page](https://workbenchfsm.com/texting-registration) explains how to get one.",
            },
            {
              q: "It was rejected because the name or EIN didn't match.",
              a: "The legal name has to match your IRS letter exactly, including \"LLC\", punctuation and spelling. Copy it from the letter.",
            },
          ],
        },
      ],
    },
    {
      slug: "text-notifications-and-opt-out",
      title: "Text notifications, STOP and HELP",
      summary: "Which texts clients get, and how opting out works.",
      keywords: ["stop", "unsubscribe", "opt out", "opt in", "start", "help", "text notifications", "consent", "reminder texts"],
      where: { label: "Phone & texting", href: "/app/settings?s=phone" },
      plan: VOICE_CHIP_LABEL,
      blocks: [
        {
          type: "p",
          text: "Once texting is on, press `Turn on text notifications` in Settings → Phone & texting. Turning it on confirms your clients gave you their numbers. From then on, clients with a phone number get service texts (appointment reminders, on-my-way, invoice links) unless you switch a client off or they opt out.",
        },
        {
          type: "list",
          items: [
            "A client who replies **STOP**, STOPALL, UNSUBSCRIBE, CANCEL, END or QUIT, as the whole message, gets no more texts. **START** or UNSTOP turns texts back on. **HELP** or INFO gets your contact details.",
            "\"Cancel Friday's visit\" is a normal message that lands in your inbox, not an opt-out.",
            "Which texts go out on their own: appointment reminders the day before and about an hour ahead, schedule changes, the invoice pay link when you press `Send to Client`, on-my-way, and any `Text client` step in an automation. Those say who they are from and how to stop. Your own replies in Messages are texts too, sent exactly as you typed them.",
            "Quotes are never texted, because carriers treat them as marketing. They go by email.",
            "There's a limit of 500 texts a day per company.",
          ],
        },
      ],
    },
    {
      slug: "messages-inbox",
      title: "Message clients from the inbox",
      summary: "One conversation per client: texts, portal messages and replies in one place.",
      keywords: ["messages", "inbox", "conversation", "thread", "reply", "portal message", "new message", "text a client"],
      where: { label: "Messages", href: "/app/messages" },
      roles: "Everyone except Tech",
      blocks: [
        {
          type: "steps",
          items: [
            "Open **Messages** and press `New message`, then search for the client. Or press `Message` on a client's page.",
            "Type and send.",
          ],
        },
        {
          type: "list",
          items: [
            "**With texting on**, your message is a text from your business number and their reply lands in the same thread.",
            "**Without texting**, it goes to their client portal plus an email.",
            "Clients can also write to you from the Messages tab in their portal.",
            "The separate `Text` button on jobs and client pages opens your own phone's messaging app instead. It's free and sends from your personal number.",
          ],
        },
        {
          type: "tip",
          text: "Texting a lead from Messages moves them to **Contacted** on the Leads board.",
        },
      ],
    },
  ],
};
