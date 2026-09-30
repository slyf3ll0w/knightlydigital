"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, FlaskConical, Loader2, Search } from "lucide-react";
import { Button, Card, Chip, ListRow, SectionTitle } from "@/components/ds";
import { Select } from "@/components/Input";
import PresenceDot from "./PresenceDot";
import DeviceIcons from "./DeviceIcons";
import { monthYear, usd, usdFine } from "@/lib/console-format";
import type { AccountRow } from "@/lib/console-accounts";

/**
 * The two account lists (Live, Test) with the filters, search and sort that
 * work on them, and the Test / Live toggle on every row. Everything here is
 * already loaded — filtering is instant — and a toggle re-fetches the page
 * so the stats and charts above agree with the lists.
 */

type Filter = "all" | "live" | "attention" | "pending" | "suspended";
type Sort = "active" | "newest" | "clients" | "collected";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "attention", label: "Needs attention" },
  { key: "pending", label: "Pending" },
  { key: "suspended", label: "Suspended" },
];

function matchesFilter(r: AccountRow, f: Filter): boolean {
  switch (f) {
    case "live":
      return r.status.key === "live";
    case "attention":
      return r.status.key !== "live" || r.chips.some((c) => c.tone === "warn");
    case "pending":
      return r.status.key === "pending";
    case "suspended":
      return r.status.key === "suspended";
    default:
      return true;
  }
}

function sorter(s: Sort) {
  return (a: AccountRow, b: AccountRow) => {
    switch (s) {
      case "newest":
        return b.createdAt.localeCompare(a.createdAt);
      case "clients":
        return b.clients.total - a.clients.total;
      case "collected":
        return b.collectedCents - a.collectedCents;
      default:
        return (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? "") || b.createdAt.localeCompare(a.createdAt);
    }
  };
}

export default function AccountsClient({ rows, days }: { rows: AccountRow[]; days: number }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("active");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const term = q.trim().toLowerCase();
  const search = (r: AccountRow) =>
    !term ||
    r.name.toLowerCase().includes(term) ||
    r.slug.toLowerCase().includes(term) ||
    (r.industry ?? "").toLowerCase().includes(term) ||
    (r.place ?? "").toLowerCase().includes(term);

  const live = useMemo(
    () => rows.filter((r) => !r.isTest && matchesFilter(r, filter) && search(r)).sort(sorter(sort)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, filter, term, sort]
  );
  const test = useMemo(
    () => rows.filter((r) => r.isTest && search(r)).sort(sorter(sort)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, term, sort]
  );

  async function toggle(r: AccountRow) {
    setBusy(r.id);
    setError("");
    try {
      const res = await fetch(`/api/superadmin/companies/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: r.isTest ? "mark-live" : "mark-test" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't update that account.");
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't update that account.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`ds-btn ds-btn-sm ${filter === f.key ? "ds-btn-soft" : "ds-btn-ghost"}`}
              aria-pressed={filter === f.key}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--ds-faint)]" aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter this list"
              aria-label="Filter accounts"
              className="h-[34px] w-44 rounded-[10px] border border-[color:var(--ds-line-strong)] bg-[color:var(--ds-surface)] pl-8 pr-3 text-[13.5px] text-[color:var(--ds-ink)] placeholder:text-[color:var(--ds-faint)] focus:border-[color:var(--ds-primary)] focus:outline-none"
            />
          </div>
          <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort accounts" className="h-[34px] !w-auto !py-0 text-[13.5px]">
            <option value="active">Last active</option>
            <option value="newest">Newest</option>
            <option value="clients">Most clients</option>
            <option value="collected">Most collected</option>
          </Select>
        </div>
      </div>

      {error && (
        <div role="alert" className="form-error mt-4">
          {error}
        </div>
      )}

      <SectionTitle
        className="mt-6"
        info="Every real business on WorkBench. Sorted by who was in the app most recently unless you pick another order. Mark an account as test to move it to the list below and out of every total."
      >
        Live accounts <span className="ds-small ml-1 font-normal">{live.length}</span>
      </SectionTitle>
      <AccountsTable rows={live} days={days} busy={busy} onToggle={toggle} empty={rows.some((r) => !r.isTest) ? "No accounts match." : "No live accounts yet."} />

      <SectionTitle
        className="mt-10"
        info="Ours, testers' and the demo company. Test accounts are left out of every stat, chart and the Live list. Mark one live to move it back."
      >
        Test accounts <span className="ds-small ml-1 font-normal">{test.length}</span>
      </SectionTitle>
      <AccountsTable rows={test} days={days} busy={busy} onToggle={toggle} empty="No test accounts. Mark one from the Live list." />
    </div>
  );
}

function AccountsTable({
  rows,
  days,
  busy,
  onToggle,
  empty,
}: {
  rows: AccountRow[];
  days: number;
  busy: string | null;
  onToggle: (r: AccountRow) => void;
  empty: string;
}) {
  if (rows.length === 0) {
    return (
      <Card className="px-6 py-9 text-center">
        <p className="ds-small">{empty}</p>
      </Card>
    );
  }
  return (
    <>
      {/* ── Phones: one column, the essentials ─────────────────────── */}
      <Card className="ds-divide overflow-hidden lg:hidden">
        {rows.map((r) => (
          <ListRow
            key={r.id}
            href={`/superadmin/company/${r.id}`}
            lead={<PresenceDot state={r.presence} />}
            title={r.name}
            sub={`${r.status.label} · ${r.clients.total} client${r.clients.total === 1 ? "" : "s"} · ${r.team.total} on the team · seen ${r.lastSeen}`}
            trail={<ChevronRight size={16} className="text-[color:var(--ds-faint)]" />}
          />
        ))}
      </Card>

      {/* ── Desktop: the full table ─────────────────────────────────── */}
      <Card className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[1380px] text-[13.5px]">
          <thead>
            <tr className="ds-label border-b border-[color:var(--ds-line)] text-left [&>th]:whitespace-nowrap">
              <th className="px-4 py-2.5 font-medium">Account</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Last seen</th>
              <th className="px-3 py-2.5 text-right font-medium">Team</th>
              <th className="px-3 py-2.5 text-right font-medium">Clients</th>
              <th className="px-3 py-2.5 text-right font-medium" title="Jobs · quotes · invoices · payments created in the range">
                Jobs · quotes · inv · paid
              </th>
              <th className="px-3 py-2.5 text-right font-medium">Collected</th>
              <th className="px-3 py-2.5 text-right font-medium">Our cost</th>
              <th className="min-w-[250px] px-3 py-2.5 font-medium">Plan</th>
              <th className="px-3 py-2.5 font-medium">Devices</th>
              <th className="px-3 py-2.5 font-medium">Referral</th>
              <th className="px-3 py-2.5 font-medium">Joined</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="ds-divide">
            {rows.map((r) => (
              <tr key={r.id} className="transition-colors hover:bg-[color:var(--ds-surface-2)]">
                <td className="px-4 py-2.5">
                  <Link prefetch={false} href={`/superadmin/company/${r.id}`} className="group block min-w-0">
                    <span className="block truncate font-medium text-[color:var(--ds-ink)] group-hover:text-[color:var(--ds-primary)]">{r.name}</span>
                    <span className="ds-small block truncate">
                      /{r.slug}
                      {r.industry ? ` · ${r.industry}` : ""}
                      {r.place ? ` · ${r.place}` : ""}
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  <Chip tone={r.status.tone}>{r.status.label}</Chip>
                </td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-2 whitespace-nowrap">
                    <PresenceDot state={r.presence} />
                    <span className={r.presence === "online" ? "font-medium text-[color:var(--ds-good)]" : "text-[color:var(--ds-ink-2)]"}>
                      {r.presence === "online" ? "Online now" : r.lastSeen}
                    </span>
                  </span>
                </td>
                <td className="ds-num px-3 py-2.5 text-right">
                  {r.team.total}
                  {r.team.online > 0 && <span className="ds-small block text-[color:var(--ds-good)]">{r.team.online} online</span>}
                </td>
                <td className="ds-num px-3 py-2.5 text-right">
                  {r.clients.total}
                  {r.clients.added > 0 && (
                    <span className="ds-small block">
                      +{r.clients.added} in {days} d
                    </span>
                  )}
                </td>
                <td className="ds-num whitespace-nowrap px-3 py-2.5 text-right text-[color:var(--ds-ink-2)]">
                  {r.activity.jobs} · {r.activity.quotes} · {r.activity.invoices} · {r.activity.payments}
                </td>
                <td className="ds-num px-3 py-2.5 text-right">{usd(r.collectedCents)}</td>
                <td
                  className="ds-num px-3 py-2.5 text-right text-[color:var(--ds-ink-2)]"
                  title={`AI ${usdFine(r.cost.ai)} · email/SMS ${usdFine(r.cost.comms)} · storage ${usdFine(r.cost.storage)} · card cost ${usdFine(r.cost.processing)}`}
                >
                  {usdFine(r.costCents)}
                </td>
                <td className="px-3 py-2.5">
                  <span className="flex flex-wrap gap-x-3 gap-y-1">
                    {r.chips.map((c) => (
                      <Chip key={c.label} tone={c.tone}>
                        {c.label}
                      </Chip>
                    ))}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <DeviceIcons devices={r.devices} />
                </td>
                <td className="max-w-[140px] truncate px-3 py-2.5 text-[color:var(--ds-ink-2)]" title={r.referralSource ?? undefined}>
                  {r.referralSource || <span className="ds-small">—</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-[color:var(--ds-ink-2)]">{monthYear(r.createdAt)}</td>
                <td className="px-3 py-2.5 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={busy === r.id ? Loader2 : FlaskConical}
                    disabled={busy !== null}
                    onClick={() => onToggle(r)}
                    title={r.isTest ? "Move back to the Live list" : "Move to the Test list (out of every total)"}
                    className={busy === r.id ? "[&>svg]:animate-spin" : ""}
                  >
                    {r.isTest ? "Mark live" : "Mark test"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
