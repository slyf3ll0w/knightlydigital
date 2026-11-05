"use client";

import { GENERIC_ERROR } from "@/lib/safe-fetch";
import { useEffect, useRef, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { appSignOut } from "@/lib/sign-out";
import { CheckCircle2, Loader2, Ticket } from "lucide-react";
import TurnstileWidget, { type TurnstileHandle, captchaEnabled } from "@/components/TurnstileWidget";
import SocialSignInButtons, { OrDivider, useSocialSignInOffered } from "@/components/SocialSignInButtons";
import { NO_SOCIAL_SIGN_IN, type SocialSignIn } from "@/lib/sign-in-options";
import { saveCredential } from "@/lib/save-credential";
import { browserTimezone } from "@/lib/timezone";
import { CORE_FREE_LINE } from "@/lib/help/plan-copy";
import IndustrySelect, { industryValue } from "@/components/IndustrySelect";
import { getAttribution, trackSiteEvent } from "@/lib/site-track";

/**
 * The sign-up form. One submit opens the account (login + company + owner),
 * signs the new owner in and sends them to the payment-setup step
 * (/app/setup/payments: who pays the card fee, connect Square) — the last
 * part of signing up, after which they're in. Nobody reviews sign-ups by
 * hand any more (2026-11-03): the seven screening questions the old
 * application asked (team size, city, volume, years, structure…) only ever
 * fed that review and Finix underwriting, and Square does its own KYC, so
 * the form is the seven things we actually need plus "how did you hear
 * about us".
 *
 * INVITE CODE: a code — a minted WB-XXXX-XXXX or the shared tester code —
 * waives the payment-setup step (and, in the Finix era, review +
 * underwriting): the company lands straight on the dashboard. The field is
 * folded behind "Have an invite code?" so the ordinary sign-up never sees
 * it; a link that carries ?code= opens it filled in. The unlisted /invite
 * page is still the short, code-only door (components/InviteSignupForm.tsx)
 * — same endpoint.
 *
 * Two skins, one form (`appearance`): "site" is the marketing card at /apply;
 * "app" is the in-app door at /app/get-started, which exists so the mobile
 * shell never has to eject someone to the website to sign up.
 *
 * Google path: "Continue with Google" opens a password-less login and comes
 * back here signed in but company-less (lib/social-login.ts). The form then
 * drops email/password — the login already exists — and the same POST opens
 * the company against that login. A visitor who's already signed in WITH a
 * company sees a pointer to the app instead (second companies are added
 * from inside it, not here).
 */
export default function ApplyForm({
  social = NO_SOCIAL_SIGN_IN,
  appearance = "site",
  verifyPayments = false,
  setupPayments = false,
  initial,
  draftId,
}: {
  /** Which social buttons this visitor gets, and how they run (lib/sign-in-options.ts). */
  social?: SocialSignIn;
  appearance?: "site" | "app";
  /** Finix underwriting follows signup (lib/payments-gate.ts paymentsGateEnabled). Off = no verification step. */
  verifyPayments?: boolean;
  /** Square: the payment-setup step follows signup (lib/payments-gate.ts paymentsSetupGateEnabled). */
  setupPayments?: boolean;
  /** Fields filled in ahead of time (a free-tool draft: lib/tool-drafts.ts draftPrefill). */
  initial?: { companyName?: string; email?: string; phone?: string };
  /** The free-tool draft to carry into the new account (/apply?draft=…). */
  draftId?: string;
}) {
  const inApp = appearance === "app";
  const selfUrl = inApp ? "/app/get-started" : "/apply";
  const { data: session, status, update } = useSession();
  const signedIn = status === "authenticated" && Boolean(session?.user?.accountId);
  // Signed in without a company: the login exists, only the business is missing.
  const attachMode = signedIn && !session?.user?.companyId;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [otherIndustry, setOtherIndustry] = useState("");
  // Gates the button AND its "or" rule: on the native path the answer only
  // arrives after mount (older shells ship no plugin).
  const socialOffered = useSocialSignInOffered(social);
  const [done, setDone] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const captchaRef = useRef<TurnstileHandle>(null);
  const [inviteCode, setInviteCode] = useState("");
  // The code field stays folded until asked for (or a ?code= link opens it).
  const [codeOpen, setCodeOpen] = useState(false);
  // Unchecked by default: consent to WorkBench's OWN sales & support texts
  // (the platform line's opt-in, cited in its toll-free verification).
  const [smsConsent, setSmsConsent] = useState(false);
  // Pre-flight state for the code — UX only; /api/public/apply re-checks it
  // and claims a minted one inside the signup transaction.
  const [codeState, setCodeState] = useState<"empty" | "checking" | "valid" | "invalid">("empty");
  const [codeError, setCodeError] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: initial?.email ?? "",
    password: "",
    phone: initial?.phone ?? "",
    companyName: initial?.companyName ?? "",
    industry: "",
    referralSource: "",
  });

  // A good code waives the payment-setup step (and the Finix gate).
  const waived = codeState === "valid";
  // What follows the form: the payment-setup step, the Finix verification, or straight in.
  const nextStep: "setup" | "verify" | "none" = waived ? "none" : setupPayments ? "setup" : verifyPayments ? "verify" : "none";

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // Google told us who they are — start the name from that (still editable).
  useEffect(() => {
    if (attachMode && session?.user?.name) {
      setForm((f) => (f.name ? f : { ...f, name: session.user.name ?? "" }));
    }
  }, [attachMode, session?.user?.name]);

  // Invite links arrive as ?code=… (the console's copy-link, the invite email,
  // and the tester link). Read after mount, not in the initializer, so SSR and
  // the first client render match.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) {
      setInviteCode(code.trim());
      setCodeOpen(true);
    }
  }, []);

  // Debounced pre-flight, so a code that isn't going to work says so before
  // someone fills in the rest of the form.
  useEffect(() => {
    const code = inviteCode.trim();
    if (!code) {
      setCodeState("empty");
      setCodeError("");
      return;
    }
    setCodeState("checking");
    const ac = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/app/invite-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
          signal: ac.signal,
        });
        const data = await res.json();
        setCodeState(data.valid ? "valid" : "invalid");
        setCodeError(data.valid ? "" : data.error ?? "That invite code isn't valid.");
      } catch {
        // Aborted by the next keystroke, or the network blinked — the submit
        // re-checks either way, so don't strand them on a client-side verdict.
        if (!ac.signal.aborted) {
          setCodeState("invalid");
          setCodeError("Couldn't check that code just now — you can still submit.");
        }
      }
    }, 450);
    return () => {
      ac.abort();
      clearTimeout(t);
    };
  }, [inviteCode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    trackSiteEvent("apply_submit");
    try {
      const res = await fetch("/api/public/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The browser's zone becomes the company's (editable in Settings)
        body: JSON.stringify({
          ...form,
          industry: industryValue(form.industry, otherIndustry),
          inviteCode: inviteCode.trim() || undefined,
          captchaToken,
          timezone: browserTimezone(),
          smsConsent,
          // How this visitor arrived (UTM / referrer) and the free-tool draft, if any
          attribution: getAttribution(),
          draftId: draftId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? GENERIC_ERROR);
        // Turnstile tokens are single-use; the failed attempt consumed this one
        captchaRef.current?.reset();
        setLoading(false);
        return;
      }

      setDone(true);
      trackSiteEvent("signup", data.companyId ?? undefined);
      // A code waives the next step; otherwise the payment-setup step (Square)
      // or the Finix verification, whichever this deployment runs.
      const landing = nextStep === "setup" ? "/app/setup/payments" : nextStep === "verify" ? "/app/activate" : "/app/dashboard";

      if (attachMode) {
        // Already signed in (Google) — re-point the session at the new company.
        await update({ switchToUserId: data.userId });
        window.location.href = landing;
        return;
      }

      // Account is open — sign in and go.
      await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });
      // Signup is the one moment a password manager most wants to hear from
      // us — a brand-new credential nothing else will ever offer to store.
      await saveCredential(form.email, form.password);
      window.location.href = landing;
    } catch {
      setError(GENERIC_ERROR);
      captchaRef.current?.reset();
      setLoading(false);
    }
  }

  // The marketing page hands the form its own card; in the app the page
  // supplies the chrome, so the form is just the fields.
  const headingClass = inApp
    ? "text-[22px] font-bold tracking-tight text-gray-900"
    : "text-2xl font-extrabold";

  if (done) {
    return (
      <div
        className={
          inApp
            ? "py-10 text-center"
            : "rounded-md border border-gray-200 bg-white px-6 py-14 text-center sm:px-12"
        }
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-blue-50">
          <CheckCircle2 className="h-5 w-5 text-[#0B57D8]" strokeWidth={2} />
        </div>
        <h2 className={`mx-auto mt-5 max-w-md ${headingClass}`}>Your account is open.</h2>
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-gray-600">
          {nextStep === "setup"
            ? "Signing you in. Next: a quick payment setup, then you're in."
            : nextStep === "verify"
              ? "Signing you in and taking you to payment verification — complete it and you're in."
              : "Signing you in and taking you to WorkBench."}
        </p>
        <Loader2 className="mx-auto mt-5 h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  const inputClass = inApp
    ? "w-full rounded-md border border-gray-300 bg-white px-3.5 py-2.5 text-[15px] text-gray-900 placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#0B57D8]"
    : "w-full rounded-md border border-gray-300 px-3.5 py-2.5 text-[15px] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#0B57D8]";
  const labelClass = "mb-1.5 block text-[13.5px] font-semibold text-gray-800";

  // Coming back from Google, the session takes a beat to load. Until it
  // does, the form can't know whether to ask for an email + password — hold
  // the fields back rather than flash the wrong version and swap.
  if (status === "loading") {
    return (
      <div
        className={
          inApp
            ? "py-16 text-center"
            : "rounded-md border border-gray-200 bg-white px-6 py-16 text-center sm:px-12"
        }
      >
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  // Signed in with a company already: this form would open a SECOND one.
  // Point at the app instead (second companies live in the switcher).
  if (signedIn && !attachMode) {
    return (
      <div
        className={
          inApp
            ? "py-8 text-center"
            : "rounded-md border border-gray-200 bg-white px-6 py-12 text-center sm:px-12"
        }
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-blue-50">
          <CheckCircle2 className="h-5 w-5 text-[#0B57D8]" strokeWidth={2} />
        </div>
        <h2 className={`mx-auto mt-5 max-w-md ${headingClass}`}>You already have an account.</h2>
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-gray-600">
          You&apos;re signed in as <span className="font-semibold">{session?.user?.email}</span>
          {session?.user?.companyName ? (
            <>
              {" "}with <span className="font-semibold">{session.user.companyName}</span>
            </>
          ) : null}
          . To add another company, open WorkBench and tap your profile picture.
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href="/app/dashboard"
            className="wb-btn inline-flex items-center rounded-md bg-[#0B57D8] px-6 py-3 text-[15px] font-bold text-white"
          >
            Open WorkBench
          </a>
          <button
            type="button"
            onClick={() => void appSignOut(selfUrl)}
            className="text-sm font-semibold text-gray-500 hover:text-gray-800"
          >
            Not you? Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={inApp ? "" : "rounded-md border border-gray-200 bg-white p-6 sm:p-10"}
    >
      <h2 className={headingClass}>Create your account</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-gray-600">
        {attachMode ? (
          <>
            You&apos;re signed in as{" "}
            <span className="font-semibold text-gray-800">{session?.user?.email}</span> — this
            opens your business on that login.{" "}
          </>
        ) : (
          <>This opens your account on the spot. </>
        )}
        {nextStep === "setup" ? (
          <>
            Next you&apos;ll pick how card fees work and create your Square account on WorkBench&apos;s
            rates — that&apos;s what lets clients pay you online, and it takes a few minutes.
          </>
        ) : nextStep === "verify" ? (
          <>Complete the short payment-verification step that follows and you&apos;re in.</>
        ) : waived ? (
          <>Your code skips payment setup, so you&apos;ll land straight on your dashboard.</>
        ) : (
          <>You&apos;ll land straight on your dashboard.</>
        )}
      </p>

      {error && (
        <div role="alert" className="form-error mt-5">
          {error}
        </div>
      )}

      {/* Google opens the login first, then comes back here for the business
          details (attachMode). Only shown before there's a session. */}
      {socialOffered.any && !signedIn && (
        <div className="mt-6">
          <SocialSignInButtons social={social} callbackUrl={selfUrl} verb="Sign up" onError={setError} />
          <OrDivider className="mt-5" />
        </div>
      )}

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Your name</label>
          <input
            type="text"
            required
            maxLength={120}
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            className={inputClass}
            placeholder="Jane Smith"
          />
        </div>
        {/* autocomplete="username" (not "email") — this is the account
            identifier the new password gets stored against, and password
            managers won't offer to save a signup without one. Both fields
            vanish in attachMode: the login already exists. */}
        {!attachMode && (
          <div>
            <label htmlFor="apply-email" className={labelClass}>Email</label>
            <input
              id="apply-email"
              name="username"
              type="email"
              required
              maxLength={254}
              autoComplete="username"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              className={inputClass}
              placeholder="you@acmehvac.com"
            />
          </div>
        )}
        {!attachMode && (
          <div>
            <label htmlFor="apply-password" className={labelClass}>Choose a password</label>
            <input
              id="apply-password"
              name="password"
              type="password"
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              className={inputClass}
              placeholder="Min. 8 characters"
            />
          </div>
        )}
        <div>
          <label className={labelClass}>Business name</label>
          <input
            type="text"
            required
            maxLength={120}
            value={form.companyName}
            onChange={(e) => set("companyName", e.target.value)}
            className={inputClass}
            placeholder="Acme HVAC & Cooling"
          />
        </div>
        <div>
          {/* Required (David 2026-11-03): if a sign-up stalls at payment
              setup, this is how we reach out to help. */}
          <label className={labelClass}>Phone</label>
          <input
            type="tel"
            required
            maxLength={30}
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            className={inputClass}
            placeholder="(214) 555-0100"
          />
          <label className="mt-2 flex items-start gap-2 text-xs leading-snug text-gray-500">
              <input
                type="checkbox"
                checked={smsConsent}
                onChange={(e) => setSmsConsent(e.target.checked)}
                disabled={!form.phone.trim()}
                className="mt-0.5 h-4 w-4 shrink-0 rounded disabled:opacity-50"
              />
              <span>
                Text me at this number about my WorkBench account — setup help, support and answers to my questions. Msg &amp; data
                rates may apply. Msg frequency varies. Reply STOP to opt out, HELP for help.{" "}
                <a href="/sms-terms" target="_blank" rel="noreferrer" className="underline">
                  Text terms
                </a>
              </span>
            </label>
        </div>
        {/* Industry seeds the starter price book. */}
        <IndustrySelect
          value={form.industry}
          other={otherIndustry}
          onChange={(v) => set("industry", v)}
          onOtherChange={setOtherIndustry}
          inputClass={inputClass}
          labelClass={labelClass}
        />
        <div>
          <label className={labelClass}>
            How did you hear about us? <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            maxLength={200}
            value={form.referralSource}
            onChange={(e) => set("referralSource", e.target.value)}
            className={inputClass}
            placeholder="A friend, Google, a Facebook group…"
          />
        </div>
      </div>

      {/* The invite code, folded away: a code from us skips the payment-setup
          step. Opens on its own when a link carries ?code=. */}
      <div className="mt-5">
        {!codeOpen ? (
          <button
            type="button"
            onClick={() => setCodeOpen(true)}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-gray-500 hover:text-gray-800"
          >
            <Ticket size={14} className="text-gray-400" /> Have an invite code?
          </button>
        ) : (
          <>
            <label htmlFor="apply-invite-code" className={labelClass}>
              Invite code <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              id="apply-invite-code"
              type="text"
              maxLength={40}
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              className={`${inputClass} font-mono tracking-wide`}
              placeholder="If someone gave you one"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            {codeState === "checking" && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-gray-400">
                <Loader2 size={13} className="animate-spin" /> Checking…
              </p>
            )}
            {codeState === "valid" && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-green-700">
                <Ticket size={13} /> Code accepted — you&apos;ll skip payment setup and land on your dashboard.
              </p>
            )}
            {codeState === "invalid" && <p className="mt-1.5 text-[13px] text-red-600">{codeError}</p>}
          </>
        )}
      </div>

      <div className="mt-6">
        <TurnstileWidget ref={captchaRef} onToken={setCaptchaToken} />
      </div>

      <button
        type="submit"
        // Wait for the captcha token: a click before it mints 400s and burns
        // one of the three signup attempts an hour (same guard as the login
        // and register forms).
        disabled={loading || codeState === "checking" || (captchaEnabled && !captchaToken)}
        className={
          inApp
            ? "mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-[#0B57D8] py-3 text-[15px] font-bold text-white transition-colors hover:bg-[#0A4CBB] active:bg-[#09429F] disabled:opacity-50"
            : "wb-btn mt-6 inline-flex items-center gap-2 rounded-md bg-[#0B57D8] px-6 py-3 text-[15px] font-bold text-white disabled:opacity-50"
        }
      >
        {loading && <Loader2 size={15} className="animate-spin" />}
        {attachMode ? "Open my business" : "Create my account"}
      </button>
      <p className="mt-4 text-[13px] text-gray-400">
        {CORE_FREE_LINE}{" "}
        {waived
          ? "Online card and bank payments switch on whenever you connect Square from Settings."
          : nextStep === "setup"
            ? "Payments run through your own Square account — WorkBench never sees card numbers."
            : nextStep === "verify"
              ? "Card and bank payments switch on when the underwriter approves you."
              : "Online card and bank payments are coming soon."}
      </p>
    </form>
  );
}
