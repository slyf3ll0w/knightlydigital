"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Check, Copy, ExternalLink, Link2, Loader2, Plus, X } from "lucide-react";
import { Button, Card, Chip, DsPage, PageHeader, SectionTitle } from "@/components/ds";
import { Input, Select } from "@/components/Input";
import { confirmSheet } from "@/components/ConfirmSheet";
import { fullDate } from "@/lib/console-format";

/**
 * Sign-ups: applications to decide, and invite codes to mint or revoke.
 * One page, two tabs (the URL carries the tab so the rail badge and the
 * redirects from the old pages land in the right place).
 */

export type Application = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  companyName: string;
  industry: string | null;
  teamSize: string | null;
  city: string | null;
  state: string | null;
  paymentsToday: string | null;
  monthlyVolume: string | null;
  yearsInBusiness: string | null;
  entityType: string | null;
  website: string | null;
  message: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  decidedAt: string | null;
  inviteCode: { code: string; used: boolean } | null;
  /** Self-serve applications: the account is already open in pending mode. */
  company: { id: string; name: string; suspended: boolean; finixState: string | null } | null;
};

export type Invite = {
  id: string;
  code: string;
  note: string | null;
  email: string | null;
  createdAt: string;
  expiresAt: string | null;
  usedAt: string | null;
  revokedAt: string | null;
  usedByCompany: { id: string; name: string } | null;
  applicationCompany: string | null;
};

type TabKey = "applications" | "invites";

export default function SignupsClient({ tab, applications, invites }: { tab: TabKey; applications: Application[]; invites: Invite[] }) {
  const pending = applications.filter((a) => a.status === "PENDING").length;
  return (
    <DsPage>
      <PageHeader
        eyebrow={pending > 0 ? `${pending} waiting on you` : "Nothing waiting"}
        title="Sign-ups"
        info={
          <>
            Applications: self-serve sign-ups open their account immediately in pending mode — approving keeps the
            account and emails the good news; rejecting suspends it. Finix underwriting is still the hard gate for
            payments, so approve anyone who looks like a real business. Invite codes: every code authorizes exactly
            one company sign-up with no review and underwriting waived; they are entered on the unlisted /invite page
            (the copy-link button builds that URL) or at /app/register.
          </>
        }
      />
      <nav className="mt-6 flex gap-1" aria-label="Sections">
        {(
          [
            ["applications", `Applications${pending > 0 ? ` · ${pending}` : ""}`],
            ["invites", "Invite codes"],
          ] as const
        ).map(([key, label]) => (
          <Link key={key} prefetch={false} href={`/superadmin/signups?tab=${key}`} className={`ds-btn ds-btn-sm ${tab === key ? "ds-btn-soft" : "ds-btn-ghost"}`} aria-current={tab === key ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>
      {tab === "applications" ? <ApplicationsPanel applications={applications} /> : <InvitesPanel invites={invites} />}
    </DsPage>
  );
}

// ── Applications ────────────────────────────────────────────────────────────

const statusTone: Record<Application["status"], "warn" | "good" | "neutral"> = { PENDING: "warn", APPROVED: "good", REJECTED: "neutral" };

function ApplicationsPanel({ applications }: { applications: Application[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const pending = applications.filter((a) => a.status === "PENDING");
  const decided = applications.filter((a) => a.status !== "PENDING");

  async function decide(app: Application, action: "approve" | "reject") {
    if (action === "reject") {
      const ok = await confirmSheet({
        title: "Reject this application?",
        message: app.company
          ? "Their account is already open — rejecting suspends the company immediately. No email is sent."
          : "No email is sent.",
        confirmLabel: app.company ? "Reject and suspend" : "Reject",
        destructive: true,
      });
      if (!ok) return;
    }
    setError("");
    setBusy(app.id);
    try {
      const res = await fetch(`/api/superadmin/applications/${app.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      if (action === "approve" && data.emailed === false) {
        setError(
          data.code
            ? `Approved and code ${data.code} was created, but the email failed to send — copy it from the Invite codes tab and send it yourself.`
            : "Approved — their account is confirmed, but the notification email failed to send."
        );
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(""), 1500);
  }

  return (
    <>
      {error && (
        <div role="alert" className="form-error mt-4">
          {error}
        </div>
      )}
      <div className="mt-6 space-y-3">
        {pending.length === 0 && (
          <Card className="px-6 py-9 text-center">
            <p className="ds-small">No pending applications.</p>
          </Card>
        )}
        {pending.map((app) => (
          <ApplicationCard key={app.id} app={app} busy={busy === app.id} copied={copied} onCopy={copy} onDecide={decide} />
        ))}
      </div>
      {decided.length > 0 && (
        <>
          <SectionTitle className="mt-10">Decided</SectionTitle>
          <div className="space-y-3">
            {decided.map((app) => (
              <ApplicationCard key={app.id} app={app} busy={busy === app.id} copied={copied} onCopy={copy} onDecide={decide} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function ApplicationCard({
  app,
  busy,
  copied,
  onCopy,
  onDecide,
}: {
  app: Application;
  busy: boolean;
  copied: string;
  onCopy: (text: string) => void;
  onDecide: (app: Application, action: "approve" | "reject") => void;
}) {
  const location = [app.city, app.state].filter(Boolean).join(", ");
  const rows: [string, string | null][] = [
    ["Contact", `${app.name} — ${app.email}${app.phone ? ` — ${app.phone}` : ""}`],
    ["Trade", app.industry],
    ["Location", location || null],
    ["Team size", app.teamSize],
    ["Pays today", app.paymentsToday],
    ["Volume/mo", app.monthlyVolume],
    ["In business", app.yearsInBusiness],
    ["Structure", app.entityType],
    ["Website", app.website],
    ["Notes", app.message],
  ];
  // One-click background check: their site, plus Google/Maps searches built
  // from what they claimed — a real business shows up in ten seconds.
  const query = encodeURIComponent(`${app.companyName} ${location}`.trim());
  const verifyLinks: [string, string][] = [
    ...(app.website ? ([["Their site", app.website.startsWith("http") ? app.website : `https://${app.website}`]] as [string, string][]) : []),
    ["Google", `https://www.google.com/search?q=${query}`],
    ["Maps", `https://www.google.com/maps/search/${query}`],
  ];
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="ds-h2 truncate">{app.companyName}</h3>
          <p className="ds-small">
            Applied {fullDate(app.createdAt)}
            {app.decidedAt ? ` · decided ${fullDate(app.decidedAt)}` : ""}
          </p>
        </div>
        <Chip tone={statusTone[app.status]}>{app.status.charAt(0) + app.status.slice(1).toLowerCase()}</Chip>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-[14px]">
        {rows.map(
          ([label, value]) =>
            value && (
              <div key={label} className="contents">
                <dt className="ds-small whitespace-nowrap">{label}</dt>
                <dd className="min-w-0 break-words text-[color:var(--ds-ink)]">{value}</dd>
              </div>
            )
        )}
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px]">
        <span className="ds-small">Verify:</span>
        {verifyLinks.map(([label, href]) => (
          <a key={label} href={href} target="_blank" rel="noopener noreferrer" className="ds-link inline-flex items-center gap-1">
            {label} <ExternalLink size={11} />
          </a>
        ))}
      </div>
      {app.company && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
          <Chip tone={app.company.suspended ? "bad" : "primary"}>{app.company.suspended ? "Account suspended" : "Account open (pending)"}</Chip>
          {app.company.finixState && <span className="ds-small">Finix: {app.company.finixState}</span>}
          <Link prefetch={false} href={`/superadmin/company/${app.company.id}`} className="ds-link">
            View account
          </Link>
        </div>
      )}
      {app.status === "PENDING" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" icon={busy ? Loader2 : Check} disabled={busy} onClick={() => onDecide(app, "approve")} className={busy ? "[&>svg]:animate-spin" : ""}>
            {app.company ? "Approve account" : "Approve & email code"}
          </Button>
          <Button variant="outline" size="sm" icon={X} disabled={busy} onClick={() => onDecide(app, "reject")}>
            {app.company ? "Reject & suspend" : "Reject"}
          </Button>
        </div>
      )}
      {app.status === "APPROVED" && app.inviteCode && (
        <div className="mt-4 flex items-center gap-2 text-sm">
          <span className="ds-num rounded-lg bg-[color:var(--ds-surface-2)] px-3 py-1.5 font-semibold tracking-wider text-[color:var(--ds-ink)]">{app.inviteCode.code}</span>
          <button type="button" onClick={() => onCopy(app.inviteCode!.code)} className="ds-info" title="Copy code" aria-label="Copy code">
            {copied === app.inviteCode.code ? <Check size={14} style={{ color: "var(--ds-good)" }} /> : <Copy size={14} />}
          </button>
          <span className="ds-small">{app.inviteCode.used ? "Used — they signed up" : "Not used yet"}</span>
        </div>
      )}
    </Card>
  );
}

// ── Invite codes ────────────────────────────────────────────────────────────

function inviteStatus(i: Invite): { label: string; tone: "good" | "neutral" | "primary" } {
  if (i.usedAt) return { label: "Used", tone: "good" };
  if (i.revokedAt) return { label: "Revoked", tone: "neutral" };
  if (i.expiresAt && new Date(i.expiresAt) < new Date()) return { label: "Expired", tone: "neutral" };
  return { label: "Active", tone: "primary" };
}

function InvitesPanel({ invites }: { invites: Invite[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [email, setEmail] = useState("");
  const [sendNow, setSendNow] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState("30");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      const res = await fetch("/api/superadmin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note, email, sendEmail: sendNow, expiresInDays: Number(expiresInDays) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      if (sendNow && data.emailed === false) setError(`Code ${data.code} was created but the email failed to send — copy it below.`);
      setNote("");
      setEmail("");
      setSendNow(false);
      router.refresh();
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    const ok = await confirmSheet({ title: "Revoke this code?", message: "It can no longer be used to sign up.", confirmLabel: "Revoke code", destructive: true });
    if (!ok) return;
    setError("");
    setBusy(id);
    try {
      const res = await fetch(`/api/superadmin/invites/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Something went wrong.");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 1500);
  }

  return (
    <>
      {error && (
        <div role="alert" className="form-error mt-4">
          {error}
        </div>
      )}
      <SectionTitle className="mt-6">New invite code</SectionTitle>
      <Card className="p-5">
        <form onSubmit={create}>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="ds-label mb-1 block">Who is it for? (memo)</span>
              <Input type="text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className="w-full" placeholder="Joe's Plumbing — met at expo" />
            </label>
            <label className="block">
              <span className="ds-label mb-1 block">Email (optional)</span>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} className="w-full" placeholder="joe@joesplumbing.com" />
            </label>
            <label className="block">
              <span className="ds-label mb-1 block">Expires</span>
              <Select value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)} className="w-full">
                <option value="7">In 7 days</option>
                <option value="30">In 30 days</option>
                <option value="90">In 90 days</option>
                <option value="0">Never</option>
              </Select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-[color:var(--ds-ink-2)]">
              <input type="checkbox" checked={sendNow} onChange={(e) => setSendNow(e.target.checked)} className="h-4 w-4 rounded" />
              Email the code to them now
            </label>
            <Button type="submit" size="sm" icon={creating ? Loader2 : Plus} disabled={creating} className={creating ? "[&>svg]:animate-spin" : ""}>
              Create code
            </Button>
          </div>
        </form>
      </Card>

      <SectionTitle className="mt-8">
        Codes <span className="ds-small ml-1 font-normal">{invites.length}</span>
      </SectionTitle>
      <Card className="ds-divide overflow-hidden">
        {invites.length === 0 && <p className="ds-small px-6 py-9 text-center">No codes yet.</p>}
        {invites.map((invite) => {
          const status = inviteStatus(invite);
          const active = status.label === "Active";
          return (
            <div key={invite.id} className="ds-row flex-wrap gap-x-4 gap-y-2">
              <span className="ds-num text-[14px] font-semibold tracking-wider text-[color:var(--ds-ink)]">{invite.code}</span>
              <Chip tone={status.tone}>{status.label}</Chip>
              <span className="ds-small min-w-0 flex-1 truncate">
                {invite.usedAt && invite.usedByCompany ? (
                  <>
                    Used by{" "}
                    <Link prefetch={false} href={`/superadmin/company/${invite.usedByCompany.id}`} className="ds-link">
                      {invite.usedByCompany.name}
                    </Link>{" "}
                    on {fullDate(invite.usedAt)}
                  </>
                ) : (
                  invite.note || (invite.applicationCompany ? `Application — ${invite.applicationCompany}` : "") || invite.email || ""
                )}
              </span>
              {invite.expiresAt && !invite.usedAt && !invite.revokedAt && <span className="ds-small whitespace-nowrap">Expires {fullDate(invite.expiresAt)}</span>}
              <span className="flex items-center gap-1">
                <button type="button" onClick={() => copy(invite.code, invite.id)} className="ds-info" title="Copy code" aria-label="Copy code">
                  {copied === invite.id ? <Check size={15} style={{ color: "var(--ds-good)" }} /> : <Copy size={15} />}
                </button>
                <button
                  type="button"
                  onClick={() => copy(`${window.location.origin}/invite?code=${encodeURIComponent(invite.code)}`, `${invite.id}-link`)}
                  className="ds-info"
                  title="Copy sign-up link (pre-fills the code)"
                  aria-label="Copy sign-up link"
                >
                  {copied === `${invite.id}-link` ? <Check size={15} style={{ color: "var(--ds-good)" }} /> : <Link2 size={15} />}
                </button>
                {active && (
                  <button type="button" onClick={() => revoke(invite.id)} disabled={busy === invite.id} className="ds-info hover:!text-[color:var(--ds-bad)] disabled:opacity-50" title="Revoke" aria-label="Revoke code">
                    {busy === invite.id ? <Loader2 size={15} className="animate-spin" /> : <Ban size={15} />}
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </Card>
    </>
  );
}
