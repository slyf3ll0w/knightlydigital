"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Heart, Loader2, RotateCcw, Trash2 } from "lucide-react";

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

const statusChip: Record<Listing["status"], { label: string; cls: string }> = {
  LIVE: { label: "Live", cls: "bg-green-100 text-green-700" },
  HIDDEN: { label: "Unlisted by owner", cls: "bg-gray-200 text-gray-600" },
  REMOVED: { label: "Removed", cls: "bg-red-100 text-red-700" },
};

export default function LibraryClient({ listings }: { listings: Listing[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<"ALL" | Listing["status"]>("ALL");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const visible = filter === "ALL" ? listings : listings.filter((l) => l.status === filter);

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

  function remove(l: Listing) {
    const reason = prompt(`Remove "${l.name}" from the Library? The owner will see this reason on their tool page. Copies other companies added stay with them.`, "");
    if (reason === null) return;
    if (!reason.trim()) {
      setError("Give the owner a reason.");
      return;
    }
    void patch(l.id, { action: "remove", reason: reason.trim() });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Library</h1>
          <p className="mt-1 text-sm text-gray-500">
            Estimate tools businesses have shared with each other. Removing one only stops it showing publicly — the tools other companies already copied are theirs.
          </p>
        </div>
        <nav className="flex gap-1 rounded-md border border-gray-200 bg-white p-0.5 text-xs">
          {(
            [
              ["ALL", "All"],
              ["LIVE", "Live"],
              ["HIDDEN", "Unlisted"],
              ["REMOVED", "Removed"],
            ] as const
          ).map(([value, label]) => (
            <button key={value} onClick={() => setFilter(value)} className={`rounded px-2.5 py-1 font-medium ${filter === value ? "bg-[#0B57D8] text-white" : "text-gray-500 hover:text-gray-900"}`}>
              {label}
            </button>
          ))}
        </nav>
      </div>

      {error && (
        <div role="alert" className="form-error mt-4">
          {error}
        </div>
      )}

      <div className="mt-6 space-y-3">
        {visible.length === 0 && <p className="rounded-xl border border-dashed border-gray-300 bg-white px-5 py-8 text-center text-sm text-gray-400">Nothing here.</p>}
        {visible.map((l) => {
          const chip = statusChip[l.status];
          const expanded = open.has(l.id);
          return (
            <div key={l.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-semibold text-gray-900">{l.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip.cls}`}>{chip.label}</span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">{l.industry}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    <Link href={`/superadmin/company/${l.company.id}`} className="font-medium text-gray-700 hover:underline">
                      {l.company.name}
                    </Link>
                    {l.anonymous ? " · shared anonymously" : ""} · shared {new Date(l.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · updated {new Date(l.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                  <p className="mt-1 inline-flex items-center gap-3 text-xs text-gray-600">
                    <span className="inline-flex items-center gap-1"><Heart size={12} /> {l.likes}</span>
                    <span>added {l.adds}×</span>
                  </p>
                  <p className={`mt-2 whitespace-pre-line text-sm text-gray-700 ${expanded ? "" : "line-clamp-2"}`}>{l.description}</p>
                  {l.description.length > 160 && (
                    <button type="button" onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n; })} className="mt-1 text-xs font-medium text-gray-500 hover:text-gray-900">
                      {expanded ? "Less" : "More"}
                    </button>
                  )}
                  {l.status === "REMOVED" && l.removedReason && <p className="mt-2 rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-700">Reason given: {l.removedReason}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {l.status === "REMOVED" ? (
                    <button type="button" disabled={busy === l.id} onClick={() => void patch(l.id, { action: "restore" })} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                      {busy === l.id ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Restore
                    </button>
                  ) : (
                    <button type="button" disabled={busy === l.id} onClick={() => remove(l)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
                      {busy === l.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
