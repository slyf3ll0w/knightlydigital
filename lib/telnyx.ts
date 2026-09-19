/**
 * Thin Telnyx REST client for the business-line feature (lib/business-line.ts):
 * number search + purchase, per-number voice/messaging settings, and the
 * 10DLC brand → campaign → number-assignment registration chain. Message
 * sending itself stays in lib/sms.ts.
 *
 * Every call is a plain fetch with a bounded timeout, and every failure is a
 * TelnyxError carrying Telnyx's own error detail — those strings are what we
 * surface to the tenant (a TCR rejection reason is only ever useful verbatim).
 *
 * Request/response shapes follow the Telnyx OpenAPI spec (checked against the
 * telnyx@7 SDK types, 2026-09-18). 10DLC endpoints answer bare JSON objects;
 * the rest wrap in `{ data }`.
 *
 * Env: TELNYX_API_KEY (required for anything), TELNYX_MESSAGING_PROFILE_ID
 * (every purchased number joins this profile so inbound texts hit our
 * webhook), TELNYX_10DLC_MOCK=1 (brand/campaign registered as mocks — no TCR
 * fees, statuses still flow; use on staging).
 */

const API = "https://api.telnyx.com/v2";
const TIMEOUT_MS = 20_000;

export class TelnyxError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(`Telnyx ${status}: ${detail}`);
    this.name = "TelnyxError";
    this.status = status;
    this.detail = detail;
  }
}

export function telnyxConfigured(): boolean {
  return Boolean(process.env.TELNYX_API_KEY && process.env.TELNYX_MESSAGING_PROFILE_ID);
}

export function messagingProfileId(): string {
  return process.env.TELNYX_MESSAGING_PROFILE_ID ?? "";
}

export function tenDlcMock(): boolean {
  return process.env.TELNYX_10DLC_MOCK === "1";
}

/** Pull the human-readable reason out of a Telnyx error body, whatever shape it took. */
function errorDetail(status: number, text: string): string {
  try {
    const j = JSON.parse(text) as {
      errors?: Array<{ title?: string; detail?: string }>;
      message?: string;
      detail?: string | Array<{ msg?: string }>;
      error?: string;
    };
    if (Array.isArray(j.errors) && j.errors.length) {
      return j.errors
        .map((e) => [e.title, e.detail].filter(Boolean).join(": "))
        .filter(Boolean)
        .join("; ");
    }
    if (typeof j.detail === "string") return j.detail;
    if (Array.isArray(j.detail)) return j.detail.map((d) => d.msg ?? "").filter(Boolean).join("; ");
    if (j.message) return j.message;
    if (j.error) return j.error;
  } catch {
    /* not JSON */
  }
  return text.slice(0, 300) || `HTTP ${status}`;
}

async function call<T>(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  query?: Record<string, string | number | boolean | undefined>
): Promise<T> {
  const key = process.env.TELNYX_API_KEY;
  if (!key) throw new TelnyxError(0, "TELNYX_API_KEY is not set");
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new TelnyxError(res.status, errorDetail(res.status, text));
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new TelnyxError(res.status, "Unexpected non-JSON response");
  }
}

/* ───────────────────────── Numbers ───────────────────────── */

export type AvailableNumber = {
  phone_number: string;
  features?: Array<{ name: string }>;
  cost_information?: { upfront_cost?: string; monthly_cost?: string; currency?: string };
  region_information?: Array<{ region_type: string; region_name: string }>;
};

/** Local US numbers in one area code that can do both SMS and voice. */
export async function searchLocalNumbers(areaCode: string, limit = 10): Promise<AvailableNumber[]> {
  const out = await call<{ data?: AvailableNumber[] }>("GET", "/available_phone_numbers", undefined, {
    "filter[country_code]": "US",
    "filter[national_destination_code]": areaCode,
    "filter[phone_number_type]": "local",
    "filter[features][]": "sms",
    "filter[limit]": limit,
    "filter[best_effort]": false,
  });
  // The features filter is single-valued in query form; drop anything voiceless here.
  return (out.data ?? []).filter((n) => {
    const f = new Set((n.features ?? []).map((x) => x.name));
    return f.has("sms") && f.has("voice");
  });
}

/** US toll-free numbers (8xx) that can text. Telnyx picks from all toll-free prefixes. */
export async function searchTollFreeNumbers(limit = 10): Promise<AvailableNumber[]> {
  const out = await call<{ data?: AvailableNumber[] }>("GET", "/available_phone_numbers", undefined, {
    "filter[country_code]": "US",
    "filter[phone_number_type]": "toll_free",
    "filter[features][]": "sms",
    "filter[limit]": limit,
    "filter[best_effort]": false,
  });
  return (out.data ?? []).filter((n) => {
    const f = new Set((n.features ?? []).map((x) => x.name));
    return f.has("sms") && f.has("voice");
  });
}

export const isTollFreeNumber = (e164: string): boolean => /^\+18(00|33|44|55|66|77|88)\d{7}$/.test(e164);

export type NumberOrder = {
  id?: string;
  status?: "pending" | "success" | "failure";
  phone_numbers?: Array<{ id?: string; phone_number?: string; status?: string }>;
};

/** Buy one number straight onto the WorkBench messaging profile. */
export async function orderNumber(phoneNumber: string, customerReference: string): Promise<NumberOrder> {
  const out = await call<{ data?: NumberOrder }>("POST", "/number_orders", {
    phone_numbers: [{ phone_number: phoneNumber }],
    messaging_profile_id: messagingProfileId(),
    customer_reference: customerReference,
  });
  return out.data ?? {};
}

export async function getNumberOrder(orderId: string): Promise<NumberOrder> {
  const out = await call<{ data?: NumberOrder }>("GET", `/number_orders/${orderId}`);
  return out.data ?? {};
}

export type PhoneNumberRecord = {
  id: string;
  phone_number: string;
  status?: string;
  messaging_profile_id?: string | null;
  connection_id?: string | null;
  call_forwarding_enabled?: boolean;
  emergency_enabled?: boolean;
};

/** The phone_numbers resource for a number we own (null while an order is still settling). */
export async function findOwnedNumber(phoneNumber: string): Promise<PhoneNumberRecord | null> {
  const out = await call<{ data?: PhoneNumberRecord[] }>("GET", "/phone_numbers", undefined, {
    "filter[phone_number]": phoneNumber,
    "page[size]": 5,
  });
  return (out.data ?? []).find((n) => n.phone_number === phoneNumber) ?? null;
}

export async function setNumberMessagingProfile(numberId: string): Promise<void> {
  await call("PATCH", `/phone_numbers/${numberId}/messaging`, {
    messaging_profile_id: messagingProfileId(),
  });
}

/**
 * Number-level call forwarding — inbound calls to the business line ring the
 * owner's real cell, caller sees the business number. No connection or Call
 * Control app involved, which is why voice can be live the minute the number
 * is bought. Pass null to switch forwarding off.
 */
export async function setCallForwarding(numberId: string, forwardsTo: string | null): Promise<void> {
  await call("PATCH", `/phone_numbers/${numberId}/voice`, {
    call_forwarding: forwardsTo
      ? { call_forwarding_enabled: true, forwarding_type: "always", forwards_to: forwardsTo }
      : { call_forwarding_enabled: false },
  });
}

export async function releaseNumber(numberId: string): Promise<void> {
  await call("DELETE", `/phone_numbers/${numberId}`);
}

/* ───────────────────────── 10DLC ───────────────────────── */

export type BrandEntityType = "PRIVATE_PROFIT" | "SOLE_PROPRIETOR";

export type BrandInput = {
  entityType: BrandEntityType;
  displayName: string;
  companyName: string;
  ein?: string | null;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  website?: string | null;
  vertical: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /** Sole proprietors verify by OTP to this mobile. */
  mobilePhone?: string | null;
  webhookURL?: string;
};

export type TelnyxBrand = {
  brandId?: string;
  tcrBrandId?: string;
  identityStatus?: "VERIFIED" | "UNVERIFIED" | "SELF_DECLARED" | "VETTED_VERIFIED";
  status?: "OK" | "REGISTRATION_PENDING" | "REGISTRATION_FAILED";
  failureReasons?: string;
  entityType?: string;
  mock?: boolean;
};

export async function createBrand(input: BrandInput): Promise<TelnyxBrand> {
  return call<TelnyxBrand>("POST", "/10dlc/brand", {
    entityType: input.entityType,
    displayName: input.displayName,
    companyName: input.companyName,
    ein: input.entityType === "PRIVATE_PROFIT" ? input.ein ?? undefined : undefined,
    country: "US",
    street: input.street,
    city: input.city,
    state: input.state,
    postalCode: input.postalCode,
    website: input.website || undefined,
    vertical: input.vertical,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    businessContactEmail: input.email,
    phone: input.phone,
    mobilePhone: input.mobilePhone || undefined,
    isReseller: false,
    mock: tenDlcMock(),
    webhookURL: input.webhookURL,
  });
}

export async function getBrand(brandId: string): Promise<TelnyxBrand> {
  return call<TelnyxBrand>("GET", `/10dlc/brand/${brandId}`);
}

/** Sole proprietor only: text the owner the PIN they enter back in the app. */
export async function triggerBrandOtp(brandId: string, businessName: string): Promise<void> {
  await call("POST", `/10dlc/brand/${brandId}/smsOtp`, {
    pinSms: `${businessName}: your texting verification PIN is @OTP_PIN@. Enter it in WorkBench within 24 hours.`,
    successSms: `${businessName}: verified — your texting registration is moving to carrier review.`,
  });
}

export async function verifyBrandOtp(brandId: string, otpPin: string): Promise<void> {
  await call("PUT", `/10dlc/brand/${brandId}/smsOtp`, { otpPin });
}

export type CampaignInput = {
  brandId: string;
  description: string;
  messageFlow: string;
  samples: string[];
  privacyPolicyLink: string;
  termsAndConditionsLink: string;
  webhookURL?: string;
};

export type TelnyxCampaign = {
  campaignId?: string;
  tcrCampaignId?: string;
  campaignStatus?: string;
  submissionStatus?: "CREATED" | "FAILED" | "PENDING";
  failureReasons?: string;
  isTMobileRegistered?: boolean;
};

/**
 * Low-volume mixed campaign — the cheapest tier ($1.50/mo) that covers a
 * service business's whole traffic mix: reminders, quote/invoice links,
 * conversational replies. Under ~2,000 msgs/day, which no 1–8 tech shop hits.
 */
export async function createCampaign(input: CampaignInput): Promise<TelnyxCampaign> {
  const [s1, s2, s3, s4, s5] = input.samples;
  return call<TelnyxCampaign>("POST", "/10dlc/campaignBuilder", {
    brandId: input.brandId,
    usecase: "LOW_VOLUME",
    subUsecases: ["ACCOUNT_NOTIFICATION", "CUSTOMER_CARE"],
    description: input.description,
    messageFlow: input.messageFlow,
    sample1: s1,
    sample2: s2,
    sample3: s3,
    sample4: s4,
    sample5: s5,
    embeddedLink: true,
    embeddedPhone: false,
    numberPool: false,
    ageGated: false,
    directLending: false,
    subscriberOptin: true,
    subscriberOptout: true,
    subscriberHelp: true,
    optinKeywords: "START,UNSTOP",
    optinMessage: "You are opted in to texts from this business. Reply STOP to opt out, HELP for help. Msg&data rates may apply.",
    optoutKeywords: "STOP,STOPALL,UNSUBSCRIBE,CANCEL,END,QUIT",
    optoutMessage: "You have been unsubscribed and will receive no further texts from this number. Reply START to opt back in.",
    helpKeywords: "HELP,INFO",
    helpMessage: "This number sends appointment and billing texts from the business you hired. Reply STOP to opt out. Support: workbenchfsm.com/sms-terms",
    privacyPolicyLink: input.privacyPolicyLink,
    termsAndConditionsLink: input.termsAndConditionsLink,
    termsAndConditions: true,
    autoRenewal: true,
    mock: tenDlcMock(),
    webhookURL: input.webhookURL,
  });
}

export async function getCampaign(campaignId: string): Promise<TelnyxCampaign> {
  return call<TelnyxCampaign>("GET", `/10dlc/campaign/${campaignId}`);
}

export type NumberCampaign = {
  phoneNumber?: string;
  campaignId?: string;
  assignmentStatus?:
    | "FAILED_ASSIGNMENT"
    | "PENDING_ASSIGNMENT"
    | "ASSIGNED"
    | "PENDING_UNASSIGNMENT"
    | "FAILED_UNASSIGNMENT";
  failureReasons?: string;
};

/** Bind the number to the campaign. The number must already sit on a messaging profile. */
export async function assignNumberToCampaign(phoneNumber: string, campaignId: string): Promise<NumberCampaign> {
  return call<NumberCampaign>("POST", "/10dlc/phone_number_campaigns", { phoneNumber, campaignId });
}

export async function getNumberCampaign(phoneNumber: string): Promise<NumberCampaign | null> {
  try {
    return await call<NumberCampaign>("GET", `/10dlc/phone_number_campaigns/${encodeURIComponent(phoneNumber)}`);
  } catch (err) {
    if (err instanceof TelnyxError && err.status === 404) return null;
    throw err;
  }
}

export async function unassignNumberFromCampaign(phoneNumber: string): Promise<void> {
  try {
    await call("DELETE", `/10dlc/phone_number_campaigns/${encodeURIComponent(phoneNumber)}`);
  } catch (err) {
    if (err instanceof TelnyxError && err.status === 404) return;
    throw err;
  }
}

/* ───────────────────────── Toll-free verification ─────────────────────────
 * Toll-free numbers skip 10DLC entirely: one verification request per number,
 * reviewed by the toll-free aggregator (free, 1–2 weeks). Same two-party rule —
 * the request is filed as the business that will be texting.
 * ------------------------------------------------------------------------ */

export type TollFreeStatus =
  | "Verified"
  | "Rejected"
  | "Waiting For Vendor"
  | "Waiting For Customer"
  | "Waiting For Telnyx"
  | "In Progress";

export type TollFreeVerificationInput = {
  phoneNumber: string;
  businessName: string;
  doingBusinessAs?: string | null;
  entityType: "PRIVATE_PROFIT" | "SOLE_PROPRIETOR";
  ein?: string | null;
  addr1: string;
  city: string;
  /** Full state name — "Texas", not "TX". */
  state: string;
  zip: string;
  website: string;
  contactFirstName: string;
  contactLastName: string;
  contactEmail: string;
  contactPhone: string;
  /** Telnyx volume bucket: "10" | "100" | "1,000" | "10,000" | … */
  messageVolume: string;
  /** Telnyx use-case category, e.g. "Appointments". */
  useCase: string;
  useCaseSummary: string;
  productionMessageContent: string;
  optInWorkflow: string;
  optInImageUrls: string[];
  additionalInformation: string;
  privacyPolicyURL: string;
  termsAndConditionURL: string;
  webhookUrl?: string;
};

export type TollFreeVerification = {
  id?: string;
  verificationRequestId?: string;
  verificationStatus?: TollFreeStatus;
  phoneNumbers?: Array<{ phoneNumber: string }>;
  businessName?: string;
  /** Some responses carry the reviewer's note here. */
  reason?: string;
};

function tollFreeBody(i: TollFreeVerificationInput) {
  return {
    phoneNumbers: [{ phoneNumber: i.phoneNumber }],
    businessName: i.businessName,
    doingBusinessAs: i.doingBusinessAs || undefined,
    entityType: i.entityType,
    businessRegistrationNumber: i.ein || undefined,
    businessRegistrationType: i.ein ? "EIN" : undefined,
    businessRegistrationCountry: i.ein ? "US" : undefined,
    businessAddr1: i.addr1,
    businessCity: i.city,
    businessState: i.state,
    businessZip: i.zip,
    corporateWebsite: i.website,
    businessContactFirstName: i.contactFirstName,
    businessContactLastName: i.contactLastName,
    businessContactEmail: i.contactEmail,
    businessContactPhone: i.contactPhone,
    messageVolume: i.messageVolume,
    useCase: i.useCase,
    useCaseSummary: i.useCaseSummary,
    productionMessageContent: i.productionMessageContent,
    optInWorkflow: i.optInWorkflow,
    optInWorkflowImageURLs: i.optInImageUrls.map((url) => ({ url })),
    additionalInformation: i.additionalInformation,
    isvReseller: "WorkBench (Streamflaire Group LLC)",
    optInKeywords: "START,UNSTOP",
    optInConfirmationResponse:
      "You are opted in to texts from this business. Reply STOP to opt out, HELP for help. Msg&data rates may apply.",
    helpMessageResponse:
      "This number sends appointment and billing texts from the business you hired. Reply STOP to opt out. Support: workbenchfsm.com/sms-terms",
    privacyPolicyURL: i.privacyPolicyURL,
    termsAndConditionURL: i.termsAndConditionURL,
    ageGatedContent: false,
    webhookUrl: i.webhookUrl,
  };
}

export async function createTollFreeVerification(input: TollFreeVerificationInput): Promise<TollFreeVerification> {
  return call<TollFreeVerification>("POST", "/messaging_tollfree/verification/requests", tollFreeBody(input));
}

/** Re-file an existing request — the path Telnyx wants when a request is "Waiting For Customer". */
export async function updateTollFreeVerification(id: string, input: TollFreeVerificationInput): Promise<TollFreeVerification> {
  return call<TollFreeVerification>("PATCH", `/messaging_tollfree/verification/requests/${id}`, tollFreeBody(input));
}

export async function getTollFreeVerification(id: string): Promise<TollFreeVerification> {
  return call<TollFreeVerification>("GET", `/messaging_tollfree/verification/requests/${id}`);
}

/** Every request ever filed for this number, newest first. */
export async function listTollFreeVerifications(phoneNumber: string): Promise<TollFreeVerification[]> {
  const out = await call<{ records?: TollFreeVerification[]; data?: TollFreeVerification[] }>(
    "GET",
    "/messaging_tollfree/verification/requests",
    undefined,
    { phone_number: phoneNumber, page: 1, page_size: 20 }
  );
  return out.records ?? out.data ?? [];
}

/** The reviewer's reason for the latest status change (rejections, requests for info). */
export async function tollFreeStatusReason(id: string): Promise<string | null> {
  try {
    const out = await call<{ records?: Array<{ status?: string; reason?: string; createdAt?: string }>; data?: Array<{ status?: string; reason?: string }> }>(
      "GET",
      `/messaging_tollfree/verification/requests/${id}/status_history`,
      undefined,
      { page: 1, page_size: 5 }
    );
    const rows = out.records ?? out.data ?? [];
    const withReason = rows.find((r) => r.reason);
    return withReason?.reason ?? null;
  } catch {
    return null;
  }
}
