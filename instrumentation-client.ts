import * as Sentry from "@sentry/nextjs";

// Browser-side Sentry. NEXT_PUBLIC_SENTRY_DSN is inlined at build time, so
// this only activates on builds made with the var present (Railway). A DSN
// is a public write-only endpoint, not a secret.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Inlined at build time by next.config.ts (RAILWAY_ENVIRONMENT_NAME itself
  // never reaches the browser bundle).
  environment: process.env.NEXT_PUBLIC_RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV,
  tracesSampleRate: 0,
  sendDefaultPii: false,
  // Errors only. The default BrowserSession integration POSTs a "session"
  // envelope on every page load AND every client navigation — two extra
  // requests per page change on a phone, for release-health stats nobody
  // reads. Client reports (dropped-event tallies) are the same kind of noise.
  integrations: (defaults) => defaults.filter((i) => i.name !== "BrowserSession"),
  sendClientReports: false,
  ignoreErrors: [
    // Benign browser noise that would eat the error quota
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
    // Thrown by Microsoft's Office / Outlook browser extension (Safe Links)
    // from a script it injects into every page — nothing in this bundle
    // calls it, and it fires on client portal links opened from Outlook
    // (Sentry 8e8b1407, 2026-10-07).
    /Object Not Found Matching Id:\d+, MethodName:/,
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
