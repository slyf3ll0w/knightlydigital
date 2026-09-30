"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Heart, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { Button, Card, Chip, DsPage, PageHeader } from "@/components/ds";
import { promptSheet } from "@/components/ConfirmSheet";
import { fullDate, shortDate } from "@/lib/console-format";

type Listing = {
  id: string;
  name: string;
  description: string;
  industry: string;
  anonymous: boolean;
  byName: string | null;
  likes: number;
  adds: number;
  status: "LIVE" | "HIDDEN" | "REMOVED";
  removedReason: string | null;
  removedAt: string | null;
  createdAt: string;
  updatedAt: string;
  company: { id: string; name: string };
};

const statusChip: Record<Listing["status"], { label: string; tone: "good" | "neutral" | "bad" }> = {
  LIVE: { label: "Live", tone: "good" },
  HIDDEN: { label: "Unlisted by owner", tone: "neutral" },
  REMOVED: { label: "Removed", tone: "bad" },
};

export default function LibraryClient({ listings }: { listings: Listing[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<"ALL" | Listing["status"]>("ALL");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const visible = filter === "ALL" ? listings : listings.filter((l) => l.status === filter);
  const live = listings.filter((l) => l.status === "LIVE").length;

  async function patch(id: string, body: Record<string, unknown>) {
    setError("");
    setBusy(id);
    try {
      const res = await fetch(`/api/superadmin/library/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function remove(l: Listing) {
    const reason = await promptSheet({
      title: `Remove "${l.name}" from the Library?`,
      message: "The owner will see this reason on their tool page. Copies other companies added stay with them.",
      confirmLabel: "Remove",
      destructive: true,
      placeholder: "Reason the owner will see",
    });
    if (reason === null) return;
    if (!reason.trim()) {
      setError("Give the owner a reason.");
      return;
    }
    void patch(l.id, { action: "remove", reason: reason.trim() });
  }

  return (
    <DsPage>
      <PageHeader
        eyebrow={`${live} live listing${live === 1 ? "" : "s"}`}
        title="Library"
        info="Estimate tools businesses have shared with each other. Removing one only stops it showing publicly, with a reason the owner sees on their tool page — the tools other companies already copied are theirs. Restore puts it back."
        actions={
          <nav className="flex gap-1" aria-label="Status">
            {(
              [
                ["ALL", "All"],
                ["LIVE", "Live"],
                ["HIDDEN", "Unlisted"],
                ["REMOVED", "Removed"],
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
        {visible.length === 0 && (
          <Card className="px-6 py-9 text-center">
            <p className="ds-small">Nothing here.</p>
          </Card>
        )}
        {visible.map((l) => {
          const chip = statusChip[l.status];
          const expanded = open.has(l.id);
          return (
            <Card key={l.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="ds-h2">{l.name}</span>
                    <Chip tone={chip.tone}>{chip.label}</Chip>
                    <Chip tone="neutral">{l.industry}</Chip>
                  </div>
                  <p className="ds-small mt-1">
                    <Link prefetch={false} href={`/superadmin/company/${l.company.id}`} className="ds-link font-medium">
                      {l.company.name}
                    </Link>
                    {l.anonymous ? " · shared anonymously" : ""} · shared {fullDate(l.createdAt)} · updated {shortDate(l.updatedAt)}
                  </p>
                  <p className="ds-small mt-1 inline-flex items-center gap-3">
                    <span className="inline-flex items-center gap-1">
                      <Heart size={12} /> {l.likes}
                    </span>
                    <span>added {l.adds}×</span>
                  </p>
                  <p className={`mt-2 whitespace-pre-line text-[14px] text-[color:var(--ds-ink)] ${expanded ? "" : "line-clamp-2"}`}>{l.description}</p>
                  {l.description.length > 160 && (
                    <button
                      type="button"
                      onClick={() =>
                        setOpen((s) => {
                          const n = new Set(s);
                          if (n.has(l.id)) n.delete(l.id);
                          else n.add(l.id);
                          return n;
                        })
                      }
                      className="ds-link mt-1 text-[13px]"
                    >
                      {expanded ? "Less" : "More"}
                    </button>
                  )}
                  {l.status === "REMOVED" && l.removedReason && <p className="mt-2 rounded-lg bg-[color:var(--ds-bad-soft)] px-2.5 py-1.5 text-[13px] text-[color:var(--ds-bad)]">Reason given: {l.removedReason}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {l.status === "REMOVED" ? (
                    <Button variant="outline" size="sm" icon={busy === l.id ? Loader2 : RotateCcw} disabled={busy === l.id} onClick={() => void patch(l.id, { action: "restore" })} className={busy === l.id ? "[&>svg]:animate-spin" : ""}>
                      Restore
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" icon={busy === l.id ? Loader2 : Trash2} disabled={busy === l.id} onClick={() => remove(l)} className={`!text-[color:var(--ds-bad)] ${busy === l.id ? "[&>svg]:animate-spin" : ""}`}>
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </DsPage>
  );
}
