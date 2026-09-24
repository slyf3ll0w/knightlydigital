"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, Check, ChevronRight, Heart, Loader2, Play, Plus, Search } from "lucide-react";
import PageTitle from "@/components/PageTitle";
import BackLink from "@/components/BackLink";
import EstimatorRunner, { type RunnerEstimator } from "@/components/EstimatorRunner";
import { confirmSheet } from "@/components/ConfirmSheet";
import { APP_THEME, wash } from "@/components/EstimatorControls";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { INDUSTRIES } from "@/lib/pricebooks";
import type { EstimatorSpec } from "@/lib/estimator";
import type { ListingCard } from "@/lib/estimator-library";

/**
 * The Library: one ledger row per shared tool — name, industry, who shared
 * it (or "Shared anonymously"), the description, the facts, likes. Preview
 * runs the listing's portable rules in the runner (nothing saved); Add
 * copies it into the company's tools with every rate under "Rates to
 * confirm". Filters: search, industry chips, Most liked / Newest.
 */

type Sort = "likes" | "new";
type Page = { listings: ListingCard[]; nextCursor: string | null };

export default function LibraryClient({ manager, defaultIndustry, embedded = false }: { manager: boolean; defaultIndustry: string; /** Rendered as the Library view of /app/estimates — no page frame or title of its own */ embedded?: boolean }) {
  const theme = APP_THEME;
  const [q, setQ] = useState("");
  const [industry, setIndustry] = useState(defaultIndustry);
  const [sort, setSort] = useState<Sort>("likes");
  const [rows, setRows] = useState<ListingCard[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<string, { id: string; name: string }>>({});
  const [preview, setPreview] = useState<RunnerEstimator | null>(null);
  const reqRef = useRef(0);

  const load = useCallback(
    async (after: string | null) => {
      const n = ++reqRef.current;
      if (after) setMore(true);
      else setLoading(true);
      setError("");
      const sp = new URLSearchParams();
      if (q.trim()) sp.set("q", q.trim());
      if (industry) sp.set("industry", industry);
      sp.set("sort", sort);
      if (after) sp.set("cursor", after);
      try {
        const res = await fetch(`/api/app/library?${sp.toString()}`);
        const data = (await res.json().catch(() => null)) as (Page & { error?: string }) | null;
        if (n !== reqRef.current) return;
        if (!res.ok || !data) {
          setError(data?.error ?? GENERIC_ERROR);
          return;
        }
        setRows((prev) => (after ? [...prev, ...data.listings] : data.listings));
        setCursor(data.nextCursor);
      } finally {
        if (n === reqRef.current) {
          setLoading(false);
          setMore(false);
        }
      }
    },
    [q, industry, sort]
  );

  // search debounced; industry + sort at once
  useEffect(() => {
    const t = setTimeout(() => void load(null), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  async function like(row: ListingCard) {
    const next = !row.liked;
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, liked: next, likes: Math.max(0, r.likes + (next ? 1 : -1)) } : r)));
    const { ok, data } = await postJson<{ liked: boolean; likes: number }>(`/api/app/library/${row.id}/like`);
    if (!ok || !data) {
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, liked: row.liked, likes: row.likes } : r)));
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, liked: data.liked, likes: data.likes } : r)));
  }

  async function openPreview(row: ListingCard) {
    setBusy(`preview:${row.id}`);
    setError("");
    try {
      const res = await fetch(`/api/app/library/${row.id}`);
      const data = (await res.json().catch(() => null)) as { spec?: EstimatorSpec; error?: string } | null;
      if (!res.ok || !data?.spec) {
        setError(data?.error ?? GENERIC_ERROR);
        return;
      }
      // id "library/<id>" routes the runner's calls to /api/app/estimators/library/<id>/run
      setPreview({ id: `library/${row.id}`, name: row.name, description: row.description.split("\n")[0], usesAtlas: false, spec: data.spec });
    } finally {
      setBusy(null);
    }
  }

  async function add(row: ListingCard) {
    if (
      !(await confirmSheet({
        title: `Add “${row.name}” to your tools?`,
        message: "You get your own copy. Every rate lands under Rates to confirm so you can set your numbers before anyone quotes with it.",
        confirmLabel: "Add Tool",
      }))
    )
      return;
    setBusy(`add:${row.id}`);
    setError("");
    const { ok, data } = await postJson<{ id?: string; name?: string; error?: string }>(`/api/app/library/${row.id}/add`);
    setBusy(null);
    if (!ok || !data?.id) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    setAdded((a) => ({ ...a, [row.id]: { id: data.id as string, name: data.name ?? row.name } }));
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, added: true, adds: r.adds + 1 } : r)));
  }

  const chip = (active: boolean) => `inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-[13px] font-medium transition-colors ${active ? "border-transparent" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`;
  const seg = (active: boolean) => `rounded-full px-3 py-1.5 text-[13px] font-medium ${active ? "bg-white text-gray-900 shadow-sm" : "text-gray-600"}`;
  const emptyText = q.trim() ? `Nothing in the Library matches “${q.trim()}”.` : industry ? `No ${industry} tools shared yet — be the first: open one of your tools and pick Library.` : "Nothing shared yet. Open one of your tools and pick Library to share it.";

  return (
    <div className={embedded ? "" : "mx-auto max-w-3xl p-4 lg:p-8"}>
      {!embedded && (
        <>
          <BackLink href="/app/estimates" className="mb-3" />
          <div className="mb-5">
            <PageTitle section="quotes" icon={BookOpen} sub="Estimate tools other Workbench businesses have shared. Add one, set your rates, done.">
              Library
            </PageTitle>
          </div>
        </>
      )}

      <div className="mb-4 space-y-3">
        <div className="flex items-center gap-2 rounded-[10px] border border-gray-300 bg-white px-3">
          <Search size={15} className="shrink-0 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tools…" className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400" aria-label="Search the Library" />
        </div>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-0.5">
          <button type="button" onClick={() => setIndustry("")} className={chip(industry === "")} style={industry === "" ? { backgroundColor: theme.accent, color: theme.onAccent } : undefined}>
            All
          </button>
          {INDUSTRIES.map((i) => (
            <button key={i} type="button" onClick={() => setIndustry(i)} className={chip(industry === i)} style={industry === i ? { backgroundColor: theme.accent, color: theme.onAccent } : undefined}>
              {i}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex rounded-full border border-gray-200 bg-gray-100 p-1">
            <button type="button" onClick={() => setSort("likes")} className={seg(sort === "likes")}>
              Most liked
            </button>
            <button type="button" onClick={() => setSort("new")} className={seg(sort === "new")}>
              Newest
            </button>
          </div>
          {loading && <Loader2 size={15} className="animate-spin text-gray-400" />}
        </div>
      </div>

      {error && (
        <div role="alert" className="form-error mb-4">
          {error}
        </div>
      )}

      <div className="card-ledger overflow-hidden">
        {!loading && rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-500">{emptyText}</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {rows.map((r) => {
              const open = expanded.has(r.id);
              const long = r.description.length > 220 || r.description.includes("\n");
              const just = added[r.id];
              return (
                <div key={r.id} className="px-4 py-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px]" style={{ backgroundColor: wash(theme, 12), color: theme.accent }} aria-hidden>
                      <BookOpen size={18} strokeWidth={2.25} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-[15px] font-semibold text-gray-900">{r.name}</span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">{r.industry}</span>
                        {r.mine && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">Yours</span>}
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500">{r.byName ? `by ${r.byName}` : "Shared anonymously"}</p>
                      <p className={`mt-2 whitespace-pre-line text-sm text-gray-700 ${open ? "" : "line-clamp-3"}`}>{r.description}</p>
                      {long && (
                        <button type="button" onClick={() => setExpanded((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} className="mt-1 text-xs font-medium text-gray-500 hover:text-gray-900">
                          {open ? "Less" : "More"}
                        </button>
                      )}
                      <p className="mt-2 text-xs text-gray-500">
                        {r.facts.join(" · ")}
                        {r.adds > 0 ? ` · added ${r.adds.toLocaleString()} time${r.adds === 1 ? "" : "s"}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 pl-[52px]">
                    <button type="button" onClick={() => void like(r)} aria-pressed={r.liked} className={`inline-flex h-9 items-center gap-1.5 rounded-[10px] border px-3 text-sm font-medium ${r.liked ? "border-rose-200 bg-rose-50 text-rose-700" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}>
                      <Heart size={14} className={r.liked ? "fill-current" : ""} /> {r.likes.toLocaleString()}
                    </button>
                    <button type="button" disabled={busy !== null} onClick={() => void openPreview(r)} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60">
                      {busy === `preview:${r.id}` ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Preview
                    </button>
                    {manager && !r.mine && (just ? (
                      <Link href={`/app/estimates/${just.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-green-50 px-3 text-sm font-medium text-green-700 hover:bg-green-100">
                        <Check size={14} /> Added — open {just.name} <ChevronRight size={13} />
                      </Link>
                    ) : r.added ? (
                      <span className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-gray-100 px-3 text-sm font-medium text-gray-600">
                        <Check size={14} /> In your tools
                      </span>
                    ) : (
                      <button type="button" disabled={busy !== null} onClick={() => void add(r)} className="btn-primary h-9 justify-center">
                        {busy === `add:${r.id}` ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add to my tools
                      </button>
                    ))}
                    {!manager && r.added && (
                      <span className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-gray-100 px-3 text-sm font-medium text-gray-600">
                        <Check size={14} /> In your tools
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {cursor && (
          <button type="button" disabled={more} onClick={() => void load(cursor)} className="flex w-full items-center justify-center gap-2 border-t border-gray-100 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50">
            {more ? <Loader2 size={14} className="animate-spin" /> : null} Load more
          </button>
        )}
      </div>

      <EstimatorRunner estimators={preview ? [preview] : []} open={preview !== null} onClose={() => setPreview(null)} allowQuote={false} showSamples />
    </div>
  );
}
