/**
 * Typing helpers for the client forms (streamline batch 1, 2026-10-16).
 * Pure, no DOM — unit-tested in scripts/test-phone-input.ts.
 */

/**
 * A US phone number formatted as it is typed: "2145" → "(214) 5",
 * "2145550100" → "(214) 555-0100", "12145550100" → "+1 (214) 555-0100".
 *
 * Anything that doesn't look like a US number is handed back untouched —
 * a foreign "+44…", an extension ("… ext 4"), or more than ten digits — so
 * the box never hides what someone typed. Deleting works backwards through
 * the format too: "(214) " loses its space on the next keystroke.
 */
export function formatPhoneAsTyped(raw: string): string {
  if (!raw) return "";
  if (/[a-zA-Z@]/.test(raw)) return raw;
  if (/^\s*\+(?!1)/.test(raw)) return raw;
  let digits = raw.replace(/\D/g, "");
  let plusOne = false;
  if (digits.length > 10 && digits.startsWith("1")) {
    digits = digits.slice(1);
    plusOne = true;
  } else if (/^\s*\+1/.test(raw) || /^\s*1[\s(-]/.test(raw)) {
    // "+1 (" typed before the area code — keep the prefix while it's short
    if (digits.startsWith("1")) digits = digits.slice(1);
    plusOne = true;
  }
  if (digits.length > 10) return raw;
  if (digits.length === 0) return plusOne ? "+1 " : "";
  const a = digits.slice(0, 3);
  const b = digits.slice(3, 6);
  const c = digits.slice(6, 10);
  let out: string;
  if (digits.length <= 3) out = `(${a}`;
  else if (digits.length <= 6) out = `(${a}) ${b}`;
  else out = `(${a}) ${b}-${c}`;
  return plusOne ? `+1 ${out}` : out;
}

/** True when the box holds something that is (or is becoming) a phone number, not an email. */
export function looksLikePhone(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  if (/[a-zA-Z@]/.test(s)) return false;
  return /\d/.test(s);
}

/**
 * "mike jones" → "Mike Jones". Only an all-lowercase value is touched: a
 * name someone capitalised themselves ("McDonald", "de la Cruz") stays
 * exactly as typed. Capitalises after spaces, hyphens and apostrophes.
 */
export function titleCaseName(raw: string): string {
  if (!raw || /[A-Z]/.test(raw)) return raw;
  return raw.replace(/(^|[\s\-'’])([a-z])/g, (_m, sep: string, ch: string) => `${sep}${ch.toUpperCase()}`);
}

/**
 * One "Name" box → first + last: the first word is the first name, the
 * rest is the last name ("Mary Ann Smith" → Mary / Ann Smith). Same rule
 * as the Leads board quick-add.
 */
export function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}
