import * as Sentry from "@sentry/nextjs";

// Server-side Sentry. With no NEXT_PUBLIC_SENTRY_DSN set the SDK disables
// itself, so this is a no-op everywhere until the var exists in Railway —
// local dev and CI never phone home.
export async function register() {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV,
    // Errors only — no performance tracing. Keeps us far inside the free
    // tier and the signal is exactly what launch-watching needs.
    tracesSampleRate: 0,
    // Tenant data must not ride along in error reports.
    sendDefaultPii: false,
  });
}

// Server Component / route handler errors surface through this hook —
// without it only unhandled process-level errors would be captured.
export const onRequestError = Sentry.captureRequestError;
