"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Check, Heart, Loader2, Sparkles } from "lucide-react";
import { Select, Textarea } from "@/components/Input";
import { useAssistant } from "@/components/AssistantContext";
import { confirmSheet } from "@/components/ConfirmSheet";
import { APP_THEME } from "@/components/EstimatorControls";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { INDUSTRIES } from "@/lib/pricebooks";

/**
 * A tool's Library section: share it with every Workbench business (under
 * the company's name or anonymously), with an industry tag and a plain
 * description Atlas can draft. Listed → the like/add counts, "Update the
 * library copy" (re-snapshots today's rules) and "Remove from the Library"
 * (unlists; copies others already added stay theirs). A Workbench takedown
 * shows its reason and locks the form.
 */

type ShareState =
  | { listed: false }
  | { listed: boolean; status: string; industry: string; description: string; anonymous: boolean; likes: number; adds: number; removedReason: string | null; updatedAt: string };

const MIN = 20;
const MAX = 1200;

export default function SharePanel({ toolId, toolName, companyName, companyIndustry }: { toolId: string; toolName: string; companyName: string; companyIndustry: string | null }) {
  const theme = APP_THEME;
  const atlas = useAssistant();
  const [state, setState] = useState<ShareState | null>(null);
  const [industry, setIndustry] = useState(companyIndustry && (INDUSTRIES as readonly string[]).includes(companyIndustry) ? companyIndustry : "");
  const [anonymous, setAnonymous] = useState(false);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState<"load" | "describe" | "share" | "remove" | null>("load");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/app/estimators/${toolId}/share`);
      const data = (await res.json().catch(() => null)) as (ShareState & { error?: string }) | null;
      if (cancelled) return;
      setBusy(null);
      if (!res.ok || !data) {
        setError(data?.error ?? GENERIC_ERROR);
        return;
      }
      setState(data);
      if ("status" in data) {
        setIndustry(data.industry);
        setAnonymous(data.anonymous);
        setDescription(data.description);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toolId]);

  const removed = state && "status" in state && state.status === "REMOVED";
  const listed = Boolean(state && state.listed && !removed);
  const canShare = industry !== "" && description.trim().length >= MIN && description.length <= MAX && !removed;

  async function describe() {
    setBusy("describe");
    setError("");
    setNote("");
    const { ok, data } = await postJson<{ description?: string; tokens?: number; error?: string }>(`/api/app/estimators/${toolId}/share/describe`);
    setBusy(null);
    if (!ok || !data?.description) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    setDescription(data.description);
    setNote(`${atlas.name} wrote a draft — read it over and edit anything.${data.tokens ? ` ${data.tokens.toLocaleString()} tokens.` : ""}`);
  }

  async function share() {
    setBusy("share");
    setError("");
    setNote("");
    const { ok, data } = await postJson<ShareState & { error?: string }>(`/api/app/estimators/${toolId}/share`, { industry, description: description.trim(), anonymous });
    setBusy(null);
    if (!ok || !data) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    setState(data);
    setNote(listed ? "The library copy now matches today's rules." : "Shared. Other businesses can find it in the Library now.");
  }

  async function remove() {
    if (
      !(await confirmSheet({
        title: "Remove from the Library?",
        message: "It stops showing to other businesses. Anyone who already added it keeps their copy — that's theirs now. You can share it again any time; its likes are kept.",
        confirmLabel: "Remove",
        destructive: true,
      }))
    )
      return;
    setBusy("remove");
    setError("");
    setNote("");
    const { ok, data } = await postJson<ShareState & { error?: string }>(`/api/app/estimators/${toolId}/share`, undefined, "DELETE");
    setBusy(null);
    if (!ok || !data) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    setState(data);
    setNote("Removed from the Library.");
  }

  const seg = (active: boolean) => `flex-1 rounded-lg border px-2 py-2 text-xs font-medium ${active ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`;
  const label = "mb-1 block text-sm font-medium text-gray-800";

  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="form-error">
          {error}
        </div>
      )}
      {note && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{note}</p>}

      <section className="card-ledger p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <BookOpen size={18} className="mt-0.5 shrink-0" style={{ color: theme.accent }} />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-gray-900">{listed ? "Shared in the Library" : "Share it in the Library"}</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Other Workbench businesses can add a copy of “{toolName}” to their own tools. They get the questions and the structure; every rate lands on their side as a number to confirm, and your price book stays yours. <Link href="/app/estimates?view=library" className="font-medium text-gray-700 underline-offset-2 hover:underline">Browse the Library</Link>
            </p>
            {state && "status" in state && (listed || removed) && (
              <p className="mt-2 inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
                <span className="inline-flex items-center gap-1"><Heart size={12} /> {state.likes.toLocaleString()} like{state.likes === 1 ? "" : "s"}</span>
                <span>added {state.adds.toLocaleString()} time{state.adds === 1 ? "" : "s"}</span>
              </p>
            )}
          </div>
        </div>

        {removed && state && "status" in state && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700">
            Workbench removed this listing{state.removedReason ? `: ${state.removedReason}` : "."} Businesses that already added it keep their copy. Reply to us from Help &amp; Feedback if you think that&apos;s a mistake.
          </div>
        )}

        {busy === "load" ? (
          <div className="mt-5 flex items-center gap-2 text-sm text-gray-500">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : (
          <fieldset disabled={Boolean(removed) || busy !== null} className="mt-5 space-y-4 disabled:opacity-60">
            <div>
              <span className={label}>Share as</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setAnonymous(false)} className={seg(!anonymous)}>
                  {companyName || "Company name"}
                </button>
                <button type="button" onClick={() => setAnonymous(true)} className={seg(anonymous)}>
                  Anonymous
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="share-industry" className={label}>
                Industry
              </label>
              <Select id="share-industry" value={industry} onChange={(e) => setIndustry(e.target.value)} className="w-full">
                <option value="">Pick one…</option>
                {INDUSTRIES.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <div className="mb-1 flex items-end justify-between gap-2">
                <label htmlFor="share-description" className="block text-sm font-medium text-gray-800">
                  How it works
                </label>
                {atlas.available && (
                  <button type="button" onClick={() => void describe()} disabled={atlas.locked} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50" title={atlas.locked ? `${atlas.name} is out of tokens right now` : `${atlas.name} explains what it prices, the questions and the rates to set (uses tokens)`}>
                    {busy === "describe" ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} style={{ color: theme.accent }} />} Write it with {atlas.name}
                  </button>
                )}
              </div>
              <Textarea id="share-description" value={description} onChange={(e) => setDescription(e.target.value.slice(0, MAX))} rows={6} placeholder="What it prices, the questions it asks, the rates someone will want to set as their own, and where it shines." className="w-full" />
              <p className="mt-1 text-right text-[11px] text-gray-400">
                {description.length.toLocaleString()} / {MAX.toLocaleString()}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {listed && (
                <button type="button" onClick={() => void remove()} className="h-10 rounded-lg px-3 text-sm font-medium text-red-600 hover:bg-red-50">
                  {busy === "remove" ? <Loader2 size={14} className="animate-spin" /> : "Remove from the Library"}
                </button>
              )}
              <button type="button" onClick={() => void share()} disabled={!canShare} className="btn-primary h-10 justify-center">
                {busy === "share" ? <Loader2 size={14} className="animate-spin" /> : listed ? <Check size={14} /> : <BookOpen size={14} />}
                {listed ? "Update the library copy" : "Share to the Library"}
              </button>
            </div>
            {listed && <p className="text-right text-[11px] text-gray-400">Updating re-snapshots today&apos;s rules and words for new adopters. Copies already added don&apos;t change.</p>}
          </fieldset>
        )}
      </section>
    </div>
  );
}
