"use client";

import { useEffect, useRef, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { CheckCircle2, Loader2 } from "lucide-react";
import TurnstileWidget, { type TurnstileHandle, captchaEnabled } from "@/components/TurnstileWidget";
import GoogleSignInButton, { OrDivider, useGoogleSignInOffered } from "@/components/GoogleSignInButton";
import { saveCredential } from "@/lib/save-credential";

/**
 * The invite-code signup at the unlisted /invite page. Same endpoint as the
 * public /apply form (POST /api/public/apply) but a much shorter ask: just
 * what the account needs to exist. None of the screening questions, because
 * the code is the approval — the superadmin who minted it already decided.
 *
 * A valid code opens the company with the human review skipped AND Finix
 * underwriting waived, so the owner signs in and lands on the dashboard
 * instead of the /app/activate payment-verification gate. That's the point:
 * businesses we let in without card processing.
 *
 * Links arrive as /invite?code=WB-XXXX-XXXX (the console's copy-link and the
 * invite email both point here); the code prefills.
 */
export default function InviteSignupForm({
  googleEnabled = false,
  googleNativeClientId = null,
}: {
  googleEnabled?: boolean;
  /** Android app only — switches the Google button to the native sheet. */
  googleNativeClientId?: string | null;
}) {
  const { data: session, status, update } = useSession();
  const signedIn = status === "authenticated" && Boolean(session?.user?.accountId);
  // Signed in without a company (came back from Google): the login exists,
  // the code just opens the business on it. Same shape as ApplyForm.
  const attachMode = signedIn && !session?.user?.companyId;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Gates the button AND its "or" rule: on the native path the answer only
  // arrives after mount (older shells ship no plugin).
  const googleOffered = useGoogleSignInOffered(googleEnabled, googleNativeClientId);
  const [done, setDone] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const captchaRef = useRef<TurnstileHandle>(null);
  // The Google round-trip must come back to THIS url, code included.
  const [returnUrl, setReturnUrl] = useState("/invite");
  const [form, setForm] = useState({
    inviteCode: "",
    name: "",
    email: "",
    password: "",
    companyName: "",
    phone: "",
    industry: "",
  });

  // Read the ?code= after mount (not in the initializer) so SSR and the first
  // client render match.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) setForm((f) => ({ ...f, inviteCode: code.toUpperCase() }));
    setReturnUrl(window.location.pathname + window.location.search);
  }, []);

  useEffect(() => {
    if (attachMode && session?.user?.name) {
      setForm((f) => (f.name ? f : { ...f, name: session.user.name ?? "" }));
    }
  }, [attachMode, session?.user?.name]);

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/public/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, captchaToken }),
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

      if (attachMode) {
        // Already signed in (Google) — re-point the session at the new company.
        await update({ switchToUserId: data.userId });
        window.location.href = "/app";
        return;
      }

      // Account is open and underwriting is waived — sign in, straight to the app.
      await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });
      await saveCredential(form.email, form.password);
      window.location.href = "/app";
    } catch {
      setError("Something went wrong. Please try again.");
      captchaRef.current?.reset();
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-3xl border border-gray-200 bg-white px-6 py-14 text-center sm:px-12">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50">
          <CheckCircle2 className="h-5 w-5 text-[#0B57D8]" strokeWidth={2} />
        </div>
        <h2 className="mx-auto mt-5 max-w-md text-2xl font-extrabold">Your account is open.</h2>
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-gray-600">
          Signing you in and taking you to WorkBench.
        </p>
        <Loader2 className="mx-auto mt-5 h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  const inputClass =
    "w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-[15px] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#0B57D8]";
  const labelClass = "mb-1.5 block text-[13.5px] font-semibold text-gray-800";

  // Signed in with a company already — this code would open a SECOND one,
  // which lives in the app's switcher (New company), not here.
  if (signedIn && !attachMode) {
    return (
      <div className="rounded-3xl border border-gray-200 bg-white px-6 py-12 text-center sm:px-12">
        <h2 className="mx-auto max-w-md text-2xl font-extrabold">You&apos;re already signed in.</h2>
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-gray-600">
          Signed in as <span className="font-semibold">{session?.user?.email}</span>. To use an
          invite code for another company, open WorkBench, tap your profile
          picture and choose New company.
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href="/app/register"
            className="wb-btn-tool inline-flex items-center rounded-lg bg-[#0B57D8] px-6 py-3 text-[15px] font-bold text-white"
          >
            Add a company
          </a>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: returnUrl })}
            className="text-sm font-semibold text-gray-500 hover:text-gray-800"
          >
            Not you? Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-3xl border border-gray-200 bg-white p-6 sm:p-10">
      <h2 className="text-2xl font-extrabold">Create your account</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-gray-600">
        {attachMode ? (
          <>
            Signed in as <span className="font-semibold text-gray-800">{session?.user?.email}</span>.
            Your invite code opens the business on that login — no application
            review and no payment verification.
          </>
        ) : (
          <>
            Your invite code opens the account on the spot — no application review
            and no payment verification. Just the basics below and you&apos;re in.
          </>
        )}
      </p>

      {error && (
        <div role="alert" className="form-error mt-5">
          {error}
        </div>
      )}

      {googleOffered && !signedIn && (
        <div className="mt-6">
          <GoogleSignInButton
            enabled
            callbackUrl={returnUrl}
            label="Sign up with Google"
            nativeClientId={googleNativeClientId}
            onError={setError}
          />
          <OrDivider className="mt-5" />
        </div>
      )}

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="invite-code" className={labelClass}>Invite code</label>
          <input
            id="invite-code"
            type="text"
            required
            maxLength={40}
            value={form.inviteCode}
            onChange={(e) => set("inviteCode", e.target.value.toUpperCase())}
            className={`${inputClass} font-mono tracking-wider uppercase`}
            placeholder="WB-XXXX-XXXX"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
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
            <label htmlFor="invite-email" className={labelClass}>Email</label>
            <input
              id="invite-email"
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
            <label htmlFor="invite-password" className={labelClass}>Choose a password</label>
            <input
              id="invite-password"
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
        <div>
          <label className={labelClass}>
            What kind of work do you do?{" "}
            <span className="font-normal text-gray-400">(optional — seeds your starter price list)</span>
          </label>
          <input
            type="text"
            maxLength={80}
            value={form.industry}
            onChange={(e) => set("industry", e.target.value)}
            className={inputClass}
            placeholder="e.g. HVAC, lawn care, plumbing"
          />
        </div>
      </div>

      <div className="mt-6">
        <TurnstileWidget ref={captchaRef} onToken={setCaptchaToken} />
      </div>

      <button
        type="submit"
        // Wait for the captcha token: a click before it mints 400s and burns
        // one of the three signup attempts an hour.
        disabled={loading || (captchaEnabled && !captchaToken)}
        className="wb-btn-tool mt-6 inline-flex items-center gap-2 rounded-lg bg-[#0B57D8] px-6 py-3 text-[15px] font-bold text-white disabled:opacity-50"
      >
        {loading && <Loader2 size={15} className="animate-spin" />}
        {attachMode ? "Open my business" : "Create my account"}
      </button>
      <p className="mt-4 text-[13px] text-gray-400">
        Invite codes are single-use.{" "}
        {attachMode
          ? "This business is added to the login you're signed in with."
          : "Already have a WorkBench login? Enter that email and password here and this business is added to it."}
      </p>
    </form>
  );
}
