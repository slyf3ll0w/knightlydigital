"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { CalendarClock, Mail, MessageSquare, Send } from "lucide-react";
import Modal from "@/components/Modal";
import { InfoTip } from "@/components/ds";
import { inputCls } from "@/components/Input";
import { hapticImpact } from "@/lib/haptics";
import { slotTimeOptions } from "@/lib/scheduling";
import type { SendChannels } from "@/lib/send-channels";
import { tomorrowISO } from "@/lib/send-later-shared";

/**
 * "Send to client" — by email, by text from the business line, or both
 * (David 2026-10-03). Used by every document send (quote, invoice, deposit,
 * agreement): when the client can be reached BOTH ways the chooser opens
 * with both ticked; one way only and nothing is asked. `choose()` resolves
 * with the channels (or null for cancel); render `{chooser}` once.
 *
 * Text is offered only when the business line can send — the page computes
 * `canText` from the line's registration and the client's consent.
 *
 * Send later (quotes and invoices, 2026-10-05): with `allowLater` the sheet
 * always opens and carries a third choice, a date + time in the company's
 * timezone (default tomorrow 9:00 AM, 15-minute slots). The result then
 * carries `later: { date, time }` and the caller parks the document instead
 * of sending it.
 */
export type SendChoiceOptions = {
  email: string | null;
  /** Formatted phone, shown as the text recipient. */
  phone: string | null;
  canText: boolean;
  /** What is being sent — the sheet's title ("Send the quote"). */
  what: string;
  /**
   * Pre-ticked channels; default both. A channel that CAN be used but is
   * not ticked here is a question, so the sheet opens even when it is the
   * only way to reach the client — a quote for a phone-only client is
   * never texted on its own (10DLC filing: quotes go by email, 2026-10-07).
   */
  defaults?: Partial<SendChannels>;
  /** Replaces the Text row's InfoTip (the quote's "email first" note). */
  textInfo?: string;
  /** Offer "Send later" (quotes and invoices). */
  allowLater?: boolean;
  /**
   * The company's IANA zone: "tomorrow" for the Send later default is the
   * company's tomorrow, which the server parses the date in — not the
   * browser's, which can be a day ahead for someone travelling. Browser
   * zone when omitted.
   */
  timeZone?: string;
};

const TEXT_INFO = "Goes out from your business line, with the same link. The client can reply by text and it lands in Messages.";

export type SendChoiceResult = SendChannels & {
  /** Set when the sender picked a time: company-zone wall clock. */
  later?: { date: string; time: string };
};

type Pending = { opts: SendChoiceOptions; resolve: (c: SendChoiceResult | null) => void };

export function useSendChoice() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [pick, setPick] = useState<SendChannels>({ email: true, text: true });
  const [later, setLater] = useState(false);
  const [laterDate, setLaterDate] = useState("");
  const [laterTime, setLaterTime] = useState("09:00");
  const resolved = useRef(false);
  const times = useMemo(() => slotTimeOptions(15, 7 * 60), []);

  const choose = useCallback((opts: SendChoiceOptions): Promise<SendChoiceResult | null> => {
    const canEmail = Boolean(opts.email);
    const canText = Boolean(opts.canText && opts.phone);
    const picked: SendChannels = {
      email: canEmail && (opts.defaults?.email ?? true),
      text: canText && (opts.defaults?.text ?? true),
    };
    // One way to reach them, already ticked, and no Send later on offer: no
    // question to ask. A way that is open but NOT ticked (a quote's Text)
    // is one, even on its own — nothing goes out that way unasked.
    const oneWayAndChosen = !(canEmail && canText) && picked.email === canEmail && picked.text === canText;
    if (oneWayAndChosen && !opts.allowLater) return Promise.resolve(picked);
    return new Promise((resolve) => {
      resolved.current = false;
      setPick(picked);
      setLater(false);
      setLaterDate(tomorrowISO(opts.timeZone));
      setLaterTime("09:00");
      setPending({ opts, resolve });
    });
  }, []);

  const finish = (c: SendChoiceResult | null) => {
    if (!pending || resolved.current) return;
    resolved.current = true;
    pending.resolve(c);
    setPending(null);
  };

  const row = (key: keyof SendChannels, Icon: typeof Mail, label: string, to: string, info?: string) => (
    <label className="flex cursor-pointer items-center gap-3 rounded-[12px] border border-[color:var(--ds-line)] bg-[color:var(--ds-surface)] px-3.5 py-3">
      <input
        type="checkbox"
        checked={pick[key]}
        onChange={(e) => setPick((p) => ({ ...p, [key]: e.target.checked }))}
        className="h-4 w-4 accent-[color:var(--ds-primary)]"
      />
      <Icon size={16} className="shrink-0 text-[color:var(--ds-muted)]" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-sm font-semibold text-[color:var(--ds-ink)]">
          {label}
          {info && <InfoTip>{info}</InfoTip>}
        </span>
        <span className="block truncate text-xs text-[color:var(--ds-muted)]">{to}</span>
      </span>
    </label>
  );

  const canEmail = Boolean(pending?.opts.email);
  const canTextNow = Boolean(pending?.opts.canText && pending?.opts.phone);
  const nothingPicked = !pick.email && !pick.text;
  const laterReady = later ? Boolean(laterDate && laterTime) : true;

  const chooser = (
    <Modal open={Boolean(pending)} onClose={() => finish(null)} size="sm" portal>
      {pending && (
        <div className="space-y-3 text-left">
          <h2 className="text-base font-semibold text-[color:var(--ds-ink)]">{pending.opts.what}</h2>
          <div className="grid gap-2">
            {canEmail && row("email", Mail, "Email", pending.opts.email ?? "")}
            {canTextNow &&
              row("text", MessageSquare, "Text", pending.opts.phone ?? "", pending.opts.textInfo ?? TEXT_INFO)}
            {!canEmail && !canTextNow && (
              <p className="text-sm text-[color:var(--ds-muted)]">No email or textable phone on file yet — add one before the send time.</p>
            )}
          </div>

          {pending.opts.allowLater && (
            <div className="rounded-[12px] border border-[color:var(--ds-line)] bg-[color:var(--ds-surface)] px-3.5 py-3">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={later}
                  onChange={(e) => setLater(e.target.checked)}
                  className="h-4 w-4 accent-[color:var(--ds-primary)]"
                />
                <CalendarClock size={16} className="shrink-0 text-[color:var(--ds-muted)]" />
                <span className="flex items-center gap-1 text-sm font-semibold text-[color:var(--ds-ink)]">
                  Send later
                  <InfoTip>
                    Picks a date and time in your company&apos;s timezone. Until then it stays a draft you can still edit;
                    whatever is on it at that moment is what goes out. You&apos;ll get a notification when it&apos;s sent.
                  </InfoTip>
                </span>
              </label>
              {later && (
                <div className="mt-2.5 grid grid-cols-[1fr_auto] gap-2">
                  <input
                    type="date"
                    value={laterDate}
                    onChange={(e) => setLaterDate(e.target.value)}
                    aria-label="Send date"
                    className={inputCls}
                  />
                  <select
                    value={laterTime}
                    onChange={(e) => setLaterTime(e.target.value)}
                    aria-label="Send time"
                    className={`${inputCls} min-w-[118px]`}
                  >
                    {times.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={() => finish(null)} className="btn-tool-line rounded-[10px] bg-white px-3.5 py-2 text-sm font-medium text-[color:var(--ds-ink-2)]">
              Cancel
            </button>
            <button
              type="button"
              disabled={nothingPicked || !laterReady}
              onClick={() => {
                hapticImpact("LIGHT");
                finish(later ? { ...pick, later: { date: laterDate, time: laterTime } } : pick);
              }}
              className="btn-primary disabled:opacity-50"
            >
              {later ? <CalendarClock size={13} /> : <Send size={13} />}
              {later ? "Schedule" : "Send"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );

  return { choose, chooser };
}

/** "Emailed to a@b.com · Texted to (469) 555-0100" from a send route's answer. */
export function sentSummary(
  data: { emailed?: boolean | null; texted?: boolean | null; to?: string | null; phone?: string | null } | null,
  fallback: { email?: string | null; phone?: string | null }
): string {
  const parts: string[] = [];
  if (data?.emailed) parts.push(`Emailed to ${data.to ?? fallback.email ?? "the client"}`);
  if (data?.texted) parts.push(`Texted to ${data.phone ?? fallback.phone ?? "the client"}`);
  return parts.join(" · ") || "Sent";
}
