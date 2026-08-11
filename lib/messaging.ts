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

/**
 * Whether this device can act on an sms: link — phones and tablets, plus
 * Macs (the Messages app handles sms:). Windows/Linux desktops have no
 * texting app, so text buttons should not render there. Client-side only;
 * false during SSR, so gate rendering behind a mounted check.
 */
export function canSendSms(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android|Macintosh/i.test(navigator.userAgent);
}

export const ON_MY_WAY_PLACEHOLDERS = [
  ["{{firstName}}", "client's first name"],
  ["{{lastName}}", "client's last name"],
  ["{{companyName}}", "your company name"],
  ["{{techName}}", "name of the person sending"],
  ["{{jobTitle}}", "the job's title"],
  ["{{address}}", "the job site address"],
  ["{{time}}", "the scheduled time"],
  ["{{eta}}", 'live drive-time estimate from where you are, e.g. "about 20 minutes out"'],
] as const;

export const DEFAULT_ON_MY_WAY_TEMPLATE =
  "Hi {{firstName}}, this is {{techName}} with {{companyName}} — I'm on my way to you now, {{eta}}. See you soon!";

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

/** "about 20 minutes out" — ETA rounded to a friendly 5-minute step. */
export function etaPhrase(minutes: number): string {
  const rounded = Math.max(5, Math.round(minutes / 5) * 5);
  return `about ${rounded} minutes out`;
}

/**
 * Resolve the {{eta}} token after the fact — the drive-time estimate is only
 * known when the tech actually taps the button (server-side render fills the
 * other placeholders and leaves this one in place). No estimate → the token
 * lifts out cleanly, including a leading comma/dash so the sentence still reads.
 */
export function fillEta(message: string, etaMinutes: number | null): string {
  if (!/\{\{\s*eta\s*\}\}/.test(message)) return message;
  if (etaMinutes != null && Number.isFinite(etaMinutes)) {
    return message.replace(/\{\{\s*eta\s*\}\}/g, etaPhrase(etaMinutes));
  }
  return message
    .replace(/\s*[,—–-]?\s*\{\{\s*eta\s*\}\}/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ ([,.!?;:])/g, "$1")
    .trim();
}
