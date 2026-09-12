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

/** Checkbox label on the public booking / request forms (unchecked by default). */
export function smsConsentLabel(businessName: string): string {
  return `Text me appointment reminders and updates from ${businessName} via WorkBench. Msg & data rates may apply. Msg frequency varies. Reply STOP to opt out, HELP for help.`;
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
