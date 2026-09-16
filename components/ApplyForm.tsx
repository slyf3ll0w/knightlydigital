"use client";

import { useEffect, useRef, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { CheckCircle2, Loader2, Ticket } from "lucide-react";
import TurnstileWidget, { type TurnstileHandle } from "@/components/TurnstileWidget";
import GoogleSignInButton, { OrDivider, useGoogleSignInOffered } from "@/components/GoogleSignInButton";
import { saveCredential } from "@/lib/save-credential";
import { browserTimezone } from "@/lib/timezone";

const TEAM_SIZES = ["Just me", "2–5", "6–15", "16+"];
const PAYMENTS_TODAY = [
  "Card — through Square, Stripe, or similar",
  "Card — through my current software",
  "Mostly cash or check",
  "Mix of everything",
];
const MONTHLY_VOLUMES = ["Under $5k", "$5k – $20k", "$20k – $75k", "$75k+"];
const YEARS_IN_BUSINESS = ["Less than 1 year", "1–3 years", "3–10 years", "10+ years"];
const ENTITY_TYPES = [
  "LLC or corporation",
  "Sole proprietor",
  "Partnership",
  "Not registered yet",
];

/**
 * Step 1 of onboarding — the application form. One submit does everything:
 * records the application AND opens the account, then signs the new owner in
 * and sends them straight to payment verification (Finix underwriting) at
 * /app/activate. A person still reviews the application afterward — the
 * account runs in pending-approval mode until then.
 *
 * The questions are payment-intent screening: every company must pass Finix
 * underwriting, so this form's job is to predict (a) is this a real business
 * and (b) will they actually run card volume.
 *
 * INVITE CODE: a code — a minted WB-XXXX-XXXX or the shared tester code — IS
 * the approval: no review, no underwriting. It used to have nowhere to go on
 * this form, so anyone handed the tester code and pointed at "Get started"
 * filled out the whole application and landed on the KYC gate anyway. The
 * field is here now: once a code checks out the screening questions fold away
 * (nothing downstream reads them) and the signup lands on the dashboard
 * instead of /app/activate. The unlisted /invite page is still the short,
 * code-only door (components/InviteSignupForm.tsx) — same endpoint.
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
  googleEnabled = false,
  googleNativeClientId = null,
  appearance = "site",
}: {
  googleEnabled?: boolean;
  /** Android app only — switches the Google button to the native sheet. */
  googleNativeClientId?: string | null;
  appearance?: "site" | "app";
}) {
  const inApp = appearance === "app";
  const selfUrl = inApp ? "/app/get-started" : "/apply";
  const { data: session, status, update } = useSession();
  const signedIn = status === "authenticated" && Boolean(session?.user?.accountId);
  // Signed in without a company: the login exists, only the business is missing.
  const attachMode = signedIn && !session?.user?.companyId;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Gates the button AND its "or" rule: on the native path the answer only
  // arrives after mount (older shells ship no plugin).
  const googleOffered = useGoogleSignInOffered(googleEnabled, googleNativeClientId);
  const [done, setDone] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const captchaRef = useRef<TurnstileHandle>(null);
  const [inviteCode, setInviteCode] = useState("");
  // Pre-flight state for the code — UX only; /api/public/apply re-checks it
  // and claims a minted one inside the signup transaction.
  const [codeState, setCodeState] = useState<"empty" | "checking" | "valid" | "invalid">("empty");
  const [codeError, setCodeError] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    companyName: "",
    industry: "",
    teamSize: "",
    city: "",
    state: "",
    paymentsToday: "",
    monthlyVolume: "",
    yearsInBusiness: "",
    entityType: "",
    website: "",
    message: "",
  });

  // A good code skips review AND underwriting, so the screening questions —
  // all of which only ever feed those two decisions — come off the form.
  const waived = codeState === "valid";

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
    if (code) setInviteCode(code.trim());
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
    try {
      const res = await fetch("/api/public/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The browser's zone becomes the company's (editable in Settings)
        body: JSON.stringify({
          ...form,
          inviteCode: inviteCode.trim() || undefined,
          captchaToken,
          timezone: browserTimezone(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        // Turnstile tokens are single-use; the failed attempt consumed this one
        captchaRef.current?.reset();
        setLoading(false);
        return;
      }

      setDone(true);
      // A code waives underwriting — there's no gate to send them to.
      const landing = waived ? "/app/dashboard" : "/app/activate";

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
      setError("Something went wrong. Please try again.");
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
            : "rounded-3xl border border-gray-200 bg-white px-6 py-14 text-center sm:px-12"
        }
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50">
          <CheckCircle2 className="h-5 w-5 text-[#0B57D8]" strokeWidth={2} />
        </div>
        <h2 className={`mx-auto mt-5 max-w-md ${headingClass}`}>
          {waived ? "Your account is open." : "Your account is created."}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-gray-600">
          {waived
            ? "Signing you in and taking you to WorkBench."
            : "Signing you in and taking you to payment verification — complete it and you're in."}
        </p>
        <Loader2 className="mx-auto mt-5 h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  const inputClass = inApp
    ? "w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-[15px] text-gray-900 placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#0B57D8]"
    : "w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-[15px] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#0B57D8]";
  const labelClass = "mb-1.5 block text-[13.5px] font-semibold text-gray-800";

  // Signed in with a company already: this form would open a SECOND one.
  // Point at the app instead (second companies live in the switcher).
  if (signedIn && !attachMode) {
    return (
      <div
        className={
          inApp
            ? "py-8 text-center"
            : "rounded-3xl border border-gray-200 bg-white px-6 py-12 text-center sm:px-12"
        }
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50">
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
            className="wb-btn-tool inline-flex items-center rounded-lg bg-[#0B57D8] px-6 py-3 text-[15px] font-bold text-white"
          >
            Open WorkBench
          </a>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: selfUrl })}
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
      className={inApp ? "" : "rounded-3xl border border-gray-200 bg-white p-6 sm:p-10"}
    >
      <h2 className={headingClass}>
        {waived ? "Open your account" : "Tell us about your business"}
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-gray-600">
        {attachMode ? (
          <>
            You&apos;re signed in as{" "}
            <span className="font-semibold text-gray-800">{session?.user?.email}</span> — this
            opens your business on that login.{" "}
          </>
        ) : (
          <>This creates your account — </>
        )}
        {waived ? (
          <>
            your code skips the application review and the payment-verification
            step, so you&apos;ll land straight on your dashboard.
          </>
        ) : (
          <>
            complete the short payment-verification step that follows and
            you&apos;re in. A person also reviews every application within a
            business day; your account keeps working while that happens.
          </>
        )}
      </p>

      {error && (
        <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Google opens the login first, then comes back here for the business
          details (attachMode). Only shown before there's a session. */}
      {googleOffered && !signedIn && (
        <div className="mt-6">
          <GoogleSignInButton
            enabled
            callbackUrl={selfUrl}
            label="Sign up with Google"
            nativeClientId={googleNativeClientId}
            onError={setError}
          />
          <OrDivider className="mt-5" />
        </div>
      )}

      {/* The code goes first: it decides how much of this form there is. */}
      <div className="mt-6">
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
            <Ticket size={13} /> Code accepted — no application review, no payment verification.
          </p>
        )}
        {codeState === "invalid" && <p className="mt-1.5 text-[13px] text-red-600">{codeError}</p>}
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
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
          <label className={labelClass}>
            Phone <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            type="tel"
            maxLength={30}
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            className={inputClass}
            placeholder="(214) 555-0100"
          />
        </div>
        {/* Industry seeds the starter price book, so it's asked either way. */}
        <div>
          <label className={labelClass}>What kind of work do you do?</label>
          <input
            type="text"
            required
            maxLength={80}
            value={form.industry}
            onChange={(e) => set("industry", e.target.value)}
            className={inputClass}
            placeholder="e.g. HVAC, lawn care, plumbing"
          />
        </div>
        {/* ── Screening questions — they feed the review and underwriting,
            and a code decides both, so they fold away when one checks out. */}
        {!waived && (
          <>
            <div>
              <label className={labelClass}>Team size</label>
              <select
                required
                value={form.teamSize}
                onChange={(e) => set("teamSize", e.target.value)}
                className={`${inputClass} bg-white`}
              >
                <option value="" disabled>
                  Select…
                </option>
                {TEAM_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>City</label>
              <input
                type="text"
                required
                maxLength={80}
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
                className={inputClass}
                placeholder="Allen"
              />
            </div>
            <div>
              <label className={labelClass}>State</label>
              <input
                type="text"
                required
                maxLength={40}
                value={form.state}
                onChange={(e) => set("state", e.target.value)}
                className={inputClass}
                placeholder="TX"
              />
            </div>
            <div>
              <label className={labelClass}>How do you take payment today?</label>
              <select
                required
                value={form.paymentsToday}
                onChange={(e) => set("paymentsToday", e.target.value)}
                className={`${inputClass} bg-white`}
              >
                <option value="" disabled>
                  Select…
                </option>
                {PAYMENTS_TODAY.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Roughly how much do you invoice per month?</label>
              <select
                required
                value={form.monthlyVolume}
                onChange={(e) => set("monthlyVolume", e.target.value)}
                className={`${inputClass} bg-white`}
              >
                <option value="" disabled>
                  Select…
                </option>
                {MONTHLY_VOLUMES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>How long have you been in business?</label>
              <select
                required
                value={form.yearsInBusiness}
                onChange={(e) => set("yearsInBusiness", e.target.value)}
                className={`${inputClass} bg-white`}
              >
                <option value="" disabled>
                  Select…
                </option>
                {YEARS_IN_BUSINESS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Business structure</label>
              <select
                required
                value={form.entityType}
                onChange={(e) => set("entityType", e.target.value)}
                className={`${inputClass} bg-white`}
              >
                <option value="" disabled>
                  Select…
                </option>
                {ENTITY_TYPES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>
                Website or social page{" "}
                <span className="font-normal text-gray-400">
                  (optional — the fastest way for us to verify you)
                </span>
              </label>
              <input
                type="text"
                maxLength={200}
                value={form.website}
                onChange={(e) => set("website", e.target.value)}
                className={inputClass}
                placeholder="acmehvac.com, Google Business, Facebook…"
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>
                Anything else? <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <textarea
                maxLength={2000}
                rows={3}
                value={form.message}
                onChange={(e) => set("message", e.target.value)}
                className={inputClass}
                placeholder="How you heard about WorkBench, what you're using today…"
              />
            </div>
          </>
        )}
      </div>

      <div className="mt-6">
        <TurnstileWidget ref={captchaRef} onToken={setCaptchaToken} />
      </div>

      <button
        type="submit"
        disabled={loading || codeState === "checking"}
        className={
          inApp
            ? "mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D8] py-3 text-[15px] font-bold text-white transition-colors hover:bg-[#0A4CBB] active:bg-[#09429F] disabled:opacity-50"
            : "wb-btn-tool mt-6 inline-flex items-center gap-2 rounded-lg bg-[#0B57D8] px-6 py-3 text-[15px] font-bold text-white disabled:opacity-50"
        }
      >
        {loading && <Loader2 size={15} className="animate-spin" />}
        {attachMode ? "Open my business" : "Create my account"}
      </button>
      <p className="mt-4 text-[13px] text-gray-400">
        {waived ? (
          <>
            Free forever — we make money when you get paid, not before. Taking
            card payments online stays switched off on a code account until the
            business is verified.
          </>
        ) : (
          <>
            Free forever — we make money when you get paid, not before. A person
            reads every application; until yours is approved your account is
            provisional, and it closes if we can&apos;t approve it.
          </>
        )}
      </p>
    </form>
  );
}
