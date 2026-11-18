"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Mail, MessageSquare, PenLine, RotateCw, Send } from "lucide-react";
import { Button, Card, Chip, DsPage, Hint, ListRow, PageHeader, SectionTitle } from "@/components/ds";
import { Input, Textarea } from "@/components/Input";
import { postJson } from "@/lib/safe-fetch";
import { DRAFT_LIMITS, type FollowUpChannel } from "@/lib/follow-ups";
import type { FollowUpDraft, FollowUpItem, FollowUpList } from "@/lib/follow-ups-server";

/**
 * Follow-ups (docs/plans/ai-workers-follow-ups-2026-11-17.md).
 *
 * One card per client worth a nudge today: who, what, how much, and the plain
 * facts behind "why now". "Write the message" asks for a draft; the person
 * reads it, changes what they like and presses Send, which posts to the same
 * routes the Messages page and the email composer use. Nothing leaves without
 * that press.
 *
 * Laid out per docs/design-system.md: the thing to do comes first, the
 * explanation lives in the (i), one card, one button family.
 */
type Phase = "idle" | "drafting" | "draft" | "sending" | "sent" | "later" | "never";
type Row = { phase: Phase; draft: FollowUpDraft | null; subject: string; body: string; error: string };

const blank: Row = { phase: "idle", draft: null, subject: "", body: "", error: "" };
const keyOf = (i: { kind: string; id: string }) => `${i.kind}:${i.id}`;
const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function status(i: FollowUpItem): { tone: "bad" | "warn" | "secondary" | "neutral"; label: string } {
  if (i.trigger === "past_due") return { tone: "bad", label: `${i.daysPastDue} ${i.daysPastDue === 1 ? "day" : "days"} late` };
  if (i.trigger === "expiring") return { tone: "warn", label: "Expires soon" };
  if (i.trigger === "hot") return { tone: "secondary", label: "Keeps opening it" };
  return { tone: "neutral", label: "No reply yet" };
}

export default function FollowUpsClient({ initial, atlasName }: { initial: FollowUpList; atlasName: string }) {
  const [rows, setRows] = useState<Record<string, Row>>({});
  const row = (i: FollowUpItem) => rows[keyOf(i)] ?? blank;
  const patch = (i: FollowUpItem, p: Partial<Row>) => setRows((m) => ({ ...m, [keyOf(i)]: { ...(m[keyOf(i)] ?? blank), ...p } }));

  const open = initial.items.filter((i) => !["sent", "later", "never"].includes(row(i).phase));
  const waitingMoney = open.reduce((s, i) => s + i.amount, 0);

  async function write(i: FollowUpItem, channel?: FollowUpChannel, standard = false) {
    patch(i, { phase: "drafting", error: "" });
    const { ok, data } = await postJson<FollowUpDraft>("/api/app/follow-ups/draft", { kind: i.kind, id: i.id, channel: channel ?? row(i).draft?.channel, standard });
    if (!ok || !data || !("body" in data)) {
      patch(i, { phase: row(i).draft ? "draft" : "idle", error: data?.error ?? "Couldn't write that one. Try again in a moment." });
      return;
    }
    patch(i, { phase: "draft", draft: data, subject: data.subject ?? "", body: data.body, error: "" });
  }

  async function send(i: FollowUpItem) {
    const r = row(i);
    const d = r.draft;
    if (!d) return;
    const body = r.body.trim();
    if (!body) return patch(i, { error: "Write a message first." });
    if (d.channel === "email" && !r.subject.trim()) return patch(i, { error: "Add a subject." });
    patch(i, { phase: "sending", error: "" });
    const full = d.link ? `${body}\n\n${d.link.label}: ${d.link.url}` : body;
    // The message signs itself, so the email goes without the saved signature
    const payload = d.channel === "email" ? { subject: r.subject.trim(), body: full, signature: "" } : { body: full };
    const { ok, data } = await postJson(d.send.endpoint, payload);
    if (!ok) return patch(i, { phase: "draft", error: data?.error ?? "That didn't send. Nothing went out." });
    patch(i, { phase: "sent" });
  }

  async function skip(i: FollowUpItem, mode: "later" | "never" | "undo") {
    const before = row(i).phase;
    patch(i, { phase: mode === "undo" ? "idle" : mode, error: "" });
    const { ok } = await postJson("/api/app/follow-ups/skip", { kind: i.kind, id: i.id, mode });
    if (!ok) patch(i, { phase: before, error: "That didn't save. Try again." });
  }

  const nothing = initial.items.length === 0 && initial.waiting.length === 0;

  return (
    <DsPage className="max-w-4xl">
      <PageHeader
        eyebrow={open.length > 0 ? `${open.length} worth a nudge today · ${money(waitingMoney)} waiting` : undefined}
        title="Follow-ups"
        info={`The quotes and unpaid invoices worth a personal message today. ${atlasName} writes the first draft from the quote or invoice itself; you read it, change anything you like, and send it. Nothing goes to a client until you press Send. The automatic reminder emails keep running as before: this page picks up where they stop.`}
      />

      <div className="mt-6 space-y-8">
        {initial.waiting.length > 0 && (
          <section className="ds-rise">
            <SectionTitle info="These clients wrote or called and nobody has answered yet. A reply comes before a reminder, so they are not on the list below.">Reply first</SectionTitle>
            <Card className="ds-divide overflow-hidden">
              {initial.waiting.map((w) => (
                <ListRow key={w.clientId} href={w.href} title={w.clientName} sub="Waiting on an answer from you" trail={<Chip tone="warn">Open the thread</Chip>} />
              ))}
            </Card>
          </section>
        )}

        {initial.items.length > 0 && (
          <section className="ds-rise space-y-4" style={{ ["--ds-i" as string]: 1 }}>
            {initial.items.map((i) => {
              const r = row(i);
              const s = status(i);
              const doc = `${i.kind === "invoice" ? "Invoice" : "Quote"} #${i.number}`;
              const busy = r.phase === "drafting" || r.phase === "sending";

              if (r.phase === "sent" || r.phase === "later" || r.phase === "never") {
                return (
                  <Card key={keyOf(i)} className="flex items-center gap-3 px-5 py-4">
                    {r.phase === "sent" && <Check size={18} className="shrink-0 text-[color:var(--ds-good)]" aria-hidden />}
                    <p className="min-w-0 flex-1 truncate text-[14.5px] text-[color:var(--ds-ink)]">
                      {r.phase === "sent" ? `Sent to ${i.clientName}.` : r.phase === "later" ? `${i.clientName}: hidden for a week.` : `${i.clientName}: you won't be asked about this one again.`}
                    </p>
                    {r.phase !== "sent" && (
                      <Button variant="ghost" size="sm" onClick={() => void skip(i, "undo")}>
                        Undo
                      </Button>
                    )}
                  </Card>
                );
              }

              return (
                <Card key={keyOf(i)} className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="ds-h2 truncate">{i.clientName}</p>
                      <p className="ds-small mt-0.5 truncate">
                        <Link prefetch={false} href={i.href} className="ds-link">
                          {doc}
                        </Link>
                        {i.title ? ` · ${i.title}` : ""}
                        {i.alsoOwed.length > 0 ? ` · and ${i.alsoOwed.length} more past due` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <p className="ds-num text-[17px] font-semibold text-[color:var(--ds-ink)]">{money(i.amount)}</p>
                      <Chip tone={s.tone}>{s.label}</Chip>
                    </div>
                  </div>

                  <ul className="mt-3 space-y-0.5 text-[14px] text-[color:var(--ds-ink-2)]">
                    {i.why.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>

                  {r.draft && (
                    <div className="mt-4 border-t border-[color:var(--ds-line)] pt-4">
                      {i.channels.length > 1 && (
                        <div className="mb-3 flex gap-2" role="group" aria-label="Send as">
                          {i.channels.map((c) => (
                            <Button key={c} size="sm" variant={r.draft!.channel === c ? "soft" : "ghost"} icon={c === "text" ? MessageSquare : Mail} disabled={busy} aria-pressed={r.draft!.channel === c} onClick={() => r.draft!.channel !== c && void write(i, c)}>
                              {c === "text" ? "Text" : "Email"}
                            </Button>
                          ))}
                        </div>
                      )}
                      {r.draft.channel === "email" && (
                        <label className="mb-2 block">
                          <span className="ds-label mb-1 block">Subject</span>
                          <Input className="w-full" value={r.subject} maxLength={150} disabled={busy} onChange={(e) => patch(i, { subject: e.target.value })} />
                        </label>
                      )}
                      <label className="block">
                        <span className="ds-label mb-1 block">{r.draft.channel === "text" ? "Text message" : "Message"}</span>
                        <Textarea className="w-full" rows={r.draft.channel === "text" ? 4 : 9} value={r.body} maxLength={5000} disabled={busy} onChange={(e) => patch(i, { body: e.target.value })} />
                      </label>
                      <p className="ds-small mt-2">
                        {r.draft.link ? `Goes under your message: a link to ${i.kind === "invoice" ? "view and pay the invoice" : "the quote"}.` : "No link goes with this one."}
                        {r.draft.channel === "text" ? ` ${r.body.trim().length} of ${DRAFT_LIMITS.textMax} characters.` : ""}
                      </p>
                      <p className="ds-small mt-1">{r.draft.note ?? (r.draft.source === "atlas" ? `${atlasName} wrote this from the ${i.kind}. Read it before you send it.` : "Standard wording. Change anything you like.")}</p>
                    </div>
                  )}

                  {r.error && (
                    <p role="alert" className="mt-3 text-[14px] text-[color:var(--ds-bad)]">
                      {r.error}
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {r.draft ? (
                      <>
                        <Button icon={Send} loading={r.phase === "sending"} disabled={busy} onClick={() => void send(i)}>
                          {r.draft.channel === "text" ? "Send text" : "Send email"}
                        </Button>
                        <Button variant="ghost" size="sm" icon={RotateCw} loading={r.phase === "drafting"} disabled={busy} onClick={() => void write(i)}>
                          Write it again
                        </Button>
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => patch(i, { draft: null, phase: "idle", error: "" })}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button icon={PenLine} loading={r.phase === "drafting"} disabled={busy} onClick={() => void write(i)}>
                          Write the message
                        </Button>
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void skip(i, "later")}>
                          Not now
                        </Button>
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void skip(i, "never")}>
                          Don&apos;t follow up on this one
                        </Button>
                      </>
                    )}
                  </div>
                </Card>
              );
            })}
          </section>
        )}

        {nothing && (
          <Card className="ds-rise">
            <Hint title="Nobody needs a nudge today." info="A quote shows up here once it has sat without an answer and the automatic reminders are done, or when the client keeps opening it. An invoice shows up five days after it was due. Anyone who just wrote, just paid, or was just contacted is left alone." />
          </Card>
        )}

        {initial.heldBack.length > 0 && (
          <section className="ds-rise" style={{ ["--ds-i" as string]: 2 }}>
            <SectionTitle info="Open quotes and unpaid invoices that were looked at and left off the list, with the reason. They come back by themselves when the reason passes.">Left alone today</SectionTitle>
            <Card className="ds-divide overflow-hidden">
              {initial.heldBack.map((h) => (
                <div key={h.reason} className="flex items-center gap-3 px-5 py-3">
                  <span className="min-w-0 flex-1 truncate text-[14.5px] text-[color:var(--ds-ink)]">{h.label}</span>
                  <span className="ds-num ds-small shrink-0">{h.count}</span>
                </div>
              ))}
            </Card>
          </section>
        )}
      </div>
    </DsPage>
  );
}
