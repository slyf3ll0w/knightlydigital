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

import { randomBytes } from "node:crypto";

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

/**
 * The WorkBench Call Control application (one per environment — its webhook
 * URL is fixed per app), created by `npx tsx scripts/telnyx-voice-setup.ts`.
 * Numbers assigned to it ring into /api/public/webhooks/telnyx/voice instead
 * of the number-level forwarding feature. Unset = plain forwarding.
 */
export function voiceAppId(): string {
  return process.env.TELNYX_VOICE_APP_ID ?? "";
}

export function voiceConfigured(): boolean {
  return Boolean(process.env.TELNYX_API_KEY && voiceAppId());
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

/** Same request, raw body back — the credential token endpoint answers a bare JWT, not JSON. */
async function callText(method: "POST", path: string): Promise<string> {
  const key = process.env.TELNYX_API_KEY;
  if (!key) throw new TelnyxError(0, "TELNYX_API_KEY is not set");
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, Accept: "*/*" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new TelnyxError(res.status, errorDetail(res.status, text));
  return text.trim();
}

/** URL-safe random alphanumerics (SIP connection usernames/passwords must be plain alphanumeric). */
function randomAlnum(length: number): string {
  let out = "";
  while (out.length < length) out += randomBytes(32).toString("base64").replace(/[^A-Za-z0-9]/g, "");
  return out.slice(0, length);
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

/**
 * Outbound caller-ID name (CNAM listing): what a called party's carrier shows
 * next to the number, when it does a lookup. Alphanumerics + spaces, ≤15.
 * Null switches the listing off. Propagation to the CNAM databases takes
 * days; carriers (and toll-free numbers) honour it unevenly.
 */
export async function setCnamListing(numberId: string, name: string | null): Promise<void> {
  await call("PATCH", `/phone_numbers/${numberId}/voice`, {
    cnam_listing: name ? { cnam_listing_enabled: true, cnam_listing_details: name } : { cnam_listing_enabled: false },
  });
}

export async function releaseNumber(numberId: string): Promise<void> {
  await call("DELETE", `/phone_numbers/${numberId}`);
}

/** Point the number's voice at a connection / Call Control app (null detaches it). */
export async function setNumberConnection(numberId: string, connectionId: string | null): Promise<void> {
  await call("PATCH", `/phone_numbers/${numberId}`, { connection_id: connectionId ?? "" });
}

/* ───────────────────────── Call Control (voice) ─────────────────────────
 * Every inbound call to a number on the WorkBench Call Control app arrives
 * as a `call.initiated` webhook; we answer, dial, whisper, bridge and record
 * by POSTing commands against the call's call_control_id. lib/voice.ts holds
 * the flow; these are the verbs. Command bodies follow the Telnyx v2 spec
 * (checked against the telnyx@7 SDK types, 2026-09-18).
 * ---------------------------------------------------------------------- */

export type DialInput = {
  /** E.164, or a SIP URI (sipUri) for a registered softphone. */
  to: string;
  from: string;
  /** Caller-ID name presented to the destination (SIP From display name) — the softphone shows it. */
  fromDisplayName?: string;
  /** Extra SIP headers on the INVITE (X-… names); the softphone reads them off the incoming call. */
  customHeaders?: Array<{ name: string; value: string }>;
  /** Base64 JSON — echoed back on every webhook for the new leg. */
  clientState?: string;
  /** Seconds to ring before Telnyx gives up (call.hangup with cause timeout). */
  timeoutSecs?: number;
  /** Share the call session with an existing leg (webhooks carry the same call_session_id). */
  linkTo?: string;
  /** Idempotency key: Telnyx drops a repeat within the dedupe window. */
  commandId?: string;
};

export type DialedCall = { call_control_id: string; call_leg_id?: string; call_session_id?: string };

export async function dialCall(input: DialInput): Promise<DialedCall> {
  const out = await call<{ data?: DialedCall }>("POST", "/calls", {
    connection_id: voiceAppId(),
    to: input.to,
    from: input.from,
    client_state: input.clientState,
    timeout_secs: input.timeoutSecs ?? 30,
    link_to: input.linkTo,
    command_id: input.commandId,
    from_display_name: input.fromDisplayName,
    custom_headers: input.customHeaders,
  });
  if (!out.data?.call_control_id) throw new TelnyxError(502, "Dial returned no call_control_id");
  return out.data;
}

export type CallCommand =
  | "answer"
  | "hangup"
  | "bridge"
  | "speak"
  | "gather_using_speak"
  | "playback_start"
  | "playback_stop"
  | "record_start"
  | "record_stop";

/**
 * One Call Control command. "Call has already ended" / not found is the
 * normal race (the caller left between our webhook and our command) — it is
 * swallowed here so orchestration code never has to special-case it; every
 * other failure (a bad parameter, say) throws so it is never mistaken for a
 * hang-up.
 */
export async function callAction(callControlId: string, action: CallCommand, body: Record<string, unknown> = {}): Promise<boolean> {
  try {
    await call("POST", `/calls/${encodeURIComponent(callControlId)}/actions/${action}`, body);
    return true;
  } catch (err) {
    const gone = err instanceof TelnyxError && (err.status === 404 || /no longer active|already ended|not found|hung up/i.test(err.detail));
    if (gone) {
      console.warn(`[telnyx] ${action} on ${callControlId} skipped: ${err.detail}`);
      return false;
    }
    throw err;
  }
}

/** Telnyx TTS: basic tier, female en-US — good enough for a whisper and a greeting. */
export const TTS = { voice: "female", language: "en-US" } as const;

export type RecordingRecord = {
  id?: string;
  status?: string;
  duration_millis?: number;
  call_leg_id?: string;
  download_urls?: { mp3?: string | null; wav?: string | null };
};

/** A stored call recording; the download URLs inside are short-lived, fetch on demand. */
export async function getRecording(recordingId: string): Promise<RecordingRecord | null> {
  try {
    const out = await call<{ data?: RecordingRecord }>("GET", `/recordings/${encodeURIComponent(recordingId)}`);
    return out.data ?? null;
  } catch (err) {
    if (err instanceof TelnyxError && err.status === 404) return null;
    throw err;
  }
}

/** Recordings made on one call leg (fallback when the saved-webhook carried no recording_id). */
export async function listRecordingsForLeg(callLegId: string): Promise<RecordingRecord[]> {
  const out = await call<{ data?: RecordingRecord[] }>("GET", "/recordings", undefined, {
    "filter[call_leg_id]": callLegId,
    "page[size]": 5,
  });
  return out.data ?? [];
}

/** Setup (scripts/telnyx-voice-setup.ts): the outbound profile every dial goes through. */
export async function createOutboundVoiceProfile(name: string): Promise<{ id: string }> {
  const out = await call<{ data?: { id?: string } }>("POST", "/outbound_voice_profiles", {
    name,
    traffic_type: "conversational",
    service_plan: "global", // the only combination Telnyx accepts today: conversational + global + rate-deck
    usage_payment_method: "rate-deck",
    whitelisted_destinations: ["US", "CA"],
    // No concurrent_call_limit: a level-1 Telnyx account rejects anything above
    // its own cap; the account default applies.
  });
  if (!out.data?.id) throw new TelnyxError(502, "No outbound voice profile id returned");
  return { id: out.data.id };
}

/** Setup: the Call Control application whose webhook is our voice route. */
export async function createCallControlApp(name: string, webhookUrl: string, outboundProfileId: string): Promise<{ id: string }> {
  const out = await call<{ data?: { id?: string } }>("POST", "/call_control_applications", {
    application_name: name,
    webhook_event_url: webhookUrl,
    webhook_api_version: "2",
    webhook_timeout_secs: 25,
    first_command_timeout: true,
    first_command_timeout_secs: 20,
    dtmf_type: "RFC 2833",
    inbound: { shaken_stir_enabled: true },
    outbound: { outbound_voice_profile_id: outboundProfileId },
  });
  if (!out.data?.id) throw new TelnyxError(502, "No call control application id returned");
  return { id: out.data.id };
}

/* ───────────────────────── Softphone (SIP credentials) ─────────────────────────
 * lib/softphone.ts: one credential connection per company, one telephony
 * credential per team member. The browser logs in with a short-lived JWT
 * minted from the credential and Call Control dials it as a SIP URI.
 * ---------------------------------------------------------------------- */

export const SIP_DOMAIN = "sip.telnyx.com";
/** Where Call Control reaches a registered softphone. */
export const sipUri = (username: string): string => `sip:${username}@${SIP_DOMAIN}`;

/**
 * A credential connection with NO outbound voice profile: browsers registered
 * under it can receive the legs we dial at them and nothing else (no PSTN
 * origination → no 911 → no E911 address on the number). The connection's
 * own username/password are never used by anyone — telephony credentials
 * (below) are what the browsers log in with — so they are random and
 * forgotten.
 *
 * sip_uri_calling_preference MUST be "internal": it is what lets a dial to
 * sip:<credential>@sip.telnyx.com from our own Call Control app reach the
 * registered browser. At the default (disabled) Telnyx answers every such
 * dial with SIP 403 after ~300 ms — the 2026-09-21 live test.
 */
export async function createCredentialConnection(name: string): Promise<{ id: string }> {
  const out = await call<{ data?: { id?: string } }>("POST", "/credential_connections", {
    connection_name: name.slice(0, 200),
    user_name: `wb${randomAlnum(24)}`,
    password: randomAlnum(40),
    active: true,
    sip_uri_calling_preference: "internal",
  });
  if (!out.data?.id) throw new TelnyxError(502, "No credential connection id returned");
  return { id: out.data.id };
}

/** Idempotent repair for a connection created before the preference was set (lib/softphone.ts runs it once per company per process). */
export async function ensureSipUriCalling(connectionId: string): Promise<void> {
  const out = await call<{ data?: { sip_uri_calling_preference?: string | null } }>("GET", `/credential_connections/${encodeURIComponent(connectionId)}`);
  const pref = out.data?.sip_uri_calling_preference;
  if (pref === "internal" || pref === "unrestricted") return;
  await call("PATCH", `/credential_connections/${encodeURIComponent(connectionId)}`, { sip_uri_calling_preference: "internal" });
  console.warn(`[telnyx] credential connection ${connectionId}: sip_uri_calling_preference ${pref ?? "unset"} → internal`);
}

export async function deleteCredentialConnection(id: string): Promise<void> {
  try {
    await call("DELETE", `/credential_connections/${encodeURIComponent(id)}`);
  } catch (err) {
    if (!(err instanceof TelnyxError && err.status === 404)) throw err;
  }
}

export type TelephonyCredential = { id: string; sip_username: string };

export async function createTelephonyCredential(connectionId: string, name: string): Promise<TelephonyCredential> {
  const out = await call<{ data?: { id?: string; sip_username?: string } }>("POST", "/telephony_credentials", {
    connection_id: connectionId,
    name: name.slice(0, 100),
  });
  if (!out.data?.id || !out.data.sip_username) throw new TelnyxError(502, "No telephony credential returned");
  return { id: out.data.id, sip_username: out.data.sip_username };
}

export async function deleteTelephonyCredential(id: string): Promise<void> {
  try {
    await call("DELETE", `/telephony_credentials/${encodeURIComponent(id)}`);
  } catch (err) {
    if (!(err instanceof TelnyxError && err.status === 404)) throw err;
  }
}

/** A JWT the browser logs in with (@telnyx/webrtc `login_token`). Short-lived; mint one per page load. */
export async function createCredentialToken(credentialId: string): Promise<string> {
  const text = await callText("POST", `/telephony_credentials/${encodeURIComponent(credentialId)}/token`);
  // Documented as a bare token; tolerate a JSON-wrapped one just in case.
  if (text.startsWith("{") || text.startsWith("\"")) {
    try {
      const j = JSON.parse(text) as string | { data?: string | { token?: string } };
      if (typeof j === "string") return j;
      if (typeof j.data === "string") return j.data;
      if (j.data && typeof j.data.token === "string") return j.data.token;
    } catch {
      /* fall through */
    }
  }
  if (!text) throw new TelnyxError(502, "Empty credential token");
  return text;
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
