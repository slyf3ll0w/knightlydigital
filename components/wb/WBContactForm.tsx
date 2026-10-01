"use client";

import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import TurnstileWidget, { type TurnstileHandle, captchaEnabled } from "@/components/TurnstileWidget";

/**
 * The marketing site's contact form: name, business, email, phone and "how
 * can we help". Posts to /api/public/contact, which stores it for
 * /superadmin/contact and emails the WorkBench inbox. Used in the floating
 * "Contact us" panel (WBContactButton, `compact`) and on /contact.
 */

const input =
  "w-full min-w-0 rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-[15px] text-gray-900 placeholder:text-gray-400 focus:border-[#0B57D8] focus:outline-none focus:ring-2 focus:ring-[#0B57D8]/20";
const label = "mb-1 block text-[13px] font-bold text-gray-700";

export default function WBContactForm({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [captchaToken, setCaptchaToken] = useState("");
  const captchaRef = useRef<TurnstileHandle>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setError("");
    setSending(true);
    try {
      const res = await fetch("/api/public/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, businessName, email, phone, message, website, captchaToken, pageUrl: pathname }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "That did not go through. Try again in a moment.");
        // Turnstile tokens are single-use; the failed attempt consumed this one
        setCaptchaToken("");
        captchaRef.current?.reset();
        return;
      }
      setSent(true);
    } catch {
      setError("That did not go through. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className={`flex flex-col items-center text-center ${compact ? "px-2 py-10" : "py-12"}`}>
        <CheckCircle2 className="h-11 w-11 text-[#0B57D8]" strokeWidth={2} />
        <p className="mt-4 text-xl font-extrabold text-gray-900">Thanks, {name.trim().split(/\s+/)[0]}.</p>
        <p className="mt-2 max-w-xs text-[15px] leading-relaxed text-gray-600">
          We got your message and will get back to you at {email.trim()}{phone.trim() ? " or by phone" : ""}.
        </p>
      </div>
    );
  }

  const ready = name.trim() && email.trim() && message.trim() && (!captchaEnabled || captchaToken);

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <div className={compact ? "space-y-3.5" : "grid gap-3.5 sm:grid-cols-2"}>
        <div>
          <label htmlFor="wbc-name" className={label}>Name</label>
          <input id="wbc-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={120} className={input} />
        </div>
        <div>
          <label htmlFor="wbc-business" className={label}>
            Business name <span className="font-medium text-gray-400">(optional)</span>
          </label>
          <input id="wbc-business" value={businessName} onChange={(e) => setBusinessName(e.target.value)} autoComplete="organization" maxLength={120} className={input} />
        </div>
        <div>
          <label htmlFor="wbc-email" className={label}>Email</label>
          <input id="wbc-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required maxLength={254} className={input} />
        </div>
        <div>
          <label htmlFor="wbc-phone" className={label}>
            Phone <span className="font-medium text-gray-400">(optional)</span>
          </label>
          <input id="wbc-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" inputMode="tel" maxLength={30} className={input} />
        </div>
      </div>
      <div>
        <label htmlFor="wbc-message" className={label}>How can we help?</label>
        <textarea
          id="wbc-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          maxLength={4000}
          rows={compact ? 4 : 5}
          className={`${input} resize-none`}
        />
      </div>
      <input
        tabIndex={-1}
        autoComplete="off"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        className="hidden"
        aria-hidden
      />
      <TurnstileWidget ref={captchaRef} onToken={setCaptchaToken} action="contact" />
      {error && <p role="alert" className="text-[13px] font-semibold text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={sending || !ready}
        className={`wb-pill wb-pill-primary inline-flex items-center justify-center gap-2 disabled:opacity-40 ${compact ? "w-full" : "w-full sm:w-auto"}`}
      >
        {sending && <Loader2 className="h-4 w-4 animate-spin" />}
        Send message
      </button>
    </form>
  );
}
