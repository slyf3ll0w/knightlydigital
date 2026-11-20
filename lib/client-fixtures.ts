import type { PublicBookingType } from "@/lib/booking-runtime";
import type { ScheduleAppearance } from "@/app/book/[slug]/schedule/shell";
import type { SlotDay, Booked } from "@/app/book/[slug]/schedule/[type]/BookingStepper";
import type { BusinessProfile } from "@/lib/business-profile";
import { defaultButtonLabel, defaultIntake, effectiveIntake } from "@/lib/booking-intake";
import { clientBand } from "@/lib/client-band";
import type { BookingKind, BookingMode } from "@/lib/booking-types";
import type { PublicQuote } from "@/app/quote/[token]/QuoteAcceptPage";
import type { PublicInvoice } from "@/app/pay/[token]/PayPage";
import type { HubHomeData } from "@/app/hub/[token]/HubHome";

/**
 * Brightwire Electric — the FAKE company every client-facing surface is
 * reviewed on (/app/design/client and /client-preview). Never a real
 * client of WorkBench (feedback-no-real-clients-in-marketing).
 */

export type FixtureBrand = "default" | "navy" | "orange" | "yellow" | "black";

const BRANDS: Record<FixtureBrand, { brandColor: string | null; brandColorSecondary: string | null; documentColor: string | null }> = {
  default: { brandColor: null, brandColorSecondary: null, documentColor: null },
  navy: { brandColor: "#0A1428", brandColorSecondary: "#F86808", documentColor: null },
  orange: { brandColor: "#F97316", brandColorSecondary: null, documentColor: null },
  yellow: { brandColor: "#FDE047", brandColorSecondary: null, documentColor: null },
  black: { brandColor: "#111111", brandColorSecondary: "#FFFFFF", documentColor: null },
};

export function fixtureCompany(brand: FixtureBrand = "navy") {
  return {
    name: "Brightwire Electric",
    phone: "(469) 555-0142",
    email: "hello@brightwire-electric.example",
    address: "1180 Greenville Ave, Suite 210",
    city: "Allen",
    state: "TX",
    zip: "75002",
    logoUrl: null,
    ...BRANDS[brand],
    surchargeEnabled: true,
    surchargeRate: 0.03,
  };
}

const CONTACT = {
  firstName: "Sarah",
  lastName: "Henderson",
  email: "sarah.henderson@example.com",
  phone: "(214) 555-0188",
  address: "14 Oak Court",
  city: "Allen",
  state: "TX",
  zip: "75013",
};

const DAY = 86_400_000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();

export function fixtureQuote(state: "open" | "approved" | "expired" | "withdrawn" = "open", brand: FixtureBrand = "navy"): PublicQuote {
  const items = [
    { id: "li1", name: "Panel upgrade, 200A", description: "Replace the existing 100A panel with a 200A Square D panel, new main breaker and grounding to code.", quantity: 1, unitPrice: 2400, total: 2400, isOptional: false, optedOut: false },
    { id: "li2", name: "City permit and inspection", description: "", quantity: 1, unitPrice: 180, total: 180, isOptional: false, optedOut: false },
    { id: "li3", name: "Whole-home surge protector", description: "Eaton CHSPT2 installed at the panel.", quantity: 1, unitPrice: 320, total: 320, isOptional: true, optedOut: false },
    { id: "li4", name: "EV charger circuit (50A)", description: "Conduit run to the garage, NEMA 14-50 outlet.", quantity: 1, unitPrice: 650, total: 650, isOptional: true, optedOut: true },
  ];
  const included = items.filter((i) => !i.optedOut);
  const subtotal = included.reduce((s, i) => s + i.total, 0);
  const tax = Math.round(subtotal * 0.0825 * 100) / 100;
  return {
    id: "q_preview",
    publicToken: "preview",
    quoteNumber: 1042,
    title: "Panel upgrade at 14 Oak Court",
    status: state === "approved" ? "APPROVED" : state === "withdrawn" ? "ARCHIVED" : "AWAITING_RESPONSE",
    subtotal,
    discountType: "NONE",
    discountValue: null,
    taxRate: 0.0825,
    tax,
    total: subtotal + tax,
    depositType: "PERCENT",
    depositValue: 30,
    clientMessage:
      "Hi Sarah — thanks for having us out Tuesday. Here's the estimate for the panel work we talked about. The surge protector and EV circuit are optional; tick whichever you'd like included and the total updates. Happy to answer anything.",
    disclaimer:
      "Estimate valid for 30 days. Work is scheduled on deposit. Any additional work found once the panel is open is quoted before it is done. Brightwire Electric is licensed and insured (TECL 00000).",
    validUntil: state === "expired" ? iso(-3) : iso(27),
    sentAt: iso(-2),
    createdAt: iso(-2),
    signatureName: state === "approved" ? "Sarah Henderson" : null,
    approvedAt: state === "approved" ? iso(-1) : null,
    contact: CONTACT,
    company: fixtureCompany(brand),
    lineItems: items,
  };
}

export function fixtureInvoice(state: "open" | "paid" | "partial" | "withdrawn" = "open", brand: FixtureBrand = "navy"): PublicInvoice {
  const items = [
    { id: "ii1", name: "Panel upgrade, 200A", description: "Replace the existing 100A panel with a 200A Square D panel, new main breaker and grounding to code.", quantity: 1, unitPrice: 2400, total: 2400, recurringInterval: null },
    { id: "ii2", name: "City permit and inspection", description: "", quantity: 1, unitPrice: 180, total: 180, recurringInterval: null },
    { id: "ii3", name: "Whole-home surge protector", description: "Eaton CHSPT2 installed at the panel.", quantity: 1, unitPrice: 320, total: 320, recurringInterval: null },
  ];
  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const tax = Math.round(subtotal * 0.0825 * 100) / 100;
  // The invoice total is NET of the deposit (the ledger shows "Deposit applied" as a deduction)
  const gross = Math.round((subtotal + tax) * 100) / 100;
  const deposit = Math.round(gross * 0.3 * 100) / 100;
  const total = Math.round((gross - deposit) * 100) / 100;
  const payments =
    state === "paid"
      ? [{ id: "p1", amount: total, surchargeAmount: 0, method: "ACH", paidAt: iso(-1) }]
      : state === "partial"
        ? [{ id: "p2", amount: 500, surchargeAmount: 15, method: "CARD", paidAt: iso(-1) }]
        : [];
  return {
    id: "i_preview",
    invoiceNumber: 2210,
    status: state === "paid" ? "PAID" : state === "withdrawn" ? "ARCHIVED" : "AWAITING_PAYMENT",
    kind: "FINAL",
    publicToken: "preview",
    subtotal,
    discount: null,
    tax,
    surcharge: null,
    depositApplied: deposit,
    total,
    notes: "Thank you for choosing Brightwire. Your panel carries a 5-year workmanship warranty.",
    clientMessage: "The panel passed inspection this morning — everything's buttoned up. Here's the final invoice with your deposit applied.",
    dueDate: iso(12),
    issuedAt: iso(0),
    createdAt: iso(0),
    contact: CONTACT,
    company: fixtureCompany(brand),
    lineItems: items,
    payments,
  };
}

/** What the pay page would be asked to charge for a fixture state (mirrors lib/payments invoiceBalance). */
export function fixtureBalance(inv: PublicInvoice): number {
  const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
  const surcharges = inv.payments.reduce((s, p) => s + Number(p.surchargeAmount ?? 0), 0);
  return Math.max(0, Math.round((Number(inv.total) + surcharges - paid) * 100) / 100);
}

/**
 * The client portal home for Maria Hernandez (demo client) at Brightwire
 * Electric. "open" = an unpaid invoice, a quote to approve, a visit coming up
 * and an unread reply; "clear" = nothing owed or waiting, history only.
 */
export function fixtureHub(state: "open" | "clear" = "open", brand: FixtureBrand = "navy"): { company: ReturnType<typeof fixtureCompany>; firstName: string; unread: number; data: HubHomeData } {
  const base = "/hub/preview";
  const tz = "America/Chicago";
  const md = (offset: number) => {
    const d = new Date(Date.now() + offset * DAY);
    return { month: d.toLocaleDateString("en-US", { month: "short", timeZone: tz }), day: d.toLocaleDateString("en-US", { day: "numeric", timeZone: tz }), weekday: d.toLocaleDateString("en-US", { weekday: "long", timeZone: tz }), long: d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: tz }) };
  };
  const v1 = md(3);
  const v2 = md(17);
  const w1 = md(-9);
  const w2 = md(-40);
  const open = state === "open";
  return {
    company: fixtureCompany(brand),
    firstName: "Maria",
    unread: open ? 1 : 0,
    data: {
      token: "preview",
      base,
      companyName: "Brightwire Electric",
      balance: open
        ? { amount: 1842.5, count: 1, href: "/client-preview?doc=invoice", what: "Invoice 2210", due: `Due ${md(12).long}`, overdue: false, payable: true }
        : null,
      quote: open ? { count: 1, title: "EV charger circuit (50A)", total: 703.63, href: "/client-preview?doc=quote" } : null,
      pendingContracts: [],
      unread: open ? { count: 1, preview: "Hi Maria, the inspector signed off this morning. We'll see you Thursday for the charger walk-through." } : null,
      visits: open
        ? [
            { id: "v1", title: "EV charger walk-through", month: v1.month, day: v1.day, when: `${v1.weekday} · arriving 9:00 – 11:00 AM` },
            { id: "v2", title: "Smoke detector check", month: v2.month, day: v2.day, when: `${v2.weekday} · Anytime` },
          ]
        : [],
      recentWork: [
        { id: "w1", title: "Panel upgrade, 200A", when: `Completed ${w1.long}`, thumb: null, month: w1.month, day: w1.day },
        { id: "w2", title: "Kitchen GFCI outlets", when: `Completed ${w2.long}`, thumb: null, month: w2.month, day: w2.day },
      ],
      signedContracts: [{ id: "c1", title: "Service agreement", when: w2.long }],
      form: { heading: "Get work done", description: "Send us a request and fill us in on the details.", buttonLabel: "New request" },
    },
  };
}

// ── Booking page, its forms and the portal login (2026-11-20) ────────────

/** The light booking look in the brand's colors (no saved accent, default font). */
export function fixtureAppearance(brand: FixtureBrand = "navy"): ScheduleAppearance {
  const c = fixtureCompany(brand);
  return { dark: false, transparent: false, accent: clientBand(c).accent, fontName: null, fontHref: null, zoom: 1, title: "", description: "" };
}

function item(
  id: string,
  name: string,
  kind: BookingKind,
  mode: BookingMode,
  extra: Partial<PublicBookingType> = {}
): PublicBookingType {
  const confirmation = extra.confirmation ?? "INSTANT";
  const intake = effectiveIntake(defaultIntake(kind, mode), { kind, mode });
  return {
    id,
    slug: id,
    name,
    description: null,
    kind,
    mode,
    showOnPage: true,
    exactTime: kind === "PHONE_CALL" || kind === "VIDEO_CALL",
    needsAddress: false,
    durationMinutes: 30,
    arrivalWindowMinutes: 0,
    confirmation,
    paymentMode: "NONE",
    clientCanReschedule: true,
    clientCanCancel: true,
    cutoffHours: 2,
    bookable: true,
    intake,
    heading: name,
    buttonLabel: defaultButtonLabel({ kind, mode, confirmation }),
    services: [],
    ...extra,
  };
}

/** The booking page menu on Brightwire: a call, a visit, a paid service, a message. */
export function fixtureBookingItems(): PublicBookingType[] {
  return [
    item("free-phone-estimate", "Free phone estimate", "PHONE_CALL", "SCHEDULE", { description: "A quick call to talk through the job and a ballpark price." }),
    item("in-home-estimate", "In-home estimate", "IN_PERSON", "SCHEDULE", { description: "We come out, look at the panel and wiring, and leave a written quote.", durationMinutes: 60, arrivalWindowMinutes: 120, confirmation: "APPROVAL" }),
    fixtureServiceItem(),
    fixtureRequestItem(),
  ];
}

export function fixtureServiceItem(): PublicBookingType {
  return item("book-a-service", "Book a service", "SERVICE", "SCHEDULE", {
    description: "Fixed-price jobs you can book and pay for online.",
    durationMinutes: 90,
    arrivalWindowMinutes: 120,
    paymentMode: "FULL",
    services: [
      { id: "s1", name: "Ceiling fan install", description: "Existing box, fan supplied by you.", price: 185, priceLabel: "$185.00", priceDisplay: "FIXED", durationMinutes: 90 },
      { id: "s2", name: "Outlet to GFCI swap", description: "Up to 3 outlets in one room.", price: 140, priceLabel: "$140.00", priceDisplay: "FIXED", durationMinutes: 60 },
      { id: "s3", name: "Whole-home surge protector", description: "Installed at the panel.", price: 320, priceLabel: "$320.00", priceDisplay: "FIXED", durationMinutes: 60 },
    ],
  });
}

export function fixtureRequestItem(): PublicBookingType {
  return item("request-service", "Request service", "SERVICE", "REQUEST", {
    description: "Tell us what you need and we'll send a quote.",
    services: [
      { id: "r1", name: "Panel upgrade", description: null, price: 2400, priceLabel: "From $2,400.00", priceDisplay: "STARTING_AT", durationMinutes: null },
      { id: "r2", name: "EV charger circuit", description: null, price: 650, priceLabel: "From $650.00", priceDisplay: "STARTING_AT", durationMinutes: null },
      { id: "r3", name: "Lighting and fixtures", description: null, price: 0, priceLabel: "Quoted on site", priceDisplay: "QUOTE", durationMinutes: null },
      { id: "r4", name: "Something else", description: null, price: 0, priceLabel: "Quoted on site", priceDisplay: "QUOTE", durationMinutes: null },
    ],
  });
}

/** Five open days from tomorrow, a few calls each (company time, America/Chicago). */
export function fixtureSlotDays(): SlotDay[] {
  const tz = "America/Chicago";
  const keyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" });
  const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const out: SlotDay[] = [];
  for (let i = 1; out.length < 5; i++) {
    const noon = new Date(Date.now() + i * DAY);
    const wd = noon.toLocaleDateString("en-US", { weekday: "short", timeZone: tz });
    if (wd === "Sun") continue;
    const key = keyFmt.format(noon);
    const base = new Date(`${key}T14:00:00Z`); // 8:00 AM Central (standard time)
    const hours = out.length % 2 === 0 ? [0, 1, 2.5, 4, 5, 6.5] : [1, 1.5, 3, 5.5];
    out.push({
      date: key,
      label: dayFmt.format(base),
      slots: hours.map((h) => {
        const s = new Date(base.getTime() + h * 3_600_000);
        const e = new Date(s.getTime() + 30 * 60_000);
        return { start: s.toISOString(), end: e.toISOString(), windowEnd: s.toISOString(), label: timeFmt.format(s) };
      }),
    });
  }
  return out;
}

export function fixtureBooked(days: SlotDay[]): Booked {
  const s = days[0].slots[2];
  return {
    start: s.start,
    end: s.end,
    windowEnd: s.windowEnd,
    label: s.label,
    typeName: "Free phone estimate",
    exactTime: true,
    tentative: false,
    withName: "Derek Olsen",
    meetingLink: null,
    manageUrl: "#",
    address: null,
  };
}

/** The business footer's facts (the full variant shows them). */
export function fixtureBusinessProfile(brand: FixtureBrand = "navy"): BusinessProfile {
  const c = fixtureCompany(brand);
  return {
    id: "fixture",
    name: c.name,
    slug: "brightwire-electric",
    phone: "4695550142",
    email: c.email,
    shownEmail: c.email,
    address: c.address,
    city: c.city,
    state: c.state,
    zip: c.zip,
    website: null,
    about: null,
    industry: "Electrical",
    logoUrl: null,
    services: ["Panel upgrades", "EV chargers", "Lighting"],
    showDetails: true,
    detailsForced: false,
  };
}
