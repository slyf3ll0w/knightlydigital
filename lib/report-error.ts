import * as Sentry from "@sentry/nextjs";

/**
 * `reportError(...)` — a drop-in for `console.error(...)` inside catch blocks
 * and `.catch()` handlers that also sends the failure to Sentry.
 *
 * Why: `instrumentation.ts` only forwards UNCAUGHT errors. Almost every API
 * route and sender here catches, logs, and answers 500/false — so until now
 * those failures lived only in Railway's log scrollback. Same call shape as
 * console.error so a swap is mechanical:
 *
 *   reportError("[invoices] send failed", invoice.id, err);
 *
 * Grouping: the first string argument is the stable label ("[tag] what
 * failed"); ids and the error come after it as separate args, never
 * interpolated into the label, so one broken path is one Sentry issue.
 * Without a DSN (local, CI) Sentry's SDK is disabled and this is console.error.
 */
export function reportError(...args: unknown[]): void {
  console.error(...args);
  try {
    const err = args.find((a): a is Error => a instanceof Error);
    const label = args.find((a): a is string => typeof a === "string") ?? "error";
    const extra: Record<string, unknown> = {};
    args.forEach((a, i) => {
      if (a === err) return;
      extra[`arg${i}`] = serializable(a);
    });
    if (err) {
      Sentry.captureException(err, { tags: { where: label.slice(0, 190) }, extra });
    } else {
      // No Error object (a status code, a string, a plain object): group by
      // the label alone so a flapping id doesn't fan out into N issues.
      Sentry.captureMessage(label, { level: "error", fingerprint: [label], extra });
    }
  } catch {
    // Reporting must never throw into the path that is already failing.
  }
}

function serializable(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v === "string") return v.length > 2000 ? v.slice(0, 2000) + "…" : v;
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (v instanceof Error) return { name: v.name, message: v.message };
  try {
    const s = JSON.stringify(v, (_k, x) => (x instanceof Error ? { name: x.name, message: x.message } : x));
    return s && s.length > 4000 ? s.slice(0, 4000) + "…" : (s ?? String(v));
  } catch {
    return String(v);
  }
}
