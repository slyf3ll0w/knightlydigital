"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Inbox, Loader2, Mail, Phone, Trash2, Undo2 } from "lucide-react";
import { Button, Card, Chip, DsPage, PageHeader } from "@/components/ds";
import { confirmSheet } from "@/components/ConfirmSheet";
import { fullDate } from "@/lib/console-format";

type Submission = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  businessName: string | null;
  message: string;
  pageUrl: string | null;
  spam: boolean;
  createdAt: string;
  isNew: boolean;
};

export default function ContactClient({ submissions }: { submissions: Submission[] }) {
  const router = useRouter();
  const [view, setView] = useState<"inbox" | "spam">("inbox");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const inbox = submissions.filter((s) => !s.spam);
  const spam = submissions.filter((s) => s.spam);
  const visible = view === "inbox" ? inbox : spam;

  async function setSpam(s: Submission, value: boolean) {
    setError("");
    setBusy(s.id);
    try {
      const res = await fetch(`/api/superadmin/contact/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spam: value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function remove(s: Submission) {
    const ok = await confirmSheet({
      title: `Delete the message from ${s.name}?`,
      message: "It's gone for good.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setBusy(s.id);
    try {
      await fetch(`/api/superadmin/contact/${s.id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <DsPage>
      <PageHeader
        eyebrow={`${inbox.length} ${inbox.length === 1 ? "message" : "messages"}`}
        title="Contact form"
        info="Messages sent from the Contact us form on workbenchfsm.com. Each one is also emailed to the applications inbox. Marking one as spam moves it to the Spam tab; nothing is sent to the person."
        actions={
          <nav className="flex gap-1" aria-label="View">
            {(
              [
                ["inbox", `Inbox`],
                ["spam", `Spam${spam.length ? ` · ${spam.length}` : ""}`],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setView(value)}
                className={`ds-btn ds-btn-sm ${view === value ? "ds-btn-soft" : "ds-btn-ghost"}`}
                aria-pressed={view === value}
              >
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
        {visible.length === 0 && (
          <Card className="px-6 py-9 text-center">
            <p className="ds-small">{view === "inbox" ? "No messages yet." : "Nothing marked as spam."}</p>
          </Card>
        )}
        {visible.map((s) => (
          <Card key={s.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="ds-h2">
                  {s.name}
                  {s.businessName && <span className="font-normal text-[color:var(--ds-muted)]"> · {s.businessName}</span>}
                </h3>
                <p className="ds-small">
                  {fullDate(s.createdAt)}
                  {s.pageUrl ? ` · from ${s.pageUrl}` : ""}
                </p>
              </div>
              {s.isNew && <Chip tone="primary">New</Chip>}
              {s.spam && <Chip tone="neutral">Spam</Chip>}
            </div>

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13.5px]">
              <a href={`mailto:${s.email}`} className="ds-link inline-flex items-center gap-1.5 break-all">
                <Mail size={13} /> {s.email}
              </a>
              {s.phone && (
                <a href={`tel:${s.phone}`} className="ds-link inline-flex items-center gap-1.5">
                  <Phone size={13} /> {s.phone}
                </a>
              )}
            </div>

            <p className="mt-3 whitespace-pre-line break-words text-[14px] text-[color:var(--ds-ink)]">{s.message}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              {!s.spam && (
                <a href={`mailto:${s.email}?subject=${encodeURIComponent("Re: your message to WorkBench")}`} className="ds-btn ds-btn-sm ds-btn-primary">
                  <Mail size={14} /> Reply by email
                </a>
              )}
              {s.spam ? (
                <Button variant="outline" size="sm" icon={busy === s.id ? Loader2 : Undo2} onClick={() => setSpam(s, false)} disabled={busy === s.id}>
                  Not spam
                </Button>
              ) : (
                <Button variant="outline" size="sm" icon={busy === s.id ? Loader2 : Ban} onClick={() => setSpam(s, true)} disabled={busy === s.id}>
                  Mark as spam
                </Button>
              )}
              <Button variant="ghost" size="sm" icon={Trash2} onClick={() => remove(s)} disabled={busy === s.id} className="ml-auto hover:!text-[color:var(--ds-bad)]">
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {view === "spam" && spam.length > 0 && (
        <p className="ds-small mt-4 flex items-center gap-1.5">
          <Inbox size={13} /> Not spam puts a message back in the inbox.
        </p>
      )}
    </DsPage>
  );
}
