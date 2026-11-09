import Link from "next/link";
import { CircleAlert, CircleCheck } from "lucide-react";
import { SQUARE_OUTCOME } from "@/lib/square-outcomes";

/**
 * Where the Square callback lands when consent ran in the SYSTEM browser
 * rather than the app — Square's sign-in page doesn't work inside the phone
 * app's webview, so the shell opens it in a browser sheet and the callback
 * comes back there (see app/api/app/square/callback/route.ts; the signed
 * state carries a native flag).
 *
 * Lives outside /app, as /quickbooks-connected does: /app/* URLs are
 * claimed by the mobile shells as App Links, which would hand this redirect
 * to the app and swallow the result. The connection itself was already made
 * by the callback; nothing on this page reads or writes account data — it
 * only says what happened and sends the owner back to the app.
 */

const TITLES: Record<string, string> = {
  connected: "Square connected",
  denied: "Connection cancelled",
  already_connected_elsewhere: "That Square account is taken",
  no_location: "No location that takes cards",
  exchange_failed: "Square didn't finish",
  merchant_lookup_failed: "Connected, with a hitch",
  bad_state: "That link expired",
  unauthorized: "That account can't connect Square",
  missing_params: "Square sent us back empty",
};

export default async function SquareConnectedPage({ searchParams }: { searchParams: Promise<{ square?: string }> }) {
  const { square } = await searchParams;
  const key = square && SQUARE_OUTCOME[square] ? square : "bad_state";
  const outcome = SQUARE_OUTCOME[key];
  const ok = outcome.tone === "good";
  const body = ok
    ? "You're all set. Close this and go back to WorkBench — Settings → Online Payments shows the connection within a few seconds."
    : `${outcome.text} Go back to WorkBench and press Connect Square again.`;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="card-ledger w-full max-w-md p-8 shadow-sm text-center">
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${ok ? "bg-green-100" : "bg-amber-100"}`}
        >
          {ok ? <CircleCheck className="text-green-600" size={22} /> : <CircleAlert className="text-amber-600" size={22} />}
        </div>
        <h1 className="text-lg font-semibold text-gray-900">{TITLES[key]}</h1>
        <p className="mt-2 text-sm text-gray-600">{body}</p>
        <Link
          href="/app/settings"
          className="mt-6 inline-flex items-center justify-center rounded-[10px] bg-green-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-600"
        >
          Open WorkBench
        </Link>
      </div>
    </div>
  );
}
