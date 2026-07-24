"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bug,
  Check,
  ExternalLink,
  Lightbulb,
  Loader2,
  Megaphone,
  MessageSquare,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";

type Ticket = {
  id: string;
  type: "BUG" | "SUGGESTION";
  status: "OPEN" | "PLANNED" | "RESOLVED" | "DECLINED";
  title: string;
  details: string;
  pageUrl: string | null;
  response: string | null;
  createdAt: string;
  user: { name: string; email: string } | null;
  company: { id: string; name: string };
  roadmapItem: { id: string; title: string; shippedAt: string | null } | null;
};

type PanelMode = "approve" | "resolve" | "decline" | "reply";

const statusChip: Record<Ticket["status"], { label: string; cls: string }> = {
  OPEN: { label: "Open", cls: "bg-amber-100 text-amber-700" },
  PLANNED: { label: "On the board", cls: "bg-blue-100 text-blue-700" },
  RESOLVED: { label: "Resolved", cls: "bg-green-100 text-green-700" },
  DECLINED: { label: "Declined", cls: "bg-gray-200 text-gray-600" },
};

const CATEGORIES = [
  { value: "FEATURE", label: "Feature" },
  { value: "QOL", label: "Quality of Life" },
  { value: "BUG", label: "Bug" },
] as const;

export default function FeedbackClient({ tickets }: { tickets: Ticket[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<"ALL" | "BUG" | "SUGGESTION">("ALL");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const visible = filter === "ALL" ? tickets : tickets.filter((t) => t.type === filter);
  const open = visible.filter((t) => t.status === "OPEN");
  const reviewed = visible.filter((t) => t.status !== "OPEN");

  async function patch(id: string, body: Record<string, unknown>): Promise<boolean> {
    setError("");
    setBusy(id);
    try {
      const res = await fetch(`/api/superadmin/feedback/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong.");
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function remove(t: Ticket) {
    if (!confirm(`Delete "${t.title}"? The submitter loses it from their list too.`)) return;
    setBusy(t.id);
    try {
      await fetch(`/api/superadmin/feedback/${t.id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Support &amp; suggestions</h1>
          <p className="mt-1 text-sm text-gray-500">
            Bug reports and feature ideas filed from Help &amp; Feedback inside the app. Approving
            posts an editable copy onto the public Upcoming Features board.
          </p>
        </div>
        <nav className="flex gap-1 rounded-md border border-gray-200 bg-white p-0.5 text-xs">
          {(
            [
              ["ALL", "All"],
              ["BUG", "Bugs"],
              ["SUGGESTION", "Suggestions"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`rounded px-2.5 py-1 font-medium ${
                filter === value ? "bg-[#0B57D8] text-white" : "text-gray-500 hover:text-gray-900"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 space-y-3">
        {open.length === 0 && (
          <p className="rounded-xl border border-dashed border-gray-300 bg-white px-5 py-8 text-center text-sm text-gray-400">
            No open tickets.
          </p>
        )}
        {open.map((t) => (
          <TicketCard key={t.id} t={t} busy={busy === t.id} onPatch={patch} onDelete={remove} />
        ))}
      </div>

      {reviewed.length > 0 && (
        <>
          <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-gray-400">
            Reviewed
          </h2>
          <div className="mt-3 space-y-3">
            {reviewed.map((t) => (
              <TicketCard key={t.id} t={t} busy={busy === t.id} onPatch={patch} onDelete={remove} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * One ticket. Top-level component (NOT nested in FeedbackClient) so typing in
 * the editor doesn't remount the card — a nested component function gets a new
 * identity every parent render, which resets the textarea cursor to the start
 * and makes typing come out backwards.
 */
function TicketCard({
  t,
  busy,
  onPatch,
  onDelete,
}: {
  t: Ticket;
  busy: boolean;
  onPatch: (id: string, body: Record<string, unknown>) => Promise<boolean>;
  onDelete: (t: Ticket) => void;
}) {
  const [mode, setMode] = useState<PanelMode | null>(null);

  // Approve-editor draft — what actually lands on the public board
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDetails, setDraftDetails] = useState("");
  const [draftCategory, setDraftCategory] = useState<string>("FEATURE");
  const [draftPrivate, setDraftPrivate] = useState("");
  const [draftResponse, setDraftResponse] = useState("");

  const chip = statusChip[t.status];

  function openPanel(next: PanelMode) {
    setMode(next);
    if (next === "approve") {
      setDraftTitle(t.title);
      setDraftDetails(t.details);
      setDraftCategory(t.type === "BUG" ? "BUG" : "FEATURE");
      setDraftPrivate(
        `From ${t.user ? `${t.user.name} (${t.user.email})` : "a deleted user"} · ${t.company.name}`
      );
    }
    setDraftResponse(next === "reply" ? (t.response ?? "") : "");
  }

  async function submit(body: Record<string, unknown>) {
    if (await onPatch(t.id, body)) setMode(null);
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
              t.type === "BUG" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"
            }`}
          >
            {t.type === "BUG" ? <Bug size={16} /> : <Lightbulb size={16} />}
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900">{t.title}</h3>
            <p className="text-xs text-gray-400">
              {t.user ? `${t.user.name} — ${t.user.email}` : "Deleted user"} ·{" "}
              <Link href={`/superadmin/company/${t.company.id}`} className="hover:underline">
                {t.company.name}
              </Link>{" "}
              · {new Date(t.createdAt).toLocaleDateString()}
              {t.pageUrl ? ` · ${t.pageUrl}` : ""}
            </p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${chip.cls}`}>
          {chip.label}
        </span>
      </div>

      <p className="mt-3 whitespace-pre-line text-sm text-gray-700">{t.details}</p>

      {t.response && (
        <p className="mt-3 border-l-2 border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-600 whitespace-pre-line">
          <span className="font-semibold">Your reply:</span> {t.response}
        </p>
      )}
      {t.roadmapItem && (
        <p className="mt-3 text-xs text-gray-500">
          Posted to the board as{" "}
          <Link
            href="/roadmap"
            target="_blank"
            className="inline-flex items-center gap-1 font-semibold text-[#0B57D8] hover:underline"
          >
            {t.roadmapItem.title} <ExternalLink size={11} />
          </Link>
          {t.roadmapItem.shippedAt ? " (shipped)" : ""}
        </p>
      )}

      {/* ── Actions ── */}
      {!mode && (
        <div className="mt-4 flex flex-wrap gap-2">
          {t.status === "OPEN" && (
            <>
              <button
                onClick={() => openPanel("approve")}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B57D8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A4CBB] disabled:opacity-50"
              >
                <Megaphone size={14} /> Approve &amp; post to board
              </button>
              <button
                onClick={() => openPanel("resolve")}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50"
              >
                <Check size={14} /> {t.type === "BUG" ? "Mark fixed" : "Mark done"}
              </button>
              <button
                onClick={() => openPanel("decline")}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                <X size={14} /> Decline
              </button>
            </>
          )}
          {t.status !== "OPEN" && (
            <>
              <button
                onClick={() => openPanel("reply")}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                <MessageSquare size={12} />
                {t.response ? "Edit reply" : "Add reply"}
              </button>
              <button
                onClick={() => submit({ action: "reopen" })}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                Reopen
              </button>
            </>
          )}
          <button
            onClick={() => onDelete(t)}
            disabled={busy}
            className="ml-auto inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-gray-400 hover:text-red-600"
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>
      )}

      {/* ── Approve editor — edit before it goes public ── */}
      {mode === "approve" && (
        <div className="mt-4 space-y-2.5 rounded-lg border border-blue-200 bg-blue-50/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#0B57D8]">
            Edit before posting — this is what everyone sees on Upcoming Features
          </p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                onClick={() => setDraftCategory(c.value)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  draftCategory === c.value
                    ? "bg-[#0B57D8] text-white"
                    : "border border-gray-300 bg-white text-gray-600 hover:border-gray-400"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <input
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            maxLength={200}
            placeholder="Board title"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B57D8]"
          />
          <textarea
            value={draftDetails}
            onChange={(e) => setDraftDetails(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Public details (optional)"
            className="w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B57D8]"
          />
          <textarea
            value={draftPrivate}
            onChange={(e) => setDraftPrivate(e.target.value)}
            maxLength={5000}
            rows={2}
            placeholder="Private note — only board editors see this (optional)"
            className="w-full resize-none border border-amber-300 bg-amber-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <textarea
            value={draftResponse}
            onChange={(e) => setDraftResponse(e.target.value)}
            maxLength={2000}
            rows={2}
            placeholder="Reply to the submitter — shows on their tickets list (optional)"
            className="w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B57D8]"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                submit({
                  action: "approve",
                  title: draftTitle,
                  details: draftDetails,
                  category: draftCategory,
                  privateNotes: draftPrivate,
                  response: draftResponse,
                })
              }
              disabled={busy || !draftTitle.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B57D8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A4CBB] disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Megaphone size={14} />}
              Post to board
            </button>
            <button
              onClick={() => setMode(null)}
              className="px-3 py-2 text-sm font-semibold text-gray-500 hover:text-gray-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Resolve / decline / standalone reply — the submitter sees this ── */}
      {(mode === "resolve" || mode === "decline" || mode === "reply") && (
        <div className="mt-4 space-y-2.5 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <textarea
            autoFocus
            value={draftResponse}
            onChange={(e) => setDraftResponse(e.target.value)}
            maxLength={2000}
            rows={2}
            placeholder={
              mode === "decline"
                ? "Let them know why (optional)"
                : 'Reply to the submitter, e.g. "Fixed in today\'s update" (optional)'
            }
            className="w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B57D8]"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => submit({ action: mode, response: draftResponse })}
              disabled={busy}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                mode === "resolve"
                  ? "bg-green-500 hover:bg-green-600"
                  : mode === "reply"
                    ? "bg-[#0B57D8] hover:bg-[#0A4CBB]"
                    : "bg-gray-500 hover:bg-gray-600"
              }`}
            >
              {busy ? (
                <Loader2 size={14} className="animate-spin" />
              ) : mode === "resolve" ? (
                <Check size={14} />
              ) : mode === "reply" ? (
                <MessageSquare size={14} />
              ) : (
                <X size={14} />
              )}
              {mode === "resolve"
                ? t.type === "BUG"
                  ? "Mark fixed"
                  : "Mark done"
                : mode === "reply"
                  ? "Save reply"
                  : "Decline ticket"}
            </button>
            <button
              onClick={() => setMode(null)}
              className="px-3 py-2 text-sm font-semibold text-gray-500 hover:text-gray-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
