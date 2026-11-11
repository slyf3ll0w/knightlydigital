/**
 * What a team member can be alerted about, and how (2026-11-10: "a way to
 * customize your notifications"). Client-safe — My Profile renders the
 * switches from this list; lib/push.ts notifyUsers filters by it.
 *
 * Each notifyUsers call names its event. A call without one is an ACCOUNT
 * alert (online payments approved, Square disconnected, texting registration,
 * business-line limits) — those always go out and have no switch.
 *
 * Channels: push (phone / browser), bell (the in-app list), email (to the
 * person's own sign-in address — separate from the company-inbox emails,
 * which Settings and the Email alerts card govern). No stored row = the
 * default below, so nothing changes for anyone until they flip a switch.
 */

export const NOTIFICATION_EVENTS = [
  { key: "requests", label: "New requests, leads and bookings", hint: "Website forms, online bookings, bookings waiting for your OK" },
  { key: "client_messages", label: "Client messages", hint: "Texts, hub messages and website chat" },
  { key: "team_chat", label: "Team chat" },
  { key: "tasks", label: "Tasks", hint: "Someone gave you a task, task reminders" },
  { key: "reminders", label: "Up next", hint: "Before your next job or appointment" },
  { key: "payments", label: "Payments received" },
  { key: "payment_problems", label: "Payment problems", hint: "Failed payments and refunds, autopay stopped, gift cards that need you" },
  { key: "quotes", label: "Quotes approved" },
  { key: "views", label: "A client opened something", hint: "A quote, invoice or email you sent" },
  { key: "documents", label: "Sending documents", hint: "Sent, or couldn't be sent" },
  { key: "calls", label: "Missed calls and voicemail" },
  { key: "automations", label: "Automation alerts", hint: "From your automations' Notify step" },
] as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number]["key"];
export const NOTIFICATION_CHANNELS = ["push", "bell", "email"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const CHANNEL_LABEL: Record<NotificationChannel, string> = { push: "Push", bell: "Bell", email: "Email" };

/** On unless turned off: push and the bell. Email is opt-in (it would double the company inbox). */
export function defaultPreference(channel: NotificationChannel): boolean {
  return channel !== "email";
}

export function isNotificationEvent(v: unknown): v is NotificationEvent {
  return typeof v === "string" && NOTIFICATION_EVENTS.some((e) => e.key === v);
}

export function isNotificationChannel(v: unknown): v is NotificationChannel {
  return typeof v === "string" && (NOTIFICATION_CHANNELS as readonly string[]).includes(v);
}

export type PreferenceMap = Record<NotificationEvent, Record<NotificationChannel, boolean>>;

/** Stored rows → the full grid with defaults filled in. */
export function preferenceMap(rows: { event: string; channel: string; enabled: boolean }[]): PreferenceMap {
  const map = {} as PreferenceMap;
  for (const e of NOTIFICATION_EVENTS) {
    map[e.key] = { push: defaultPreference("push"), bell: defaultPreference("bell"), email: defaultPreference("email") };
  }
  for (const r of rows) {
    if (isNotificationEvent(r.event) && isNotificationChannel(r.channel)) map[r.event][r.channel] = r.enabled;
  }
  return map;
}
