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

/** What a business line can do on the phone side right now. */
export type VoiceSummary = {
  /** TELNYX_VOICE_APP_ID is set on this server. */
  available: boolean;
  /** The number sits on the Call Control app: whisper + press 1, voicemail, calls from the app. */
  routed: boolean;
  /** Custom greeting, or null for the default. */
  greeting: string | null;
  defaultGreeting: string;
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
