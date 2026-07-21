"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";

/**
 * UI for the payment-verification gate (/app/activate). The server page
 * decides the status; this renders it and drives the hosted Finix form:
 *  - activate  → start/continue the KYC form (owner only)
 *  - pending   → PROVISIONING: submitted screen + door into the app
 *                UPDATE_REQUESTED: reopen the form for more info
 *  - rejected  → locked screen
 */
export default function ActivateClient({
  status,
  state,
  started,
  justSubmitted,
  isOwner,
  sandbox,
  companyName,
}: {
  status: "activate" | "pending" | "rejected";
  state: string | null;
  started: boolean;
  justSubmitted: boolean;
  isOwner: boolean;
  sandbox: boolean;
  companyName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"form" | "test" | null>(null);
  const [error, setError] = useState("");

  async function openForm() {
    setError("");
    setBusy("form");
    try {
      const res = await fetch("/api/app/settings/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnTo: "activate" }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error ?? "Couldn't open the verification form. Please try again.");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Couldn't open the verification form. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function testApprove() {
    setError("");
    setBusy("test");
    try {
      const res = await fetch("/api/app/settings/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test-approve" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Test approval failed.");
        return;
      }
      router.refresh();
    } catch {
      setError("Test approval failed.");
    } finally {
      setBusy(null);
    }
  }

  const updateRequested = state === "UPDATE_REQUESTED";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-5 py-10">
      <p className="text-lg font-extrabold tracking-tight text-gray-900">
        Work<span className="text-[#0B57D8]">Bench</span>
      </p>

      <div className="mt-6 w-full max-w-lg rounded-3xl border border-gray-200 bg-white p-7 shadow-sm sm:p-10">
        {status === "activate" && (
          <>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50">
              <ShieldCheck className="h-5 w-5 text-[#0B57D8]" strokeWidth={2} />
            </div>
            <h1 className="mt-4 text-2xl font-extrabold text-gray-900">
              Verify your business to activate your account
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
              Card and bank payments are built into everything WorkBench does, so{" "}
              <span className="font-semibold text-gray-900">{companyName}</span> needs to pass a
              one-time payment verification (required by federal banking rules) before the
              account opens up. It takes about 10 minutes.
            </p>
            <ul className="mt-4 space-y-2 text-[14px] text-gray-600">
              {[
                "Your business details — legal name, address, and EIN (or SSN if you're a sole proprietor)",
                "An owner's identity information",
                "The bank account where your payouts should land",
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#0B57D8]" strokeWidth={2} />
                  {item}
                </li>
              ))}
            </ul>
            {justSubmitted && (
              <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                Just finished the form? It can take a moment to register —{" "}
                <button onClick={() => router.refresh()} className="font-bold underline">
                  check again
                </button>
                .
              </div>
            )}
            {isOwner ? (
              <button
                onClick={openForm}
                disabled={busy !== null}
                className="wb-btn-tool mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D8] px-6 py-3 text-[15px] font-bold text-white disabled:opacity-50"
              >
                {busy === "form" ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <ArrowRight size={15} />
                )}
                {started ? "Continue verification" : "Start verification"}
              </button>
            ) : (
              <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                Only the account owner can complete verification — ask them to sign in and finish
                this step.
              </div>
            )}
            <p className="mt-3 text-[13px] text-gray-400">
              Reviewed by our payments underwriter, usually within a business day. Your details go
              directly to the payment processor over an encrypted connection.
            </p>
          </>
        )}

        {status === "pending" && !updateRequested && (
          <>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50">
              <Clock className="h-5 w-5 text-[#0B57D8]" strokeWidth={2} />
            </div>
            <h1 className="mt-4 text-2xl font-extrabold text-gray-900">
              Verification submitted — you&apos;re in
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
              Underwriting is reviewing <span className="font-semibold text-gray-900">{companyName}</span>,
              which usually wraps up within a business day. You don&apos;t have to wait: head into
              your account, set your prices, and add your clients. Card and bank payments switch on
              the moment you&apos;re approved.
            </p>
            <Link
              href="/app/dashboard"
              className="wb-btn-tool mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D8] px-6 py-3 text-[15px] font-bold text-white"
            >
              Go to your dashboard <ArrowRight size={15} />
            </Link>
          </>
        )}

        {status === "pending" && updateRequested && (
          <>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50">
              <AlertTriangle className="h-5 w-5 text-amber-600" strokeWidth={2} />
            </div>
            <h1 className="mt-4 text-2xl font-extrabold text-gray-900">
              More information needed
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
              The underwriter reviewed your submission and needs a bit more from{" "}
              <span className="font-semibold text-gray-900">{companyName}</span> before approving
              payments. Reopen the form to see what&apos;s missing.
            </p>
            {isOwner ? (
              <button
                onClick={openForm}
                disabled={busy !== null}
                className="wb-btn-tool mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D8] px-6 py-3 text-[15px] font-bold text-white disabled:opacity-50"
              >
                {busy === "form" ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <ArrowRight size={15} />
                )}
                Reopen verification form
              </button>
            ) : (
              <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                Only the account owner can update the verification — ask them to sign in.
              </div>
            )}
            <Link
              href="/app/dashboard"
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-6 py-2.5 text-[14px] font-semibold text-gray-700 hover:bg-gray-50"
            >
              Go to your dashboard
            </Link>
          </>
        )}

        {status === "rejected" && (
          <>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50">
              <XCircle className="h-5 w-5 text-red-600" strokeWidth={2} />
            </div>
            <h1 className="mt-4 text-2xl font-extrabold text-gray-900">
              We couldn&apos;t approve your business
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
              Our payments underwriter wasn&apos;t able to approve{" "}
              <span className="font-semibold text-gray-900">{companyName}</span> for card
              processing, and every WorkBench account runs on payments — so the account can&apos;t
              be opened right now. If you think this is a mistake, we&apos;ll take a second look.
            </p>
            <a
              href="mailto:info@streamflaire.com?subject=Payment%20verification%20review"
              className="wb-btn-tool mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D8] px-6 py-3 text-[15px] font-bold text-white"
            >
              Contact us
            </a>
          </>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {sandbox && status !== "rejected" && isOwner && (
          <div className="mt-6 rounded-lg border border-dashed border-gray-300 px-4 py-3">
            <p className="text-[12px] font-bold uppercase tracking-wide text-gray-400">
              Sandbox tools
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {status === "activate" && (
                <button
                  onClick={testApprove}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-[13px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {busy === "test" && <Loader2 size={13} className="animate-spin" />}
                  Approve instantly (test data)
                </button>
              )}
              <button
                onClick={() => router.refresh()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-[13px] font-semibold text-gray-700 hover:bg-gray-50"
              >
                Check status
              </button>
            </div>
          </div>
        )}
      </div>

      <button
        onClick={() => signOut({ callbackUrl: "/app/login" })}
        className="mt-6 text-[13px] font-semibold text-gray-400 hover:text-gray-600"
      >
        Sign out
      </button>
    </div>
  );
}
