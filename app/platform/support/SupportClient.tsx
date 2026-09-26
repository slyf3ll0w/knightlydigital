"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bug,
  CheckCircle2,
  Clock,
  Lightbulb,
  Loader2,
  Megaphone,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { postJson } from "@/lib/safe-fetch";
import PageTitle from "@/components/PageTitle";
import { Chip } from "@/components/ds";

type TicketType = "BUG" | "SUGGESTION";
type TicketStatus = "OPEN" | "PLANNED" | "RESOLVED" | "DECLINED";

interface Ticket {
  id: string;
  type: TicketType;
  status: TicketStatus;
  title: string;
  details: string;
  response: string | null;
  roadmapItemId: string | null;
  createdAt: string;
}

const STATUS_CHIP: Record<TicketStatus, { label: (t: TicketType) => string; tone: "warn" | "primary" | "good" | "neutral"; icon: LucideIcon }> = {
  OPEN: {
    label: () => "Under review",
    tone: "warn",
    icon: Clock,
  },
  PLANNED: {
    label: () => "Planned",
    tone: "primary",
    icon: Megaphone,
  },
  RESOLVED: {
    label: (t) => (t === "BUG" ? "Fixed" : "Done"),
    tone: "good",
    icon: CheckCircle2,
  },
  DECLINED: {
    label: () => "Not planned",
    tone: "neutral",
    icon: XCircle,
  },
};

export default function SupportClient({
  initialTickets,
  initialType,
}: {
  initialTickets: Ticket[];
  initialType: TicketType | null;
}) {
  const [tickets, setTickets] = useState<Ticket[]>(initialTickets);
  const [formType, setFormType] = useState<TicketType | null>(initialType);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<TicketType | null>(null);

  function openForm(type: TicketType) {
    setFormType(type);
    setSent(null);
    setError(null);
  }

  async function submit() {
    if (!formType || !title.trim() || !details.trim()) return;
    setBusy(true);
    setError(null);
    const { ok, data } = await postJson<Ticket>("/api/app/feedback", {
      type: formType,
      title,
      details,
      pageUrl: pageUrl.trim() || undefined,
    });
    setBusy(false);
    if (!ok || !data) {
      setError(data?.error || "Something went wrong — please try again.");
      return;
    }
    setTickets((all) => [
      {
        id: data.id,
        type: formType,
        status: "OPEN",
        title: title.trim(),
        details: details.trim(),
        response: null,
        roadmapItemId: null,
        createdAt: data.createdAt ?? new Date().toISOString(),
      },
      ...all,
    ]);
    setSent(formType);
    setFormType(null);
    setTitle("");
    setDetails("");
    setPageUrl("");
  }

  const isBug = formType === "BUG";

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-4 lg:p-8">
      <div>
        <PageTitle info="Report a bug or share an idea. The team reads every ticket.">
          Help &amp; Feedback
        </PageTitle>
      </div>

      {sent && (
        <div className="ds-card flex items-start gap-3 px-4 py-3.5 border-l-4 border-[color:var(--ds-good)]">
          <CheckCircle2 size={18} className="text-[color:var(--ds-good)] mt-0.5 shrink-0" />
          <div className="text-sm text-gray-700">
            <p className="font-semibold text-gray-900">
              {sent === "BUG" ? "Bug report sent" : "Suggestion sent"} — thank you!
            </p>
            <p className="mt-0.5">
              {sent === "BUG"
                ? "We'll look into it. You can follow the status below."
                : "If it's approved, it'll appear on the Upcoming Features board."}
            </p>
          </div>
        </div>
      )}

      {/* ── Entry cards ── */}
      {!formType && (
        <div className="grid sm:grid-cols-2 gap-4">
          <button
            onClick={() => openForm("BUG")}
            className="ds-card ds-card-link px-5 py-5 text-left"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[color:var(--ds-primary-soft)] text-[color:var(--ds-primary)]">
              <Bug size={20} strokeWidth={2.25} />
            </span>
            <p className="mt-3 text-[15px] font-semibold text-gray-900">Report a bug</p>
            <p className="mt-1 text-xs text-gray-500">
              Something not working? Tell us what happened so we can fix it.
            </p>
          </button>
          <button
            onClick={() => openForm("SUGGESTION")}
            className="ds-card ds-card-link px-5 py-5 text-left"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[color:var(--ds-secondary-soft)] text-[color:var(--ds-secondary-strong)]">
              <Lightbulb size={20} strokeWidth={2.25} />
            </span>
            <p className="mt-3 text-[15px] font-semibold text-gray-900">Suggest a feature</p>
            <p className="mt-1 text-xs text-gray-500">
              A new capability or a small tweak. Approved ideas land on the Upcoming Features
              board.
            </p>
          </button>
        </div>
      )}

      {/* ── Form ── */}
      {formType && (
        <div className="ds-card p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-[9px] ${
                isBug ? "bg-[color:var(--ds-primary-soft)] text-[color:var(--ds-primary)]" : "bg-[color:var(--ds-secondary-soft)] text-[color:var(--ds-secondary-strong)]"
              }`}
            >
              {isBug ? <Bug size={16} /> : <Lightbulb size={16} />}
            </span>
            <h2 className="text-[15px] font-semibold text-gray-900">
              {isBug ? "Report a bug" : "Suggest a feature"}
            </h2>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                {isBug ? "What's broken?" : "What's your idea?"}
              </label>
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder={
                  isBug ? "e.g. Invoice totals look wrong after a refund" : "e.g. Bulk-text all of today's clients"
                }
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                {isBug
                  ? "What happened? What did you expect instead?"
                  : "How would it help your day-to-day?"}
              </label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                maxLength={5000}
                rows={5}
                placeholder={
                  isBug
                    ? "The steps you took, what you saw, and what you expected to see…"
                    : "Describe how it should work…"
                }
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)] resize-none"
              />
            </div>
            {isBug && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Where did it happen? <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  value={pageUrl}
                  onChange={(e) => setPageUrl(e.target.value)}
                  maxLength={300}
                  placeholder="e.g. Invoices page, or the job detail screen"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
                />
              </div>
            )}

            {error && <p className="text-sm text-[color:var(--ds-bad)]">{error}</p>}

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={submit}
                disabled={busy || !title.trim() || !details.trim()}
                className="btn-primary"
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                {isBug ? "Send bug report" : "Send suggestion"}
              </button>
              <button
                onClick={() => setFormType(null)}
                className="px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── My tickets ── */}
      <div className="ds-card">
        <div className="px-4 py-2.5 text-[13px] font-semibold border-b border-[color:var(--ds-line)] text-gray-500">
          My tickets
        </div>
        <ul className="divide-y divide-[color:var(--ds-line)]">
          {tickets.length === 0 && (
            <li className="px-4 py-5 text-sm text-gray-400 italic">
              Nothing yet — your bug reports and suggestions will show up here with their status.
            </li>
          )}
          {tickets.map((t) => {
            const chip = STATUS_CHIP[t.status];
            return (
              <li key={t.id} className="px-4 py-3.5">
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] ${
                      t.type === "BUG" ? "bg-[color:var(--ds-primary-soft)] text-[color:var(--ds-primary)]" : "bg-[color:var(--ds-secondary-soft)] text-[color:var(--ds-secondary-strong)]"
                    }`}
                  >
                    {t.type === "BUG" ? <Bug size={14} /> : <Lightbulb size={14} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">{t.title}</p>
                      <Chip tone={chip.tone} icon={chip.icon}>
                        {chip.label(t.type)}
                      </Chip>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500 whitespace-pre-line line-clamp-3">
                      {t.details}
                    </p>
                    <p className="mt-1 text-[11px] text-gray-400">
                      {new Date(t.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                    {t.response && (
                      <div className="mt-2 px-3 py-2 bg-gray-50 border-l-2 border-gray-300 text-xs text-gray-600 whitespace-pre-line">
                        <span className="font-semibold text-gray-700">WorkBench team: </span>
                        {t.response}
                      </div>
                    )}
                    {t.status === "PLANNED" && t.roadmapItemId && (
                      <Link
                        href="/app/roadmap"
                        className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[color:var(--ds-primary)] hover:underline"
                      >
                        On the Upcoming Features board <ArrowRight size={10} />
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="text-center text-xs text-gray-500">
        Curious what&apos;s already in the works?{" "}
        <Link href="/app/roadmap" className="font-medium text-gray-500 hover:text-gray-800 underline">
          See the Upcoming Features board
        </Link>
      </p>
    </div>
  );
}
