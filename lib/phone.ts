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
  // "214-555-0100 x12" — the extension is not part of the number; folding it
  // in would mis-key the contact (…0100 x12 → 4555010012) so no inbound text
  // or duplicate check ever matches them again.
  const base = (phone ?? "").replace(/\s*(?:x|ext\.?|extension|#)\s*\d+\s*$/i, "");
  const digits = base.replace(/\D/g, "");
  // Only a leading country code 1 is dropped (11 digits → last 10). Longer
  // strings are kept whole rather than truncated: two unrelated numbers that
  // happen to share their last 10 digits must not become one person.
  if (digits.length === 11 && digits[0] === "1") return digits.slice(1);
  return digits.length >= 7 ? digits : null;
}
