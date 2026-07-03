"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, RotateCcw, Send, Sparkles, X } from "lucide-react";
import type { Proposal } from "@/lib/assistant";

/**
 * Owner assistant chat drawer (docs/plans/ai-assistant-plan.md). Reads are
 * answered directly; writes arrive as Proposal cards — nothing happens until
 * the user presses Confirm, which submits to the same existing API route the
 * equivalent button uses. History lives in sessionStorage only.
 */

type CardState = "pending" | "confirming" | "done" | "failed" | "dismissed";

type Msg = {
  role: "user" | "assistant";
  content: string;
  proposals?: (Proposal & { state: CardState; resultNote?: string })[];
};

const STORAGE_KEY = "sf-assistant-chat";

const STARTERS = [
  "What needs my attention right now?",
  "What's on the schedule today?",
  "Do we have any overdue invoices or unsigned agreements?",
  "Draft a friendly follow-up message for a quote I sent last week.",
];

function loadHistory(): Msg[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Msg[]) : [];
    return Array.isArray(parsed) ? parsed.slice(-30) : [];
  } catch {
    return [];
  }
}

/** Render /app/... paths in assistant text as real links. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(\/app\/[a-z0-9\-/]*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("/app/") ? (
          <Link key={i} href={part} className="font-medium text-green-700 underline underline-offset-2">
            {part}
          </Link>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </>
  );
}

function ProposalCard({
  proposal: p,
  onConfirm,
  onCancel,
}: {
  proposal: Proposal & { state: CardState; resultNote?: string };
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const needsTyping = Boolean(p.confirmText);
  const armed = !needsTyping || typed.trim().toLowerCase() === p.confirmText!.trim().toLowerCase();

  return (
    <div
      className={`rounded-lg border px-3 py-2.5 ${
        p.state === "done"
          ? "border-green-300 bg-green-50"
          : p.state === "failed"
            ? "border-red-200 bg-red-50"
            : p.danger
              ? "border-red-300 bg-red-50"
              : "border-amber-300 bg-amber-50"
      }`}
    >
      <p className={`text-sm font-semibold ${p.danger && p.state === "pending" ? "text-red-800" : "text-gray-900"}`}>
        {p.title}
      </p>
      {p.lines.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {p.lines.map((l, j) => (
            <p key={j} className="text-xs text-gray-600">
              {l}
            </p>
          ))}
        </div>
      )}
      {p.state === "pending" || p.state === "confirming" ? (
        <div className="mt-2 space-y-2">
          {needsTyping && (
            <div>
              <p className="mb-1 text-xs font-medium text-red-800">
                Type <span className="font-semibold">{p.confirmText}</span> to allow this:
              </p>
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={p.confirmText}
                className="w-full rounded border border-red-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-red-400"
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={p.state === "confirming" || !armed}
              onClick={onConfirm}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-50 ${
                p.danger ? "bg-red-600 hover:bg-red-700" : "bg-green-500 hover:bg-green-600"
              }`}
            >
              {p.state === "confirming" ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Check size={12} />
              )}
              {p.danger ? "Delete" : "Confirm"}
            </button>
            <button
              type="button"
              disabled={p.state === "confirming"}
              onClick={onCancel}
              className="rounded border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className={`mt-1.5 text-xs font-semibold ${p.state === "done" ? "text-green-700" : "text-red-700"}`}>
          {p.resultNote}
        </p>
      )}
    </div>
  );
}

export default function AssistantDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMessages(loadHistory());
  }, []);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      bottomRef.current?.scrollIntoView();
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function persist(next: Msg[]) {
    setMessages(next);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(-30)));
    } catch {
      // storage full/blocked — chat still works for the session
    }
  }

  async function send(text: string) {
    const content = text.trim().slice(0, 4000);
    if (!content || loading) return;
    setError("");
    setInput("");
    const next: Msg[] = [...messages, { role: "user", content }];
    persist(next);
    setLoading(true);
    try {
      const res = await fetch("/api/app/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // strip proposals from what we send — the model only needs the text
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })) }),
      });
      const data = (await res.json().catch(() => null)) as
        | { reply?: string; proposals?: Proposal[]; error?: string }
        | null;
      if (!res.ok || !data?.reply) {
        setError(data?.error ?? "Something went wrong — please try again.");
      } else {
        persist([
          ...next,
          {
            role: "assistant",
            content: data.reply,
            proposals: (data.proposals ?? []).map((p) => ({ ...p, state: "pending" as const })),
          },
        ]);
      }
    } catch {
      setError("Couldn't reach the assistant — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function setCard(msgIdx: number, propId: string, patch: Partial<{ state: CardState; resultNote: string }>) {
    persist(
      messages.map((m, i) =>
        i === msgIdx
          ? { ...m, proposals: m.proposals?.map((p) => (p.id === propId ? { ...p, ...patch } : p)) }
          : m
      )
    );
  }

  async function confirm(msgIdx: number, prop: Proposal) {
    setCard(msgIdx, prop.id, { state: "confirming" });
    try {
      const hasBody = prop.method !== "DELETE" && Object.keys(prop.payload).length > 0;
      const res = await fetch(prop.endpoint, {
        method: prop.method,
        ...(hasBody
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(prop.payload) }
          : {}),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setCard(msgIdx, prop.id, {
          state: "failed",
          resultNote: data?.error ?? "That didn't go through — try it from the page instead.",
        });
      } else {
        setCard(msgIdx, prop.id, { state: "done", resultNote: "Done!" });
        router.refresh();
      }
    } catch {
      setCard(msgIdx, prop.id, { state: "failed", resultNote: "Network error — nothing was saved." });
    }
  }

  function reset() {
    persist([]);
    setError("");
    setInput("");
    inputRef.current?.focus();
  }

  if (!open) return null;
  return (
    <>
      {/* backdrop (mobile emphasis; click closes everywhere) */}
      <div className="fixed inset-0 z-40 bg-black/20 sm:bg-black/10" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-full flex-col border-l border-gray-200 bg-paper shadow-2xl sm:w-[400px]">
        {/* header */}
        <div className="flex h-[57px] shrink-0 items-center gap-2.5 border-b border-gray-200 px-4">
          <Sparkles size={17} className="text-green-600" />
          <p className="text-sm font-semibold text-gray-900">Assistant</p>
          <span className="stamp border-green-600/30 bg-green-600/[0.06] text-[10px] text-green-700">
            Beta
          </span>
          <div className="ml-auto flex items-center gap-1">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={reset}
                title="New chat"
                className="rounded-md p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
              >
                <RotateCcw size={15} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close assistant"
              className="rounded-md p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* messages */}
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.length === 0 && (
            <div className="pt-6">
              <p className="mb-1 text-sm font-semibold text-gray-900">
                Ask me anything about your business.
              </p>
              <p className="mb-4 text-xs text-gray-500">
                I can dig through your schedule, money, clients, and agreements, draft messages,
                and — with your confirmation — manage clients, quotes, invoices, jobs,
                appointments, and payments for you.
              </p>
              <div className="space-y-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="block w-full rounded border border-gray-200 bg-white px-3 py-2 text-left text-xs text-gray-700 transition-colors hover:border-green-500 hover:text-green-700"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="ml-8 rounded-lg bg-green-600/[0.08] px-3 py-2">
                <p className="whitespace-pre-wrap text-sm text-gray-900">{m.content}</p>
              </div>
            ) : (
              <div key={i} className="mr-4 space-y-2">
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <p className="whitespace-pre-wrap text-sm text-gray-800">
                    <Linkified text={m.content} />
                  </p>
                </div>
                {m.proposals?.map((p) =>
                  p.state === "dismissed" ? null : (
                    <ProposalCard
                      key={p.id}
                      proposal={p}
                      onConfirm={() => confirm(i, p)}
                      onCancel={() => setCard(i, p.id, { state: "dismissed" })}
                    />
                  )
                )}
              </div>
            )
          )}
          {loading && (
            <div className="mr-4 flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
              <Loader2 size={13} className="animate-spin text-green-600" />
              <span className="text-xs text-gray-500">Looking that up...</span>
            </div>
          )}
          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* input */}
        <div className="shrink-0 border-t border-gray-200 p-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={2}
              maxLength={4000}
              placeholder="Ask, or tell me what to do..."
              className="max-h-32 flex-1 resize-none rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              type="button"
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              aria-label="Send"
              className="rounded bg-green-500 p-2.5 text-white transition-colors hover:bg-green-600 disabled:opacity-40"
            >
              <Send size={15} />
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-gray-400">
            AI answers can be wrong — verify anything important on its page.
          </p>
        </div>
      </div>
    </>
  );
}
