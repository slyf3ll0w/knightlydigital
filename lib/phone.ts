/**
 * Phone-number normalization for matching. Contacts store whatever was
 * typed ("(214) 555-0100", "+1 214.555.0100", "2145550100"); every
 * comparison — duplicate detection on the public forms, inbound-SMS routing,
 * CSV import — goes through here so the same person is the same person
 * however they typed it.
 */

/**
 * Digits used to identify a number: the last 10 for US numbers (drops the
 * leading 1 / +1), the raw digits for short local numbers with at least 7,
 * or null when there's nothing dialable to compare on.
 */
export function phoneDigits(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return digits.length >= 7 ? digits : null;
}
