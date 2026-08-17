"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, Loader2, Lock, Sparkles } from "lucide-react";

/**
 * The Workbench Plus upsell. Three states:
 *  - subscribed → the active card
 *  - just back from Livery checkout (?checkout=done) → "Activating…" while we
 *    poll /api/app/addon waiting for the subscription.created webhook to land
 *  - not subscribed → the pitch + Subscribe (a redirect to the hosted Livery
 *    checkout link; ?ref= on it is how the webhook finds this company)
 */

const FEATURES = [
  {
    title: "Advanced reporting & insights",
    sub: "Deeper revenue, job-profit, and team-performance breakdowns.",
  },
  {
    title: "Priority support",
    sub: "Your questions jump the queue.",
  },
  {
    title: "Early access",
    sub: "New features land here first, before the general release.",
  },
];

const POLL_MS = 2500;
const POLL_MAX_MS = 90_000;

export default function AddonClient({
  active,
  activeAt,
  configured,
  checkoutUrl,
  isOwner,
}: {
  active: boolean;
  activeAt: string | null;
  configured: boolean;
  checkoutUrl: string | null;
  isOwner: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cameFromCheckout = searchParams.get("checkout") === "done";

  const [isActive, setIsActive] = useState(active);
  const [activating, setActivating] = useState(!active && cameFromCheckout);
  const [timedOut, setTimedOut] = useState(false);
  const startedAt = useRef(Date.now());

  // Back from Livery checkout: the webhook usually lands within seconds —
  // poll until the entitlement flips (or give up and show the fallback note).
  useEffect(() => {
    if (!activating) return;
    const timer = setInterval(async () => {
      if (Date.now() - startedAt.current > POLL_MAX_MS) {
        clearInterval(timer);
        setActivating(false);
        setTimedOut(true);
        return;
      }
      try {
        const res = await fetch("/api/app/addon");
        if (res.ok) {
          const data = await res.json();
          if (data.active) {
            clearInterval(timer);
            setIsActive(true);
            setActivating(false);
            router.refresh();
          }
        }
      } catch {}
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [activating, router]);

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      <Link
        href="/app/settings"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft size={14} />
        Settings
      </Link>
      <div className="mb-6">
        <h1 className="numeral-ledger text-2xl font-semibold text-gray-900">Workbench Plus</h1>
        <p className="text-sm text-gray-500">
          More horsepower for your whole team, billed monthly.
        </p>
      </div>

      {isActive ? (
        <div className="card-ledger p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-600 text-white">
              <Check size={20} />
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">Workbench Plus is active</p>
              <p className="text-xs text-gray-500">
                {activeAt
                  ? `Subscribed since ${new Date(activeAt).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}.`
                  : "Your subscription is live."}{" "}
                Billing runs through Livery — your card on file is charged monthly, and a
                receipt lands in your inbox each cycle.
              </p>
            </div>
          </div>
          <div className="mt-5 border-t border-gray-100 pt-4">
            <p className="mb-2 text-xs font-semibold text-gray-400">Included</p>
            <ul className="space-y-2">
              {FEATURES.map((f) => (
                <li key={f.title} className="flex items-start gap-2 text-sm text-gray-700">
                  <Check size={15} className="mt-0.5 shrink-0 text-green-600" />
                  {f.title}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : activating ? (
        <div className="card-ledger p-8 text-center">
          <Loader2 size={28} className="mx-auto mb-3 animate-spin text-gray-400" />
          <p className="text-sm font-semibold text-gray-900">Activating your subscription…</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-gray-500">
            Your payment went through — we&apos;re waiting for the confirmation to arrive.
            This usually takes a few seconds.
          </p>
        </div>
      ) : (
        <div className="card-ledger p-6">
          {timedOut && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Your payment went through, but the confirmation hasn&apos;t arrived yet. It can
              lag a few minutes — check back shortly, and contact support if it doesn&apos;t
              activate.
            </div>
          )}
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-green-500/10 text-green-700">
              <Sparkles size={19} />
            </span>
            <p className="text-sm leading-relaxed text-gray-600">
              Everything in Workbench stays free. Plus adds the extras for teams that want
              more — cancel anytime.
            </p>
          </div>
          <ul className="mt-5 space-y-3 border-t border-gray-100 pt-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-start gap-2.5">
                <Check size={16} className="mt-0.5 shrink-0 text-green-600" />
                <span className="text-sm">
                  <span className="font-medium text-gray-900">{f.title}</span>
                  <span className="block text-xs text-gray-500">{f.sub}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-6 border-t border-gray-100 pt-5">
            {!configured ? (
              <p className="text-sm text-gray-400">
                Subscriptions aren&apos;t available quite yet — check back soon.
              </p>
            ) : !isOwner ? (
              <p className="text-sm text-gray-500">
                Only the account owner can start the subscription — ask them to visit this
                page.
              </p>
            ) : (
              <>
                <a
                  href={checkoutUrl!}
                  className="btn-tool inline-flex w-full items-center justify-center gap-2 py-3 text-sm font-semibold sm:w-auto sm:px-8"
                >
                  <Lock size={14} />
                  Subscribe
                </a>
                <p className="mt-3 text-xs text-gray-400">
                  You&apos;ll check out securely on Livery, our payments platform, and land
                  right back here. Your card is kept on file and billed monthly until you
                  cancel.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
