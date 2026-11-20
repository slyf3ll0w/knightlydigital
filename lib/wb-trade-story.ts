/**
 * How each /trades/<slug> page is laid out (David 2026-11-20: "the trade
 * pages all look the same; make them more like sections of the home page,
 * with more uniqueness between them"). Decided with him:
 *
 *   three FAMILIES, by how the work runs, each its own section lineup
 *     repair  — the call comes in, fix it, get paid in the driveway
 *     route   — the same stops every week, billed on their own
 *     project — the walkthrough, the big quote, the deposit, the job costing
 *   plus one SIGNATURE section per trade (a coded app demo of the thing that
 *   trade cares about most), and its own hero shade and accent.
 *
 * The copy here is number-free on prices like lib/wb-trades.ts
 * (scripts/test-wb-site.ts); demo amounts come from the trade's price-book
 * template (lib/wb-tools.ts TRADE_TEMPLATES) inside the page.
 */

export type TradeFamily = "repair" | "route" | "project";

export type SignatureKind = "quoteOptions" | "recurring" | "atlas" | "checklist" | "booking" | "timesheet" | "contract" | "dayshift" | "video";

export type TradeStory = {
  family: TradeFamily;
  /** The hero background: three WorkBench shades, so neighbours differ. */
  tone: "navy" | "deep" | "blue";
  /** The accent phrase color in headlines. */
  accent: "orange" | "sky";
  signature: {
    kind: SignatureKind;
    /** [plain part, accent part] of the section title. */
    title: [string, string];
    body: string;
    /** A short hand-written note beside the demo (two lines). */
    note?: [string, string];
    /** quoteOptions: which optional line the client turns on (index among the template's optional lines). */
    pick?: number;
    /** checklist: the visit's checklist. */
    items?: { label: string; value?: string }[];
    /** recurring / route: how often. */
    cadence?: string;
    /** contract: the clauses on the agreement. */
    clauses?: string[];
    /** Pro-only feature: printed under the body. */
    pro?: boolean;
  };
  /** repair: the call that jumps the day. */
  urgent?: { client: string; title: string };
  /** route: how often the stops come around. */
  cadence?: string;
  /** route: the service name on each stop (defaults to the template's first line). */
  stopService?: string;
};

export const TRADE_STORIES: Record<string, TradeStory> = {
  /* ── repair ─────────────────────────────────────────────────────────── */
  plumbing: {
    family: "repair",
    tone: "navy",
    accent: "orange",
    urgent: { client: "Derek Olsen", title: "Burst pipe under the kitchen sink" },
    signature: {
      kind: "quoteOptions",
      title: ["One quote,", "the homeowner picks."],
      body: "Put the extras on the quote as options. The homeowner keeps the ones they want and unticks the rest on their phone, the total moves with them, and they sign right there. The deposit invoice follows by itself. No second trip to re-quote.",
      note: ["They choose,", "you get the yes"],
      pick: 0,
    },
  },
  hvac: {
    family: "repair",
    tone: "deep",
    accent: "sky",
    urgent: { client: "Olivia Park", title: "No cooling, upstairs at 84°" },
    signature: {
      kind: "recurring",
      title: ["Maintenance plans", "that renew themselves."],
      body: "Sell the tune-up plan once. The spring and fall visits land on the schedule by themselves, each one bills when it is done, and a saved card pays it. The quiet months fill up before the phone rings.",
      cadence: "Every 6 months",
      note: ["Visits book", "themselves"],
    },
  },
  electrical: {
    family: "repair",
    tone: "blue",
    accent: "orange",
    urgent: { client: "Marcus Bell", title: "Half the house lost power" },
    signature: {
      kind: "atlas",
      title: ["Hands in the panel?", "Just say it."],
      body: "Talk to Atlas from the ladder: build the quote for the panel upgrade, text the client you are running late, or ask who still owes you. Anything that goes to a client or moves money waits for your OK.",
    },
  },
  "appliance-repair": {
    family: "repair",
    tone: "navy",
    accent: "sky",
    urgent: { client: "Hannah Brooks", title: "Washer stopped mid-cycle, full of water" },
    signature: {
      kind: "checklist",
      title: ["Show them what", "you checked."],
      body: "The tech ticks the checklist on the phone as they work, so every repair is done the same way and you can see who checked what. With the Gallery plan, coming soon, the client also gets the work report by email when the job is done.",
      items: [{ label: "Drain pump tested" }, { label: "Hoses and filter checked" }, { label: "Pump replaced" }, { label: "Test cycle run, no leaks" }],
      note: ["Every step,", "on record"],
    },
  },
  "garage-doors": {
    family: "repair",
    tone: "deep",
    accent: "orange",
    urgent: { client: "Grace Kim", title: "Door stuck open, spring snapped" },
    signature: {
      kind: "booking",
      title: ["Booked while you", "were on a ladder."],
      body: "Put a booking button on your website and Google profile. Homeowners pick from your real open times, answer your questions, and the visit lands on the schedule with the address and the photos they sent.",
      note: ["Real open", "times only"],
    },
  },
  handyman: {
    family: "repair",
    tone: "blue",
    accent: "sky",
    urgent: { client: "Maria Hernandez", title: "Front door won't latch" },
    signature: {
      kind: "timesheet",
      title: ["Bill the hours", "you really worked."],
      body: "Clock in on the job from the phone and the timer runs until you clock out. The hours land on the timesheet and on the job, so hourly work bills right and you can see what each job paid you for your time.",
      pro: true,
    },
  },

  /* ── route ──────────────────────────────────────────────────────────── */
  "lawn-care": {
    family: "route",
    tone: "navy",
    accent: "orange",
    cadence: "Every week",
    signature: {
      kind: "quoteOptions",
      title: ["Sell the add-ons", "without the sales pitch."],
      body: "Put fertilizing and mulch on the season quote as options. The homeowner unticks the ones they don't want, the total updates, and they sign from the couch. Every add-on they keep becomes part of the job.",
      note: ["Add-ons sell", "themselves"],
      pick: 0,
    },
  },
  "pool-service": {
    family: "route",
    tone: "blue",
    accent: "orange",
    cadence: "Every week",
    stopService: "Weekly pool service",
    signature: {
      kind: "checklist",
      title: ["Every stop,", "checked off."],
      body: "The tech ticks the visit checklist on the phone at every pool, so nothing gets skipped on a long route and you can see who did what. With the Gallery plan, coming soon, the owner also gets the work report by email before the truck leaves the street.",
      items: [
        { label: "Chlorine tested and adjusted" },
        { label: "pH balanced" },
        { label: "Skimmed and brushed" },
        { label: "Baskets emptied" },
        { label: "Filter pressure checked" },
      ],
      note: ["Nothing", "skipped"],
    },
  },
  "pest-control": {
    family: "route",
    tone: "deep",
    accent: "sky",
    cadence: "Every 3 months",
    stopService: "Quarterly service",
    signature: {
      kind: "contract",
      title: ["The service agreement,", "signed on their phone."],
      body: "Send the yearly agreement with your terms in it. The client reads it and signs on their phone, a signed copy lands in their inbox, and the quarterly visits are set to come around on their own.",
      clauses: ["Initial treatment, inside and out", "A service visit every three months", "Free re-treatment between visits", "Billed per visit to the card on file", "Cancel any time with notice"],
      pro: true,
    },
  },
  "window-cleaning": {
    family: "route",
    tone: "navy",
    accent: "sky",
    cadence: "Every 3 months",
    stopService: "Exterior windows",
    signature: {
      kind: "booking",
      title: ["New clients book", "the open slots."],
      body: "A booking button on your website shows only the times you can really take. The homeowner picks one, answers your questions about the house, and the visit drops onto the day that already has stops nearby.",
      note: ["Fills the", "gaps for you"],
    },
  },
  cleaning: {
    family: "route",
    tone: "blue",
    accent: "orange",
    cadence: "Every 2 weeks",
    stopService: "Recurring clean",
    signature: {
      kind: "timesheet",
      title: ["Know where every", "crew's hours went."],
      body: "Each cleaner clocks in at the house and out when it is done. The timesheet fills itself in for payroll, and every job shows what the labor cost, so you know which homes are priced right.",
      pro: true,
    },
  },
  "snow-removal": {
    family: "route",
    tone: "deep",
    accent: "orange",
    cadence: "Every snowfall",
    stopService: "Driveway plow",
    signature: {
      kind: "atlas",
      title: ["Storm tonight?", "Tell Atlas."],
      body: "Say it from the truck: put every contract driveway on tomorrow's route, text the clients that you are coming, and bill the pushes at the end of the month. Atlas sets it up and waits for your OK before anything goes out.",
    },
  },

  /* ── project ────────────────────────────────────────────────────────── */
  roofing: {
    family: "project",
    tone: "navy",
    accent: "orange",
    signature: {
      kind: "contract",
      title: ["The contract signed", "before the tear-off."],
      body: "Send the roofing agreement with the scope, the warranty and the payment terms. The homeowner signs on their phone, a signed copy lands in their inbox, and the deposit is collected before you order shingles.",
      clauses: ["Tear off and replace the full roof", "New underlayment and drip edge", "Rotten decking replaced at the listed rate", "Workmanship warranty in writing", "Deposit due at signing, balance at completion"],
      pro: true,
    },
  },
  painting: {
    family: "project",
    tone: "deep",
    accent: "sky",
    signature: {
      kind: "quoteOptions",
      title: ["Walls, trim, ceilings.", "They choose."],
      body: "Quote the rooms and put the trim and the ceilings on as options. The homeowner unticks what they don't want, the price follows, and they sign. The quote they approve becomes the job.",
      note: ["Upsell without", "the awkward talk"],
      pick: 1,
    },
  },
  landscaping: {
    family: "project",
    tone: "blue",
    accent: "orange",
    signature: {
      kind: "timesheet",
      title: ["See what the crew days", "really cost."],
      body: "A patio is three crew days, or it is five. Everyone clocks in on the job, the hours add up against the quote, and the job costing shows the profit while there is still time to do something about it.",
      pro: true,
    },
  },
  "christmas-lights": {
    family: "project",
    tone: "deep",
    accent: "orange",
    signature: {
      kind: "video",
      title: ["The busy season,", "run on WorkBench."],
      body: "Edan runs Knight Light Christmas Lighting on WorkBench: the installs, the mid-season service calls and the takedowns, every one on the schedule and paid through the app.",
    },
  },
  "pressure-washing": {
    family: "project",
    tone: "navy",
    accent: "sky",
    signature: {
      kind: "booking",
      title: ["Sunny weekend?", "Your calendar fills."],
      body: "Homeowners book the driveway or the house wash from your website at the times you really have open. They answer your questions about the property up front, so you can quote it before you get there.",
      note: ["Booked from", "your website"],
    },
  },
  "junk-removal": {
    family: "project",
    tone: "blue",
    accent: "orange",
    urgent: { client: "Olivia Park", title: "Same-day pickup, garage cleanout" },
    signature: {
      kind: "dayshift",
      title: ["Same-day jobs,", "slotted right in."],
      body: "A same-day pickup comes in and you drag it into the gap on today's schedule. Move a job to make room and text that client the new time in one tap, and the crew sees the change on their phones.",
      note: ["One drag,", "one tap"],
    },
  },
};

export function tradeStory(slug: string): TradeStory {
  const s = TRADE_STORIES[slug];
  if (!s) throw new Error(`lib/wb-trade-story.ts: no story for trade ${slug}`);
  return s;
}
