/**
 * The keypad's number handling (components/DialPad.tsx), kept pure so it can
 * be tested: what a paste or a keystroke leaves in the field, and how the
 * field shows it. Unit tests: scripts/test-dial-format.ts.
 */

/** The keypad field holds at most this many characters. */
export const DIAL_MAX = 20;

/**
 * What survives of typed or pasted text: digits, * # and a leading +. A
 * pasted US number in any of its dressings — "(469) 833-5853",
 * "+1 469-833-5853", "1 (469) 833 5853", "tel:+14698335853" — becomes the
 * ten digits, so the field never shows a "+1 " that pushes the number past
 * its edge (the desktop keypad is 236 px wide; every extra character of a
 * long number was being cut off). Other countries keep their + and country
 * code as typed.
 */
export function normalizeDialed(raw: string, max = DIAL_MAX): string {
  let v = raw.replace(/[^0-9*#+]/g, "");
  // A + only means anything at the front.
  v = v.replace(/(?!^)\+/g, "");
  if (/^\+?1\d{10}$/.test(v)) v = v.slice(-10);
  return v.slice(0, max);
}

/** "469" → "469-833" → "(469) 833-5853" as the digits arrive; +1 and anything odd shown as typed. */
export function fmtDialing(value: string): string {
  if (!value) return "";
  if (value.startsWith("+") && !value.startsWith("+1")) return value;
  if (/[*#]/.test(value)) return value;
  let d = value.replace(/\D/g, "");
  let prefix = "";
  if (value.startsWith("+1") || (d.length === 11 && d.startsWith("1"))) {
    d = d.replace(/^1/, "");
    prefix = "+1 ";
  }
  if (d.length > 10) return value;
  if (d.length <= 3) return prefix + d;
  if (d.length <= 7) return `${prefix}${d.slice(0, 3)}-${d.slice(3)}`;
  return `${prefix}(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/**
 * The display's font size steps down as the number grows, so a full
 * "(469) 833-5853" (14 chars) or an international "+44 20 7946 0958" still
 * fits the 236 px keypad column instead of running past the field's edges.
 */
export function dialDisplaySize(shown: string): "lg" | "md" | "sm" {
  if (shown.length <= 12) return "lg";
  if (shown.length <= 16) return "md";
  return "sm";
}
