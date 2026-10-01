"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ChevronRight, ExternalLink, FlaskConical, Link2, Search } from "lucide-react";
import { Card, Chip, ListRow, SectionTitle } from "@/components/ds";
import { Select } from "@/components/Input";
import RowActions, { QuickMenu, type MenuAnchor, type QuickAction } from "@/components/QuickMenu";
import PresenceDot from "./PresenceDot";
import { monthYear } from "@/lib/console-format";
import type { AccountRow } from "@/lib/console-accounts";

/**
 * The two account lists (Live, Test) with the filters, search and sort that
 * work on them. The home page keeps to the basics — who they are, whether
 * they are live, when they were last in, team and client counts — and the
 * company page holds everything else. Right-click a row on the desktop
 * (press and hold on a phone) for Open / new tab / copy link / Mark as
 * test or live, the same quick menu as the app's rail.
 */

type Filter = "all" | "live" | "attention" | "pending" | "suspended";
type Sort = "active" | "newest" | "clients";

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
      default:
        return (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? "") || b.createdAt.localeCompare(a.createdAt);
    }
  };
}

const hrefOf = (r: AccountRow) => `/superadmin/company/${r.id}`;

export default function AccountsClient({ rows, days }: { rows: AccountRow[]; days: number }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("active");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState<{ row: AccountRow; anchor: MenuAnchor } | null>(null);

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

  // One menu for every row, the app's rail quick menu: open, open in a new
  // tab, copy the link, and the Test / Live switch.
  const actionsFor = (r: AccountRow): QuickAction[] => [
    { key: "open", label: "Open", icon: ArrowUpRight, href: hrefOf(r) },
    { key: "tab", label: "Open in new tab", icon: ExternalLink, onSelect: () => void window.open(hrefOf(r), "_blank", "noopener") },
    {
      key: "copy",
      label: "Copy link",
      icon: Link2,
      onSelect: () => void navigator.clipboard.writeText(`${window.location.origin}${hrefOf(r)}`),
    },
    {
      key: "toggle",
      label: r.isTest ? "Mark as live" : "Mark as test",
      icon: FlaskConical,
      hint: r.isTest ? "back into the totals" : "out of the totals",
      disabled: busy !== null,
      onSelect: () => toggle(r),
    },
  ];

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
        info="Every real business on WorkBench, most recently active first. Right-click a row on a computer, or press and hold on a phone, to open it, copy its link, or mark it as a test account. Everything else about an account — money, usage, devices, controls — is on its own page."
      >
        Live accounts <span className="ds-small ml-1 font-normal">{live.length}</span>
      </SectionTitle>
      <AccountsTable rows={live} days={days} actionsFor={actionsFor} onMenu={setMenu} empty={rows.some((r) => !r.isTest) ? "No accounts match." : "No live accounts yet."} />

      <SectionTitle
        className="mt-10"
        info="Ours, testers' and the demo company. Test accounts are left out of every stat, chart and the Live list. Right-click (or press and hold) to mark one live again."
      >
        Test accounts <span className="ds-small ml-1 font-normal">{test.length}</span>
      </SectionTitle>
      <AccountsTable rows={test} days={days} actionsFor={actionsFor} onMenu={setMenu} empty="No test accounts. Right-click a live account to mark it as test." />

      <QuickMenu open={menu !== null} anchor={menu?.anchor ?? null} title={menu?.row.name} actions={menu ? actionsFor(menu.row) : []} onClose={() => setMenu(null)} />
    </div>
  );
}

function AccountsTable({
  rows,
  days,
  actionsFor,
  onMenu,
  empty,
}: {
  rows: AccountRow[];
  days: number;
  actionsFor: (r: AccountRow) => QuickAction[];
  onMenu: (m: { row: AccountRow; anchor: MenuAnchor }) => void;
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
      {/* ── Phones: one column, the essentials; press and hold for the menu ── */}
      <Card className="ds-divide overflow-hidden lg:hidden">
        {rows.map((r) => (
          <RowActions key={r.id} actions={actionsFor(r)} title={r.name}>
            <ListRow
              href={hrefOf(r)}
              lead={<PresenceDot state={r.presence} />}
              title={r.name}
              sub={`${r.status.label} · ${r.clients.total} client${r.clients.total === 1 ? "" : "s"} · ${r.team.total} on the team · seen ${r.lastSeen}`}
              trail={<ChevronRight size={16} className="text-[color:var(--ds-faint)]" />}
            />
          </RowActions>
        ))}
      </Card>

      {/* ── Desktop: the basics; right-click a row for the menu ── */}
      <Card className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[760px] text-[13.5px]">
          <thead>
            <tr className="ds-label border-b border-[color:var(--ds-line)] text-left [&>th]:whitespace-nowrap">
              <th className="px-4 py-2.5 font-medium">Account</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Last seen</th>
              <th className="px-3 py-2.5 text-right font-medium">Team</th>
              <th className="px-3 py-2.5 text-right font-medium">Clients</th>
              <th className="px-4 py-2.5 text-right font-medium">Joined</th>
            </tr>
          </thead>
          <tbody className="ds-divide">
            {rows.map((r) => (
              <tr
                key={r.id}
                className="transition-colors hover:bg-[color:var(--ds-surface-2)]"
                onContextMenu={(e) => {
                  e.preventDefault();
                  onMenu({ row: r, anchor: { x: e.clientX, y: e.clientY } });
                }}
              >
                <td className="px-4 py-3">
                  <Link prefetch={false} href={hrefOf(r)} className="group block min-w-0">
                    <span className="block truncate font-medium text-[color:var(--ds-ink)] group-hover:text-[color:var(--ds-primary)]">{r.name}</span>
                    <span className="ds-small block truncate">
                      /{r.slug}
                      {r.industry ? ` · ${r.industry}` : ""}
                      {r.place ? ` · ${r.place}` : ""}
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-3">
                  <Chip tone={r.status.tone}>{r.status.label}</Chip>
                </td>
                <td className="px-3 py-3">
                  <span className="inline-flex items-center gap-2 whitespace-nowrap">
                    <PresenceDot state={r.presence} />
                    <span className={r.presence === "online" ? "font-medium text-[color:var(--ds-good)]" : "text-[color:var(--ds-ink-2)]"}>
                      {r.presence === "online" ? "Online now" : r.lastSeen}
                    </span>
                  </span>
                </td>
                <td className="ds-num px-3 py-3 text-right">
                  {r.team.total}
                  {r.team.online > 0 && <span className="ds-small block text-[color:var(--ds-good)]">{r.team.online} online</span>}
                </td>
                <td className="ds-num px-3 py-3 text-right">
                  {r.clients.total}
                  {r.clients.added > 0 && (
                    <span className="ds-small block">
                      +{r.clients.added} in {days} d
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-[color:var(--ds-ink-2)]">{monthYear(r.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
