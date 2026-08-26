import type { Metadata } from "next";
import Link from "next/link";
import { AnimateIn } from "@/components/AnimateIn";

export const metadata: Metadata = {
  title: "Delete Your Account — WorkBench",
  description:
    "How to permanently delete your WorkBench account and data, in the app or by request.",
};

/* Google Play requires apps with account creation to link a public web page
   where users can delete or request deletion of their account (Play Console →
   Data safety form). This page is that URL — keep it published and accurate.
   The in-app path it documents lives in SettingsClient.tsx (Danger Zone). */

const ACCENT = "#0B57D8";

export default function AccountDeletionPage() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="wb-grid-paper pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-3xl px-5 pt-16 pb-10 sm:px-8 sm:pt-24">
          <AnimateIn>
            <p
              className="mb-4 text-xs font-bold uppercase tracking-[0.18em]"
              style={{ color: ACCENT }}
            >
              Your data
            </p>
            <h1 className="text-4xl font-extrabold leading-[1.08] sm:text-5xl">
              Delete your <span style={{ color: ACCENT }}>account</span>
            </h1>
            <p className="mt-5 text-sm text-gray-500">
              Applies to WorkBench on the web, iPhone, and Android.
            </p>
          </AnimateIn>
        </div>
      </section>

      {/* ── Body ── */}
      <section className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-16">
          <div className="flex flex-col gap-10">
            <AnimateIn>
              <div>
                <h2 className="text-lg font-extrabold text-gray-900">
                  Delete it yourself, in the app
                </h2>
                <div className="mt-3 flex flex-col gap-3">
                  <p className="text-[15px] leading-relaxed text-gray-600">
                    Business owners can permanently delete their account and all company
                    data at any time: sign in, open{" "}
                    <span className="font-semibold text-gray-900">
                      Settings → Danger Zone → Delete account
                    </span>
                    , and confirm. This removes your company, team member accounts,
                    clients, quotes, jobs, invoices, messages, and photos.
                  </p>
                  <p className="text-[15px] leading-relaxed text-gray-600">
                    Team members: your account belongs to your company&apos;s WorkBench
                    workspace, so ask the business owner to remove you from{" "}
                    <span className="font-semibold text-gray-900">Settings → Team</span> —
                    or use the request option below and we&apos;ll handle it.
                  </p>
                </div>
              </div>
            </AnimateIn>

            <AnimateIn>
              <div>
                <h2 className="text-lg font-extrabold text-gray-900">
                  Or ask us to delete it
                </h2>
                <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
                  If you can&apos;t sign in or prefer we do it, email{" "}
                  <a
                    href="mailto:info@streamflaire.com?subject=WorkBench%20account%20deletion%20request"
                    className="font-semibold underline underline-offset-2"
                    style={{ color: ACCENT }}
                  >
                    info@streamflaire.com
                  </a>{" "}
                  from the email address on the account with the subject{" "}
                  <span className="font-semibold text-gray-900">
                    &ldquo;WorkBench account deletion request&rdquo;
                  </span>
                  . We&apos;ll verify it&apos;s you, confirm, and complete the deletion
                  within 30 days.
                </p>
              </div>
            </AnimateIn>

            <AnimateIn>
              <div>
                <h2 className="text-lg font-extrabold text-gray-900">
                  What is deleted, and what we keep
                </h2>
                <div className="mt-3 flex flex-col gap-3">
                  <p className="text-[15px] leading-relaxed text-gray-600">
                    Deletion removes your account credentials and your business records —
                    clients, requests, quotes, jobs, schedules, invoices, chat messages,
                    photos, and notification subscriptions. Copies may persist briefly in
                    encrypted backups before being cycled out.
                  </p>
                  <p className="text-[15px] leading-relaxed text-gray-600">
                    We retain limited records only where the law or our payment partner
                    requires it — for example, transaction records for payments you
                    processed. See our{" "}
                    <Link
                      href="/privacy"
                      className="font-semibold underline underline-offset-2"
                      style={{ color: ACCENT }}
                    >
                      Privacy Policy
                    </Link>{" "}
                    for details.
                  </p>
                </div>
              </div>
            </AnimateIn>
          </div>
        </div>
      </section>
    </>
  );
}
