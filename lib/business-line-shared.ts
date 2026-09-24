/**
 * Business-line types + constants shared by the server module
 * (lib/business-line.ts) and the client card (BusinessLineCard.tsx). Kept
 * Prisma-free so the settings page's client bundle never imports the DB.
 */

import type { LineRegistrationStatus } from "@prisma/client";

export type BrandEntityType = "PRIVATE_PROFIT" | "SOLE_PROPRIETOR";

/** TCR verticals a service business plausibly falls under, with the label the form shows. */
export const VERTICALS: Array<[string, string]> = [
  ["CONSTRUCTION", "Construction, trades & home services"],
  ["PROFESSIONAL", "Professional services"],
  ["REAL_ESTATE", "Real estate & property"],
  ["RETAIL", "Retail"],
  ["HOSPITALITY", "Hospitality"],
  ["TRANSPORTATION", "Transportation & logistics"],
  ["AGRICULTURE", "Agriculture & landscaping"],
  ["HEALTHCARE", "Healthcare"],
  ["TECHNOLOGY", "Technology"],
  ["ENERGY", "Energy & utilities"],
];

export type LineType = "local" | "toll_free";

/** A claim token parked in Company.lineNumber while an order is in flight (the unique column = the lock). */
export const PENDING_PREFIX = "pending:";
export const isRealLineNumber = (n: string | null | undefined): n is string => Boolean(n && !n.startsWith(PENDING_PREFIX));

/** What callers hear when nobody presses 1 and the company hasn't written its own greeting. */
export function defaultVoicemailGreeting(businessName: string): string {
  return `You've reached ${businessName}. We can't take your call right now. Please leave your name, number and a short message after the tone, and we'll call you back.`;
}

/**
 * The caller-ID name a business name boils down to: CNAM allows 15 uppercase
 * alphanumerics/spaces, so "Streamflaire Group, LLC" → "STREAMFLAIRE GRO".
 * Punctuation is dropped, whitespace collapsed; a trailing partial word is
 * kept (the cut is the carrier's rule, not ours).
 */
export const CALLER_ID_MAX = 15;
export function defaultCallerIdName(businessName: string): string {
  return businessName
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CALLER_ID_MAX)
    .trim();
}

/** What a business line can do on the phone side right now. */
export type VoiceSummary = {
  /** TELNYX_VOICE_APP_ID is set on this server. */
  available: boolean;
  /** The number sits on the Call Control app: whisper + press 1, voicemail, calls from the app. */
  routed: boolean;
  /** Custom greeting, or null for the default. */
  greeting: string | null;
  defaultGreeting: string;
  /** CNAM listing on the number (outbound caller-ID name); null = none. */
  callerIdName: string | null;
  defaultCallerIdName: string;
  /** The signed-in user has a cell on file to place calls from (Settings → My Profile). */
  canCall: boolean;
};
export type RegistrationKind = "10DLC" | "TOLL_FREE";

/** Toll-free verification: expected texts per month (Telnyx volume buckets). */
export const TOLL_FREE_VOLUMES: Array<[string, string]> = [
  ["100", "Up to 100 a month"],
  ["1,000", "Up to 1,000 a month"],
  ["10,000", "Up to 10,000 a month"],
  ["100,000", "Up to 100,000 a month"],
];

/** Toll-free verification: Telnyx use-case categories that fit a service business. */
export const TOLL_FREE_USE_CASES: Array<[string, string]> = [
  ["Appointments", "Appointment reminders & scheduling"],
  ["Mixed", "Reminders, billing and replies (mixed)"],
  ["Billing", "Quotes, invoices & billing"],
  ["Business Updates", "Account & business updates"],
  ["Conversational / Alerts", "Two-way conversation & alerts"],
];

export type RegistrationForm = {
  /** Toll-free only: Telnyx volume bucket / use-case category. */
  messageVolume?: string | null;
  useCase?: string | null;
  entityType: BrandEntityType;
  legalName: string;
  displayName?: string | null;
  ein?: string | null;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  website?: string | null;
  vertical: string;
  contactFirstName: string;
  contactLastName: string;
  contactEmail: string;
  contactPhone: string;
};

export type LineSummary = {
  enabled: boolean;
  entitled: boolean;
  number: string | null;
  /** Which registration path the number takes; null until a number exists. */
  type: LineType | null;
  forwardTo: string | null;
  provisionedAt: string | null;
  voice: VoiceSummary;
  /** Set once the add-on has lapsed: the number is released at this instant unless they resubscribe or port out. */
  releaseAt: string | null;
  smsReady: boolean;
  registration: null | {
    status: LineRegistrationStatus;
    kind: RegistrationKind;
    entityType: string;
    brandStatus: string | null;
    campaignStatus: string | null;
    assignmentStatus: string | null;
    /** TOLL_FREE: Telnyx's own status word ("In Progress", "Waiting For Vendor", …). */
    verificationStatus: string | null;
    rejectionReason: string | null;
    submittedAt: string;
    approvedAt: string | null;
    lastCheckedAt: string | null;
    form: RegistrationForm;
  };
  defaults: {
    areaCode: string;
    forwardTo: string;
    legalName: string;
    displayName: string;
    street: string;
    city: string;
    state: string;
    postalCode: string;
    website: string;
    contactFirstName: string;
    contactLastName: string;
    contactEmail: string;
    contactPhone: string;
  };
};

/**
 * EIN prefixes (first two digits) the IRS actually issues. Anything else
 * cannot be a real EIN, and the carrier registry charges $4.50 to discover
 * that — so it is caught here, on both the form and the server.
 */
const EIN_PREFIXES = new Set([
  "01", "02", "03", "04", "05", "06", "10", "11", "12", "13", "14", "15", "16", "20", "21", "22", "23", "24", "25", "26", "27",
  "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47", "48",
  "50", "51", "52", "53", "54", "55", "56", "57", "58", "59", "60", "61", "62", "63", "64", "65", "66", "67", "68",
  "71", "72", "73", "74", "75", "76", "77", "80", "81", "82", "83", "84", "85", "86", "87", "88",
  "90", "91", "92", "93", "94", "95", "98", "99",
]);

/** Why an EIN can't be filed, or null when it can. Digits only are considered; dashes and spaces are fine. */
export function einIssue(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length !== 9) return "Enter the 9-digit EIN (XX-XXXXXXX).";
  if (!EIN_PREFIXES.has(digits.slice(0, 2))) {
    return "The first two digits aren't a prefix the IRS issues — check the EIN against your IRS letter (CP575 / 147C).";
  }
  return null;
}

/** Entity suffixes a registered business's legal name usually carries. */
const ENTITY_SUFFIX = /\b(l\.?l\.?c\.?|inc\.?|incorporated|corp\.?|corporation|co\.?|company|l\.?p\.?|l\.?l\.?p\.?|p\.?l\.?l\.?c\.?|p\.?c\.?|ltd\.?|limited|p\.?a\.?|s\.?c\.?)\s*$/i;

/**
 * The most common brand rejection is a legal name that doesn't match the
 * IRS record exactly — usually a missing "LLC" or "Inc." Warn, don't block:
 * some legitimate names carry no suffix.
 */
export function legalNameHint(name: string, entityType: BrandEntityType): string | null {
  if (entityType !== "PRIVATE_PROFIT") return null;
  const n = name.trim();
  if (n.length < 2 || ENTITY_SUFFIX.test(n)) return null;
  return "No \"LLC\", \"Inc.\" or similar at the end — if your IRS letter shows one, include it exactly as written.";
}

const EMAIL_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "hotmal.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmial.com": "hotmail.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "yahoo.co": "yahoo.com",
  "outlok.com": "outlook.com",
  "outloo.com": "outlook.com",
  "iclod.com": "icloud.com",
  "icloud.co": "icloud.com",
};

/** "Did you mean …@gmail.com?" for the handful of domains people mistype most. */
export function emailTypoHint(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const domain = email.slice(at + 1).toLowerCase();
  const fix = EMAIL_TYPOS[domain];
  return fix ? `Did you mean ${email.slice(0, at + 1)}${fix}?` : null;
}

/** Domains the carrier registry calls "personal, free and group email" — refused as a registered business's contact. */
const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "ymail.com",
  "rocketmail.com", "aol.com", "icloud.com", "me.com", "mac.com", "protonmail.com", "proton.me", "pm.me", "zoho.com",
  "gmx.com", "gmx.net", "mail.com", "yandex.com", "yandex.ru", "fastmail.com", "hey.com", "tutanota.com", "duck.com",
  "comcast.net", "att.net", "sbcglobal.net", "verizon.net", "bellsouth.net", "cox.net", "charter.net", "earthlink.net",
]);

export const FREE_MAIL_MESSAGE =
  "The carrier registry doesn't accept personal email (Gmail, Outlook, Yahoo, iCloud, your internet provider…) for a registered business — use an address at your company's own domain.";

export function isFreeMailDomain(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  return FREE_MAIL.has(email.slice(at + 1).trim().toLowerCase());
}

/**
 * Role mailboxes the registry calls "group email IDs" (contact@, info@,
 * sales@…) — refused under the same rule as free mail: the contact has to be
 * a named person at the business (2026-09-23 rejection of contact@).
 */
const GROUP_MAILBOXES = new Set([
  "contact", "contactus", "info", "sales", "support", "admin", "administrator", "office", "hello", "hi", "team",
  "billing", "accounts", "accounting", "help", "service", "services", "mail", "email", "enquiries", "inquiries",
  "marketing", "noreply", "no-reply", "no_reply", "donotreply", "webmaster", "postmaster", "hostmaster", "abuse",
  "security", "privacy", "legal", "hr", "jobs", "careers", "press", "media", "orders", "booking", "bookings",
  "scheduling", "dispatch", "customerservice", "customer.service", "reception", "frontdesk", "front.desk", "general",
  "management", "staff", "crew", "estimates", "quotes", "invoices", "payments",
]);

export const GROUP_MAIL_MESSAGE =
  "The carrier registry doesn't accept shared mailboxes like contact@, info@ or sales@ — use a named person's address at your company's domain (for example, maria@yourcompany.com).";

export function isGroupMailbox(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 1) return false;
  const local = email.slice(0, at).trim().toLowerCase().replace(/\+.*$/, "");
  return GROUP_MAILBOXES.has(local);
}

/* ───────────── What a business needs before it files (form + /texting-registration) ───────────── */

export type ChecklistItem = { title: string; detail: string; why: string };

/** Public explainer for the carrier registration; the form and the marketing page both link here. */
export const REGISTRATION_GUIDE_PATH = "/texting-registration";

/**
 * Everything the registry will check, in the order the form asks for it, with
 * the reason each rule exists. One source for the in-app checklist and the
 * public page so the two never drift.
 */
export const REGISTRATION_CHECKLIST: Record<BrandEntityType, ChecklistItem[]> = {
  PRIVATE_PROFIT: [
    {
      title: "Your IRS letter (CP575 or 147C)",
      detail: "The legal business name, EIN and address exactly as the IRS has them — including any “LLC” or “Inc.”",
      why: "The registry matches your EIN against IRS records letter for letter. A missing “LLC” or an old address is the most common reason a registration comes back.",
    },
    {
      title: "An email for a named person at your own domain",
      detail: "Something like maria@yourcompany.com. Not Gmail, Outlook, Yahoo or your internet provider, and not a shared box like info@ or contact@.",
      why: "Carriers want a reachable person who works at the business. Free and shared mailboxes are refused automatically, whatever software you register through.",
    },
    {
      title: "A mobile number for that person",
      detail: "Where the registry or a carrier can reach someone with a question.",
      why: "Required on every registration.",
    },
    {
      title: "Your website, if you have one",
      detail: "Optional. If you give one it should load and show your business name.",
      why: "A dead or unrelated site gets the registration sent back.",
    },
    {
      title: "A booking form that asks for a phone number",
      detail: "An item on your booking page (Settings → Booking & forms), shown on the page, with the phone field on. The text-message consent checkbox sits under that field.",
      why: "Carrier reviewers open that page to see how customers opt in. A page without the checkbox is sent back, and every re-file is a carrier fee.",
    },
  ],
  SOLE_PROPRIETOR: [
    {
      title: "Your own full legal name and address",
      detail: "As they appear on your ID. Home address is fine.",
      why: "Sole proprietors register as a person, so there is no EIN to match.",
    },
    {
      title: "Any email you check",
      detail: "Gmail and the like are fine here.",
      why: "The business-domain rule only applies to businesses registering with an EIN.",
    },
    {
      title: "Your mobile phone, within reach",
      detail: "The registry texts you a PIN. Enter it in WorkBench within 24 hours.",
      why: "The PIN is how a sole proprietor is verified — usually within minutes.",
    },
    {
      title: "A booking form that asks for a phone number",
      detail: "An item on your booking page (Settings → Booking & forms), shown on the page, with the phone field on. The text-message consent checkbox sits under that field.",
      why: "Carrier reviewers open that page to see how customers opt in. A page without the checkbox is sent back, and every re-file is a carrier fee.",
    },
  ],
};
