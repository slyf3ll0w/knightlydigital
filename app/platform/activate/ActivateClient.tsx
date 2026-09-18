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
  Ticket,
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
  email,
}: {
  status: "activate" | "pending" | "rejected";
  state: string | null;
  started: boolean;
  justSubmitted: boolean;
  isOwner: boolean;
  sandbox: boolean;
  companyName: string;
  email: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"form" | "code" | null>(null);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");

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

  // An invite code IS the approval — it waives underwriting at signup. Anyone
  // who signed up before being given one (or who was pointed at the public
  // application, which sends everyone here) can redeem it now instead of
  // asking us to clear them by hand from the superadmin console.
  async function redeemCode(e: React.FormEvent) {
    e.preventDefault();
    setCodeError("");
    setBusy("code");
    try {
      const res = await fetch("/api/app/activate/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCodeError(data.error ?? "That invite code isn’t valid.");
        return;
      }
      // The gate reads off the company row — a full load re-runs it.
      window.location.href = "/app/dashboard";
    } catch {
      setCodeError("Couldn’t check that code. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const updateRequested = state === "UPDATE_REQUESTED";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-5 py-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/workbench-logo.png" alt="WorkBench" className="h-7 w-auto" />

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
              Your details go directly to the payment processor over an encrypted connection.
              Your account opens the moment you complete the form; card &amp; bank payments
              switch on when the underwriter approves you, usually within a business day.
            </p>
            {isOwner && (
              <form onSubmit={redeemCode} className="mt-7 border-t border-gray-200 pt-6">
                <label htmlFor="activate-code" className="flex items-center gap-1.5 text-[13.5px] font-semibold text-gray-800">
                  <Ticket size={14} className="text-gray-400" /> Have an invite code?
                </label>
                <p className="mt-1 text-[13px] text-gray-500">
                  A code from us skips this step — you&apos;ll go straight into
                  WorkBench, with online card payments switched on later.
                </p>
                <div className="mt-2.5 flex gap-2">
                  <input
                    id="activate-code"
                    type="text"
                    maxLength={40}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3.5 py-2.5 font-mono text-[15px] tracking-wide focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#0B57D8]"
                    placeholder="Invite code"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  <button
                    type="submit"
                    disabled={busy !== null || !code.trim()}
                    className="shrink-0 rounded-lg border border-gray-300 px-4 py-2.5 text-[14px] font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {busy === "code" ? <Loader2 size={15} className="animate-spin" /> : "Use code"}
                  </button>
                </div>
                {codeError && <p className="mt-2 text-[13px] text-red-600">{codeError}</p>}
              </form>
            )}
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
          <div role="alert" className="form-error mt-4">
            {error}
          </div>
        )}

        {/* The old "Sandbox tools" test-approve shortcut is gone on purpose —
            everyone completes the verification form, sandbox included. The
            sanctioned shortcut is an invite code: at signup (/app/get-started,
            /apply, /invite) or in the box above, and it waives underwriting
            outright — online payments are what stay switched off. */}
        {sandbox && status === "pending" && (
          <button
            onClick={() => router.refresh()}
            className="mt-6 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-[13px] font-semibold text-gray-700 hover:bg-gray-50"
          >
            Check status
          </button>
        )}
      </div>

      {/* Landing here from "Log in" means this browser already holds a
          session for a gated company — say whose, so a different account
          is one click away instead of a mystery. */}
      <p className="mt-6 text-[13px] text-gray-400">
        Signed in as <span className="font-semibold text-gray-500">{email}</span>
        {" · "}
        <button
          onClick={() => signOut({ callbackUrl: "/app/login" })}
          className="font-semibold text-gray-400 underline-offset-2 hover:text-gray-600 hover:underline"
        >
          Not you? Sign out
        </button>
      </p>
    </div>
  );
}
