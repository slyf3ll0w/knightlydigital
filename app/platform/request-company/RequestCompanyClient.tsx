"use client";

import { useState } from "react";
import { Clock, Send, X } from "lucide-react";
import { Button, Card, DsPage, ListRow, PageHeader, SectionTitle } from "@/components/ds";
import { Input, Select, Textarea } from "@/components/Input";
import { confirmSheet } from "@/components/ConfirmSheet";
import { INDUSTRIES } from "@/lib/pricebooks";
import { browserTimezone } from "@/lib/timezone";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

type Pending = { id: string; companyName: string; createdAt: string };

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export default function RequestCompanyClient({ initialPending }: { initialPending: Pending[] }) {
  const [pending, setPending] = useState(initialPending);
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSent("");
    setSending(true);
    const { ok, data } = await postJson<{ request?: Pending; error?: string }>("/api/app/account/company-requests", {
      companyName,
      industry,
      note,
      timezone: browserTimezone(),
    });
    setSending(false);
    if (!ok || !data?.request) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    const r = data.request;
    setPending((p) => [...p, { id: r.id, companyName: r.companyName, createdAt: String(r.createdAt) }]);
    setSent(r.companyName);
    setCompanyName("");
    setIndustry("");
    setNote("");
  }

  async function cancel(r: Pending) {
    const yes = await confirmSheet({
      title: `Cancel the request for ${r.companyName}?`,
      message: "Support won't open it.",
      confirmLabel: "Cancel request",
      cancelLabel: "Keep it",
      destructive: true,
    });
    if (!yes) return;
    const res = await fetch(`/api/app/account/company-requests/${r.id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) setPending((p) => p.filter((x) => x.id !== r.id));
    else setError(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? GENERIC_ERROR);
  }

  return (
    <DsPage className="max-w-2xl">
      <PageHeader
        title="Request a company"
        info="Each company is its own business on WorkBench, with its own clients, team, phone line and Square account. WorkBench support opens new companies for you. Once it's open you'll get a notification and an email, and it shows up in the menu under your picture. Your first step there is connecting Square."
      />

      {pending.length > 0 && (
        <>
          <SectionTitle className="mt-6">Waiting on support</SectionTitle>
          <Card className="ds-divide overflow-hidden">
            {pending.map((r) => (
              <ListRow
                key={r.id}
                lead={<Clock size={18} className="shrink-0 text-[color:var(--ds-ink-3)]" aria-hidden />}
                title={r.companyName}
                sub={`Requested ${shortDate(r.createdAt)}`}
                trail={
                  <button type="button" onClick={() => cancel(r)} className="ds-info" aria-label={`Cancel the request for ${r.companyName}`} title="Cancel request">
                    <X size={16} />
                  </button>
                }
              />
            ))}
          </Card>
        </>
      )}

      {sent && (
        <div role="status" className="mt-6 rounded-xl bg-[color:var(--ds-surface-2)] px-4 py-3 text-[14px] text-[color:var(--ds-ink)]">
          Sent. Support will open {sent} for you and let you know.
        </div>
      )}
      {error && (
        <div role="alert" className="form-error mt-6">
          {error}
        </div>
      )}

      <SectionTitle className="mt-6">New company</SectionTitle>
      <Card className="p-5">
        <form onSubmit={submit} className="space-y-4" data-request-company>
          <label className="block">
            <span className="ds-label mb-1 block">Company name</span>
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} maxLength={120} required placeholder="Brightwire Electric" />
          </label>
          <label className="block">
            <span className="ds-label mb-1 block">Trade</span>
            <Select value={industry} onChange={(e) => setIndustry(e.target.value)}>
              <option value="">Pick one (optional)</option>
              {INDUSTRIES.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="ds-label mb-1 block">Anything support should know? (optional)</span>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} />
          </label>
          <Button type="submit" icon={Send} loading={sending} disabled={!companyName.trim()} className="w-full sm:w-auto">
            Send request
          </Button>
        </form>
      </Card>
    </DsPage>
  );
}
