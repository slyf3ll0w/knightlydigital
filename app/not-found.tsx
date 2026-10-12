import Link from "next/link";
import { headers } from "next/headers";
import ForceLightTheme from "@/components/ForceLightTheme";

/**
 * The site-wide 404. Before this file existed, Next's bare framework page
 * ("404 | This page could not be found", following the device's dark
 * setting) answered every unmatched URL — a mistyped /app address, a
 * voided agreement, a rotated portal link, a bad pay or quote token — with
 * no company name and nowhere to go (audit 2026-10-12).
 *
 * Two readers, two messages: someone inside the app gets the in-app
 * "That page is gone" card and a way home; a customer who followed a link
 * is told the link no longer works and to contact the business. The
 * middleware stamps the requested path on x-wb-path; without it we assume a
 * customer, the safer of the two.
 */
export default async function NotFound() {
  const h = await headers();
  const path = h.get("x-wb-path") ?? "";
  const inApp = path.startsWith("/app");

  return (
    // theme-ok: a public page, always light like every customer surface
    <main
      className="flex min-h-screen items-center justify-center bg-white px-4 py-10"
      style={{ colorScheme: "light", fontFamily: "Lexend, system-ui, sans-serif" }}
    >
      <ForceLightTheme />
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
          {inApp ? "WorkBench" : "Link not found"}
        </p>
        <h1 className="mt-3 text-xl font-bold text-gray-900">
          {inApp ? "That page is gone" : "This link doesn't work anymore"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          {inApp
            ? "There's nothing at this address — it may have been deleted, moved, or mistyped. Nothing else was affected."
            : "It may have expired, been replaced with a newer one, or been typed in wrong. Please contact the business that sent it and they can send a fresh link."}
        </p>
        {inApp ? (
          <Link
            href="/app/dashboard"
            className="mt-6 inline-block rounded-full bg-[#0B57D8] px-5 py-2.5 text-sm font-semibold text-white"
          >
            Back to Home
          </Link>
        ) : (
          <p className="mt-6 text-xs text-gray-400">
            Powered by{" "}
            <Link href="/" className="font-semibold text-gray-500 underline-offset-2 hover:underline">
              WorkBench
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
