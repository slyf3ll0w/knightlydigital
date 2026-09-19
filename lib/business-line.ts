/**
 * Business line — one local phone number per company that carries their
 * automated texts (lib/sms.ts) and a forwarded business phone line.
 *
 * Why per-tenant: carriers register A2P texting per business, two-party
 * (the client opted in to the business they hired, not to WorkBench).
 * Telnyx rejected the shared toll-free model on 2026-09-14 for exactly that
 * reason — see docs/plans/business-line-2026-09-15.md. So each company buys
 * its own number and registers its own 10DLC brand + campaign under its own
 * legal name and EIN.
 *
 * The scheduling trick: 10DLC only governs SMS. Voice has no registry, so
 * calls work the minute the number provisions, while the SMS registration
 * clears in the background (3–7 business days). The wait shows as a status
 * chip on a feature that already half-works. Voice itself lives in
 * lib/voice.ts (Call Control: whisper + press 1, voicemail, calls from the
 * app); without TELNYX_VOICE_APP_ID the number falls back to Telnyx's
 * number-level forwarding.
 *
 * Lifecycle
 *   provisionLine        buy a number (entitlement: hasAddon), join the WorkBench
 *                        messaging profile, optionally forward calls
 *   submitRegistration   create the brand; EIN brands usually verify instantly →
 *                        campaign created + number bound in the same call
 *   refreshRegistration  poll Telnyx, advance the state machine (cron hourly,
 *                        the Refresh button, and the 10DLC status webhook)
 *   releaseLine          superadmin: unbind + release the number, drop the row
 *
 * State (MessagingRegistration.status): BRAND_PENDING → CAMPAIGN_PENDING →
 * ACTIVE, with REJECTED reachable from either pending step; a rejected
 * registration is resubmitted by calling submitRegistration again.
 */

import type { LineRegistrationStatus, MessagingRegistration, Prisma } from "@prisma/client";
import {
  PENDING_PREFIX,
  TOLL_FREE_USE_CASES,
  TOLL_FREE_VOLUMES,
  VERTICALS,
  defaultCallerIdName,
  defaultVoicemailGreeting,
  isRealLineNumber,
  type BrandEntityType,
  type LineSummary,
  type LineType,
  type RegistrationForm,
  type RegistrationKind,
} from "@/lib/business-line-shared";
import { stateName } from "@/lib/us-states";
import { VoiceError, ensureVoiceRouting, routeNumberToVoiceApp, sanitizeGreeting, voiceEnabled } from "@/lib/voice";

import { prisma } from "@/lib/db";
import { hasAddon } from "@/lib/addon";
import { notifyUsers } from "@/lib/push";
import { toE164 } from "@/lib/sms";
import {
  assignNumberToCampaign,
  createBrand,
  createCampaign,
  createTollFreeVerification,
  findOwnedNumber,
  getBrand,
  getCampaign,
  getNumberCampaign,
  getNumberOrder,
  getTollFreeVerification,
  isTollFreeNumber,
  listTollFreeVerifications,
  messagingProfileId,
  orderNumber,
  releaseNumber,
  searchLocalNumbers,
  searchTollFreeNumbers,
  setCallForwarding,
  setCnamListing,
  setNumberMessagingProfile,
  telnyxConfigured,
  tollFreeStatusReason,
  triggerBrandOtp,
  unassignNumberFromCampaign,
  updateTollFreeVerification,
  verifyBrandOtp,
  TelnyxError,
  type TollFreeVerification,
  type TollFreeVerificationInput,
} from "@/lib/telnyx";

export { VERTICALS, TOLL_FREE_USE_CASES, TOLL_FREE_VOLUMES };
export type { BrandEntityType, LineSummary, LineType, RegistrationForm, RegistrationKind };

export class LineError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "LineError";
    this.status = status;
  }
}

export function lineEnabled(): boolean {
  return telnyxConfigured();
}

export { isRealLineNumber };

const baseUrl = () => (process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com").replace(/\/+$/, "");
const tenDlcWebhookUrl = () => `${baseUrl()}/api/public/webhooks/telnyx/10dlc`;
const tollFreeWebhookUrl = () => `${baseUrl()}/api/public/webhooks/telnyx/tollfree`;

/** Public evidence of how consent is collected — cited in every toll-free verification. */
const OPT_IN_IMAGE_URL = "https://workbenchfsm.com/sms-opt-in.png";

/* ───────────────────────── Toll-free: pure state derivation ───────────────────────── */

/**
 * Toll-free verification is one object with one status, so the mapping is
 * flat. "Waiting For Customer" is surfaced as REJECTED-with-reason: the
 * reviewer wants something changed, and "Edit and resubmit" is the only
 * sensible next step (it PATCHes the same request).
 */
export function deriveTollFree(status: string | null | undefined, reason?: string | null): Derived {
  switch (status) {
    case "Verified":
      return { status: "ACTIVE", reason: null, next: null };
    case "Rejected":
      return { status: "REJECTED", reason: reason || "The toll-free verification was rejected. Check the business details and resubmit.", next: null };
    case "Waiting For Customer":
      return { status: "REJECTED", reason: reason || "The reviewer needs more information — edit the details below and resubmit.", next: null };
    default:
      return { status: "CAMPAIGN_PENDING", reason: null, next: null };
  }
}

/* ───────────────────────── Pure state derivation ───────────────────────── */

export type RegistrationSnapshot = {
  entityType: string;
  brandStatus?: string | null; // Telnyx identityStatus
  brandRegistration?: string | null; // Telnyx brand.status: OK | REGISTRATION_PENDING | REGISTRATION_FAILED
  brandFailure?: string | null;
  hasCampaign: boolean;
  campaignStatus?: string | null;
  campaignSubmission?: string | null; // CREATED | FAILED | PENDING
  campaignFailure?: string | null;
  assignmentStatus?: string | null;
  assignmentFailure?: string | null;
};

export type Derived = {
  status: LineRegistrationStatus;
  reason: string | null;
  /** The next Telnyx call the orchestrator should make, if any. */
  next: "await_otp" | "create_campaign" | "assign_number" | null;
};

const CAMPAIGN_FAILED = new Set([
  "TCR_FAILED",
  "TCR_EXPIRED",
  "TCR_SUSPENDED",
  "TELNYX_FAILED",
  "MNO_REJECTED",
  "MNO_PROVISIONING_FAILED",
]);
const CAMPAIGN_LIVE = new Set(["MNO_ACCEPTED", "MNO_PROVISIONED"]);

/**
 * Collapse the three Telnyx statuses into ours. Kept pure so
 * scripts/test-business-line.ts can pin every branch without an account.
 */
export function deriveRegistration(s: RegistrationSnapshot): Derived {
  const brandVerified = s.brandStatus === "VERIFIED" || s.brandStatus === "VETTED_VERIFIED";

  if (s.brandRegistration === "REGISTRATION_FAILED") {
    return { status: "REJECTED", reason: s.brandFailure || "The carrier registry rejected the business registration.", next: null };
  }
  if (!brandVerified) {
    if (s.entityType === "SOLE_PROPRIETOR" && !s.brandFailure) {
      // Sole props verify by OTP; UNVERIFIED simply means the PIN hasn't been entered yet.
      return { status: "BRAND_PENDING", reason: null, next: "await_otp" };
    }
    if (s.brandStatus === "UNVERIFIED") {
      return {
        status: "REJECTED",
        reason:
          s.brandFailure ||
          "The carrier registry couldn't match the EIN to the legal business name and address. Check them against your IRS letter (CP575 / 147C) and resubmit.",
        next: null,
      };
    }
    // SELF_DECLARED / null while TCR is still checking
    return { status: "BRAND_PENDING", reason: null, next: null };
  }

  if (!s.hasCampaign) return { status: "CAMPAIGN_PENDING", reason: null, next: "create_campaign" };

  if (s.campaignSubmission === "FAILED" || (s.campaignStatus && CAMPAIGN_FAILED.has(s.campaignStatus))) {
    return {
      status: "REJECTED",
      reason: s.campaignFailure || `The carriers rejected the texting campaign (${s.campaignStatus ?? "failed"}).`,
      next: null,
    };
  }
  if (s.assignmentStatus === "FAILED_ASSIGNMENT" || s.assignmentStatus === "FAILED_UNASSIGNMENT") {
    return {
      status: "REJECTED",
      reason: s.assignmentFailure || "The number couldn't be attached to the approved campaign.",
      next: null,
    };
  }
  if (!s.assignmentStatus) return { status: "CAMPAIGN_PENDING", reason: null, next: "assign_number" };

  const live = s.campaignStatus ? CAMPAIGN_LIVE.has(s.campaignStatus) : false;
  if (live && s.assignmentStatus === "ASSIGNED") return { status: "ACTIVE", reason: null, next: null };
  return { status: "CAMPAIGN_PENDING", reason: null, next: null };
}

/* ───────────────────────── Number provisioning ───────────────────────── */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Three-digit US area code, or null. Accepts "(214)", "214", "+1 214 …" — takes the first three digits after a leading 1. */
export function normalizeAreaCode(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  const code = d.length >= 11 && d.startsWith("1") ? d.slice(1, 4) : d.slice(0, 3);
  return /^[2-9]\d{2}$/.test(code) ? code : null;
}

export async function provisionLine(
  companyId: string,
  opts: { type?: LineType | null; areaCode?: string | null; forwardTo?: string | null }
): Promise<{ number: string }> {
  if (!lineEnabled()) throw new LineError("Phone lines aren't available on this server yet.", 503);
  const type: LineType = opts.type === "toll_free" ? "toll_free" : "local";
  const areaCode = type === "local" ? normalizeAreaCode(opts.areaCode) : null;
  if (type === "local" && !areaCode) throw new LineError("Enter a three-digit area code.");
  const forwardTo = opts.forwardTo ? toE164(opts.forwardTo) : null;
  if (opts.forwardTo && !forwardTo) throw new LineError("Enter a valid phone number to forward calls to.");

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, addonActiveAt: true, lineNumber: true },
  });
  if (!company) throw new LineError("Company not found.", 404);
  if (!hasAddon(company)) throw new LineError("A business line is part of Workbench Plus.", 402);
  if (isRealLineNumber(company.lineNumber)) throw new LineError("This company already has a number.", 409);

  // Claim: the unique lineNumber column is the lock, so a double-click or two
  // tabs can't buy two numbers. Anything that fails below releases the claim.
  const claim = `${PENDING_PREFIX}${companyId}`;
  const claimed = await prisma.company.updateMany({
    where: { id: companyId, lineNumber: null },
    data: { lineNumber: claim },
  });
  if (claimed.count === 0) throw new LineError("A number is already being set up — give it a moment.", 409);

  try {
    const candidates = type === "toll_free" ? await searchTollFreeNumbers(10) : await searchLocalNumbers(areaCode!, 10);
    if (candidates.length === 0) {
      throw new LineError(
        type === "toll_free"
          ? "No toll-free numbers are available right now — try again in a few minutes."
          : `No numbers are available in area code ${areaCode} right now — try a nearby one.`
      );
    }

    let number: string | null = null;
    let lastErr: unknown = null;
    for (const cand of candidates.slice(0, 3)) {
      try {
        let order = await orderNumber(cand.phone_number, companyId);
        for (let i = 0; i < 6 && order.status === "pending" && order.id; i++) {
          await sleep(1500);
          order = await getNumberOrder(order.id);
        }
        if (order.status === "failure") {
          lastErr = new Error(`order ${order.id} failed`);
          continue;
        }
        number = cand.phone_number;
        break;
      } catch (err) {
        lastErr = err;
        // A number taken between search and order comes back 4xx — try the next one.
        if (err instanceof TelnyxError && err.status >= 500) throw err;
      }
    }
    if (!number) {
      const detail = lastErr instanceof TelnyxError ? lastErr.detail : "";
      throw new LineError(
        type === "toll_free"
          ? `Couldn't buy a toll-free number${detail ? ` (${detail})` : ""}. Try again in a few minutes.`
          : `Couldn't buy a number in ${areaCode}${detail ? ` (${detail})` : ""}. Try again or pick another area code.`,
        502
      );
    }

    // The phone_numbers record appears shortly after the order succeeds.
    let record = await findOwnedNumber(number);
    for (let i = 0; i < 5 && !record; i++) {
      await sleep(1500);
      record = await findOwnedNumber(number);
    }
    if (record && record.messaging_profile_id !== messagingProfileId()) {
      try {
        await setNumberMessagingProfile(record.id);
      } catch (err) {
        console.error("[line] messaging profile assignment failed:", err);
      }
    }
    // Voice: onto the Call Control app when this server has one (lib/voice.ts
    // answers, whispers, takes voicemail); otherwise the number-level
    // forwarding feature, which is live the minute the number exists.
    let voiceRouted = false;
    if (record) {
      try {
        voiceRouted = await routeNumberToVoiceApp(record.id);
        if (!voiceRouted && forwardTo) await setCallForwarding(record.id, forwardTo);
      } catch (err) {
        console.error("[line] voice routing failed at provision:", err);
      }
    }

    const callerIdName = record ? await tryCnam(record.id, company.name) : null;

    await prisma.company.update({
      where: { id: companyId },
      data: {
        lineNumber: number,
        lineNumberId: record?.id ?? null,
        lineType: type,
        lineForwardTo: record && forwardTo ? forwardTo : null,
        lineProvisionedAt: new Date(),
        lineVoiceAppAt: voiceRouted ? new Date() : null,
        lineCallerIdName: callerIdName,
      },
    });
    console.warn(`[line] provisioned ${type} ${number} for "${company.name}" (${companyId})`);
    return { number };
  } catch (err) {
    await prisma.company.updateMany({ where: { id: companyId, lineNumber: claim }, data: { lineNumber: null } });
    if (err instanceof LineError) throw err;
    const detail = err instanceof TelnyxError ? err.detail : err instanceof Error ? err.message : "unknown error";
    console.error("[line] provision failed:", err);
    throw new LineError(`Telnyx couldn't complete that: ${detail}`, 502);
  }
}

/**
 * Superadmin: hand a company a number the Telnyx account already owns (a
 * toll-free bought by hand, a ported number) instead of buying a new one.
 * Same end state as provisionLine; the registration path follows from the
 * number's prefix.
 */
export async function attachExistingNumber(companyId: string, phoneNumber: string): Promise<{ number: string; type: LineType }> {
  if (!lineEnabled()) throw new LineError("Telnyx isn't configured on this server.", 503);
  const e164 = toE164(phoneNumber);
  if (!e164) throw new LineError("Enter the number in a dialable form, e.g. +1 833 555 0100.");
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, lineNumber: true },
  });
  if (!company) throw new LineError("Company not found.", 404);
  if (isRealLineNumber(company.lineNumber)) throw new LineError("This company already has a number — release it first.", 409);
  const taken = await prisma.company.findUnique({ where: { lineNumber: e164 }, select: { name: true } });
  if (taken) throw new LineError(`${e164} is already attached to "${taken.name}".`, 409);

  let record;
  try {
    record = await findOwnedNumber(e164);
  } catch (err) {
    const detail = err instanceof TelnyxError ? err.detail : "unknown error";
    throw new LineError(`Telnyx lookup failed: ${detail}`, 502);
  }
  if (!record) throw new LineError(`${e164} isn't on the Telnyx account. Buy or port it there first.`, 404);
  if (record.messaging_profile_id !== messagingProfileId()) {
    try {
      await setNumberMessagingProfile(record.id);
    } catch (err) {
      const detail = err instanceof TelnyxError ? err.detail : "unknown error";
      throw new LineError(`Couldn't put the number on the WorkBench messaging profile: ${detail}`, 502);
    }
  }
  const type: LineType = isTollFreeNumber(e164) ? "toll_free" : "local";
  let voiceRouted = false;
  try {
    voiceRouted = await routeNumberToVoiceApp(record.id);
  } catch (err) {
    console.error("[line] voice routing failed at attach:", err);
  }
  const callerIdName = await tryCnam(record.id, company.name);
  await prisma.company.update({
    where: { id: companyId },
    data: {
      lineNumber: e164,
      lineNumberId: record.id,
      lineType: type,
      lineProvisionedAt: new Date(),
      lineVoiceAppAt: voiceRouted ? new Date() : null,
      lineCallerIdName: callerIdName,
    },
  });
  console.warn(`[line] attached existing ${type} ${e164} to "${company.name}" (${companyId})`);
  return { number: e164, type };
}

/** Resolve the Telnyx number id when the order settled after we saved the row. */
async function ensureNumberId(company: { id: string; lineNumber: string | null; lineNumberId: string | null }): Promise<string> {
  if (company.lineNumberId) return company.lineNumberId;
  if (!isRealLineNumber(company.lineNumber)) throw new LineError("Get a number first.", 409);
  const record = await findOwnedNumber(company.lineNumber);
  if (!record) throw new LineError("Telnyx is still activating the number — try again in a minute.", 503);
  await prisma.company.update({ where: { id: company.id }, data: { lineNumberId: record.id } });
  return record.id;
}

export async function setLineForwarding(companyId: string, forwardTo: string | null): Promise<{ forwardTo: string | null }> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, lineNumber: true, lineNumberId: true },
  });
  if (!company) throw new LineError("Company not found.", 404);
  const e164 = forwardTo ? toE164(forwardTo) : null;
  if (forwardTo && !e164) throw new LineError("Enter a valid phone number to forward calls to.");
  if (e164 && e164 === company.lineNumber) throw new LineError("Calls can't forward to the business line itself.");
  const numberId = await ensureNumberId(company);
  // On the voice app the ring target is ours to read at call time (lib/voice.ts);
  // on plain forwarding it lives on the number at Telnyx. Saving here also
  // migrates a pre-voice number onto the app the first time.
  let routed = false;
  try {
    routed = await ensureVoiceRouting(companyId);
  } catch (err) {
    console.error("[line] voice routing at forwarding save failed (falling back to forwarding):", err);
  }
  if (!routed) {
    try {
      await setCallForwarding(numberId, e164);
    } catch (err) {
      const detail = err instanceof TelnyxError ? err.detail : "unknown error";
      throw new LineError(`Telnyx couldn't update call forwarding: ${detail}`, 502);
    }
  }
  await prisma.company.update({ where: { id: companyId }, data: { lineForwardTo: e164 } });
  return { forwardTo: e164 };
}

/** Settings: the voicemail greeting callers hear (null = the generated default). */
export async function setVoicemailGreeting(companyId: string, raw: unknown): Promise<{ greeting: string | null }> {
  let greeting: string | null;
  try {
    greeting = sanitizeGreeting(raw);
  } catch (err) {
    if (err instanceof VoiceError) throw new LineError(err.message, err.status);
    throw err;
  }
  await prisma.company.update({ where: { id: companyId }, data: { lineVoicemailGreeting: greeting } });
  return { greeting };
}

/** Best-effort CNAM listing from the company name at provision/attach; null when Telnyx declines (toll-free, say). */
async function tryCnam(numberId: string, businessName: string): Promise<string | null> {
  const name = defaultCallerIdName(businessName);
  if (!name) return null;
  try {
    await setCnamListing(numberId, name);
    return name;
  } catch (err) {
    console.warn(`[line] CNAM listing "${name}" declined at setup:`, err instanceof TelnyxError ? err.detail : err);
    return null;
  }
}

/** Validate the caller-ID name from the settings form; "" = switch the listing off. */
export function sanitizeCallerIdName(raw: unknown): string | null {
  const name = defaultCallerIdName(typeof raw === "string" ? raw : "");
  if (typeof raw === "string" && raw.trim() && !name) throw new LineError("Use letters, numbers and spaces only.");
  return name || null;
}

/** Settings: the outbound caller-ID name (CNAM listing) on the company's number. */
export async function setCallerIdName(companyId: string, raw: unknown): Promise<{ callerIdName: string | null }> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, lineNumber: true, lineNumberId: true },
  });
  if (!company) throw new LineError("Company not found.", 404);
  const name = sanitizeCallerIdName(raw);
  const numberId = await ensureNumberId(company);
  try {
    await setCnamListing(numberId, name);
  } catch (err) {
    const detail = err instanceof TelnyxError ? err.detail : "unknown error";
    throw new LineError(`Telnyx wouldn’t set that caller ID name: ${detail}`, 502);
  }
  await prisma.company.update({ where: { id: companyId }, data: { lineCallerIdName: name } });
  return { callerIdName: name };
}

/* ───────────────────────── Registration ───────────────────────── */

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Validate + normalize the form; throws LineError with the first problem.
 * TOLL_FREE tightens two things the aggregator insists on: a website and an
 * EIN (required since January 2026), and adds the volume/use-case pickers.
 */
export function sanitizeRegistrationForm(raw: Record<string, unknown>, kind: RegistrationKind = "10DLC"): RegistrationForm {
  const tollFree = kind === "TOLL_FREE";
  const entityType = raw.entityType === "SOLE_PROPRIETOR" && !tollFree ? "SOLE_PROPRIETOR" : "PRIVATE_PROFIT";
  const legalName = str(raw.legalName, 120);
  if (legalName.length < 2) throw new LineError("Enter the legal business name.");
  const displayName = str(raw.displayName, 120) || legalName;
  let ein: string | null = null;
  if (entityType === "PRIVATE_PROFIT") {
    ein = str(raw.ein, 20).replace(/\D/g, "");
    if (ein.length !== 9) throw new LineError("Enter the 9-digit EIN (XX-XXXXXXX).");
  }
  let messageVolume: string | null = null;
  let useCase: string | null = null;
  if (tollFree) {
    messageVolume = TOLL_FREE_VOLUMES.some(([v]) => v === raw.messageVolume) ? String(raw.messageVolume) : "1,000";
    useCase = TOLL_FREE_USE_CASES.some(([v]) => v === raw.useCase) ? String(raw.useCase) : "Appointments";
  }
  const street = str(raw.street, 120);
  const city = str(raw.city, 80);
  const state = str(raw.state, 20).toUpperCase();
  const postalCode = str(raw.postalCode, 10).replace(/\D/g, "").slice(0, 5);
  if (!street || !city || !/^[A-Z]{2}$/.test(state) || postalCode.length !== 5) {
    throw new LineError("Enter the business street address, city, two-letter state and 5-digit ZIP.");
  }
  if (/\bp\.?\s*o\.?\s*box\b/i.test(street)) throw new LineError("The carrier registry doesn't accept PO boxes — use a street address.");
  let website = str(raw.website, 200);
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
  if (tollFree && !website) throw new LineError("Toll-free verification requires a business website (or a public social page).");
  if (website) {
    try {
      new URL(website);
    } catch {
      throw new LineError(tollFree ? "Enter a valid website address." : "Enter a valid website address, or leave it blank.");
    }
  }
  const vertical = VERTICALS.some(([v]) => v === raw.vertical) ? String(raw.vertical) : "";
  if (!vertical) throw new LineError("Pick the industry that fits best.");
  const contactFirstName = str(raw.contactFirstName, 60);
  const contactLastName = str(raw.contactLastName, 60);
  if (!contactFirstName || !contactLastName) throw new LineError("Enter the contact's first and last name.");
  const contactEmail = str(raw.contactEmail, 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new LineError("Enter a valid contact email.");
  const contactPhone = toE164(str(raw.contactPhone, 30));
  if (!contactPhone) throw new LineError(entityType === "SOLE_PROPRIETOR" ? "Enter the mobile number that will receive the verification PIN." : "Enter a valid contact phone number.");
  return {
    entityType,
    legalName,
    displayName,
    ein,
    street,
    city,
    state,
    postalCode,
    website: website || null,
    vertical,
    contactFirstName,
    contactLastName,
    contactEmail,
    contactPhone,
    messageVolume,
    useCase,
  };
}

/** What the carriers see: how consent happens and what the texts look like. */
export function campaignCopy(businessName: string, website: string | null) {
  const site = website ?? "the business's website";
  return {
    description: `${businessName} is a local service business. Customers who hire it receive appointment reminders, schedule changes, quote and invoice links, and replies to their own messages, from this number. Sent through the WorkBench field-service platform (workbenchfsm.com).`,
    messageFlow: `Customers give ${businessName} their mobile number when they request service by phone, in person, or through the online booking form at ${site}, which includes an unchecked SMS consent checkbox and links to the text terms (https://workbenchfsm.com/sms-terms). Every text includes opt-out language; STOP opts out immediately and HELP returns support info.`,
    samples: [
      `Hi Maria, a reminder from ${businessName}: HVAC tune-up, Tue Jun 3 between 8–10am at 123 Oak St. Reply STOP to opt out.`,
      `Hi Maria, ${businessName} will arrive soon for HVAC tune-up (8–10am). Reply STOP to opt out.`,
      `Hi Maria, ${businessName} sent you quote #1042 for $480.00. View & approve: https://workbenchfsm.com/quote/abc123 Reply STOP to opt out.`,
      `Hi Maria, ${businessName} sent you invoice #2210 for $480.00. View & pay: https://workbenchfsm.com/pay/abc123 Reply STOP to opt out.`,
      `${businessName}: Yes, we can move your visit to Thursday morning — I've updated the schedule. Reply STOP to opt out.`,
    ],
    privacyPolicyLink: "https://workbenchfsm.com/privacy",
    termsAndConditionsLink: "https://workbenchfsm.com/sms-terms",
  };
}

type RegWithCompany = MessagingRegistration & { company: { id: string; name: string; lineNumber: string | null } };

const snapshotOf = (
  reg: Pick<MessagingRegistration, "entityType" | "brandStatus" | "campaignId" | "campaignStatus" | "assignmentStatus">,
  extra: Partial<RegistrationSnapshot> = {}
): RegistrationSnapshot => ({
  entityType: reg.entityType,
  brandStatus: reg.brandStatus,
  hasCampaign: Boolean(reg.campaignId),
  campaignStatus: reg.campaignStatus,
  assignmentStatus: reg.assignmentStatus,
  ...extra,
});

/**
 * File (or re-file) the company's registration. Creates the brand; when TCR
 * verifies the EIN on the spot — the common case — the campaign is created
 * and the number bound before this returns, so the tenant sees
 * "carriers reviewing" rather than a two-step wait.
 */
export async function submitRegistration(companyId: string, form: RegistrationForm): Promise<MessagingRegistration> {
  if (!lineEnabled()) throw new LineError("Phone lines aren't available on this server yet.", 503);
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      addonActiveAt: true,
      lineNumber: true,
      lineType: true,
      messagingRegistration: { select: { id: true, status: true, kind: true, verificationId: true } },
    },
  });
  if (!company) throw new LineError("Company not found.", 404);
  if (!hasAddon(company)) throw new LineError("Texting registration is part of Workbench Plus.", 402);
  if (!isRealLineNumber(company.lineNumber)) throw new LineError("Get a number before registering it for texting.", 409);
  if (company.messagingRegistration && company.messagingRegistration.status !== "REJECTED") {
    throw new LineError("A registration is already in progress.", 409);
  }

  if (lineKind(company) === "TOLL_FREE") {
    return submitTollFreeVerification(
      { id: company.id, name: company.name, lineNumber: company.lineNumber },
      form,
      company.messagingRegistration?.kind === "TOLL_FREE" ? company.messagingRegistration.verificationId : null
    );
  }

  let brand;
  try {
    brand = await createBrand({
      entityType: form.entityType,
      displayName: form.displayName || form.legalName,
      companyName: form.legalName,
      ein: form.ein,
      street: form.street,
      city: form.city,
      state: form.state,
      postalCode: form.postalCode,
      website: form.website,
      vertical: form.vertical,
      firstName: form.contactFirstName,
      lastName: form.contactLastName,
      email: form.contactEmail,
      phone: form.contactPhone,
      mobilePhone: form.entityType === "SOLE_PROPRIETOR" ? form.contactPhone : null,
      webhookURL: tenDlcWebhookUrl(),
    });
  } catch (err) {
    const detail = err instanceof TelnyxError ? err.detail : "unknown error";
    throw new LineError(`The carrier registry rejected the submission: ${detail}`, 502);
  }
  if (!brand.brandId) throw new LineError("Telnyx accepted the brand but returned no id — contact support.", 502);

  const data: Prisma.MessagingRegistrationUncheckedCreateInput = {
    companyId,
    status: "BRAND_PENDING",
    kind: "10DLC",
    verificationId: null,
    verificationStatus: null,
    messageVolume: null,
    useCase: null,
    entityType: form.entityType,
    legalName: form.legalName,
    displayName: form.displayName || form.legalName,
    ein: form.ein,
    street: form.street,
    city: form.city,
    state: form.state,
    postalCode: form.postalCode,
    website: form.website,
    vertical: form.vertical,
    contactFirstName: form.contactFirstName,
    contactLastName: form.contactLastName,
    contactEmail: form.contactEmail,
    contactPhone: form.contactPhone,
    brandId: brand.brandId,
    tcrBrandId: brand.tcrBrandId ?? null,
    brandStatus: brand.identityStatus ?? null,
    campaignId: null,
    tcrCampaignId: null,
    campaignStatus: null,
    assignmentStatus: null,
    rejectionReason: null,
    submittedAt: new Date(),
    approvedAt: null,
    lastCheckedAt: new Date(),
  };
  const reg = await prisma.messagingRegistration.upsert({
    where: { companyId },
    create: data,
    update: { ...data, companyId: undefined },
  });
  console.warn(`[line] brand ${brand.brandId} (${brand.identityStatus ?? "?"}) filed for "${company.name}" (${companyId})`);

  if (form.entityType === "SOLE_PROPRIETOR") {
    try {
      await triggerBrandOtp(brand.brandId, form.displayName || form.legalName);
    } catch (err) {
      console.error("[line] OTP trigger failed:", err);
    }
  }

  // Advance as far as Telnyx lets us right now (EIN brands: usually all the way to campaign review).
  return advance({ ...reg, company: { id: company.id, name: company.name, lineNumber: company.lineNumber } }, {
    brandRegistration: brand.status,
    brandFailure: brand.failureReasons,
  });
}

/** Which registration path a company's number takes. Falls back to the prefix for rows attached before lineType existed. */
function lineKind(c: { lineNumber: string | null; lineType: string | null }): RegistrationKind {
  if (c.lineType === "toll_free") return "TOLL_FREE";
  if (c.lineType === "local") return "10DLC";
  return c.lineNumber && isTollFreeNumber(c.lineNumber) ? "TOLL_FREE" : "10DLC";
}

/** The verification request body for a company, from its stored form. */
function tollFreeInput(number: string, form: RegistrationForm): TollFreeVerificationInput {
  const business = form.displayName || form.legalName;
  const copy = campaignCopy(business, form.website ?? null);
  return {
    phoneNumber: number,
    businessName: form.legalName,
    doingBusinessAs: form.displayName && form.displayName !== form.legalName ? form.displayName : null,
    entityType: form.entityType,
    ein: form.ein,
    addr1: form.street,
    city: form.city,
    state: stateName(form.state),
    zip: form.postalCode,
    website: form.website ?? "",
    contactFirstName: form.contactFirstName,
    contactLastName: form.contactLastName,
    contactEmail: form.contactEmail,
    contactPhone: form.contactPhone,
    messageVolume: form.messageVolume ?? "1,000",
    useCase: form.useCase ?? "Appointments",
    useCaseSummary: copy.description,
    productionMessageContent: copy.samples[0],
    optInWorkflow: copy.messageFlow,
    optInImageUrls: [OPT_IN_IMAGE_URL, copy.termsAndConditionsLink],
    additionalInformation:
      `Submitted by WorkBench (workbenchfsm.com, Streamflaire Group LLC) on behalf of ${form.legalName}, which is the sole sender on this number. ` +
      "Traffic is transactional: appointment reminders, schedule changes, quote and invoice links, and replies to the customer's own messages. " +
      "No marketing. STOP/HELP handled at the Telnyx edge and mirrored in the application.",
    privacyPolicyURL: copy.privacyPolicyLink,
    termsAndConditionURL: copy.termsAndConditionsLink,
    webhookUrl: tollFreeWebhookUrl(),
  };
}

/**
 * Toll-free path: one verification request. Reuses an existing request when
 * Telnyx already holds one for this number (a "Waiting For Customer" request
 * is updated in place — that is what the reviewer asked for; a verified one
 * is simply adopted), and files a fresh one otherwise.
 */
async function submitTollFreeVerification(
  company: { id: string; name: string; lineNumber: string | null },
  form: RegistrationForm,
  knownVerificationId: string | null
): Promise<MessagingRegistration> {
  const number = company.lineNumber as string;
  const input = tollFreeInput(number, form);

  let existing: TollFreeVerification | null = null;
  try {
    if (knownVerificationId) {
      existing = await getTollFreeVerification(knownVerificationId);
    } else {
      const prior = await listTollFreeVerifications(number);
      existing =
        prior.find((p) => p.verificationStatus === "Verified") ??
        prior.find((p) => p.verificationStatus && p.verificationStatus !== "Rejected") ??
        null;
    }
  } catch (err) {
    console.error("[line] toll-free lookup failed (filing fresh):", err);
  }

  let request: TollFreeVerification;
  const existingId = existing?.id ?? existing?.verificationRequestId ?? null;
  try {
    if (existing && existingId && existing.verificationStatus === "Verified") {
      request = existing;
    } else if (existing && existingId && existing.verificationStatus === "Waiting For Customer") {
      request = await updateTollFreeVerification(existingId, input);
    } else if (existing && existingId && existing.verificationStatus && existing.verificationStatus !== "Rejected") {
      request = existing; // already in review under this number — don't file a duplicate
    } else {
      request = await createTollFreeVerification(input);
    }
  } catch (err) {
    const detail = err instanceof TelnyxError ? err.detail : "unknown error";
    throw new LineError(`Telnyx rejected the verification submission: ${detail}`, 502);
  }
  const verificationId = request.id ?? request.verificationRequestId ?? existingId;
  if (!verificationId) throw new LineError("Telnyx accepted the request but returned no id — contact support.", 502);

  const d = deriveTollFree(request.verificationStatus);
  const data: Prisma.MessagingRegistrationUncheckedCreateInput = {
    companyId: company.id,
    status: d.status,
    kind: "TOLL_FREE",
    verificationId,
    verificationStatus: request.verificationStatus ?? null,
    messageVolume: input.messageVolume,
    useCase: input.useCase,
    entityType: form.entityType,
    legalName: form.legalName,
    displayName: form.displayName || form.legalName,
    ein: form.ein,
    street: form.street,
    city: form.city,
    state: form.state,
    postalCode: form.postalCode,
    website: form.website,
    vertical: form.vertical,
    contactFirstName: form.contactFirstName,
    contactLastName: form.contactLastName,
    contactEmail: form.contactEmail,
    contactPhone: form.contactPhone,
    brandId: null,
    tcrBrandId: null,
    brandStatus: null,
    campaignId: null,
    tcrCampaignId: null,
    campaignStatus: null,
    assignmentStatus: null,
    rejectionReason: d.reason,
    submittedAt: new Date(),
    approvedAt: d.status === "ACTIVE" ? new Date() : null,
    lastCheckedAt: new Date(),
  };
  console.warn(`[line] toll-free verification ${verificationId} (${request.verificationStatus ?? "?"}) for "${company.name}" (${company.id})`);
  return prisma.messagingRegistration.upsert({
    where: { companyId: company.id },
    create: data,
    update: { ...data, companyId: undefined },
  });
}

async function advanceTollFree(reg: RegWithCompany): Promise<MessagingRegistration> {
  if (!reg.verificationId) throw new LineError("No verification request on file — resubmit.", 409);
  let request: TollFreeVerification;
  try {
    request = await getTollFreeVerification(reg.verificationId);
  } catch (err) {
    await prisma.messagingRegistration.update({ where: { id: reg.id }, data: { lastCheckedAt: new Date() } });
    const detail = err instanceof TelnyxError ? err.detail : "unknown error";
    throw new LineError(`Telnyx check failed: ${detail}`, 502);
  }
  const status = request.verificationStatus ?? null;
  const reason =
    status === "Rejected" || status === "Waiting For Customer" ? await tollFreeStatusReason(reg.verificationId) : null;
  const d = deriveTollFree(status, reason);
  if (d.status !== reg.status) {
    console.warn(`[line] "${reg.company.name}" toll-free: ${reg.status} → ${d.status}${d.reason ? ` (${d.reason})` : ""}`);
  }
  return prisma.messagingRegistration.update({
    where: { id: reg.id },
    data: {
      status: d.status,
      verificationStatus: status,
      rejectionReason: d.reason,
      approvedAt: d.status === "ACTIVE" ? reg.approvedAt ?? new Date() : reg.approvedAt,
      lastCheckedAt: new Date(),
    },
  });
}

/** Toll-free webhook: any ping naming a verification request we hold triggers a re-read. */
export async function refreshByVerificationId(verificationId: string): Promise<boolean> {
  const reg = await prisma.messagingRegistration.findFirst({
    where: { verificationId },
    select: { companyId: true, lastCheckedAt: true, status: true },
  });
  if (!reg) return false;
  if (reg.status === "ACTIVE") return true;
  if (reg.lastCheckedAt && Date.now() - reg.lastCheckedAt.getTime() < 30_000) return true;
  try {
    await refreshRegistration(reg.companyId, { includeRejected: true });
  } catch (err) {
    console.error("[line] toll-free webhook refresh failed:", err);
  }
  return true;
}

/** Sole proprietor: the owner types the PIN Telnyx texted them. */
export async function verifyRegistrationOtp(companyId: string, pin: string): Promise<MessagingRegistration> {
  const reg = await loadRegistration(companyId);
  if (!reg?.brandId) throw new LineError("No registration to verify.", 404);
  if (reg.kind !== "10DLC" || reg.entityType !== "SOLE_PROPRIETOR" || reg.status !== "BRAND_PENDING") {
    throw new LineError("This registration isn't waiting on a PIN.", 409);
  }
  const clean = pin.replace(/\D/g, "");
  if (clean.length < 4) throw new LineError("Enter the PIN from the text message.");
  try {
    await verifyBrandOtp(reg.brandId, clean);
  } catch (err) {
    const detail = err instanceof TelnyxError ? err.detail : "unknown error";
    throw new LineError(`That PIN didn't verify: ${detail}`, 400);
  }
  return refreshRegistration(companyId);
}

export async function resendRegistrationOtp(companyId: string): Promise<void> {
  const reg = await loadRegistration(companyId);
  if (!reg?.brandId || reg.entityType !== "SOLE_PROPRIETOR" || reg.status !== "BRAND_PENDING") {
    throw new LineError("This registration isn't waiting on a PIN.", 409);
  }
  try {
    await triggerBrandOtp(reg.brandId, reg.displayName);
  } catch (err) {
    const detail = err instanceof TelnyxError ? err.detail : "unknown error";
    throw new LineError(`Couldn't resend the PIN: ${detail}`, 502);
  }
}

async function loadRegistration(companyId: string): Promise<RegWithCompany | null> {
  return prisma.messagingRegistration.findUnique({
    where: { companyId },
    include: { company: { select: { id: true, name: true, lineNumber: true } } },
  });
}

/**
 * Re-read every Telnyx object we hold an id for and move the state machine
 * forward — creating the campaign / binding the number when their
 * prerequisites just became true. Safe to call any time; terminal states
 * return immediately.
 */
export async function refreshRegistration(
  companyId: string,
  opts: { includeRejected?: boolean } = {}
): Promise<MessagingRegistration> {
  const reg = await loadRegistration(companyId);
  if (!reg) throw new LineError("No registration on file.", 404);
  if (reg.status === "ACTIVE") return reg;
  // A toll-free "REJECTED" may really be "Waiting For Customer", which the
  // reviewer can flip back to In Progress on their own — worth re-reading.
  if (reg.status === "REJECTED" && !(opts.includeRejected && reg.kind === "TOLL_FREE")) return reg;
  if (reg.kind === "TOLL_FREE") return advanceTollFree(reg);
  return advance(reg);
}

async function advance(reg: RegWithCompany, brandExtra: Partial<RegistrationSnapshot> = {}): Promise<MessagingRegistration> {
  const patch: Prisma.MessagingRegistrationUncheckedUpdateInput = { lastCheckedAt: new Date() };
  let snap: RegistrationSnapshot = snapshotOf(reg, brandExtra);
  const number = reg.company.lineNumber;

  try {
    // 1. Brand
    if (reg.brandId && !brandExtra.brandRegistration) {
      const brand = await getBrand(reg.brandId);
      patch.brandStatus = brand.identityStatus ?? reg.brandStatus;
      patch.tcrBrandId = brand.tcrBrandId ?? reg.tcrBrandId;
      snap = { ...snap, brandStatus: brand.identityStatus ?? reg.brandStatus, brandRegistration: brand.status, brandFailure: brand.failureReasons };
    }

    // 2. Campaign — create once the brand is verified
    let d = deriveRegistration(snap);
    if (d.next === "create_campaign" && reg.brandId) {
      const copy = campaignCopy(reg.displayName, reg.website);
      const campaign = await createCampaign({
        brandId: reg.brandId,
        description: copy.description,
        messageFlow: copy.messageFlow,
        samples: copy.samples,
        privacyPolicyLink: copy.privacyPolicyLink,
        termsAndConditionsLink: copy.termsAndConditionsLink,
        webhookURL: tenDlcWebhookUrl(),
      });
      if (!campaign.campaignId) throw new LineError("Telnyx accepted the campaign but returned no id.", 502);
      patch.campaignId = campaign.campaignId;
      patch.tcrCampaignId = campaign.tcrCampaignId ?? null;
      patch.campaignStatus = campaign.campaignStatus ?? null;
      snap = {
        ...snap,
        hasCampaign: true,
        campaignStatus: campaign.campaignStatus,
        campaignSubmission: campaign.submissionStatus,
        campaignFailure: campaign.failureReasons,
      };
      console.warn(`[line] campaign ${campaign.campaignId} created for "${reg.company.name}"`);
    } else if (reg.campaignId) {
      const campaign = await getCampaign(reg.campaignId);
      patch.campaignStatus = campaign.campaignStatus ?? reg.campaignStatus;
      patch.tcrCampaignId = campaign.tcrCampaignId ?? reg.tcrCampaignId;
      snap = {
        ...snap,
        campaignStatus: campaign.campaignStatus ?? reg.campaignStatus,
        campaignSubmission: campaign.submissionStatus,
        campaignFailure: campaign.failureReasons,
      };
    }

    // 3. Number ↔ campaign binding
    d = deriveRegistration(snap);
    const campaignId = (patch.campaignId as string | undefined) ?? reg.campaignId;
    if (campaignId && isRealLineNumber(number) && d.status !== "REJECTED") {
      let binding = snap.assignmentStatus === "ASSIGNED" ? null : await getNumberCampaign(number);
      if (!binding && d.next === "assign_number") {
        binding = await assignNumberToCampaign(number, campaignId);
        console.warn(`[line] ${number} bound to campaign ${campaignId}`);
      }
      if (binding) {
        patch.assignmentStatus = binding.assignmentStatus ?? "PENDING_ASSIGNMENT";
        snap = { ...snap, assignmentStatus: patch.assignmentStatus as string, assignmentFailure: binding.failureReasons };
      }
    }
  } catch (err) {
    // A Telnyx hiccup mid-chain must not masquerade as a rejection: persist
    // whatever advanced, keep the pending status, and let the caller decide.
    await prisma.messagingRegistration.update({ where: { id: reg.id }, data: patch });
    if (err instanceof LineError) throw err;
    const detail = err instanceof TelnyxError ? err.detail : err instanceof Error ? err.message : "unknown error";
    console.error(`[line] refresh failed for company ${reg.companyId}:`, err);
    throw new LineError(`Telnyx check failed: ${detail}`, 502);
  }

  const final = deriveRegistration(snap);
  patch.status = final.status;
  patch.rejectionReason = final.reason;
  if (final.status === "ACTIVE" && !reg.approvedAt) patch.approvedAt = new Date();
  if (final.status !== reg.status) {
    console.warn(`[line] "${reg.company.name}": ${reg.status} → ${final.status}${final.reason ? ` (${final.reason})` : ""}`);
  }
  return prisma.messagingRegistration.update({ where: { id: reg.id }, data: patch });
}

/** Hourly: nudge every pending registration along. */
export async function runLineRegistrationSweep(): Promise<{ checked: number; errors: number }> {
  if (!lineEnabled()) return { checked: 0, errors: 0 };
  const stale = new Date(Date.now() - 50 * 60_000);
  const pending = await prisma.messagingRegistration.findMany({
    where: {
      status: { in: ["BRAND_PENDING", "CAMPAIGN_PENDING"] },
      OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: stale } }],
    },
    select: { companyId: true },
    take: 100,
  });
  let errors = 0;
  for (const { companyId } of pending) {
    try {
      await refreshRegistration(companyId);
    } catch (err) {
      errors++;
      console.error(`[line] sweep: company ${companyId}`, err);
    }
  }
  return { checked: pending.length, errors };
}

/** The 10DLC status webhook doesn't need trusting: any ping just triggers a re-read of that brand/campaign. */
export async function refreshByTelnyxId(ids: { brandId?: string | null; campaignId?: string | null }): Promise<boolean> {
  const reg = await prisma.messagingRegistration.findFirst({
    where: {
      OR: [
        ...(ids.brandId ? [{ brandId: ids.brandId }, { tcrBrandId: ids.brandId }] : []),
        ...(ids.campaignId ? [{ campaignId: ids.campaignId }, { tcrCampaignId: ids.campaignId }] : []),
      ],
    },
    select: { companyId: true, lastCheckedAt: true, status: true },
  });
  if (!reg) return false;
  if (reg.status === "ACTIVE" || reg.status === "REJECTED") return true;
  // Debounce: TCR can fire several events for one change.
  if (reg.lastCheckedAt && Date.now() - reg.lastCheckedAt.getTime() < 30_000) return true;
  try {
    await refreshRegistration(reg.companyId);
  } catch (err) {
    console.error("[line] webhook-triggered refresh failed:", err);
  }
  return true;
}

/* ───────────────────────── Number rights after cancellation ─────────────────────────
 * The number is the tenant's for as long as they subscribe, and for a grace
 * period after: when the add-on lapses (Livery cancel, final payment failure,
 * superadmin revoke) the hourly sweep stamps lineReleaseAt = now + 30 days,
 * the Settings card says so with a keep-my-number path (resubscribe, or port
 * it out — an FCC right; Telnyx handles port-outs through support), and the
 * sweep releases the number only once that date passes with no add-on.
 * Resubscribing before then simply clears the date.
 * ------------------------------------------------------------------------ */

export const LINE_GRACE_DAYS = 30;

export type LineReleaseAction = "stamp" | "release" | "clear" | null;

/** What the sweep should do for one company right now. Pure — see scripts/test-business-line.ts. */
export function lineReleasePlan(
  c: { lineNumber: string | null; addonActiveAt: Date | null; lineReleaseAt: Date | null },
  now: Date
): LineReleaseAction {
  if (!isRealLineNumber(c.lineNumber)) return c.lineReleaseAt ? "clear" : null;
  if (c.addonActiveAt) return c.lineReleaseAt ? "clear" : null;
  if (!c.lineReleaseAt) return "stamp";
  return c.lineReleaseAt.getTime() <= now.getTime() ? "release" : null;
}

/** Hourly: schedule, un-schedule, or carry out number releases for lapsed add-ons. */
export async function runLineReleaseSweep(now = new Date()): Promise<{ stamped: number; released: number; cleared: number; errors: number }> {
  const out = { stamped: 0, released: 0, cleared: 0, errors: 0 };
  if (!lineEnabled()) return out;
  const rows = await prisma.company.findMany({
    where: { OR: [{ lineNumber: { not: null } }, { lineReleaseAt: { not: null } }] },
    select: { id: true, name: true, lineNumber: true, addonActiveAt: true, lineReleaseAt: true },
    take: 500,
  });
  for (const c of rows) {
    const action = lineReleasePlan(c, now);
    if (!action) continue;
    try {
      if (action === "stamp") {
        const at = new Date(now.getTime() + LINE_GRACE_DAYS * 86_400_000);
        await prisma.company.update({ where: { id: c.id }, data: { lineReleaseAt: at } });
        out.stamped++;
        console.warn(`[line] "${c.name}" add-on lapsed — ${c.lineNumber} scheduled for release ${at.toISOString()}`);
        const owners = await prisma.user.findMany({ where: { companyId: c.id, role: "OWNER" }, select: { id: true } });
        await notifyUsers(
          owners.map((o) => o.id),
          {
            title: "Your business line",
            body: `Your plan ended, so ${c.lineNumber} will be released in ${LINE_GRACE_DAYS} days. Resubscribe to keep it, or port it out before then.`,
            url: "/app/settings?s=features",
            tag: `line-release-${c.id}`,
          }
        ).catch(() => {});
      } else if (action === "clear") {
        await prisma.company.update({ where: { id: c.id }, data: { lineReleaseAt: null } });
        out.cleared++;
      } else {
        await releaseLine(c.id);
        out.released++;
      }
    } catch (err) {
      out.errors++;
      console.error(`[line] release sweep: company ${c.id} (${action})`, err);
    }
  }
  return out;
}

/** Superadmin: call off a scheduled release (comped keep, port-out in progress). */
export async function keepLine(companyId: string): Promise<void> {
  await prisma.company.update({ where: { id: companyId }, data: { lineReleaseAt: null } });
}

/* ───────────────────────── Release (superadmin) ───────────────────────── */

/**
 * Give the number back. Irreversible: the registration is dropped with it,
 * and clients' reply history stays but points at a number that will ring
 * someone else one day. Use after cancellation + grace period, not on it.
 */
export async function releaseLine(companyId: string): Promise<void> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, lineNumber: true, lineNumberId: true },
  });
  if (!company) throw new LineError("Company not found.", 404);
  if (isRealLineNumber(company.lineNumber)) {
    try {
      await unassignNumberFromCampaign(company.lineNumber);
    } catch (err) {
      console.error("[line] campaign unassign failed (continuing):", err);
    }
    let id = company.lineNumberId;
    if (!id) id = (await findOwnedNumber(company.lineNumber))?.id ?? null;
    if (id) {
      try {
        await releaseNumber(id);
      } catch (err) {
        if (!(err instanceof TelnyxError && err.status === 404)) {
          const detail = err instanceof TelnyxError ? err.detail : "unknown error";
          throw new LineError(`Telnyx wouldn't release the number: ${detail}`, 502);
        }
      }
    }
  }
  await prisma.$transaction([
    prisma.messagingRegistration.deleteMany({ where: { companyId } }),
    prisma.company.update({
      where: { id: companyId },
      data: { lineNumber: null, lineNumberId: null, lineForwardTo: null, lineProvisionedAt: null, lineVoiceAppAt: null, lineCallerIdName: null },
    }),
  ]);
  console.warn(`[line] released ${company.lineNumber ?? "(no number)"} for "${company.name}" (${companyId})`);
}

/* ───────────────────────── Read model for the UI ───────────────────────── */

export async function lineSummary(
  companyId: string,
  actor?: { id?: string | null; name?: string | null; email?: string | null } | null
): Promise<LineSummary> {
  const c = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      name: true,
      phone: true,
      email: true,
      address: true,
      city: true,
      state: true,
      zip: true,
      website: true,
      addonActiveAt: true,
      lineNumber: true,
      lineType: true,
      lineForwardTo: true,
      lineProvisionedAt: true,
      lineReleaseAt: true,
      lineVoiceAppAt: true,
      lineVoicemailGreeting: true,
      lineCallerIdName: true,
      messagingRegistration: true,
    },
  });
  if (!c) throw new LineError("Company not found.", 404);
  const reg = c.messagingRegistration;
  const actorPhone = actor?.id
    ? (await prisma.user.findUnique({ where: { id: actor.id }, select: { phone: true } }))?.phone ?? null
    : null;
  const [first, ...rest] = (actor?.name ?? "").trim().split(/\s+/);
  const number = isRealLineNumber(c.lineNumber) ? c.lineNumber : null;
  return {
    enabled: lineEnabled(),
    entitled: hasAddon(c),
    number,
    type: number ? (lineKind(c) === "TOLL_FREE" ? "toll_free" : "local") : null,
    forwardTo: c.lineForwardTo,
    provisionedAt: c.lineProvisionedAt?.toISOString() ?? null,
    voice: {
      available: voiceEnabled(),
      routed: Boolean(number && c.lineVoiceAppAt),
      greeting: c.lineVoicemailGreeting,
      defaultGreeting: defaultVoicemailGreeting(c.name),
      callerIdName: c.lineCallerIdName,
      defaultCallerIdName: defaultCallerIdName(c.name),
      canCall: Boolean(number && c.lineVoiceAppAt && (toE164(actorPhone) ?? c.lineForwardTo)),
    },
    releaseAt: number && !hasAddon(c) ? c.lineReleaseAt?.toISOString() ?? null : null,
    smsReady: Boolean(number && reg?.status === "ACTIVE"),
    registration: reg
      ? {
          status: reg.status,
          kind: reg.kind === "TOLL_FREE" ? "TOLL_FREE" : "10DLC",
          entityType: reg.entityType,
          brandStatus: reg.brandStatus,
          campaignStatus: reg.campaignStatus,
          assignmentStatus: reg.assignmentStatus,
          verificationStatus: reg.verificationStatus,
          rejectionReason: reg.rejectionReason,
          submittedAt: reg.submittedAt.toISOString(),
          approvedAt: reg.approvedAt?.toISOString() ?? null,
          lastCheckedAt: reg.lastCheckedAt?.toISOString() ?? null,
          form: {
            entityType: reg.entityType as BrandEntityType,
            legalName: reg.legalName,
            displayName: reg.displayName,
            ein: reg.ein,
            street: reg.street,
            city: reg.city,
            state: reg.state,
            postalCode: reg.postalCode,
            website: reg.website,
            vertical: reg.vertical,
            contactFirstName: reg.contactFirstName,
            contactLastName: reg.contactLastName,
            contactEmail: reg.contactEmail,
            contactPhone: reg.contactPhone,
            messageVolume: reg.messageVolume,
            useCase: reg.useCase,
          },
        }
      : null,
    defaults: {
      areaCode: normalizeAreaCode(c.phone) ?? "",
      forwardTo: c.phone ?? "",
      legalName: c.name,
      displayName: c.name,
      street: c.address ?? "",
      city: c.city ?? "",
      state: c.state ?? "",
      postalCode: c.zip ?? "",
      website: c.website ?? "",
      contactFirstName: first ?? "",
      contactLastName: rest.join(" "),
      contactEmail: actor?.email ?? c.email ?? "",
      contactPhone: c.phone ?? "",
    },
  };
}
