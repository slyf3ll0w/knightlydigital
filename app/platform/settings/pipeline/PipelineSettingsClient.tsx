"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Plus,
  Trash2,
  Webhook,
  Zap,
} from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

type Stage = {
  id: string;
  name: string;
  color: string | null;
  autoAdvanceOn: string | null;
};

const TRIGGERS: { value: string; label: string }[] = [
  { value: "", label: "No automation" },
  { value: "REQUEST_CREATED", label: "Request comes in" },
  { value: "APPOINTMENT_SCHEDULED", label: "Appointment scheduled" },
  { value: "QUOTE_SENT", label: "Quote sent" },
  { value: "QUOTE_APPROVED", label: "Quote approved" },
];

const SAMPLE_PAYLOAD = `{
  "firstName": "Maria",
  "lastName": "Torres",
  "email": "maria@example.com",
  "phone": "(214) 555-0138",
  "address": "412 Pecan St, Allen TX",
  "source": "Facebook Ads",
  "message": "Needs a gutter cleaning quote"
}`;

export default function PipelineSettingsClient({
  initialStages,
  webhookUrl,
}: {
  initialStages: Stage[];
  webhookUrl: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [stages, setStages] = useState<Stage[]>(initialStages);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [hook, setHook] = useState<string | null>(webhookUrl);
  const [copied, setCopied] = useState(false);

  const refresh = () => startTransition(() => router.refresh());

  async function run(fn: () => Promise<{ ok: boolean; data: { error?: string } | null }>) {
    setSaving(true);
    setError("");
    const { ok, data } = await fn();
    setSaving(false);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return false;
    }
    refresh();
    return true;
  }

  async function patchStage(id: string, patch: Partial<Stage>) {
    setStages((s) => s.map((st) => (st.id === id ? { ...st, ...patch } : st)));
    // Claiming a trigger releases it from the stage that had it (server does
    // the same) — mirror locally so the selects don't show a stale claim
    if (patch.autoAdvanceOn) {
      setStages((s) =>
        s.map((st) =>
          st.id !== id && st.autoAdvanceOn === patch.autoAdvanceOn
            ? { ...st, autoAdvanceOn: null }
            : st
        )
      );
    }
    await run(() => postJson(`/api/app/pipeline/stages/${id}`, patch, "PATCH"));
  }

  async function move(index: number, dir: -1 | 1) {
    const next = [...stages];
    const [item] = next.splice(index, 1);
    next.splice(index + dir, 0, item);
    setStages(next);
    await run(() =>
      postJson("/api/app/pipeline/stages/reorder", { orderedIds: next.map((s) => s.id) })
    );
  }

  async function removeStage(stage: Stage) {
    if (
      !window.confirm(
        `Delete the "${stage.name}" stage? Any leads in it move to your first stage.`
      )
    )
      return;
    setStages((s) => s.filter((st) => st.id !== stage.id));
    await run(() => postJson(`/api/app/pipeline/stages/${stage.id}`, undefined, "DELETE"));
  }

  async function addStage(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const ok = await run(() => postJson("/api/app/pipeline/stages", { name: newName.trim() }));
    if (ok) {
      setNewName("");
      setAdding(false);
      // Server assigns id/sort — pull the authoritative list
      const res = await fetch("/api/app/pipeline/stages");
      if (res.ok) setStages(await res.json());
    }
  }

  async function setWebhook(enable: boolean) {
    setSaving(true);
    setError("");
    const { ok, data } = await postJson<{ url: string | null }>(
      "/api/app/pipeline/webhook",
      undefined,
      enable ? "POST" : "DELETE"
    );
    setSaving(false);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    setHook(data?.url ?? null);
  }

  function copyHook() {
    if (!hook) return;
    navigator.clipboard.writeText(hook).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      <Link
        href="/app/leads"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4"
      >
        <ArrowLeft size={14} />
        Back to the board
      </Link>
      <h1 className="numeral-ledger text-2xl font-semibold text-gray-900 mb-1">Lead Pipeline</h1>
      <p className="text-sm text-gray-500 mb-6">
        The stages your Leads board runs through, and where outside lead sources plug in.
      </p>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Stages */}
      <div className="card-ledger p-5 mb-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold text-gray-900">Board stages</h2>
          <button
            onClick={() => setAdding((v) => !v)}
            className="flex items-center gap-1 text-sm font-medium text-green-600 hover:text-green-700"
          >
            <Plus size={14} />
            Add stage
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Rename, recolor, and reorder to match how you actually sell. An automation moves a
          lead&apos;s card to that stage when the event happens — forward only, never backward.
        </p>

        {adding && (
          <form onSubmit={addStage} className="flex gap-2 mb-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Stage name, e.g. Follow up"
              maxLength={40}
              autoFocus
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/30"
            />
            <button
              type="submit"
              disabled={saving || !newName.trim()}
              className="chamfer px-4 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-semibold"
            >
              Add
            </button>
          </form>
        )}

        <div className="space-y-2">
          {stages.map((stage, i) => (
            <div
              key={stage.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 px-3 py-2.5"
            >
              <div className="flex flex-col">
                <button
                  onClick={() => move(i, -1)}
                  disabled={i === 0 || saving}
                  className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-25"
                  aria-label="Move up"
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={i === stages.length - 1 || saving}
                  className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-25"
                  aria-label="Move down"
                >
                  <ArrowDown size={13} />
                </button>
              </div>

              <input
                type="color"
                value={stage.color ?? "#0C0F0C"}
                onChange={(e) => patchStage(stage.id, { color: e.target.value })}
                className="w-8 h-8 rounded cursor-pointer border border-gray-200 bg-white p-0.5"
                title="Column color"
              />

              <input
                defaultValue={stage.name}
                maxLength={40}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== stage.name) patchStage(stage.id, { name: v });
                  else e.target.value = stage.name;
                }}
                className="flex-1 min-w-[120px] px-2.5 py-1.5 text-sm font-medium border border-transparent hover:border-gray-200 focus:border-gray-300 rounded-lg focus:outline-none"
              />

              <div className="flex items-center gap-1.5">
                <Zap size={13} className="text-gray-400" aria-hidden />
                <select
                  value={stage.autoAdvanceOn ?? ""}
                  onChange={(e) =>
                    patchStage(stage.id, { autoAdvanceOn: e.target.value || null })
                  }
                  className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-600 focus:outline-none"
                  title="Auto-advance leads to this stage when…"
                >
                  {TRIGGERS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => removeStage(stage)}
                disabled={stages.length <= 1 || saving}
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-25"
                aria-label={`Delete ${stage.name}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-400 mt-3">
          The first stage is where new leads land. Won and Lost aren&apos;t stages — close leads
          out by dragging cards onto the Won/Lost zones on the board.
        </p>
      </div>

      {/* Lead intake webhook */}
      <div className="card-ledger p-5">
        <div className="flex items-center gap-2 mb-1">
          <Webhook size={16} className="text-gray-500" />
          <h2 className="text-base font-semibold text-gray-900">Lead intake webhook</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Pipe leads in from anywhere — connect Meta Lead Ads, Google Ads lead forms, Angi, or
          any form tool through Zapier or Make: point the connector&apos;s webhook action at this
          URL and every ad lead lands on your board, deduped against existing clients, with your
          team notified.
        </p>

        {hook ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <code className="flex-1 truncate px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg text-gray-700">
                {hook}
              </code>
              <button
                onClick={copyHook}
                className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 rounded-lg"
              >
                {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <details className="mb-4">
              <summary className="text-xs font-medium text-gray-500 cursor-pointer hover:text-gray-700">
                What to send (sample JSON)
              </summary>
              <pre className="mt-2 px-3 py-2 text-[11px] bg-gray-50 border border-gray-200 rounded-lg text-gray-600 overflow-x-auto">
                {SAMPLE_PAYLOAD}
              </pre>
              <p className="text-[11px] text-gray-400 mt-1.5">
                POST as JSON. A name plus an email or phone is required; <code>source</code>{" "}
                becomes the lead source on the card.
              </p>
            </details>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (
                    window.confirm(
                      "Rotate the webhook URL? Anything using the old URL stops working immediately."
                    )
                  )
                    setWebhook(true);
                }}
                disabled={saving}
                className="px-3 py-2 text-xs font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 rounded-lg"
              >
                Rotate URL
              </button>
              <button
                onClick={() => {
                  if (window.confirm("Turn off lead intake? The URL stops accepting leads."))
                    setWebhook(false);
                }}
                disabled={saving}
                className="px-3 py-2 text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 rounded-lg"
              >
                Turn off
              </button>
            </div>
          </>
        ) : (
          <button
            onClick={() => setWebhook(true)}
            disabled={saving}
            className="chamfer px-4 py-2 bg-gray-900 hover:bg-black text-white text-sm font-semibold"
          >
            Generate webhook URL
          </button>
        )}
      </div>
    </div>
  );
}
