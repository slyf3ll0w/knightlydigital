"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Plus, X } from "lucide-react";
import { Button, Card, Chip, SectionTitle } from "@/components/ds";
import { Input, Select, Textarea } from "@/components/Input";
import { confirmSheet } from "@/components/ConfirmSheet";
import { fullDate } from "@/lib/console-format";
import { INDUSTRIES } from "@/lib/pricebooks";

/**
 * Sign-ups → Company requests: people asking for another company on their
 * login (lib/company-requests.ts). Approve opens it on their login (they're
 * the owner, held at the Square step like any new company); Decline emails
 * them, with a reason if you give one. "Open a company for a login" does
 * the same without a request — for your own companies, or someone you set
 * up on a call.
 */

export type CompanyRequestRow = {
  id: string;
  companyName: string;
  industry: string | null;
  note: string | null;
  requesterName: string;
  email: string;
  currentCompanies: { id: string; name: string }[];
  status: "PENDING" | "APPROVED" | "DECLINED" | "CANCELLED";
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  company: { id: string; name: string } | null;
};

const tone: Record<CompanyRequestRow["status"], "warn" | "good" | "neutral"> = {
  PENDING: "warn",
  APPROVED: "good",
  DECLINED: "neutral",
  CANCELLED: "neutral",
};
const label: Record<CompanyRequestRow["status"], string> = {
  PENDING: "Waiting",
  APPROVED: "Opened",
  DECLINED: "Declined",
  CANCELLED: "Cancelled by them",
};

async function send(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const data = (await res?.json().catch(() => null)) as { error?: string; emailed?: boolean } | null;
  return { ok: Boolean(res?.ok), data };
}

export default function CompanyRequestsPanel({ requests }: { requests: CompanyRequestRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [declining, setDeclining] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [form, setForm] = useState({ email: "", companyName: "", industry: "" });
  const [opening, setOpening] = useState(false);

  const pending = requests.filter((r) => r.status === "PENDING");
  const decided = requests.filter((r) => r.status !== "PENDING");

  async function approve(r: CompanyRequestRow) {
    const ok = await confirmSheet({
      title: `Open ${r.companyName}?`,
      message: `It opens on ${r.email} with ${r.requesterName} as the owner. They get a notification and an email.`,
      confirmLabel: "Open company",
    });
    if (!ok) return;
    setError("");
    setNotice("");
    setBusy(r.id);
    const { ok: done, data } = await send(`/api/superadmin/company-requests/${r.id}`, "PATCH", { action: "approve" });
    setBusy(null);
    if (!done) return setError(data?.error ?? "Something went wrong.");
    setNotice(data?.emailed === false ? `${r.companyName} is open, but the email to them failed. Let them know yourself.` : `${r.companyName} is open. They've been told.`);
    router.refresh();
  }

  async function decline(r: CompanyRequestRow) {
    setError("");
    setNotice("");
    setBusy(r.id);
    const { ok: done, data } = await send(`/api/superadmin/company-requests/${r.id}`, "PATCH", { action: "decline", reason });
    setBusy(null);
    if (!done) return setError(data?.error ?? "Something went wrong.");
    setDeclining(null);
    setReason("");
    router.refresh();
  }

  async function openForLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setOpening(true);
    const { ok: done, data } = await send("/api/superadmin/company-requests", "POST", form);
    setOpening(false);
    if (!done) return setError(data?.error ?? "Something went wrong.");
    setNotice(`${form.companyName} is open on ${form.email}.${data?.emailed === false ? " The email to them failed." : ""}`);
    setForm({ email: "", companyName: "", industry: "" });
    router.refresh();
  }

  return (
    <>
      {error && (
        <div role="alert" className="form-error mt-4">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="mt-4 rounded-xl bg-[color:var(--ds-surface-2)] px-4 py-3 text-[14px] text-[color:var(--ds-ink)]">
          {notice}
        </div>
      )}

      <div className="mt-6 space-y-3">
        {pending.length === 0 && (
          <Card className="px-6 py-9 text-center">
            <p className="ds-small">No company requests waiting.</p>
          </Card>
        )}
        {pending.map((r) => (
          <Card key={r.id} className="p-5">
            <RequestHead r={r} />
            {declining === r.id ? (
              <div className="mt-4 space-y-3">
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000} placeholder="Reason for them (optional, goes in the email)" />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" icon={X} loading={busy === r.id} onClick={() => decline(r)}>
                    Decline and email them
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeclining(null)}>
                    Back
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" icon={Check} loading={busy === r.id} onClick={() => approve(r)}>
                  Approve and open
                </Button>
                <Button size="sm" variant="outline" icon={X} disabled={busy === r.id} onClick={() => { setDeclining(r.id); setReason(""); }}>
                  Decline
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>

      <SectionTitle className="mt-10" info="Opens a company straight onto an existing WorkBench login, no request needed: your own companies, or someone you set up on a call. The person on that login becomes the owner and starts at the Square step.">
        Open a company for a login
      </SectionTitle>
      <Card className="p-5">
        <form onSubmit={openForLogin} data-open-for-login>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="ds-label mb-1 block">Login email</span>
              <Input type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} maxLength={254} className="w-full" />
            </label>
            <label className="block">
              <span className="ds-label mb-1 block">Company name</span>
              <Input required value={form.companyName} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))} maxLength={120} className="w-full" />
            </label>
            <label className="block">
              <span className="ds-label mb-1 block">Trade</span>
              <Select value={form.industry} onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))} className="w-full">
                <option value="">None</option>
                {INDUSTRIES.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <div className="mt-4 flex justify-end">
            <Button type="submit" size="sm" icon={Plus} loading={opening}>
              Open company
            </Button>
          </div>
        </form>
      </Card>

      {decided.length > 0 && (
        <>
          <SectionTitle className="mt-10">Answered</SectionTitle>
          <div className="space-y-3">
            {decided.map((r) => (
              <Card key={r.id} className="p-5">
                <RequestHead r={r} />
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function RequestHead({ r }: { r: CompanyRequestRow }) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="ds-h2 truncate">{r.company ? <Link prefetch={false} href={`/superadmin/company/${r.company.id}`} className="ds-link">{r.companyName}</Link> : r.companyName}</h3>
          <p className="ds-small">
            {r.note === "Opened by support" ? "Opened by support" : "Requested"} {fullDate(r.createdAt)}
            {r.decidedAt && r.status !== "CANCELLED" ? ` · ${label[r.status].toLowerCase()} ${fullDate(r.decidedAt)}${r.decidedBy ? ` by ${r.decidedBy}` : ""}` : ""}
          </p>
        </div>
        <Chip tone={tone[r.status]}>{label[r.status]}</Chip>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-[14px]">
        <dt className="ds-small">Person</dt>
        <dd className="min-w-0 break-words text-[color:var(--ds-ink)]">
          {r.requesterName} — {r.email}
        </dd>
        {r.industry && (
          <>
            <dt className="ds-small">Trade</dt>
            <dd className="text-[color:var(--ds-ink)]">{r.industry}</dd>
          </>
        )}
        {r.currentCompanies.length > 0 && (
          <>
            <dt className="ds-small whitespace-nowrap">Already has</dt>
            <dd className="min-w-0 break-words">
              {r.currentCompanies.map((c, i) => (
                <span key={c.id}>
                  {i > 0 && ", "}
                  <Link prefetch={false} href={`/superadmin/company/${c.id}`} className="ds-link">
                    {c.name}
                  </Link>
                </span>
              ))}
            </dd>
          </>
        )}
        {r.note && r.note !== "Opened by support" && (
          <>
            <dt className="ds-small">Note</dt>
            <dd className="min-w-0 whitespace-pre-wrap break-words text-[color:var(--ds-ink)]">{r.note}</dd>
          </>
        )}
      </dl>
    </>
  );
}
