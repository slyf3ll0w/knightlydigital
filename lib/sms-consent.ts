/**
 * SMS consent — the one rule every automated sender checks, plus the copy
 * shared by every place consent is collected. Kept free of server imports so
 * the public booking forms (client components) can use it too.
 *
 * Why it exists: toll-free verification (and the carriers behind it) require
 * documented, unchecked-by-default opt-in before a business texts a consumer.
 * A phone number on file is not consent. So: no smsConsentAt → no automated
 * text, ever, even with Telnyx live. STOP (Contact.smsOptOut) always wins.
 */

export const SMS_TERMS_URL = "https://workbenchfsm.com/sms-terms";

/** Checkbox label on the public booking / request forms. */
export function smsConsentLabel(businessName: string): string {
  return `Text me appointment reminders and updates from ${businessName} via WorkBench. Msg & data rates may apply. Msg frequency varies. Reply STOP to opt out, HELP for help.`;
}

export type SmsConsentFields = {
  phone: string | null;
  smsOptOut: boolean;
  smsConsentAt: Date | null;
};

/** A dialable phone, consent on file, and no STOP on record. */
export function canText(c: SmsConsentFields): boolean {
  return Boolean(c.phone) && c.smsConsentAt !== null && !c.smsOptOut;
}
