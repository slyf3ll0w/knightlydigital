import type { Metadata } from "next";
import { AnimateIn } from "@/components/AnimateIn";
import InviteSignupForm from "@/components/InviteSignupForm";

/**
 * Unlisted invite-code signup. Nothing on the marketing site links here and
 * it's excluded from search (noindex, not in the sitemap) — people only
 * arrive with a code we gave them (/invite?code=WB-XXXX-XXXX). The code opens
 * the account with the application review AND Finix underwriting skipped:
 * this is the door for businesses we admit without card processing.
 */
export const metadata: Metadata = {
  title: "Your WorkBench invite",
  description: "Open your WorkBench account with an invite code.",
  robots: { index: false, follow: false },
};

export default function WBInvitePage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="wb-grid-paper pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-5 pt-16 sm:px-8 sm:pt-24">
          <AnimateIn>
            <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.08] sm:text-5xl">
              You&apos;re invited to <span className="text-[#0B57D8]">WorkBench</span>.
            </h1>
            <div className="mt-6 max-w-2xl space-y-4 text-[16.5px] leading-relaxed text-gray-600">
              <p>
                Someone on our team gave you an invite code. It opens your
                account right now — no application to fill out and no payment
                verification step. Enter the basics below and you&apos;ll land
                on your dashboard.
              </p>
            </div>
          </AnimateIn>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-20">
        <AnimateIn>
          <InviteSignupForm />
        </AnimateIn>
      </section>
    </>
  );
}
