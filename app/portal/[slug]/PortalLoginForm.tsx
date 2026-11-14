"use client";

import { useState } from "react";
import { Loader2, MailCheck } from "lucide-react";

/**
 * Sign-in card body + the after-submit screen. The response is the same
 * whether or not the email matched (see /api/public/portal-login), so the
 * done screen speaks to both. "Request service" for someone who isn't a
 * client yet lives on the page beside this card, not in it.
 */
export default function PortalLoginForm({
  slug,
  companyName,
  brand,
  onBrand,
}: {
  slug: string;
  companyName: string;
  /** the page's one brand color (already contrast-checked against white) */
  brand: string;
  onBrand: string;
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

  if (sentTo) {
    return (
      <div className="anim-portal" aria-live="polite">
        <span
          className="mb-4 flex h-11 w-11 items-center justify-center rounded-full"
          style={{ background: `color-mix(in srgb, ${brand} 12%, white)`, color: brand }}
        >
          <MailCheck size={20} />
        </span>
        <h2 className="text-[18px] font-semibold text-gray-900">Check your email</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-gray-600 md:text-[14px]">
          If <span className="break-all font-medium text-gray-900">{sentTo}</span> is on file with {companyName}, your
          sign-in link is on its way. It can take a minute, so check spam too.
        </p>
        <button
          type="button"
          onClick={() => setSentTo(null)}
          className="mt-4 py-1 text-[14px] font-medium hover:underline"
          style={{ color: brand }}
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="hidden text-[18px] font-semibold text-gray-900 md:block">Sign in with your email</h2>
      <p className="text-[15px] leading-relaxed text-gray-600 md:mt-2 md:text-[14px]">
        Use the email {companyName} has on file. We&apos;ll send you a link that signs you in.
      </p>

      <form onSubmit={submit} className="mt-5 space-y-2.5 md:mt-6">
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
    </div>
  );
}
