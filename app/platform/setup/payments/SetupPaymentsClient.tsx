"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpRight, CheckCircle2, CreditCard, Loader2, Ticket } from "lucide-react";
import { appSignOut } from "@/lib/sign-out";
import { postJson } from "@/lib/safe-fetch";
import { RATES } from "@/lib/plans";
import { feeExample, SERVICE_FEE_ACH, SERVICE_FEE_CARD, type FeeModel as Model } from "@/lib/service-fee";
import { squareOutcomeNotice } from "@/lib/square-outcomes";
import ConnectSquareButton from "@/components/ConnectSquareButton";
import { SQUARE_BANK_ACCOUNTS_URL } from "@/lib/square-links";

const EXAMPLE = 500;
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const OPTIONS: { model: Model; title: string; who: string; card: string; bank: string; note: string }[] = [
  {
    model: "serviceFee",
    title: "Your client pays a service fee",
    who: "Added at checkout and shown before they pay. The full invoice amount reaches you.",
    card: SERVICE_FEE_CARD,
    bank: SERVICE_FEE_ACH,
    note: "Card networks and some states regulate surcharging — you're responsible for making sure it's allowed where you do business.",
  },
  {
    model: "companyPaid",
    title: "You pay the processing fee",
    who: "Your clients see no fee. Square's fee comes out of each payment before it reaches you.",
    card: RATES.companyPaid.card,
    bank: RATES.companyPaid.achShort,
    note: "The simplest experience for your clients; a little less on each payment for you.",
  },
];

/**
 * The payment-setup step: who pays the card fee, then connect Square. The
 * server page decides the facts (app/platform/setup/payments/page.tsx);
 * this renders them and drives the two choices. Standalone (no app
 * shell) like the auth screens, always light.
 */
export default function SetupPaymentsClient({
  companyName,
  email,
  isOwner,
  required,
  connected,
  businessName,
  payout,
  serviceFeeOn,
  preselect,
  signupUrls,
  sandbox,
  outcome,
}: {
  companyName: string;
  email: string;
  isOwner: boolean;
  /** The platform layout holds the company here until Square is connected. */
  required: boolean;
  connected: boolean;
  businessName: string | null;
  payout: "VERIFIED" | "PENDING" | "NONE" | "UNKNOWN" | null;
  /** Company.surchargeEnabled as stored. */
  serviceFeeOn: boolean;
  /** Light the stored value as the choice (an older company) — a new company picks fresh. */
  preselect: boolean;
  signupUrls: { serviceFee: string | null; companyPaid: string | null };
  sandbox: boolean;
  /** ?square=<outcome> from the OAuth callback. */
  outcome: string | null;
}) {
  const router = useRouter();
  const [choice, setChoice] = useState<Model | null>(preselect ? (serviceFeeOn ? "serviceFee" : "companyPaid") : null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState("");
  const notice = squareOutcomeNotice(outcome);
  // They've opened Square's sign-up: from then on "Finish setup" is the main
  // button. Remembered per browser so a reload (or coming back from Square's
  // tab) keeps the emphasis; purely cosmetic, so a missing store is fine.
  const SIGNUP_KEY = "wb-square-signup-started";
  const [signupStarted, setSignupStarted] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(SIGNUP_KEY) === "1") setSignupStarted(true);
    } catch {
      // storage blocked — the button order just stays as on first load
    }
  }, []);
  function markSignupStarted() {
    setSignupStarted(true);
    try {
      window.localStorage.setItem(SIGNUP_KEY, "1");
    } catch {
      // ignore
    }
  }

  // Square's consent can finish in another tab or, in the phone app, in the
  // system browser. Whenever this screen comes back into view, ask whether
  // the company is connected now and move on if so.
  useEffect(() => {
    if (connected) return;
    let busy = false;
    async function check() {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const res = await fetch("/api/app/settings/payments", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (data?.square?.connected) router.refresh();
      } catch {
        // offline — the next focus tries again
      } finally {
        busy = false;
      }
    }
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [connected, router]);

  async function choose(model: Model) {
    if (saving || model === choice) return;
    const previous = choice;
    setChoice(model);
    setError("");
    setSaving(true);
    const { ok, data } = await postJson("/api/app/setup/payments", { serviceFee: model === "serviceFee" });
    setSaving(false);
    if (!ok) {
      setChoice(previous);
      setError(data?.error ?? "Couldn't save that. Please try again.");
    }
  }

  // An invite code from us waives the step (same route the old gate used):
  // the company goes straight in, with online payments switched on whenever
  // Square gets connected from Settings.
  async function redeemCode(e: React.FormEvent) {
    e.preventDefault();
    setCodeError("");
    setCodeBusy(true);
    try {
      const res = await fetch("/api/app/activate/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCodeError(data.error ?? "That invite code isn't valid.");
        return;
      }
      window.location.href = "/app/dashboard";
    } catch {
      setCodeError("Couldn't check that code. Please try again.");
    } finally {
      setCodeBusy(false);
    }
  }

  const primaryBtn =
    "wb-btn-tool inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[color:var(--ds-primary)] px-6 py-3 text-[15px] font-bold text-[color:var(--ds-on-primary)] disabled:opacity-50";
  const secondaryBtn =
    "inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-6 py-2.5 text-[14px] font-semibold text-gray-700 hover:bg-gray-50";

  return (
    <div className="ds flex min-h-screen flex-col items-center justify-center bg-[color:var(--ds-canvas)] px-5 py-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/workbench-logo.png" alt="WorkBench" className="h-7 w-auto" />

      <div className="ds-card ds-card-raised mt-6 w-full max-w-xl p-7 sm:p-10">
        {connected ? (
          <>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[color:var(--ds-good-soft)]">
              <CheckCircle2 className="h-5 w-5 text-[color:var(--ds-good)]" strokeWidth={2} />
            </div>
            <h1 className="mt-4 text-2xl font-extrabold text-gray-900">Square is connected</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
              <span className="font-semibold text-gray-900">{companyName}</span> takes card and bank payments through{" "}
              <span className="font-semibold text-gray-900">{businessName ?? "your Square account"}</span> from now on —
              on every invoice pay link, quote deposit and booking.
            </p>
            {payout === "NONE" ? (
              <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
                One thing left for later: link the bank account Square should pay you out to. Until then your money waits
                in your Square balance, and Home reminds you.
              </p>
            ) : (
              <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
                Payouts follow your Square payout schedule, straight to your bank.
              </p>
            )}
            <Link href="/app/dashboard" className={`${primaryBtn} mt-6`}>
              Open WorkBench <ArrowRight size={15} />
            </Link>
            {payout === "NONE" && (
              <a href={SQUARE_BANK_ACCOUNTS_URL} target="_blank" rel="noopener noreferrer" className={`${secondaryBtn} mt-3`}>
                Add a bank account in Square <ArrowUpRight size={13} />
              </a>
            )}
          </>
        ) : !isOwner ? (
          <>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[color:var(--ds-primary-soft)]">
              <CreditCard className="h-5 w-5 text-[color:var(--ds-primary)]" strokeWidth={2} />
            </div>
            <h1 className="mt-4 text-2xl font-extrabold text-gray-900">One more step for the account owner</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
              <span className="font-semibold text-gray-900">{companyName}</span> opens up once the account owner connects
              its Square account — that&apos;s what lets clients pay online. Ask them to sign in and finish this step.
            </p>
          </>
        ) : (
          <>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[color:var(--ds-primary-soft)]">
              <CreditCard className="h-5 w-5 text-[color:var(--ds-primary)]" strokeWidth={2} />
            </div>
            <h1 className="mt-4 text-2xl font-extrabold text-gray-900">Set up getting paid</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
              Every quote, invoice and booking in WorkBench can be paid by card or bank, through a Square account that is
              yours. Three quick steps and <span className="font-semibold text-gray-900">{companyName}</span> is ready.
            </p>

            {notice && notice.tone === "bad" && (
              <div role="alert" className="form-error mt-5">
                {notice.text}
              </div>
            )}

            {/* ── 1. Who pays the card fee ── */}
            <h2 className="mt-7 text-[13px] font-bold uppercase tracking-wide text-gray-500">1 · Who pays the card fee?</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Who pays the card fee">
              {OPTIONS.map((o) => {
                const on = choice === o.model;
                const ex = feeExample(o.model, EXAMPLE);
                return (
                  <button
                    key={o.model}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => choose(o.model)}
                    disabled={saving}
                    className="rounded-xl border-2 p-4 text-left transition-colors disabled:opacity-70"
                    style={
                      on
                        ? { borderColor: "var(--ds-primary)", background: "var(--ds-primary-soft)" }
                        : { borderColor: "color-mix(in srgb, var(--ds-ink-2) 25%, transparent)" }
                    }
                  >
                    <span className="flex items-start gap-2.5">
                      <span
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2"
                        style={
                          on
                            ? { borderColor: "var(--ds-primary)", background: "var(--ds-primary)", color: "#fff" }
                            : { borderColor: "color-mix(in srgb, var(--ds-ink-2) 45%, transparent)" }
                        }
                        aria-hidden
                      >
                        {on && <CheckCircle2 size={14} strokeWidth={3} />}
                      </span>
                      <span className="text-[15px] font-bold leading-snug text-gray-900">{o.title}</span>
                    </span>
                    <span className="mt-2 block text-[13.5px] leading-relaxed text-gray-600">{o.who}</span>
                    <span className="mt-3 block space-y-0.5 text-[13px] text-gray-700">
                      <span className="block">
                        Card <span className="font-semibold">{o.card}</span>
                      </span>
                      <span className="block">
                        Bank transfer <span className="font-semibold">{o.bank}</span>
                      </span>
                    </span>
                    <span className="mt-3 block rounded-lg bg-white/70 px-3 py-2 text-[12.5px] text-gray-600">
                      A {usd(EXAMPLE)} card payment: client pays{" "}
                      <span className="font-semibold text-gray-900">{usd(ex.clientPays)}</span>, you receive{" "}
                      <span className="font-semibold text-gray-900">{usd(ex.youReceive)}</span>.
                    </span>
                  </button>
                );
              })}
            </div>
            {choice && (
              <p className="mt-2.5 text-[12.5px] leading-relaxed text-gray-500">
                {OPTIONS.find((o) => o.model === choice)!.note} You can change this any time in Settings → Payments &amp;
                accounting.
              </p>
            )}
            {error && (
              <div role="alert" className="form-error mt-3">
                {error}
              </div>
            )}

            {/* ── 2. Create the Square account (on the chosen model's partner
                link — the link sets the rate plan, so this is the only door;
                David 2026-11-03: no "connect an existing account" here) ── */}
            <h2 className={`mt-7 text-[13px] font-bold uppercase tracking-wide ${choice ? "text-gray-500" : "text-gray-300"}`}>
              2 · Create your Square account
            </h2>
            {choice ? (
              <>
                <p className="mt-2 text-[14px] leading-relaxed text-gray-600">
                  Your money goes to a Square account made for your business, on WorkBench&apos;s{" "}
                  {choice === "serviceFee" ? "service-fee" : "company-paid"} rates. Square&apos;s sign-up is free and takes a
                  few minutes: your business details, the owner&apos;s identity and the bank account to pay you out to. It
                  opens in a new tab — come back here when you&apos;re done.
                </p>
                {signupUrls[choice] ? (
                  <a
                    href={signupUrls[choice]!}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={markSignupStarted}
                    className={`${signupStarted ? secondaryBtn : primaryBtn} mt-4`}
                  >
                    {signupStarted ? "Open Square's sign-up again" : "Create your Square account"} <ArrowUpRight size={14} />
                  </a>
                ) : (
                  <p className="mt-3 text-[13px] text-[color:var(--ds-bad)]">Square&apos;s sign-up link isn&apos;t set up on this server yet.</p>
                )}
              </>
            ) : (
              <p className="mt-2 text-[14px] text-gray-400">Pick who pays the card fee first.</p>
            )}

            {/* ── 3. Link the new account to WorkBench (OAuth) ── */}
            <h2 className={`mt-7 text-[13px] font-bold uppercase tracking-wide ${choice ? "text-gray-500" : "text-gray-300"}`}>
              3 · Finish setup
            </h2>
            {choice ? (
              <>
                <p className="mt-2 text-[14px] leading-relaxed text-gray-600">
                  Done with Square&apos;s sign-up? Sign in to your new Square account once more to approve WorkBench, and
                  you&apos;re in. Card and bank details stay with Square and never touch WorkBench.
                </p>
                <ConnectSquareButton className={`${signupStarted ? primaryBtn : secondaryBtn} mt-4`}>
                  Finish setup <ArrowRight size={15} />
                </ConnectSquareButton>
                {sandbox && (
                  <p className="mt-2 text-[12px] text-gray-400">
                    Sandbox: keep the test seller&apos;s Square dashboard open in another tab while you approve.
                  </p>
                )}
              </>
            ) : null}

            {required && (
              <div className="mt-7 border-t border-gray-200 pt-5">
                {!codeOpen ? (
                  <button
                    type="button"
                    onClick={() => setCodeOpen(true)}
                    className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-gray-500 hover:text-gray-800"
                  >
                    <Ticket size={14} className="text-gray-400" /> Have an invite code?
                  </button>
                ) : (
                  <form onSubmit={redeemCode}>
                    <label htmlFor="setup-code" className="flex items-center gap-1.5 text-[13.5px] font-semibold text-gray-800">
                      <Ticket size={14} className="text-gray-400" /> Invite code
                    </label>
                    <p className="mt-1 text-[13px] text-gray-500">
                      A code from us skips this step — connect Square later from Settings whenever you&apos;re ready.
                    </p>
                    <div className="mt-2.5 flex gap-2">
                      <input
                        id="setup-code"
                        type="text"
                        maxLength={40}
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3.5 py-2.5 font-mono text-[15px] tracking-wide focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
                        placeholder="Invite code"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                      />
                      <button
                        type="submit"
                        disabled={codeBusy || !code.trim()}
                        className="shrink-0 rounded-lg border border-gray-300 px-4 py-2.5 text-[14px] font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {codeBusy ? <Loader2 size={15} className="animate-spin" /> : "Use code"}
                      </button>
                    </div>
                    {codeError && <p className="mt-2 text-[13px] text-[color:var(--ds-bad)]">{codeError}</p>}
                  </form>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <p className="mt-6 text-center text-[13px] text-gray-500">
        Signed in as <span className="font-semibold text-gray-700">{email}</span> ·{" "}
        <button
          type="button"
          onClick={() => void appSignOut("/app/login")}
          className="font-semibold underline-offset-2 hover:underline"
        >
          Sign out
        </button>
        {!required && !connected && (
          <>
            {" "}
            ·{" "}
            <Link href="/app/dashboard" className="font-semibold underline-offset-2 hover:underline">
              Back to Home
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
