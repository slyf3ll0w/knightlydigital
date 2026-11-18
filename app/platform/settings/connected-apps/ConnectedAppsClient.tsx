"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BackLink from "@/components/BackLink";
import PageTitle from "@/components/PageTitle";
import SectionHeader from "@/components/SectionHeader";
import { postJson } from "@/lib/safe-fetch";
import type { Proposal } from "@/lib/assistant";

/**
 * Settings → Connected apps (docs/plans/workbench-connector-2026-11-17.md).
 *
 * Three things, top to bottom:
 *   1. Waiting for your approval — the cards an outside AI prepared. Each is
 *      the same card Atlas would have shown. Approve runs the card's own app
 *      request with THIS browser's session (as the Atlas drawer does), so
 *      the server checks the person's role and the record again. Nothing an
 *      outside AI asks for happens before that press.
 *   2. Connected apps — who connected what, and Disconnect.
 *   3. Connect an app — the address to paste into Claude or ChatGPT, and the
 *      owner's switch for the whole company.
 */
type Grant = { id: string; app: string; by: string; mine: boolean; createdAt: string; lastUsedAt: string | null };
type Action = { id: string; app: string; createdAt: string; proposal: Proposal };
type Activity = { id: string; app: string; by: string; what: string; outcome: "read" | "prepared" | "error"; at: string };
type Data = { url: string; off: boolean; owner: boolean; grants: Grant[]; actions: Action[]; activity: Activity[] };

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** One request of a card; null when it applied, else why not. */
async function submitOne(item: { endpoint: string; method: string; payload: Record<string, unknown> }): Promise<string | null> {
  // a card can only ever call this app's own routes
  if (!item.endpoint.startsWith("/api/app/")) return "This card points somewhere it shouldn't. It was not run.";
  try {
    const hasBody = Object.keys(item.payload ?? {}).length > 0;
    const res = await fetch(item.endpoint, { method: item.method, ...(hasBody ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.payload) } : {}) });
    if (res.ok) return null;
    if (res.status === 404) return "That record no longer exists. Dismiss this and ask the app again.";
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    return data?.error ?? "That didn't go through. Try it from the page instead.";
  } catch {
    return "Network error. Nothing was saved.";
  }
}

function ActionCard({ action, onSettled }: { action: Action; onSettled: () => void }) {
  const p = action.proposal;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [typed, setTyped] = useState("");
  const [done, setDone] = useState(false);
  const armed = !p.confirmText || typed.trim() === p.confirmText;
  const tone = p.danger ? "border-red-200 bg-red-50" : p.money ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-white";

  async function approve() {
    setBusy(true);
    setNote("");
    const items = p.batch && p.batch.length > 0 ? p.batch : [{ endpoint: p.endpoint, method: p.method, payload: p.payload }];
    let ok = 0;
    let firstError = "";
    for (const item of items) {
      const err = await submitOne(item);
      if (err === null) ok++;
      else if (!firstError) firstError = err;
    }
    if (ok === items.length) {
      await postJson(`/api/app/connector/actions/${action.id}`, { status: "done" });
      setDone(true);
      setNote(items.length > 1 ? `All ${ok} done.` : "Done.");
      setTimeout(onSettled, 1200);
    } else {
      // a batch that half-applied is settled too: pressing Approve again would repeat the half that worked
      if (ok > 0) await postJson(`/api/app/connector/actions/${action.id}`, { status: "done" });
      setNote(items.length > 1 ? `${ok} of ${items.length} done. ${items.length - ok} failed: ${firstError}` : firstError);
      if (ok > 0) setDone(true);
    }
    setBusy(false);
  }

  async function dismiss() {
    setBusy(true);
    await postJson(`/api/app/connector/actions/${action.id}`, { status: "dismissed" });
    onSettled();
  }

  return (
    <li className={`rounded-[12px] border p-4 ${tone}`}>
      <p className="text-xs text-gray-500">
        Prepared by {action.app} · {when(action.createdAt)}
      </p>
      <p className="mt-1 text-sm font-medium text-gray-900">{p.title}</p>
      {p.lines.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-sm text-gray-700">
          {p.lines.slice(0, 20).map((l, i) => (
            <li key={i} className="whitespace-pre-wrap break-words">
              {l}
            </li>
          ))}
        </ul>
      )}
      {p.money && <p className="mt-2 text-xs font-medium text-amber-900">This moves real money.</p>}
      {p.danger && <p className="mt-2 text-xs font-medium text-red-800">This can&apos;t be undone.</p>}
      {p.confirmText && !done && (
        <label className="mt-3 block text-xs text-gray-700">
          Type <span className="font-semibold">{p.confirmText}</span> to approve
          <input value={typed} onChange={(e) => setTyped(e.target.value)} className="mt-1 block h-9 w-full max-w-xs rounded-[10px] border border-gray-300 bg-white px-3 text-sm" autoComplete="off" />
        </label>
      )}
      {note && <p className={`mt-2 text-sm ${done ? "text-green-700" : "text-red-700"}`}>{note}</p>}
      {!done && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy || !armed} onClick={() => void approve()} className={`${p.danger ? "btn-danger" : "btn-primary"} h-9 justify-center`}>
            {busy ? "Working…" : p.confirmLabel || "Approve"}
          </button>
          <button type="button" disabled={busy} onClick={() => void dismiss()} className="btn-secondary h-9 justify-center">
            Dismiss
          </button>
        </div>
      )}
    </li>
  );
}

export default function ConnectedAppsClient() {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/app/connector", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setData((await res.json()) as Data);
    } catch {
      setError("Couldn't load your connected apps. Pull to refresh.");
    }
  }, []);
  useEffect(() => void load(), [load]);

  async function disconnect(g: Grant) {
    if (!window.confirm(`Disconnect ${g.app}? It stops working right away. Anything it prepared that you haven't approved is dismissed.`)) return;
    setBusy(true);
    await fetch(`/api/app/connector?grant=${encodeURIComponent(g.id)}`, { method: "DELETE" });
    setBusy(false);
    void load();
  }

  async function setOff(off: boolean) {
    setBusy(true);
    const { ok, data: out } = await postJson<{ error?: string }>("/api/app/connector", { connectorsOff: off }, "PATCH");
    setBusy(false);
    if (!ok) setError(out?.error ?? "That didn't save.");
    void load();
  }

  async function copy() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the address is on screen to select by hand */
    }
  }

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      <div className="flex items-start gap-3 mb-6">
        <BackLink href="/app/settings" className="mt-1.5" />
        <PageTitle info="Let an AI app like Claude or ChatGPT read your WorkBench account and prepare work for you. Nothing it prepares is saved or sent until you approve it here.">Connected apps</PageTitle>
      </div>
      {error && <div className="form-error mb-4">{error}</div>}
      {!data ? (
        <div className="ds-card p-5 text-sm text-gray-500">Loading…</div>
      ) : (
        <div className="space-y-4">
          {data.actions.length > 0 && (
            <div className="ds-card p-4 sm:p-5">
              <SectionHeader title="Waiting for your approval" hint="An app prepared these. Nothing has been saved, sent or charged." />
              <ul className="mt-3 space-y-3">
                {data.actions.map((a) => (
                  <ActionCard
                    key={a.id}
                    action={a}
                    onSettled={() => {
                      void load();
                      router.refresh();
                    }}
                  />
                ))}
              </ul>
            </div>
          )}

          <div className="ds-card overflow-hidden">
            <SectionHeader className="px-4 pt-4 sm:px-5" title="Connected apps" hint="Each one acts as the person who connected it, with that person's access." />
            {data.grants.length === 0 ? (
              <p className="px-4 pb-4 pt-2 text-sm text-gray-500 sm:px-5">No apps are connected.</p>
            ) : (
              <ul className="mt-3 divide-y divide-gray-100 border-t border-gray-100">
                {data.grants.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="text-sm font-medium text-gray-900">{g.app}</p>
                      <p className="text-xs text-gray-500">
                        Connected by {g.mine ? "you" : g.by} on {when(g.createdAt)} · {g.lastUsedAt ? `last used ${when(g.lastUsedAt)}` : "not used yet"}
                      </p>
                    </div>
                    <button type="button" disabled={busy} onClick={() => void disconnect(g)} className="btn-secondary h-9 justify-center">
                      Disconnect
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {data.activity.length > 0 && (
            <div className="ds-card overflow-hidden">
              <SectionHeader className="px-4 pt-4 sm:px-5" title="Recent activity" hint="What connected apps did. Only the action is kept, never what was read. Kept for 90 days." />
              <ul className="mt-3 max-h-80 divide-y divide-gray-100 overflow-y-auto border-t border-gray-100 text-sm">
                {data.activity.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 px-4 py-2 sm:px-5">
                    <span className="min-w-0 flex-1 basis-48 text-gray-900">
                      {a.what}
                      <span className="text-gray-500"> · {a.outcome === "read" ? "read" : a.outcome === "prepared" ? "prepared for approval" : "didn't work"}</span>
                    </span>
                    <span className="text-xs text-gray-500">
                      {a.app} as {a.by} · {when(a.at)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="ds-card p-4 sm:p-5">
            <SectionHeader title="Connect an app" hint="In Claude or ChatGPT, add a custom connector and paste this address. You'll be sent here to sign in and allow it." />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 basis-64 truncate rounded-[10px] bg-gray-100 px-3 py-2 text-sm text-gray-800">{data.url}</code>
              <button type="button" onClick={() => void copy()} className="btn-secondary h-9 justify-center">
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-gray-600">
              <li>It can read what you can see: clients, schedule, quotes, invoices, payments and reports.</li>
              <li>It can prepare work, like a quote or an email. You approve each one on this page before anything happens.</li>
              <li>What it reads goes to the company that makes the app, including your clients&apos; details. Only connect apps you trust.</li>
              <li>Changing your password disconnects every app you connected.</li>
            </ul>
            {data.owner && (
              <label className="mt-5 flex items-start gap-3 border-t border-gray-100 pt-4 text-sm text-gray-700">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={!data.off} disabled={busy} onChange={(e) => void setOff(!e.target.checked)} />
                <span>
                  <span className="font-medium text-gray-900">Allow connected apps for this company</span>
                  <span className="block text-xs text-gray-500">Turn off to stop every connected app at once. Owners and admins can connect apps while this is on.</span>
                </span>
              </label>
            )}
            {!data.owner && data.off && <p className="mt-4 text-sm text-amber-800">The owner has turned connected apps off for this company.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
