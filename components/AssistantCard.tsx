"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { AlertTriangle, Check, ChevronDown, Clock, Copy, CreditCard, ExternalLink, Loader2, PencilLine, Plus, Route, Send, Sparkles, Trash2, X } from "lucide-react";
import type { Proposal } from "@/lib/assistant";
import type { RunnerEstimator } from "@/components/EstimatorRunner";

const EstimatorRunner = dynamic(() => import("@/components/EstimatorRunner"), { ssr: false });

/**
 * One Atlas confirmation card — the same component in the chat drawer and on
 * the talk screen (2026-10-23). Nothing happens until the user presses the
 * commit button (or, for ordinary cards, says yes out loud); the drawer owns
 * the submit and hands the card its onConfirm / onCancel.
 */

export type CardState = "pending" | "confirming" | "done" | "failed" | "dismissed";

export type CardProposal = Proposal & { state: CardState; resultNote?: string; /** when it was applied / failed / skipped (ms) — the talk screen keeps settled cards up for a moment */ settledAt?: number };

/** A card with its place in the chat — what the talk screen renders and settles. */
export type PlacedCard = { msgIdx: number; card: CardProposal };

/** Cards a spoken "yes" may confirm: ordinary ones (no money, nothing permanent, no typed phrase). */
export function voiceConfirmable(p: Proposal): boolean {
  return !p.danger && !p.money && !p.confirmText;
}

/** Cards that put words in front of a client (email, text, portal message,
 *  sending a document). Voice applies these only after the user has HEARD
 *  the message and said yes — never on the instruction alone (David
 *  2026-10-23: "communicating with clients will need to be approved"). */
export function isOutreach(p: Proposal): boolean {
  return /^(email_|send_|reply_|text_|post_|respond_|collect_deposit)/.test(p.kind);
}

// ── proposal card ────────────────────────────────────────────────────────────

/** Icon + default verb from the proposal kind — tools set confirmLabel when
 *  the generic verb would read wrong. */
function kindMeta(p: Proposal): { Icon: typeof Plus; verb: string } {
  const k = p.kind;
  if (p.danger || /^delete_|^remove_/.test(k)) return { Icon: Trash2, verb: "Delete" };
  if (/charge|refund|payout|bill/.test(k)) return { Icon: CreditCard, verb: "Confirm" };
  if (/^email_|^send_|^reply_|^post_|^collect_deposit|^respond_/.test(k)) return { Icon: Send, verb: "Send" };
  if (/^duplicate_/.test(k)) return { Icon: Copy, verb: "Duplicate" };
  if (/^clock|time_entry|time_block/.test(k)) return { Icon: Clock, verb: "Confirm" };
  if (/route/.test(k)) return { Icon: Route, verb: "Apply" };
  if (/^create_|^add_|^log_|^schedule_|^record_|^convert_/.test(k)) return { Icon: Plus, verb: "Create" };
  if (/^update_|^set_|^move_|^manage_|^assign_|^close_|^cancel_|^undo_|^default_/.test(k)) return { Icon: PencilLine, verb: "Save changes" };
  return { Icon: Sparkles, verb: "Confirm" };
}

/** "Client: Sarah Lane" → a ledger row; anything else → a plain line. */
function splitLine(line: string): { label: string; value: string } | null {
  const m = /^([A-Za-z][A-Za-z0-9 /&()'-]{0,30}):\s+(.+)$/.exec(line);
  if (!m) return null;
  return { label: m[1], value: m[2] };
}

/** Money, counts, dates and clock times get the console's Lexend numerals. */
function isNumeral(v: string): boolean {
  const s = v.trim();
  return (
    /^[-–]?\$\d[\d,]*(\.\d+)?$/.test(s) ||
    /^\d[\d,]*(\.\d+)?(%| ?h| ?hrs?| ?min)?$/.test(s) ||
    /^\d{4}-\d{2}-\d{2}/.test(s) ||
    /^\d{1,2}:\d{2}/.test(s)
  );
}

const BATCH_PREVIEW = 5;

type Tone = "pending" | "money" | "danger" | "done" | "failed";

/** One decision, one color. Ordinary changes wear the brand accent, money
 *  is amber, permanent is red, applied is green — the header wash, the
 *  kicker and the commit button all draw from the same ink. */
const TONE: Record<Tone, { ink: string; solid: string; onSolid: string; kicker: string }> = {
  pending: {
    ink: "var(--wb-accent, #0b57d8)",
    solid: "var(--wb-accent, #0b57d8)",
    onSolid: "var(--wb-on-accent, #ffffff)",
    kicker: "Needs your OK",
  },
  money: { ink: "#b45309", solid: "#d97706", onSolid: "#ffffff", kicker: "Moves real money" },
  danger: { ink: "#b91c1c", solid: "#dc2626", onSolid: "#ffffff", kicker: "Permanent" },
  done: { ink: "#15803d", solid: "#16a34a", onSolid: "#ffffff", kicker: "Applied" },
  failed: { ink: "#b91c1c", solid: "#dc2626", onSolid: "#ffffff", kicker: "Didn't go through" },
};

export function ProposalCard({
  proposal: p,
  onConfirm,
  onCancel,
}: {
  proposal: CardProposal;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [expanded, setExpanded] = useState(false);
  // Estimate-tool cards carry the full spec — offer a live "Try it" before Confirm
  const [trying, setTrying] = useState(false);
  const payload = (p.payload && typeof p.payload === "object" ? p.payload : {}) as Record<string, unknown>;
  const previewSpec = p.kind === "manage_estimator" && payload.spec && typeof payload.spec === "object" ? (payload.spec as RunnerEstimator["spec"]) : null;
  const needsTyping = Boolean(p.confirmText);
  const armed = !needsTyping || typed.trim().toLowerCase() === p.confirmText!.trim().toLowerCase();
  const { Icon, verb } = kindMeta(p);
  const batchCount = p.batch?.length ?? 0;
  const isBatch = batchCount > 0;
  // "Save all 3", "Send all 12" — the verb's first word carries the batch
  const commitLabel = p.confirmLabel ?? (isBatch ? `${verb.split(" ")[0]} all ${batchCount}` : verb);

  if (p.state === "dismissed") {
    return (
      <div className="flex items-center gap-2 px-1 py-1 text-xs text-gray-500">
        <X size={12} className="shrink-0" />
        <span className="truncate line-through decoration-gray-300">{p.title}</span>
        <span className="ml-auto shrink-0">Skipped</span>
      </div>
    );
  }

  const tone: Tone =
    p.state === "done"
      ? "done"
      : p.state === "failed"
        ? "failed"
        : p.danger
          ? "danger"
          : p.money
            ? "money"
            : "pending";
  const t = TONE[tone];
  const kicker = tone === "pending" && isBatch ? `${batchCount} changes · needs your OK` : t.kicker;
  const lines = isBatch && !expanded ? p.lines.slice(0, BATCH_PREVIEW) : p.lines;
  const hidden = isBatch && !expanded ? Math.max(0, p.lines.length - BATCH_PREVIEW) : 0;
  const busy = p.state === "confirming";
  const open = p.state === "pending" || p.state === "confirming";

  return (
    <div className="card-ledger overflow-hidden" role="group" aria-label={p.title}>
      {/* header — a tinted band in the decision's color: kicker, then the
          title in the console's display face. Applied cards get the
          rubber-stamp ritual the approve flow already uses. */}
      <div
        className="flex items-start gap-3 px-3.5 pb-2.5 pt-3"
        style={{ background: `color-mix(in srgb, ${t.ink} 9%, transparent)` }}
      >
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold leading-none" style={{ color: t.ink }}>
            {tone === "done" ? <Check size={12} strokeWidth={3} /> : tone === "failed" ? <AlertTriangle size={12} /> : <Icon size={12} />}
            {kicker}
          </p>
          <p className="font-display mt-1.5 text-[14px] font-bold leading-snug text-gray-900">{p.title}</p>
        </div>
        {tone === "done" && (
          <span
            className="stamp-slam font-display mt-0.5 shrink-0 rounded-[4px] border-2 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{ borderColor: t.ink, color: t.ink }}
          >
            Done
          </span>
        )}
      </div>

      {/* body — key/value ledger rows, or a numbered preview for batches */}
      {lines.length > 0 && (
        <div className="px-3.5">
          {isBatch ? (
            <ol className="divide-y divide-gray-100">
              {lines.map((l, j) => (
                <li key={j} className="flex items-baseline gap-2 py-1.5 text-xs">
                  <span className="numeral-ledger w-4 shrink-0 text-right text-[11px] text-gray-400">{j + 1}</span>
                  <span className="min-w-0 truncate text-gray-700">{l}</span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="divide-y divide-gray-100">
              {lines.map((l, j) => {
                const kv = splitLine(l);
                return kv ? (
                  <div key={j} className="flex items-baseline justify-between gap-3 py-1.5 text-xs">
                    <span className="shrink-0 text-gray-500">{kv.label}</span>
                    <span
                      className={`min-w-0 text-right font-medium text-gray-800 [overflow-wrap:anywhere] ${
                        isNumeral(kv.value) ? "numeral-ledger text-[13px]" : ""
                      }`}
                    >
                      {kv.value}
                    </span>
                  </div>
                ) : (
                  <p key={j} className="whitespace-pre-wrap py-1.5 text-xs leading-relaxed text-gray-700 [overflow-wrap:anywhere]">
                    {l}
                  </p>
                );
              })}
            </div>
          )}
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="flex w-full items-center gap-1 border-t border-gray-100 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-800"
            >
              <ChevronDown size={13} />
              Show all {p.lines.length}
            </button>
          )}
        </div>
      )}

      {/* typed confirmation for destructive cards */}
      {needsTyping && open && (
        <div className="mx-3.5 mt-1 border-t border-gray-100 pt-2.5">
          <label className="block text-xs" style={{ color: t.ink }}>
            Type <span className="font-semibold">{p.confirmText}</span> to allow this
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={p.confirmText}
              autoComplete="off"
              className="mt-1.5 w-full rounded-[8px] border border-red-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-300"
            />
          </label>
        </div>
      )}

      {/* footer — quiet skip on the left, one solid commit on the right */}
      {open ? (
        <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-gray-100 px-3.5 py-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-full px-2.5 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50"
          >
            Skip
          </button>
          {previewSpec && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setTrying(true)}
              className="mr-auto rounded-full border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              Try it
            </button>
          )}
          <button
            type="button"
            disabled={busy || !armed}
            onClick={onConfirm}
            className="btn-tool flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-40"
            style={{ background: t.solid, color: t.onSolid }}
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} strokeWidth={2.5} />}
            {commitLabel}
          </button>
        </div>
      ) : p.state === "failed" ? (
        <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-red-100 bg-red-50/60 px-3.5 py-2 text-xs font-medium text-red-700">
          <span className="min-w-0 truncate">{p.resultNote}</span>
          <button type="button" onClick={onConfirm} className="shrink-0 underline-offset-2 hover:underline">
            Try again
          </button>
        </div>
      ) : isBatch || p.href ? (
        <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-gray-100 px-3.5 py-2 text-xs text-gray-500">
          <span className="min-w-0 truncate">{isBatch ? p.resultNote : "Saved"}</span>
          {p.href && (
            <Link href={p.href} className="flex shrink-0 items-center gap-1 font-medium text-gray-700 underline-offset-2 hover:underline">
              Open <ExternalLink size={11} />
            </Link>
          )}
        </div>
      ) : null}
      {previewSpec && trying && (
        <EstimatorRunner
          portal
          estimators={[{ id: "preview", name: typeof payload.name === "string" ? payload.name : p.title, description: null, usesAtlas: false, spec: previewSpec, preview: true }]}
          open={trying}
          onClose={() => setTrying(false)}
        />
      )}
    </div>
  );
}
