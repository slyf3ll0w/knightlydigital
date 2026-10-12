// App-wide feedback toast — one function, no provider.
//
// `toast("Saved")` from any client component dispatches a `wb:toast`
// CustomEvent on window; components/LiveToasts.tsx (mounted once by the
// AppShell) listens and renders it as a compact glass card under the live
// notification cards. Nothing to import but this file, nothing to mount.
//
// Also home to `kindForUrl`, the one mapping from a feed/push URL to the
// icon kind both the bell (app/api/app/notifications/route.ts) and the live
// cards (AppShell) use — pure, no React, safe to import server-side.

export type ToastTone = "good" | "neutral" | "bad";

export type ToastOptions = {
  /** Bold first line; `message` becomes the second line. Omit for one line. */
  title?: string;
  /** good = check icon (default), neutral = info, bad = warning. */
  tone?: ToastTone;
  /** Tapping the card goes here. */
  href?: string;
};

export type ToastDetail = {
  id: string;
  message: string;
  title?: string;
  tone: ToastTone;
  href?: string;
};

export const TOAST_EVENT = "wb:toast";

let seq = 0;

/**
 * Show a short confirmation ("Invoice sent", "Copied") anywhere in the app.
 * Safe to call during SSR (no-op without a window).
 */
export function toast(message: string, opts: ToastOptions = {}): void {
  if (typeof window === "undefined") return;
  const detail: ToastDetail = {
    id: `toast-${Date.now()}-${++seq}`,
    message,
    title: opts.title,
    tone: opts.tone ?? "good",
    href: opts.href,
  };
  window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail }));
}

/** Every icon kind a feed row or live card can wear. */
export type FeedKind =
  | "request"
  | "lead"
  | "booking"
  | "payment"
  | "invoice"
  | "quote"
  | "message"
  | "chat"
  | "call"
  | "task"
  | "automation";

/**
 * The icon for a notice, from where its tap lands. Agreements ride the
 * quote glyph; anything we don't recognise is an automation (the bell's
 * generic bolt).
 */
export function kindForUrl(url: string): FeedKind {
  if (url.startsWith("/app/chat")) return "chat";
  if (url.startsWith("/app/leads")) return "lead";
  if (url.startsWith("/app/requests")) return "request";
  if (url.startsWith("/app/quotes") || url.startsWith("/app/contracts")) return "quote";
  if (url.startsWith("/app/invoices")) return "invoice";
  if (url.startsWith("/app/payments")) return "payment";
  if (url.startsWith("/app/schedule") || url.startsWith("/app/appointments") || url.startsWith("/app/jobs")) return "booking";
  if (url.startsWith("/app/calls")) return "call";
  if (url.startsWith("/app/tasks")) return "task";
  if (url.startsWith("/app/messages")) return "message";
  return "automation";
}
