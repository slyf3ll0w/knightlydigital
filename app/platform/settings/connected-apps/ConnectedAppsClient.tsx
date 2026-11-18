"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Copy, Eye, PencilLine, ShieldCheck } from "lucide-react";
import BackLink from "@/components/BackLink";
import { ProposalCard, type CardState } from "@/components/AssistantCard";
import { Button, Card, Chip, DsPage, PageHeader, SectionTitle } from "@/components/ds";
import { confirmSheet } from "@/components/ConfirmSheet";
import { postJson } from "@/lib/safe-fetch";
import type { Proposal } from "@/lib/assistant";

/**
 * Settings → Connected apps (docs/plans/workbench-connector-2026-11-17.md).
 *
 * Laid out like the rest of the app (docs/design-system.md): the thing to do
 * comes first, explanations live in (i) bubbles, one card and one row style.
 *
 *   Needs your OK — only when something is waiting: what an outside AI
 *     prepared, shown as the SAME card Atlas uses (components/AssistantCard
 *     ProposalCard), so a person learns one card. Confirm runs the card's own
 *     app request with THIS browser's session, so the server checks the
 *     person's role and the record again. Nothing an outside AI asks for
 *     happens before that press.
 *   Apps — Claude, ChatGPT and Grok, each connected or showing how to
 *     connect it; then the address they all use and the owner's switch.
 *   What a connected app can do — read, prepare, never.
 *   Activity — what connected apps did, by day.
 */
type Grant = { id: string; app: string; by: string; mine: boolean; createdAt: string; lastUsedAt: string | null };
type Action = { id: string; app: string; createdAt: string; proposal: Proposal };
type Activity = { id: string; app: string; by: string; what: string; outcome: "read" | "prepared" | "error"; at: string };
type Data = { url: string; off: boolean; owner: boolean; grants: Grant[]; actions: Action[]; activity: Activity[] };
type Settled = { state: CardState; note?: string };

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** "just now", "12 min ago", "3 h ago", then the date. */
function ago(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.round(min / 60)} h ago`;
  return day(iso);
}

/** "Today", "Yesterday", or the date — the heading over a day of activity. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86_400_000);
  return diff === 0 ? "Today" : diff === 1 ? "Yesterday" : d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

/** One request of a card; null when it applied, else why not. */
async function submitOne(item: { endpoint: string; method: string; payload: Record<string, unknown> }): Promise<string | null> {
  // a card can only ever call this app's own routes
  if (!item.endpoint.startsWith("/api/app/")) return "This card points somewhere it shouldn't. It was not run.";
  try {
    const hasBody = Object.keys(item.payload ?? {}).length > 0;
    const res = await fetch(item.endpoint, { method: item.method, ...(hasBody ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.payload) } : {}) });
    if (res.ok) return null;
    if (res.status === 404) return "That record no longer exists. Skip this and ask the app again.";
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    return data?.error ?? "That didn't go through. Try it from the page instead.";
  } catch {
    return "Network error. Nothing was saved.";
  }
}

/**
 * The AI apps people ask for by name, each with where its "add a connector"
 * screen lives. Names only, in plain type: their logos are their makers'
 * trademarks and are not ours to put here without permission
 * (docs/plans/connector-directory-listing-2026-11-17.md). A connection is
 * matched to its card by the name the app gave itself; anything else shows
 * in the list underneath.
 */
const APPS = [
  { name: "Claude", maker: "Anthropic", match: /claude|anthropic/i, steps: ["In Claude, open Settings, then Connectors.", "Add a custom connector and paste the address."] },
  { name: "ChatGPT", maker: "OpenAI", match: /chatgpt|openai/i, steps: ["In ChatGPT, open Settings, then Connectors.", "Add a connector and paste the address."] },
  { name: "Grok", maker: "xAI", match: /grok|xai/i, steps: ["On grok.com, open Connectors.", "Choose New connector, then Custom, and paste the address."] },
] as const;

const ABILITIES = [
  { Icon: Eye, color: "var(--ds-primary)", title: "Read", body: "Clients, schedule, quotes, invoices, payments and reports: whatever you can see in WorkBench." },
  { Icon: PencilLine, color: "var(--ds-primary)", title: "Prepare", body: "Quotes, jobs, emails and other changes. Each one waits on this page until you confirm it." },
  { Icon: ShieldCheck, color: "var(--ds-good)", title: "Never", body: "Save, send or delete by itself, or move money. Refunds, card charges and payouts stay in WorkBench." },
] as const;

const OUTCOME = {
  read: { Icon: Eye, word: "Read", color: "var(--ds-muted)" },
  prepared: { Icon: PencilLine, word: "Prepared for your OK", color: "var(--ds-primary)" },
  error: { Icon: AlertTriangle, word: "Didn't work", color: "var(--ds-warn)" },
} as const;

export default function ConnectedAppsClient() {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [copiedFor, setCopiedFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [settled, setSettled] = useState<Record<string, Settled>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/app/connector", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setData((await res.json()) as Data);
      setError("");
    } catch {
      setError("Couldn't load your connected apps. Try again in a moment.");
    }
  }, []);
  useEffect(() => void load(), [load]);

  const mark = (id: string, s: Settled) => setSettled((m) => ({ ...m, [id]: s }));

  async function approve(a: Action) {
    const p = a.proposal;
    mark(a.id, { state: "confirming" });
    const items = p.batch && p.batch.length > 0 ? p.batch : [{ endpoint: p.endpoint, method: p.method, payload: p.payload }];
    let ok = 0;
    let firstError = "";
    for (const item of items) {
      const err = await submitOne(item);
      if (err === null) ok++;
      else if (!firstError) firstError = err;
    }
    // a batch that half-applied is settled too: pressing Confirm again would repeat the half that worked
    if (ok > 0) await postJson(`/api/app/connector/actions/${a.id}`, { status: "done" });
    if (ok === items.length) {
      mark(a.id, { state: "done", note: items.length > 1 ? `All ${ok} applied` : "Done" });
      router.refresh();
      setTimeout(() => void load(), 1800);
    } else {
      mark(a.id, { state: "failed", note: items.length > 1 ? `${ok} of ${items.length} applied. ${items.length - ok} failed: ${firstError}` : firstError });
    }
  }

  async function skip(a: Action) {
    mark(a.id, { state: "dismissed" });
    await postJson(`/api/app/connector/actions/${a.id}`, { status: "dismissed" });
    setTimeout(() => void load(), 900);
  }

  async function disconnect(g: Grant) {
    const yes = await confirmSheet({
      title: `Disconnect ${g.app}?`,
      message: "It stops working right away. Anything it prepared that you haven't confirmed is skipped.",
      confirmLabel: "Disconnect",
      destructive: true,
    });
    if (!yes) return;
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

  async function copy(from: string) {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.url);
      setCopiedFor(from);
      setTimeout(() => setCopiedFor(null), 2000);
    } catch {
      /* the address is on screen to select by hand */
    }
  }

  // activity, newest first, under one heading per day
  const days = useMemo(() => {
    const out: { label: string; rows: Activity[] }[] = [];
    for (const a of data?.activity ?? []) {
      const label = dayLabel(a.at);
      const last = out[out.length - 1];
      if (last && last.label === label) last.rows.push(a);
      else out.push({ label, rows: [a] });
    }
    return out;
  }, [data]);

  const waiting = data?.actions ?? [];
  const others = (data?.grants ?? []).filter((g) => !APPS.some((a) => a.match.test(g.app)));

  return (
    <DsPage className="max-w-5xl">
      <div className="flex items-end gap-3">
        <BackLink href="/app/settings" className="mb-1.5" />
        <PageHeader
          className="min-w-0 flex-1"
          eyebrow={data ? (data.off ? "Turned off for this company" : `${data.grants.length} connected${waiting.length > 0 ? ` · ${waiting.length} waiting for you` : ""}`) : undefined}
          title="Connected apps"
          info="Let an AI app you already use, like Claude or ChatGPT, read your WorkBench account and prepare work for you. It can read what you can see. It can't save, send or delete anything by itself, and it can't move money: whatever it prepares waits here for your OK."
        />
      </div>

      {error && (
        <div role="alert" className="form-error mt-5">
          {error}
        </div>
      )}

      {!data ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="h-44 animate-pulse">
              {null}
            </Card>
          ))}
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {/* ── the next thing to do comes first ── */}
          {waiting.length > 0 && (
            <section className="ds-rise">
              <SectionTitle info="An app prepared these for you. Nothing has been saved, sent or charged. Confirm one and it happens exactly as if you had done it yourself; skip it and nothing happens.">
                Needs your OK
                <span className="ds-count-news ds-num ml-1 inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5 text-[12.5px] font-semibold">{waiting.length}</span>
              </SectionTitle>
              <div className="gap-4 sm:columns-2 xl:columns-3">
                {waiting.map((a) => {
                  const s = settled[a.id] ?? { state: "pending" as CardState };
                  return (
                    <div key={a.id} className="mb-4 min-w-0 break-inside-avoid">
                      <p className="ds-small mb-1.5 truncate px-0.5">
                        {a.app} · {ago(a.createdAt)}
                      </p>
                      <ProposalCard proposal={{ ...a.proposal, state: s.state, resultNote: s.note }} onConfirm={() => void approve(a)} onCancel={() => void skip(a)} />
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── the apps: connected or how to connect ── */}
          <section className="ds-rise" style={{ ["--ds-i" as string]: 1 }}>
            <SectionTitle info="Each app acts as the person who connected it, with that person's access. What it reads goes to the company that makes the app, including your clients' details, so only connect apps you trust. Changing your password disconnects every app you connected.">
              Apps
            </SectionTitle>
            <div className="grid gap-4 md:grid-cols-3">
              {APPS.map((app) => {
                const mine = data.grants.filter((g) => app.match.test(g.app));
                const on = mine.length > 0;
                const recent = data.activity.filter((a) => app.match.test(a.app)).slice(0, 3);
                return (
                  <Card key={app.name} className="flex flex-col p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="ds-h2 truncate">{app.name}</p>
                        <p className="ds-small mt-0.5 truncate">by {app.maker}</p>
                      </div>
                      {on ? <Chip tone={data.off ? "warn" : "good"}>{data.off ? "Paused" : "Connected"}</Chip> : <Chip tone="neutral">Not connected</Chip>}
                    </div>
                    {on ? (
                      <>
                        {/* the last few things it did, so a connected card says something */}
                        <ul className="mt-4 flex-1 space-y-1.5">
                          {recent.length === 0 ? (
                            <li className="text-[14px] text-[color:var(--ds-muted)]">Nothing yet. Ask it something about your business.</li>
                          ) : (
                            recent.map((r) => {
                              const o = OUTCOME[r.outcome];
                              return (
                                <li key={r.id} className="flex items-center gap-2 text-[14px]">
                                  <o.Icon size={14} className="shrink-0" style={{ color: o.color }} aria-hidden />
                                  <span className="min-w-0 flex-1 truncate text-[color:var(--ds-ink)]">{r.what}</span>
                                  <span className="ds-small ds-num shrink-0">{ago(r.at)}</span>
                                </li>
                              );
                            })
                          )}
                        </ul>
                        <ul className="mt-4 space-y-1 border-t border-[color:var(--ds-line)] pt-3">
                          {mine.map((g) => (
                            <li key={g.id} className="flex items-center gap-2">
                              <span className="ds-small min-w-0 flex-1 truncate">
                                {g.mine ? "Connected by you" : `Connected by ${g.by}`} · {day(g.createdAt)}
                              </span>
                              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void disconnect(g)} aria-label={`Disconnect ${g.app}`}>
                                Disconnect
                              </Button>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <>
                        <ol className="mt-4 flex-1 space-y-1.5 text-[14px] text-[color:var(--ds-ink)]">
                          {[...app.steps, "Sign in to WorkBench and press Allow."].map((step, i) => (
                            <li key={step} className="flex gap-2.5">
                              <span className="ds-num w-3 shrink-0 text-right text-[color:var(--ds-muted)]">{i + 1}</span>
                              <span className="min-w-0 flex-1">{step}</span>
                            </li>
                          ))}
                        </ol>
                        <div className="mt-4">
                          <Button variant="soft" size="sm" icon={copiedFor === app.name ? Check : Copy} onClick={() => void copy(app.name)} disabled={data.off}>
                            {copiedFor === app.name ? "Address copied" : "Copy address"}
                          </Button>
                        </div>
                      </>
                    )}
                  </Card>
                );
              })}
            </div>

            {/* connections from an app that isn't one of the three above */}
            {others.length > 0 && (
              <Card className="mt-4 overflow-hidden">
                <ul className="ds-divide">
                  {others.map((g) => (
                    <li key={g.id} className="flex items-center gap-3 px-5 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14.5px] font-medium text-[color:var(--ds-ink)]">{g.app}</span>
                        <span className="ds-small block truncate">
                          {g.mine ? "You" : g.by} · {g.lastUsedAt ? `used ${ago(g.lastUsedAt)}` : `connected ${day(g.createdAt)}`}
                        </span>
                      </span>
                      <Button variant="ghost" size="sm" disabled={busy} onClick={() => void disconnect(g)} aria-label={`Disconnect ${g.app}`}>
                        Disconnect
                      </Button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* the address every app uses, and the owner's switch */}
            <Card className="mt-4 flex flex-col gap-4 p-5 md:flex-row md:items-center">
              <div className="min-w-0 flex-1">
                <p className="ds-label">Connector address</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-[10px] bg-[color:var(--ds-surface-2)] px-3 py-2 text-[13px] text-[color:var(--ds-ink)]" title={data.url}>
                    {data.url}
                  </code>
                  <Button variant="outline" size="sm" icon={copiedFor === "address" ? Check : Copy} onClick={() => void copy("address")}>
                    {copiedFor === "address" ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
              {(data.owner || data.off) && (
                <div className="flex items-center gap-3 border-t border-[color:var(--ds-line)] pt-4 md:border-l md:border-t-0 md:pl-5 md:pt-0">
                  <span className="min-w-0 flex-1 text-[14px] text-[color:var(--ds-ink)] md:flex-none">{data.owner ? "Allow connected apps" : "The owner has turned connected apps off."}</span>
                  {data.owner && (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!data.off}
                      aria-label="Allow connected apps for this company"
                      disabled={busy}
                      onClick={() => void setOff(!data.off)}
                      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-60 ${!data.off ? "bg-[color:var(--ds-primary)]" : "bg-[color:var(--ds-line-strong)]"}`}
                    >
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-[color:var(--ds-surface)] shadow transition-[left] ${!data.off ? "left-[1.125rem]" : "left-0.5"}`} />
                    </button>
                  )}
                </div>
              )}
            </Card>
          </section>

          {/* ── what a connected app can and can't do ── */}
          <section className="ds-rise" style={{ ["--ds-i" as string]: 2 }}>
            <SectionTitle>What a connected app can do</SectionTitle>
            <Card className="grid md:grid-cols-3 md:divide-x md:divide-[color:var(--ds-line)]">
              {ABILITIES.map((a, i) => (
                <div key={a.title} className={`p-5 ${i > 0 ? "border-t border-[color:var(--ds-line)] md:border-t-0" : ""}`}>
                  <p className="flex items-center gap-2 text-[14.5px] font-semibold text-[color:var(--ds-ink)]">
                    <a.Icon size={16} style={{ color: a.color }} aria-hidden />
                    {a.title}
                  </p>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-[color:var(--ds-muted)]">{a.body}</p>
                </div>
              ))}
            </Card>
          </section>

          {/* ── what happened ── */}
          {days.length > 0 && (
            <section className="ds-rise" style={{ ["--ds-i" as string]: 3 }}>
              <SectionTitle info="What your connected apps did. Only the action is kept, never what was read, and only for 90 days.">Activity</SectionTitle>
              <Card className="overflow-hidden">
                <div className="max-h-[24rem] overflow-y-auto">
                  {days.map((d) => (
                    <div key={d.label}>
                      <p className="ds-label sticky top-0 border-b border-[color:var(--ds-line)] bg-[color:var(--ds-surface-2)] px-5 py-1.5">{d.label}</p>
                      <ul className="ds-divide">
                        {d.rows.map((a) => {
                          const o = OUTCOME[a.outcome];
                          return (
                            <li key={a.id} className="flex items-center gap-3 px-5 py-2.5">
                              <o.Icon size={15} className="shrink-0" style={{ color: o.color }} aria-hidden />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[14px] font-medium text-[color:var(--ds-ink)]">{a.what}</span>
                                <span className="ds-small block truncate">
                                  {o.word} · {a.app}
                                  {data.grants.some((g) => !g.mine) ? ` as ${a.by}` : ""}
                                </span>
                              </span>
                              <span className="ds-small ds-num shrink-0">{clock(a.at)}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              </Card>
            </section>
          )}
        </div>
      )}
    </DsPage>
  );
}
