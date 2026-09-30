"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bug, Check, ExternalLink, Lightbulb, Loader2, Megaphone, MessageSquare, RotateCcw, Trash2, X } from "lucide-react";
import { Button, Card, Chip, DsPage, PageHeader, SectionTitle } from "@/components/ds";
import { Input, Textarea } from "@/components/Input";
import { confirmSheet } from "@/components/ConfirmSheet";
import { fullDate } from "@/lib/console-format";

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

const statusChip: Record<Ticket["status"], { label: string; tone: "warn" | "primary" | "good" | "neutral" }> = {
  OPEN: { label: "Open", tone: "warn" },
  PLANNED: { label: "On the board", tone: "primary" },
  RESOLVED: { label: "Resolved", tone: "good" },
  DECLINED: { label: "Declined", tone: "neutral" },
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
  const openAll = tickets.filter((t) => t.status === "OPEN").length;

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
    const ok = await confirmSheet({
      title: `Delete "${t.title}"?`,
      message: "The submitter loses it from their list too.",
      confirmLabel: "Delete ticket",
      destructive: true,
    });
    if (!ok) return;
    setBusy(t.id);
    try {
      await fetch(`/api/superadmin/feedback/${t.id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <DsPage>
      <PageHeader
        eyebrow={openAll > 0 ? `${openAll} open` : "Nothing open"}
        title="Feedback"
        info="Bug reports and feature ideas filed from Help & Feedback inside the app. Approving posts an editable copy onto the public Upcoming Features board; resolve and decline close the ticket with an optional reply the submitter sees on their tickets list."
        actions={
          <nav className="flex gap-1" aria-label="Type">
            {(
              [
                ["ALL", "All"],
                ["BUG", "Bugs"],
                ["SUGGESTION", "Suggestions"],
              ] as const
            ).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setFilter(value)} className={`ds-btn ds-btn-sm ${filter === value ? "ds-btn-soft" : "ds-btn-ghost"}`} aria-pressed={filter === value}>
                {label}
              </button>
            ))}
          </nav>
        }
      />

      {error && (
        <div role="alert" className="form-error mt-4">
          {error}
        </div>
      )}

      <div className="mt-6 space-y-3">
        {open.length === 0 && (
          <Card className="px-6 py-9 text-center">
            <p className="ds-small">No open tickets.</p>
          </Card>
        )}
        {open.map((t) => (
          <TicketCard key={t.id} t={t} busy={busy === t.id} onPatch={patch} onDelete={remove} />
        ))}
      </div>

      {reviewed.length > 0 && (
        <>
          <SectionTitle className="mt-10">Reviewed</SectionTitle>
          <div className="space-y-3">
            {reviewed.map((t) => (
              <TicketCard key={t.id} t={t} busy={busy === t.id} onPatch={patch} onDelete={remove} />
            ))}
          </div>
        </>
      )}
    </DsPage>
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
      setDraftPrivate(`From ${t.user ? `${t.user.name} (${t.user.email})` : "a deleted user"} · ${t.company.name}`);
    }
    setDraftResponse(next === "reply" ? (t.response ?? "") : "");
  }

  async function submit(body: Record<string, unknown>) {
    if (await onPatch(t.id, body)) setMode(null);
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="ds-disc mt-0.5" style={{ color: t.type === "BUG" ? "var(--ds-bad)" : "var(--ds-warn)", background: t.type === "BUG" ? "var(--ds-bad-soft)" : "var(--ds-warn-soft)" }}>
            {t.type === "BUG" ? <Bug size={16} /> : <Lightbulb size={16} />}
          </span>
          <div className="min-w-0">
            <h3 className="ds-h2">{t.title}</h3>
            <p className="ds-small">
              {t.user ? `${t.user.name} — ${t.user.email}` : "Deleted user"} ·{" "}
              <Link prefetch={false} href={`/superadmin/company/${t.company.id}`} className="ds-link font-medium">
                {t.company.name}
              </Link>{" "}
              · {fullDate(t.createdAt)}
              {t.pageUrl ? ` · ${t.pageUrl}` : ""}
            </p>
          </div>
        </div>
        <Chip tone={chip.tone}>{chip.label}</Chip>
      </div>

      <p className="mt-3 whitespace-pre-line text-[14px] text-[color:var(--ds-ink)]">{t.details}</p>

      {t.response && (
        <p className="mt-3 whitespace-pre-line border-l-2 border-[color:var(--ds-line-strong)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-[13px] text-[color:var(--ds-ink-2)]">
          <span className="font-semibold">Your reply:</span> {t.response}
        </p>
      )}
      {t.roadmapItem && (
        <p className="ds-small mt-3">
          Posted to the board as{" "}
          <Link href="/roadmap" target="_blank" className="ds-link inline-flex items-center gap-1">
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
              <Button size="sm" icon={Megaphone} onClick={() => openPanel("approve")} disabled={busy}>
                Approve &amp; post to board
              </Button>
              <Button variant="outline" size="sm" icon={Check} onClick={() => openPanel("resolve")} disabled={busy}>
                {t.type === "BUG" ? "Mark fixed" : "Mark done"}
              </Button>
              <Button variant="ghost" size="sm" icon={X} onClick={() => openPanel("decline")} disabled={busy}>
                Decline
              </Button>
            </>
          )}
          {t.status !== "OPEN" && (
            <>
              <Button variant="outline" size="sm" icon={MessageSquare} onClick={() => openPanel("reply")} disabled={busy}>
                {t.response ? "Edit reply" : "Add reply"}
              </Button>
              <Button variant="ghost" size="sm" icon={busy ? Loader2 : RotateCcw} onClick={() => submit({ action: "reopen" })} disabled={busy} className={busy ? "[&>svg]:animate-spin" : ""}>
                Reopen
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" icon={Trash2} onClick={() => onDelete(t)} disabled={busy} className="ml-auto hover:!text-[color:var(--ds-bad)]">
            Delete
          </Button>
        </div>
      )}

      {/* ── Approve editor — edit before it goes public ── */}
      {mode === "approve" && (
        <div className="mt-4 space-y-2.5 rounded-xl bg-[color:var(--ds-primary-soft)] p-4">
          <p className="ds-label text-[color:var(--ds-primary)]">Edit before posting — this is what everyone sees on Upcoming Features</p>
          <div className="flex flex-wrap gap-1">
            {CATEGORIES.map((c) => (
              <button key={c.value} type="button" onClick={() => setDraftCategory(c.value)} className={`ds-btn ds-btn-sm ${draftCategory === c.value ? "ds-btn-primary" : "ds-btn-outline"}`} aria-pressed={draftCategory === c.value}>
                {c.label}
              </button>
            ))}
          </div>
          <Input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} maxLength={200} placeholder="Board title" className="w-full" />
          <Textarea value={draftDetails} onChange={(e) => setDraftDetails(e.target.value)} maxLength={2000} rows={3} placeholder="Public details (optional)" className="w-full resize-none" />
          <Textarea value={draftPrivate} onChange={(e) => setDraftPrivate(e.target.value)} maxLength={5000} rows={2} placeholder="Private note — only board editors see this (optional)" className="w-full resize-none" />
          <Textarea value={draftResponse} onChange={(e) => setDraftResponse(e.target.value)} maxLength={2000} rows={2} placeholder="Reply to the submitter — shows on their tickets list (optional)" className="w-full resize-none" />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              icon={busy ? Loader2 : Megaphone}
              onClick={() => submit({ action: "approve", title: draftTitle, details: draftDetails, category: draftCategory, privateNotes: draftPrivate, response: draftResponse })}
              disabled={busy || !draftTitle.trim()}
              className={busy ? "[&>svg]:animate-spin" : ""}
            >
              Post to board
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setMode(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* ── Resolve / decline / standalone reply — the submitter sees this ── */}
      {(mode === "resolve" || mode === "decline" || mode === "reply") && (
        <div className="mt-4 space-y-2.5 rounded-xl bg-[color:var(--ds-surface-2)] p-4">
          <Textarea
            autoFocus
            value={draftResponse}
            onChange={(e) => setDraftResponse(e.target.value)}
            maxLength={2000}
            rows={2}
            placeholder={mode === "decline" ? "Let them know why (optional)" : 'Reply to the submitter, e.g. "Fixed in today\'s update" (optional)'}
            className="w-full resize-none"
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={mode === "decline" ? "outline" : "primary"}
              icon={busy ? Loader2 : mode === "resolve" ? Check : mode === "reply" ? MessageSquare : X}
              onClick={() => submit({ action: mode, response: draftResponse })}
              disabled={busy}
              className={busy ? "[&>svg]:animate-spin" : ""}
            >
              {mode === "resolve" ? (t.type === "BUG" ? "Mark fixed" : "Mark done") : mode === "reply" ? "Save reply" : "Decline ticket"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setMode(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
