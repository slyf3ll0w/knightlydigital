"use client";

import { useState } from "react";
import { ArrowRight, Loader2, MailCheck } from "lucide-react";

/**
 * Sign-in form + the after-submit screen. The response is the same whether
 * or not the email matched (see /api/public/portal-login), so the done
 * screen speaks to both: "if you're on file it's on its way" for clients,
 * and "Request service" for someone who isn't a client yet.
 */
export default function PortalLoginForm({
  slug,
  companyName,
  brand,
  onBrand,
  requestHref,
}: {
  slug: string;
  companyName: string;
  /** the page's one brand color (already contrast-checked against white) */
  brand: string;
  onBrand: string;
  /** booking page, when it has something on it — new customers start there */
  requestHref: string | null;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      await fetch("/api/public/portal-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, email: value }),
      });
    } catch {
      // same outcome either way — we never reveal whether the email matched
    } finally {
      setBusy(false);
      setSentTo(value);
    }
  }

  const newCustomer = requestHref && (
    <a
      href={requestHref}
      className="group flex items-center justify-between gap-3 rounded-2xl bg-[#f4f4f2] px-4 py-3.5 transition-colors hover:bg-[#ececea]"
    >
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold text-gray-900">Request service</span>
        <span className="block text-[13px] text-gray-500">Tell us about the job and we&apos;ll set you up.</span>
      </span>
      <ArrowRight size={18} className="shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: brand }} />
    </a>
  );

  if (sentTo) {
    return (
      <div className="anim-portal" aria-live="polite">
        <span
          className="mb-5 flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: `color-mix(in srgb, ${brand} 12%, white)`, color: brand }}
        >
          <MailCheck size={22} />
        </span>
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-gray-900">Check your email</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-gray-600">
          If <span className="font-medium text-gray-900 break-all">{sentTo}</span> is on file with {companyName}, your
          sign-in link is on its way. It can take a minute, so check spam too.
        </p>
        <button
          type="button"
          onClick={() => setSentTo(null)}
          className="mt-4 text-[14px] font-medium hover:underline"
          style={{ color: brand }}
        >
          Use a different email
        </button>

        {newCustomer && (
          <div className="mt-8 border-t border-gray-100 pt-6">
            <p className="mb-3 text-[14px] text-gray-600">Not a client yet, or nothing arrived?</p>
            {newCustomer}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-gray-900">Welcome back</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-gray-600">
        Enter the email {companyName} has on file. We&apos;ll send you a link that signs you in, no password needed.
      </p>

      <form onSubmit={submit} className="mt-7 space-y-3">
        <label htmlFor="portal-email" className="block text-[13px] font-medium text-gray-700">
          Email
        </label>
        <input
          id="portal-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="block h-12 w-full rounded-xl border border-gray-300 bg-white px-3.5 text-[16px] text-gray-900 outline-none transition-shadow placeholder:text-gray-400 focus:border-transparent"
          onFocus={(e) => (e.currentTarget.style.boxShadow = `0 0 0 2px ${brand}`)}
          onBlur={(e) => (e.currentTarget.style.boxShadow = "")}
        />
        <button
          type="submit"
          disabled={busy}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition-[filter] hover:brightness-110 active:brightness-95 disabled:opacity-70"
          style={{ background: brand, color: onBrand }}
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          Email me a sign-in link
        </button>
      </form>

      <p className="mt-3 text-[13px] text-gray-500">Already have your link from an email or text? Just open it.</p>

      {newCustomer && (
        <div className="mt-8 border-t border-gray-100 pt-6">
          <p className="mb-3 text-[14px] text-gray-600">New to {companyName}?</p>
          {newCustomer}
        </div>
      )}
    </div>
  );
}
