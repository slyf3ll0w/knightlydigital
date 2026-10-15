import Link from "next/link";
import { CircleAlert, CircleCheck } from "lucide-react";

/**
 * Where the QuickBooks callback lands when it finished in the SYSTEM browser
 * rather than the app — the native shell can't load Intuit's consent screen
 * in its webview, so consent happens in Safari/Chrome and comes back without
 * the WorkBench session (see app/api/app/quickbooks/callback/route.ts).
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
    title: "QuickBooks connected",
    body: "Your clients and invoices are syncing now. Close this tab and return to WorkBench — the QuickBooks page shows the progress within a few seconds.",
  },
  denied: {
    ok: false,
    title: "Connection cancelled",
    body: "Nothing was changed. Return to WorkBench and press Connect to QuickBooks again if you'd like to retry.",
  },
  bad_state: {
    ok: false,
    title: "That link expired",
    body: "Connection links are good for ten minutes. Return to WorkBench and press Connect to QuickBooks again.",
  },
  unauthorized: {
    ok: false,
    title: "That account can't connect QuickBooks",
    body: "Only an owner or admin can link QuickBooks. Sign in to WorkBench as one and try again.",
  },
  exchange_failed: {
    ok: false,
    title: "QuickBooks didn't finish",
    body: "QuickBooks accepted the sign-in but wouldn't hand over the connection. Return to WorkBench and try again in a moment.",
  },
  missing_params: {
    ok: false,
    title: "QuickBooks sent us back empty",
    body: "No authorisation code came back from QuickBooks. Return to WorkBench and try again.",
  },
};

export default async function QuickBooksConnectedPage({
  searchParams,
}: {
  searchParams: Promise<{ qbo?: string }>;
}) {
  const { qbo } = await searchParams;
  const outcome = OUTCOMES[qbo ?? ""] ?? OUTCOMES.bad_state;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="card-ledger w-full max-w-md p-8 shadow-sm text-center">
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${
            outcome.ok ? "bg-green-100" : "bg-amber-100"
          }`}
        >
          {outcome.ok ? (
            <CircleCheck className="text-green-600" size={22} />
          ) : (
            <CircleAlert className="text-amber-600" size={22} />
          )}
        </div>
        <h1 className="text-lg font-semibold text-gray-900">{outcome.title}</h1>
        <p className="mt-2 text-sm text-gray-600">{outcome.body}</p>
        <Link
          href="/app/settings/quickbooks"
          className="mt-6 inline-flex items-center justify-center rounded-[10px] bg-green-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-600"
        >
          Open WorkBench
        </Link>
      </div>
    </div>
  );
}
