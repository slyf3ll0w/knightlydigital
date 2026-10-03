"use client";

import { useCallback, useRef, useState } from "react";
import { Mail, MessageSquare, Send } from "lucide-react";
import Modal from "@/components/Modal";
import { InfoTip } from "@/components/ds";
import { hapticImpact } from "@/lib/haptics";
import type { SendChannels } from "@/lib/send-channels";

/**
 * "Send to client" — by email, by text from the business line, or both
 * (David 2026-10-03). Used by every document send (quote, invoice, deposit,
 * agreement): when the client can be reached BOTH ways the chooser opens
 * with both ticked; one way only and nothing is asked. `choose()` resolves
 * with the channels (or null for cancel); render `{chooser}` once.
 *
 * Text is offered only when the business line can send — the page computes
 * `canText` from the line's registration and the client's consent.
 */
export type SendChoiceOptions = {
  email: string | null;
  /** Formatted phone, shown as the text recipient. */
  phone: string | null;
  canText: boolean;
  /** What is being sent — the sheet's title ("Send the quote"). */
  what: string;
  /** Pre-ticked channels; default both. */
  defaults?: Partial<SendChannels>;
};

type Pending = { opts: SendChoiceOptions; resolve: (c: SendChannels | null) => void };

export function useSendChoice() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [pick, setPick] = useState<SendChannels>({ email: true, text: true });
  const resolved = useRef(false);

  const choose = useCallback((opts: SendChoiceOptions): Promise<SendChannels | null> => {
    const canEmail = Boolean(opts.email);
    const canText = Boolean(opts.canText && opts.phone);
    // One way to reach them: no question to ask.
    if (!(canEmail && canText)) return Promise.resolve({ email: canEmail, text: canText });
    return new Promise((resolve) => {
      resolved.current = false;
      setPick({ email: opts.defaults?.email ?? true, text: opts.defaults?.text ?? true });
      setPending({ opts, resolve });
    });
  }, []);

  const finish = (c: SendChannels | null) => {
    if (!pending || resolved.current) return;
    resolved.current = true;
    pending.resolve(c);
    setPending(null);
  };

  const row = (key: keyof SendChannels, Icon: typeof Mail, label: string, to: string, info?: string) => (
    <label className="flex cursor-pointer items-center gap-3 rounded-[12px] border border-gray-200 bg-white px-3.5 py-3">
      <input
        type="checkbox"
        checked={pick[key]}
        onChange={(e) => setPick((p) => ({ ...p, [key]: e.target.checked }))}
        className="h-4 w-4 accent-[color:var(--ds-primary)]"
      />
      <Icon size={16} className="shrink-0 text-gray-500" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-sm font-semibold text-gray-900">
          {label}
          {info && <InfoTip>{info}</InfoTip>}
        </span>
        <span className="block truncate text-xs text-gray-500">{to}</span>
      </span>
    </label>
  );

  const chooser = (
    <Modal open={Boolean(pending)} onClose={() => finish(null)} size="sm" portal>
      {pending && (
        <div className="space-y-3 text-left">
          <h2 className="text-base font-semibold text-gray-900">{pending.opts.what}</h2>
          <div className="grid gap-2">
            {row("email", Mail, "Email", pending.opts.email ?? "")}
            {row(
              "text",
              MessageSquare,
              "Text",
              pending.opts.phone ?? "",
              "Goes out from your business line, with the same link. The client can reply by text and it lands in Messages."
            )}
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={() => finish(null)} className="btn-tool-line rounded-[10px] bg-white px-3.5 py-2 text-sm font-medium text-gray-700">
              Cancel
            </button>
            <button
              type="button"
              disabled={!pick.email && !pick.text}
              onClick={() => {
                hapticImpact("LIGHT");
                finish(pick);
              }}
              className="btn-primary disabled:opacity-50"
            >
              <Send size={13} />
              Send
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
