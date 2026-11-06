"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Eye, Loader2, Mail, Plus, X } from "lucide-react";
import TurnstileWidget, { captchaEnabled, type TurnstileHandle } from "@/components/TurnstileWidget";
import { money, type ToolDoc } from "@/lib/tool-doc";

/**
 * "Email it" on the free generator (components/wb/tools/DocGenerator.tsx).
 * Two cards: the compose card (verify the sender's address with a code the
 * first time, then To + Send) and, once they have sent anything, the sent
 * list with a Viewed stamp per document and the one pitch on this page
 * that is the sender's alone: a Pay online button needs a free account.
 * Server side: /api/public/tools/email/* → lib/tool-send.ts.
 */

export type SentSummary = {
  token: string;
  kind: ToolDoc["kind"];
  number: number;
  clientName: string;
  recipients: string[];
  total: number;
  sentAt: string;
  viewedAt: string | null;
  viewCount: number;
};

export type EmailSession = {
  enabled: boolean;
  sender: { email: string; blocked?: boolean } | null;
  sends: SentSummary[];
  left: number;
};

type Props = {
  doc: ToolDoc;
  logo: string | null;
  /** The compose card is open (the Email it button toggles it). */
  open: boolean;
  onClose: () => void;
  session: EmailSession;
  onSession: (s: EmailSession) => void;
  /** Document is complete enough to send (docReady). */
  ready: { ok: true } | { ok: false; reason: string };
  /** The sign-up hand-off ("Get paid online"). */
  onGetPaid: () => void;
  /** The sender verified an address while the business email was blank: fill it. */
  onSenderEmail: (email: string) => void;
  /** Site path for the conversion event. */
  path: string;
};

const INPUT = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[14px] text-gray-900 outline-none placeholder:text-gray-400 focus:border-[#0B57D8] focus:ring-2 focus:ring-[#0B57D8]/15";

async function postJson<T>(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: T & { error?: string; code?: string } }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  return { ok: res.ok, status: res.status, data };
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function EmailPanel({ doc, logo, open, onClose, session, onSession, ready, onGetPaid, onSenderEmail, path }: Props) {
  const isEstimate = doc.kind === "estimate";
  const word = isEstimate ? "estimate" : "invoice";
  const sender = session.sender;

  // Verification
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  // Compose
  const [to, setTo] = useState("");
  const [to2, setTo2] = useState<string | null>(null);
  const [copyMe, setCopyMe] = useState(true);
  const [sent, setSent] = useState<{ href: string; recipients: string[] } | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<TurnstileHandle>(null);
  const captchaBlocked = captchaEnabled && !captchaToken;

  // Defaults follow the document until the person types.
  useEffect(() => {
    if (!email && doc.business.email) setEmail(doc.business.email);
  }, [doc.business.email, email]);
  useEffect(() => {
    if (!to && doc.client.email) setTo(doc.client.email);
  }, [doc.client.email, to]);
  // A fresh document after a send: back to the compose form.
  useEffect(() => {
    setSent(null);
  }, [doc.number, doc.client.email]);

  function spendCaptcha() {
    setCaptchaToken(null);
    captchaRef.current?.reset();
  }

  async function sendCode() {
    setError("");
    setBusy(true);
    try {
      const r = await postJson<{ ok?: boolean }>("/api/public/tools/email/start", { email, captchaToken });
      spendCaptcha();
      if (!r.ok) {
        setError(r.data.error ?? "Something went wrong. Try again.");
        return;
      }
      setCodeSent(true);
      setCode("");
    } catch {
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    setError("");
    setBusy(true);
    try {
      const r = await postJson<EmailSession>("/api/public/tools/email/verify", { email, code });
      if (!r.ok) {
        setError(r.data.error ?? "That code didn't match.");
        return;
      }
      onSession({ enabled: true, sender: r.data.sender, sends: r.data.sends ?? [], left: r.data.left ?? 0 });
      if (r.data.sender?.email) onSenderEmail(r.data.sender.email);
      setCodeSent(false);
    } catch {
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function forget() {
    await fetch("/api/public/tools/email/session", { method: "DELETE" }).catch(() => undefined);
    onSession({ ...session, sender: null, sends: [], left: 0 });
    setCodeSent(false);
    setSent(null);
  }

  async function send() {
    if (!ready.ok) {
      setError(ready.reason);
      return;
    }
    const recipients = [to, to2 ?? ""].map((s) => s.trim()).filter(Boolean);
    if (recipients.length === 0) {
      setError("Add the client's email address.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const r = await postJson<{ href?: string; recipients?: string[]; sends?: SentSummary[]; left?: number }>("/api/public/tools/email/send", {
        doc,
        logo,
        to: recipients,
        copyMe,
        captchaToken,
        path,
      });
      spendCaptcha();
      if (!r.ok) {
        if (r.data.code === "VERIFY") {
          onSession({ ...session, sender: null });
          setError("Your email session expired. Verify your address again.");
          return;
        }
        setError(r.data.error ?? "The email didn't go out. Try again.");
        return;
      }
      setSent({ href: r.data.href ?? "", recipients: r.data.recipients ?? recipients });
      onSession({ ...session, sends: r.data.sends ?? session.sends, left: r.data.left ?? session.left });
    } catch {
      setError("The email didn't go out. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const needsCaptcha = (!sender && !codeSent) || Boolean(sender && !sent);

  return (
    <>
      {open && (
        <section className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 sm:p-5" aria-label={`Email this ${word}`}>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-[15px] font-extrabold text-gray-900">
                <Mail className="h-4 w-4 text-[#0B57D8]" strokeWidth={2.5} />
                Email this {word}
              </h2>
              {sender ? (
                <p className="mt-0.5 text-[12.5px] text-gray-500">
                  Sending as <span className="font-semibold text-gray-700">{sender.email}</span>. Replies come to you.{" "}
                  <button type="button" onClick={() => void forget()} className="font-semibold underline underline-offset-2 hover:text-gray-900">
                    Not you?
                  </button>
                </p>
              ) : (
                <p className="mt-0.5 text-[12.5px] text-gray-500">First we make sure the address is yours. One code, once, and this browser remembers you for a month.</p>
              )}
            </div>
            <button type="button" onClick={onClose} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" aria-label="Close">
              <X className="h-4 w-4" strokeWidth={2.25} />
            </button>
          </div>

          {error && (
            <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-700">
              {error}
            </p>
          )}

          {/* ── Step 1: the sender's address ── */}
          {!sender && !codeSent && (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-[12.5px] font-bold text-gray-600">Your email</span>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" inputMode="email" className={INPUT} placeholder="you@yourbusiness.com" />
              </label>
              <button type="button" onClick={() => void sendCode()} disabled={busy || captchaBlocked || !email.trim()} className="wb-pill wb-pill-primary justify-center disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" strokeWidth={2.5} />}
                Send me a code
              </button>
            </div>
          )}

          {/* ── Step 2: the code ── */}
          {!sender && codeSent && (
            <div className="space-y-3">
              <p className="text-[13.5px] text-gray-600">
                We emailed a 6-digit code to <span className="font-semibold text-gray-900">{email}</span>. It expires in 10 minutes.
              </p>
              <label className="block">
                <span className="mb-1 block text-[12.5px] font-bold text-gray-600">Code</span>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className={`${INPUT} max-w-[200px] text-[20px] font-bold tracking-[0.3em]`}
                  placeholder="000000"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && code.length === 6) void verifyCode();
                  }}
                />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => void verifyCode()} disabled={busy || code.length !== 6} className="wb-pill wb-pill-primary justify-center disabled:opacity-60">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" strokeWidth={2.5} />}
                  Verify
                </button>
                <button type="button" onClick={() => setCodeSent(false)} className="text-[13px] font-semibold text-gray-500 underline-offset-2 hover:text-gray-900 hover:underline">
                  Use a different email
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: compose ── */}
          {sender && !sent && (
            <div className="space-y-3">
              {sender.blocked ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] font-semibold text-amber-800">Sending from this address is paused. You can still download the PDF.</p>
              ) : session.left <= 0 ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] font-semibold text-amber-800">You have sent today&apos;s five. A free WorkBench account sends as many as you like, with a pay link on each.</p>
              ) : null}
              <label className="block">
                <span className="mb-1 block text-[12.5px] font-bold text-gray-600">To</span>
                <input value={to} onChange={(e) => setTo(e.target.value)} type="email" inputMode="email" className={INPUT} placeholder="client@example.com" />
              </label>
              {to2 === null ? (
                <button type="button" onClick={() => setTo2("")} className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-600 hover:text-gray-900">
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                  Add another address
                </button>
              ) : (
                <label className="block">
                  <span className="mb-1 block text-[12.5px] font-bold text-gray-600">Also to</span>
                  <div className="flex gap-2">
                    <input value={to2} onChange={(e) => setTo2(e.target.value)} type="email" inputMode="email" className={INPUT} placeholder="second@example.com" />
                    <button type="button" onClick={() => setTo2(null)} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Remove second address">
                      <X className="h-4 w-4" strokeWidth={2} />
                    </button>
                  </div>
                </label>
              )}
              <label className="flex w-fit cursor-pointer items-center gap-2 text-[13px] font-semibold text-gray-600">
                <input type="checkbox" checked={copyMe} onChange={(e) => setCopyMe(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
                Send a copy to me
              </label>
              <p className="text-[12.5px] leading-relaxed text-gray-500">
                The email says &ldquo;{isEstimate ? "Estimate" : "Invoice"} {doc.number} from {doc.business.name || "your business"}&rdquo;, shows the total and a View button, and
                comes from {doc.business.name || "your business"} via WorkBench. Replies go to {sender.email}. Up to five a day.
              </p>
              <button type="button" onClick={() => void send()} disabled={busy || captchaBlocked || Boolean(sender.blocked) || session.left <= 0} data-wb-event={`tool_email_${doc.kind}`} className="wb-pill wb-pill-primary justify-center disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" strokeWidth={2.5} />}
                Send the {word}
              </button>
            </div>
          )}

          {/* ── Done ── */}
          {sender && sent && (
            <div className="space-y-3">
              <p className="flex items-start gap-2 text-[14px] font-semibold text-gray-900">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-700" strokeWidth={3} />
                <span>
                  Sent to {sent.recipients.join(" and ")}. You&apos;ll see <em className="not-italic font-bold">Viewed</em> below when they open it.
                </span>
              </p>
              <div className="flex flex-wrap items-center gap-3 text-[13px] font-semibold">
                <a href={sent.href} target="_blank" rel="noreferrer" className="text-[#0B57D8] underline-offset-2 hover:underline">
                  See what they see
                </a>
                <button type="button" onClick={() => setSent(null)} className="text-gray-500 underline-offset-2 hover:text-gray-900 hover:underline">
                  Send it to someone else
                </button>
              </div>
            </div>
          )}

          {needsCaptcha && (
            <div className="mt-3">
              <TurnstileWidget ref={captchaRef} action="tools" onToken={setCaptchaToken} />
            </div>
          )}
        </section>
      )}

      {/* ── Sent documents + the sender's pitch ── */}
      {sender && session.sends.length > 0 && (
        <section className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 sm:p-5" aria-label="Documents you emailed">
          <h2 className="text-[15px] font-extrabold text-gray-900">Emailed from here</h2>
          <ul className="mt-2 divide-y divide-gray-100">
            {session.sends.map((s) => (
              <li key={s.token} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <a href={`/t/${s.token}`} target="_blank" rel="noreferrer" className="block truncate text-[14px] font-semibold text-gray-900 hover:underline">
                    {s.kind === "estimate" ? "Estimate" : "Invoice"} #{s.number}
                    {s.clientName ? ` · ${s.clientName}` : ""}
                  </a>
                  <p className="truncate text-[12.5px] text-gray-500">
                    {money(s.total)} · sent {fmtDate(s.sentAt)} to {s.recipients.join(", ")}
                  </p>
                </div>
                {s.viewedAt ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-[12px] font-bold text-green-700">
                    <Eye className="h-3.5 w-3.5" strokeWidth={2.5} />
                    Viewed {fmtDate(s.viewedAt)}
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-[12px] font-bold text-gray-500">Not opened yet</span>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-3 rounded-xl border border-[#0B57D8]/20 bg-blue-50/60 p-3.5">
            <p className="text-[14px] font-bold text-gray-900">{isEstimate ? "Want them to approve it with a tap?" : "Want a Pay online button on these?"}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-gray-600">
              {isEstimate
                ? "Open a free WorkBench account with this estimate and the client signs it on their phone, deposit included. You keep this address and every client you've typed."
                : "Open a free WorkBench account with this invoice and the client pays by card or bank right from the email, with reminders that go out on their own. Sending is unlimited there."}
            </p>
            <button type="button" onClick={onGetPaid} data-wb-event={`tool_signup_sent_${doc.kind}`} className="mt-2 inline-flex items-center gap-2 text-[14px] font-bold text-[#0B57D8] hover:underline">
              Open a free account with this {word}
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
        </section>
      )}
    </>
  );
}
