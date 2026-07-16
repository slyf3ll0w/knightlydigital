// Client-contact deep links + the "On my way" text template.
//
// These texts are free by design: tapping the button opens the tech's own
// Messages app pre-filled (sms: deep link), so the message goes out from
// their real number — the client can reply or call back, and there's no
// SMS provider, per-message cost, or A2P 10DLC registration involved.
// If provider-sent (automated) SMS is added later, it should live in a
// lib/sms.ts mirroring the env-gated Resend pattern in lib/email.ts.

/** Strip formatting so tel:/sms: links work: keep digits and a leading +. */
function dialable(phone: string): string {
  const trimmed = phone.trim();
  return (trimmed.startsWith("+") ? "+" : "") + trimmed.replace(/\D/g, "");
}

export function telHref(phone: string): string {
  return `tel:${dialable(phone)}`;
}

/**
 * sms: link, optionally pre-filled. iOS expects `sms:number&body=`,
 * Android `sms:number?body=` — call isApplePlatform() client-side and
 * pass the result as `apple`.
 */
export function smsHref(phone: string, body?: string, apple?: boolean): string {
  const num = dialable(phone);
  if (!body) return `sms:${num}`;
  return `sms:${num}${apple ? "&" : "?"}body=${encodeURIComponent(body)}`;
}

/** True on iPhone/iPad/Mac (client-side only; false during SSR). */
export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
}

export const ON_MY_WAY_PLACEHOLDERS = [
  ["{{firstName}}", "client's first name"],
  ["{{lastName}}", "client's last name"],
  ["{{companyName}}", "your company name"],
  ["{{techName}}", "name of the person sending"],
  ["{{jobTitle}}", "the job's title"],
  ["{{address}}", "the job site address"],
  ["{{time}}", "the scheduled time"],
] as const;

export const DEFAULT_ON_MY_WAY_TEMPLATE =
  "Hi {{firstName}}, this is {{techName}} with {{companyName}} — I'm on my way to you now. See you soon!";

/**
 * Fill {{placeholders}} into a message template. Unknown or empty
 * placeholders vanish; doubled spaces left behind are collapsed.
 */
export function renderMessageTemplate(
  template: string,
  vars: Record<string, string | null | undefined>
): string {
  return template
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars[key] ?? "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ ([,.!?;:])/g, "$1")
    .trim();
}
