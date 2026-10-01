import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { ChevronLeft } from "lucide-react";
import ApplyForm from "@/components/ApplyForm";
import { socialSignInFor } from "@/lib/sign-in-options";
import { paymentsGateEnabled } from "@/lib/payments-gate";

export const metadata: Metadata = {
  title: "Get started",
};

/**
 * Signing up without leaving the app. The mobile shell only keeps /app/* in
 * the webview — every other path (the marketing site's /apply included) gets
 * handed to the system browser, so "Get started free" on the login screen
 * used to eject people out of WorkBench to finish signing up, and an invite
 * code they'd been given had nowhere to go once they got there.
 *
 * Same form as /apply (components/ApplyForm.tsx), in the app's skin: enter a
 * code and it's a four-field signup straight to the dashboard; leave it empty
 * and it's the full application (ending at payment verification while
 * payments onboarding is open — lib/payments-gate.ts).
 */
export default async function AppGetStartedPage() {
  const ua = (await headers()).get("user-agent");
  return (
    <div className="app-ui min-h-screen bg-white">
      {/* The app shell draws under the status bar, so the top padding clears
          the notch / Dynamic Island before the page starts (2026-10-01). */}
      <div className="mx-auto w-full max-w-lg px-6 pb-10 pt-[max(1rem,calc(env(safe-area-inset-top)+0.75rem))] sm:pb-14 sm:pt-8">
        <Link
          href="/app/login"
          className="-ml-2 mb-6 inline-flex items-center gap-1 rounded-full py-2 pl-1 pr-3 text-[15px] font-semibold text-[color:var(--ds-primary)] active:bg-gray-100"
        >
          <ChevronLeft size={20} strokeWidth={2.4} />
          Back
        </Link>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/workbench-logo.png" alt="WorkBench" className="mb-8 h-7 w-auto" />
        <ApplyForm
          social={socialSignInFor(ua)}
          appearance="app"
          verifyPayments={paymentsGateEnabled()}
        />
        <p className="mt-8 text-center text-sm text-gray-500">
          Already have an account?{" "}
          <Link href="/app/login" className="font-semibold text-[color:var(--ds-primary)] hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
