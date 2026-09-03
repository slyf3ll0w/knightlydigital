/**
 * Booking types — the items on a company's booking page: calls, visits,
 * services, and plain message forms. Client-safe: shapes, kind metadata, and
 * the sanitizer the settings PATCH runs. No Prisma here; the server side
 * lives in lib/booking-runtime.ts, questions/words in lib/booking-intake.ts.
 */

export type BookingKind = "PHONE_CALL" | "VIDEO_CALL" | "IN_PERSON" | "SERVICE" | "MESSAGE";
export type BookingMode = "SCHEDULE" | "REQUEST";
export type BookingConfirmation = "INSTANT" | "APPROVAL";
export type BookingPayment = "NONE" | "DEPOSIT" | "FULL";
export type BookingAssignment = "ROUND_ROBIN" | "PRIORITY";

export const BOOKING_KINDS: BookingKind[] = ["PHONE_CALL", "VIDEO_CALL", "IN_PERSON", "SERVICE", "MESSAGE"];

export const KIND_META: Record<
  BookingKind,
  {
    label: string;
    hint: string;
    /** Calls promise an exact start; visits promise an arrival window. */
    exactTime: boolean;
    /** Needs the customer's address (service area + drive time). */
    needsAddress: boolean;
    /** Can the customer pick a time for it at all? */
    schedulable: boolean;
    defaultDuration: number;
    defaultName: string;
  }
> = {
  PHONE_CALL: {
    label: "Phone call",
    hint: "You call the number they enter, at the time they pick.",
    exactTime: true,
    needsAddress: false,
    schedulable: true,
    defaultDuration: 30,
    defaultName: "Phone call",
  },
  VIDEO_CALL: {
    label: "Video call",
    hint: "A meeting link goes out with the confirmation.",
    exactTime: true,
    needsAddress: false,
    schedulable: true,
    defaultDuration: 30,
    defaultName: "Video call",
  },
  IN_PERSON: {
    label: "Visit",
    hint: "An estimate or consult at their address, as an arrival window.",
    exactTime: false,
    needsAddress: true,
    schedulable: true,
    defaultDuration: 60,
    defaultName: "Free estimate",
  },
  SERVICE: {
    label: "Service",
    hint: "They pick from your price book. Book it straight onto the schedule, or send a quote.",
    exactTime: false,
    needsAddress: true,
    schedulable: true,
    defaultDuration: 60,
    defaultName: "Book a service",
  },
  MESSAGE: {
    label: "Contact form",
    hint: "A plain form: name, contact details and a message. Every submission lands in Requests and on your Leads board.",
    exactTime: false,
    needsAddress: false,
    schedulable: false,
    defaultDuration: 30,
    defaultName: "Contact us",
  },
};

export const STEP_CHOICES = [15, 30, 60] as const;
export const BUFFER_CHOICES = [0, 5, 10, 15, 30, 45, 60] as const;
export const LEAD_CHOICES = [0, 1, 2, 4, 8, 24, 48, 72] as const;
export const HORIZON_CHOICES = [7, 14, 30, 60, 90] as const;
export const CUTOFF_CHOICES = [0, 2, 4, 12, 24, 48] as const;

/** Slugs that collide with the public routes under /book/[slug]/. */
export const RESERVED_TYPE_SLUGS = new Set(["schedule", "manage", "new", "embed"]);

export function slugifyTypeName(name: string): string {
  const s =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "booking";
  return RESERVED_TYPE_SLUGS.has(s) ? `${s}-1` : s;
}

/** How a service's price reads to customers (mirrors WorkItem.priceDisplay). */
export type ServicePriceDisplay = "FIXED" | "STARTING_AT" | "HOURLY" | "QUOTE";

/** "$150.00", "From $150.00", "$95.00/hr", or "Get a quote". */
export function servicePriceLabel(s: { price: number; priceDisplay?: ServicePriceDisplay | null }): string {
  const amount = `$${s.price.toFixed(2)}`;
  switch (s.priceDisplay) {
    case "STARTING_AT":
      return `From ${amount}`;
    case "HOURLY":
      return `${amount}/hr`;
    case "QUOTE":
      return "Get a quote";
    default:
      return amount;
  }
}

/** The editable fields of a booking type (everything but id/company/slug/intake). */
export type BookingTypeSettings = {
  name: string;
  description: string | null;
  kind: BookingKind;
  mode: BookingMode;
  isActive: boolean;
  showOnPage: boolean;
  durationMinutes: number;
  stepMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  leadHours: number;
  horizonDays: number;
  maxPerDay: number | null;
  maxShownPerDay: number;
  confirmation: BookingConfirmation;
  arrivalWindowMinutes: number | null;
  meetingLink: string | null;
  paymentMode: BookingPayment;
  assignment: BookingAssignment;
  clientCanReschedule: boolean;
  clientCanCancel: boolean;
  cutoffHours: number;
};

export type BookingTypeMemberRow = { userId: string; priority: number };

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function oneOf<T extends string>(v: unknown, choices: readonly T[], fallback: T): T {
  return typeof v === "string" && (choices as readonly string[]).includes(v) ? (v as T) : fallback;
}

const URL_RE = /^https?:\/\/[^\s]{3,500}$/i;

/**
 * Apply a PATCH body on top of the current settings. Every field is clamped
 * to its legal range; unknown keys are ignored. Kind is only settable at
 * create time (the engine, the public page and the created records all key
 * off it) — pass `allowKind` from the POST route.
 */
export function applyBookingTypePatch(
  current: BookingTypeSettings,
  raw: unknown,
  opts: { allowKind?: boolean } = {}
): { settings: BookingTypeSettings; error?: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const next: BookingTypeSettings = { ...current };

  if (r.name !== undefined) {
    const name = String(r.name).trim().slice(0, 80);
    if (!name) return { settings: current, error: "Give it a name." };
    next.name = name;
  }
  if (r.description !== undefined) {
    const d = r.description == null ? "" : String(r.description).trim().slice(0, 500);
    next.description = d || null;
  }
  if (opts.allowKind && r.kind !== undefined) {
    next.kind = oneOf(r.kind, BOOKING_KINDS, current.kind);
  }
  if (r.mode !== undefined) next.mode = oneOf(r.mode, ["SCHEDULE", "REQUEST"] as const, current.mode);
  if (r.isActive !== undefined) next.isActive = Boolean(r.isActive);
  if (r.showOnPage !== undefined) next.showOnPage = Boolean(r.showOnPage);
  if (r.durationMinutes !== undefined) next.durationMinutes = clampInt(r.durationMinutes, 5, 720, current.durationMinutes);
  if (r.stepMinutes !== undefined) {
    const s = clampInt(r.stepMinutes, 15, 60, current.stepMinutes);
    next.stepMinutes = STEP_CHOICES.reduce((best, c) => (Math.abs(c - s) < Math.abs(best - s) ? c : best));
  }
  if (r.bufferBeforeMinutes !== undefined) next.bufferBeforeMinutes = clampInt(r.bufferBeforeMinutes, 0, 240, current.bufferBeforeMinutes);
  if (r.bufferAfterMinutes !== undefined) next.bufferAfterMinutes = clampInt(r.bufferAfterMinutes, 0, 240, current.bufferAfterMinutes);
  if (r.leadHours !== undefined) next.leadHours = clampInt(r.leadHours, 0, 336, current.leadHours);
  if (r.horizonDays !== undefined) next.horizonDays = clampInt(r.horizonDays, 1, 90, current.horizonDays);
  if (r.maxPerDay !== undefined) {
    next.maxPerDay = r.maxPerDay == null || r.maxPerDay === "" || Number(r.maxPerDay) <= 0 ? null : clampInt(r.maxPerDay, 1, 50, 1);
  }
  if (r.maxShownPerDay !== undefined) next.maxShownPerDay = clampInt(r.maxShownPerDay, 1, 48, current.maxShownPerDay);
  if (r.confirmation !== undefined) next.confirmation = oneOf(r.confirmation, ["INSTANT", "APPROVAL"] as const, current.confirmation);
  if (r.arrivalWindowMinutes !== undefined) {
    next.arrivalWindowMinutes =
      r.arrivalWindowMinutes == null || r.arrivalWindowMinutes === ""
        ? null
        : clampInt(r.arrivalWindowMinutes, 0, 480, 0);
  }
  if (r.meetingLink !== undefined) {
    const link = r.meetingLink == null ? "" : String(r.meetingLink).trim();
    if (link && !URL_RE.test(link)) return { settings: current, error: "Meeting link must be a full URL (https://…)." };
    next.meetingLink = link || null;
  }
  if (r.paymentMode !== undefined) next.paymentMode = oneOf(r.paymentMode, ["NONE", "DEPOSIT", "FULL"] as const, current.paymentMode);
  if (r.assignment !== undefined) next.assignment = oneOf(r.assignment, ["ROUND_ROBIN", "PRIORITY"] as const, current.assignment);
  if (r.clientCanReschedule !== undefined) next.clientCanReschedule = Boolean(r.clientCanReschedule);
  if (r.clientCanCancel !== undefined) next.clientCanCancel = Boolean(r.clientCanCancel);
  if (r.cutoffHours !== undefined) next.cutoffHours = clampInt(r.cutoffHours, 0, 168, current.cutoffHours);

  // Kind- and mode-driven invariants
  const meta = KIND_META[next.kind];
  if (!meta.schedulable) next.mode = "REQUEST";
  if (meta.exactTime) next.arrivalWindowMinutes = 0;
  if (next.kind !== "SERVICE") next.paymentMode = "NONE";
  // A card is only taken when a real time is booked
  if (next.mode === "REQUEST") next.paymentMode = "NONE";
  // Money changes hands at booking → the booking can't sit unconfirmed
  if (next.paymentMode !== "NONE") next.confirmation = "INSTANT";
  // Self-serve links only exist for scheduled bookings
  if (next.mode === "REQUEST") {
    next.clientCanReschedule = false;
    next.clientCanCancel = false;
  }

  return { settings: next };
}

/** Defaults for a freshly created item of `kind`. */
export function defaultSettingsForKind(kind: BookingKind, name?: string, mode?: BookingMode): BookingTypeSettings {
  const meta = KIND_META[kind];
  const call = meta.exactTime;
  const m: BookingMode = meta.schedulable ? (mode ?? "SCHEDULE") : "REQUEST";
  return {
    name: name?.trim() || meta.defaultName,
    description: null,
    kind,
    mode: m,
    isActive: true,
    showOnPage: true,
    durationMinutes: meta.defaultDuration,
    stepMinutes: 30,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: call ? 0 : 15,
    leadHours: call ? 2 : 4,
    horizonDays: 30,
    maxPerDay: null,
    maxShownPerDay: 6,
    confirmation: "INSTANT",
    arrivalWindowMinutes: call ? 0 : null,
    meetingLink: null,
    paymentMode: "NONE",
    assignment: "ROUND_ROBIN",
    clientCanReschedule: call && m === "SCHEDULE",
    clientCanCancel: call && m === "SCHEDULE",
    cutoffHours: 24,
  };
}

/** Sanitize a members list from the PATCH body: unique userIds + priority. */
export function sanitizeMembers(raw: unknown): BookingTypeMemberRow[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const out: BookingTypeMemberRow[] = [];
  for (const m of raw.slice(0, 100)) {
    const userId = typeof m === "string" ? m : typeof m?.userId === "string" ? m.userId : null;
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    out.push({ userId, priority: clampInt(typeof m === "object" ? m?.priority : 0, 0, 10, 0) });
  }
  return out;
}

/** Sanitize a services list (work item ids, ordered). */
export function sanitizeServiceIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  return [...new Set(raw.filter((v): v is string => typeof v === "string"))].slice(0, 50);
}

export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = minutes / 60;
  return h % 1 === 0 ? `${h} hr` : `${h.toFixed(1)} hr`;
}

/** One quiet line describing an item — the list row's meta text. */
export function itemMetaLine(t: {
  kind: BookingKind;
  mode: BookingMode;
  durationMinutes: number;
  stepMinutes: number;
  confirmation: BookingConfirmation;
  paymentMode: BookingPayment;
  serviceCount?: number;
  questionCount?: number;
}): string {
  const meta = KIND_META[t.kind];
  const parts: string[] = [meta.label];
  if (t.kind === "SERVICE" && t.serviceCount != null) parts.push(`${t.serviceCount} service${t.serviceCount === 1 ? "" : "s"}`);
  if (t.mode === "SCHEDULE") {
    parts.push(durationLabel(t.durationMinutes));
    if (meta.exactTime && t.stepMinutes !== 30) parts.push(`every ${t.stepMinutes} min`);
    if (t.paymentMode === "FULL") parts.push("pay in full");
    else if (t.paymentMode === "DEPOSIT") parts.push("deposit at booking");
    parts.push(t.confirmation === "INSTANT" ? "instant" : "you approve");
  } else {
    parts.push(t.kind === "SERVICE" ? "sends a quote" : "you follow up");
  }
  if (t.questionCount) parts.push(`${t.questionCount} question${t.questionCount === 1 ? "" : "s"}`);
  return parts.join(" · ");
}
