import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import ApplyForm from "@/components/ApplyForm";
import { socialSignInFor } from "@/lib/sign-in-options";

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
 * and it's the full application, ending at payment verification.
 */
export default async function AppGetStartedPage() {
  const ua = (await headers()).get("user-agent");
  return (
    <div className="app-ui min-h-screen bg-white">
      <div className="mx-auto w-full max-w-lg px-6 py-10 sm:py-14">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/workbench-logo.png" alt="WorkBench" className="mb-8 h-7 w-auto" />
        <ApplyForm
          social={socialSignInFor(ua)}
          appearance="app"
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
