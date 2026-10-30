"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileDown, Loader2, Send } from "lucide-react";
import { alertSheet } from "@/components/ConfirmSheet";
import { InfoTip } from "@/components/ds";
import PlanRequired from "@/components/PlanRequired";
import { sentSummary, useSendChoice } from "@/components/SendChoice";
import { hapticImpact } from "@/lib/haptics";
import { postJson } from "@/lib/safe-fetch";
import { showSendRitual } from "@/lib/send-ritual";
import { REPORT_NOTE_MAX } from "@/lib/photos-shared";

/**
 * The Work completed report card on a finished job (Gallery plan, phase B):
 * what the client will get (how many pairs / photos they may see, how many
 * checklist items), the note to them, Preview PDF, and Send report by
 * email and/or text. `locked` = the plan gate is live and this company
 * isn't on Gallery — the plan card shows instead.
 */
export default function JobReportCard({
  jobId,
  note: initialNote,
  sentAt,
  counts,
  contactEmail,
  contactPhone,
  canTextClient,
  locked,
  tz,
}: {
  jobId: string;
  note: string | null;
  sentAt: string | null;
  counts: { pairs: number; singles: number; hidden: number; checklist: number };
  contactEmail: string | null;
  /** Pretty-printed; shown as the text recipient. */
  contactPhone: string | null;
  canTextClient: boolean;
  locked: boolean;
  tz: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState(initialNote ?? "");
  const [saved, setSaved] = useState(initialNote ?? "");
  const [busy, setBusy] = useState<"save" | "send" | null>(null);
  const { choose, chooser } = useSendChoice();

  if (locked) {
    return (
      <div className="p-4">
        <PlanRequired feature="gallery" compact />
      </div>
    );
  }

  async function saveNote() {
    setBusy("save");
    try {
      const { ok, data } = await postJson<{ note: string | null; error?: string }>(`/api/app/jobs/${jobId}/report`, { note }, "PATCH");
      if (!ok) {
        alertSheet({ message: data?.error ?? "Couldn't save the note." });
        return;
      }
      setSaved(data?.note ?? "");
      setNote(data?.note ?? "");
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    const channels = await choose({ email: contactEmail, phone: contactPhone, canText: canTextClient, what: "Send the work report" });
    if (!channels) return;
    setBusy("send");
    try {
      const { ok, data } = await postJson<{ emailed?: boolean; texted?: boolean; to?: string | null; phone?: string | null; error?: string }>(
        `/api/app/jobs/${jobId}/report`,
        { ...channels, note }
      );
      if (!ok) {
        alertSheet({ message: data?.error ?? "Couldn't send the report." });
        return;
      }
      setSaved(note);
      hapticImpact("LIGHT");
      showSendRitual(sentSummary(data, { email: contactEmail, phone: contactPhone }));
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const shown = counts.pairs + counts.singles;
  const reach = Boolean(contactEmail) || canTextClient;
  const sentLabel = sentAt
    ? new Date(sentAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz })
    : null;

  return (
    <div className="p-4 space-y-3" data-job-report>
      <p className="text-sm text-gray-700">
        {shown > 0 ? (
          <>
            The client gets {counts.pairs > 0 && <strong>{counts.pairs} before-and-after</strong>}
            {counts.pairs > 0 && counts.singles > 0 && " and "}
            {counts.singles > 0 && <strong>{counts.singles} {counts.singles === 1 ? "photo" : "photos"}</strong>}
            {counts.checklist > 0 && <>, plus the {counts.checklist}-item checklist</>}.
          </>
        ) : (
          <>No photos are shown to the client yet{counts.checklist > 0 ? " — the report carries the checklist" : ""}.</>
        )}
        {counts.hidden > 0 && (
          <span className="text-gray-500">
            {" "}
            {counts.hidden} hidden
            <InfoTip>Open a photo and choose “Client sees it” to add it to the report. After shots are shown by default; Before, During and Estimate photos are hidden until you say so.</InfoTip>
          </span>
        )}
      </p>

      <div>
        <label htmlFor={`report-note-${jobId}`} className="block text-xs font-medium text-gray-500">
          A note to the client
        </label>
        <textarea
          id={`report-note-${jobId}`}
          value={note}
          maxLength={REPORT_NOTE_MAX}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Replaced the panel and tested every circuit. Call us if anything trips."
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
        />
        {note !== saved && (
          <button type="button" onClick={() => void saveNote()} disabled={busy !== null} className="ds-btn ds-btn-outline ds-btn-sm mt-1.5 disabled:opacity-50">
            {busy === "save" ? <Loader2 size={12} className="animate-spin" /> : null}
            Save note
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void send()} disabled={busy !== null || !reach} className="btn-primary disabled:opacity-50">
          {busy === "send" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          {sentAt ? "Send again" : "Send report"}
        </button>
        <a href={`/api/app/jobs/${jobId}/report/pdf`} target="_blank" rel="noreferrer" className="ds-btn ds-btn-outline">
          <FileDown size={13} /> Preview PDF
        </a>
        {sentLabel && <span className="text-xs text-gray-500">Sent {sentLabel}</span>}
        {!reach && <span className="text-xs text-gray-500">Add an email or a textable phone to the client to send it.</span>}
      </div>
      {chooser}
    </div>
  );
}
