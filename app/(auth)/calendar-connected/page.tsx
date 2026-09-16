import Link from "next/link";
import { CalendarCheck, CircleAlert } from "lucide-react";

/**
 * Where the Google Calendar callback lands when it finished in the SYSTEM
 * browser rather than the app — the native shell can't load
 * accounts.google.com in its webview, so consent happens in Safari/Chrome
 * and comes back without the WorkBench session (see the callback route).
 *
 * Lives outside /app for two reasons: there is no session here to gate on,
 * and /app/* URLs are claimed by the mobile shells as App Links, which would
 * hand this callback to the app and swallow the result. The connection itself
 * was already authorised by the signed state; nothing on this page reads or
 * writes account data — it only says what happened and sends the user back.
 */

const OUTCOMES: Record<string, { ok: boolean; title: string; body: string }> = {
  connected: {
    ok: true,
    title: "Google Calendar connected",
    body: "Your schedule is being added to Google now. Close this tab and return to WorkBench — the Calendar sync card will show it within a few seconds.",
  },
  denied: {
    ok: false,
    title: "Connection cancelled",
    body: "Nothing was changed. Return to WorkBench and tap Connect Google Calendar again if you'd like to retry.",
  },
  bad_state: {
    ok: false,
    title: "That link expired",
    body: "Connection links are good for ten minutes. Return to WorkBench and tap Connect Google Calendar again.",
  },
  exchange_failed: {
    ok: false,
    title: "Google didn't finish",
    body: "Google accepted the sign-in but wouldn't hand over the connection. Return to WorkBench and try again in a moment.",
  },
  missing_params: {
    ok: false,
    title: "Google sent us back empty",
    body: "No authorisation code came back from Google. Return to WorkBench and try again.",
  },
};

export default async function CalendarConnectedPage({
  searchParams,
}: {
  searchParams: Promise<{ gcal?: string }>;
}) {
  const { gcal } = await searchParams;
  const outcome = OUTCOMES[gcal ?? ""] ?? OUTCOMES.bad_state;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="card-ledger w-full max-w-md p-8 shadow-sm text-center">
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${
            outcome.ok ? "bg-green-100" : "bg-amber-100"
          }`}
        >
          {outcome.ok ? (
            <CalendarCheck className="text-green-600" size={22} />
          ) : (
            <CircleAlert className="text-amber-600" size={22} />
          )}
        </div>
        <h1 className="text-lg font-semibold text-gray-900">{outcome.title}</h1>
        <p className="mt-2 text-sm text-gray-600">{outcome.body}</p>
        <Link
          href="/app/settings/profile#calendar-sync"
          className="mt-6 inline-flex items-center justify-center rounded-[10px] bg-green-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-600"
        >
          Open WorkBench
        </Link>
      </div>
    </div>
  );
}
