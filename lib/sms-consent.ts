/**
 * SMS consent — the one rule every automated sender checks, plus the copy
 * shared by every place consent is collected. Kept free of server imports so
 * the public booking forms (client components) can use it too.
 *
 * The model (same as Jobber's): texts are ON by default for any client with a
 * phone on file. Everything we send is informational — appointment reminders,
 * schedule changes, invoice links, replies — and for that class the CTIA
 * messaging principles / TCPA treat the number the client gave the business as
 * the consent. The business attests to that once, company-wide, when it turns
 * text notifications on (Company.smsAcknowledgedAt; enforced in sendSms).
 *
 * Two things turn a client off: a STOP reply (Contact.smsOptOut, flipped by
 * the inbound webhook, always wins) and Contact.smsDisabled (staff switched
 * them off, or they left the SMS box unchecked when a booking form created
 * them). Contact.smsConsentAt is an audit record of an explicit opt-in when
 * there was one; it is not required to text.
 */

export const SMS_TERMS_URL = "https://workbenchfsm.com/sms-terms";

export const PRIVACY_URL = "https://workbenchfsm.com/privacy";

/**
 * The business's own texting terms and privacy policy, hosted by WorkBench
 * under its booking page. Carriers require both to be the BRAND's, not the
 * platform's (Telnyx TELNYX_FAILED, Lessly Holdings 2026-09-24): every
 * consent checkbox, the campaign filing and the HELP reply point here.
 * Relative when `base` is omitted (the public forms), absolute for filings.
 */
export function businessPageUrl(slug: string, base = ""): string {
  return `${base}/book/${slug}`;
}
export function businessSmsTermsUrl(slug: string, base = ""): string {
  return `${businessPageUrl(slug, base)}/sms-terms`;
}
export function businessPrivacyUrl(slug: string, base = ""): string {
  return `${businessPageUrl(slug, base)}/privacy`;
}

/**
 * Checkbox label on the public booking / request forms (unchecked by default).
 * Follows Telnyx's 10DLC opt-in template word for word where it matters —
 * use case, sender, frequency, rates, STOP/HELP, no third-party sharing —
 * because the carriers' reviewers compare against it
 * (support.telnyx.com/en/articles/10684260-10dlc-opt-in-form). The campaign
 * message flow (lib/business-line.ts campaignCopy) quotes this verbatim, so
 * changing it here changes what every future filing says.
 *
 * The business name must be the registered brand name exactly (it is: the
 * brand's display name is locked to Company.name), and nothing here may read
 * as marketing — quotes/estimates count as marketing to the carriers.
 */
export function smsConsentLabel(businessName: string): string {
  return `By checking this box, you agree to receive SMS appointment reminders, arrival and schedule updates, invoice and payment links, and replies to your messages from ${businessName}. Message frequency may vary. Msg & data rates may apply. Consent is not a condition of purchase. Reply STOP to opt out, HELP for help. We will not share your mobile information with third parties for promotional or marketing purposes.`;
}

/**
 * The phrase in an outgoing text that carriers would read as marketing, or
 * null. A business line's 10DLC campaign is registered for appointment,
 * billing and customer-care texts only (no MARKETING use case), and Telnyx
 * failed a campaign for merely mentioning quotes (2026-09-24). Used on texts
 * whose wording a person wrote (automations); our own templates are pinned by
 * campaignLint. The brand name is ignored so "Quote Pros" can text.
 */
export function marketingPhrase(text: string, brandName: string): string | null {
  const t = brandName ? text.split(brandName).join(" ") : text;
  const m = t.match(/\b(quotes?|estimates?|discounts?|coupons?|promo(tion|tional)?s?|promo codes?|limited[- ]time|special offers?|on sale|flash sale|deals? of|referral bonus)\b|\d+ ?% ?off\b|\$\d+ off\b/i);
  return m ? m[0] : null;
}

/** An owner-written text made fit to send: names the business first and carries the opt-out line. */
export function brandedText(text: string, brandName: string): string {
  let out = text.trim();
  if (!out.toLowerCase().includes(brandName.toLowerCase())) out = `${brandName}: ${out}`;
  if (!/\bSTOP\b/.test(out)) out = `${out} Reply STOP to opt out.`;
  return out;
}

export type SmsConsentFields = {
  phone: string | null;
  smsOptOut: boolean;
  smsDisabled: boolean;
};

/** A dialable phone, not switched off, and no STOP on record. */
export function canText(c: SmsConsentFields): boolean {
  return Boolean(c.phone) && !c.smsOptOut && !c.smsDisabled;
}
