/**
 * SMS consent — the one rule every automated sender checks, plus the copy
 * shared by every place consent is collected. Kept free of server imports so
 * the public booking forms (client components) can use it too.
 *
 * The model (same as Jobber's): texts are ON by default for any client with a
 * phone on file. Everything we send is informational — appointment reminders,
 * schedule changes, quote and invoice links — and for that class the CTIA
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
 * Checkbox label on the public booking / request forms (unchecked by default).
 * Follows Telnyx's 10DLC opt-in template word for word where it matters —
 * use case, sender, frequency, rates, STOP/HELP, no third-party sharing —
 * because the carriers' reviewers compare against it
 * (support.telnyx.com/en/articles/10684260-10dlc-opt-in-form). The campaign
 * message flow (lib/business-line.ts campaignCopy) quotes this verbatim, so
 * changing it here changes what every future filing says.
 */
export function smsConsentLabel(businessName: string): string {
  return `By checking this box, you agree to receive SMS appointment reminders, schedule updates, and quote and invoice links from ${businessName} (sent via WorkBench). Message frequency may vary. Msg & data rates may apply. Reply STOP to opt out, HELP for help. We will not share your mobile information with third parties for promotional or marketing purposes.`;
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
