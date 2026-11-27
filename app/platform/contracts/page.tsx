import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Files, Plus, Search } from "lucide-react";
import { Button, DsPage, PageHeader } from "@/components/ds";
import FilterSelect from "@/components/FilterSelect";
import TitleSentinel from "@/components/TitleSentinel";
import { shortDate } from "@/lib/statuses";
import StatusChip from "@/components/StatusChip";
import EmptyState from "@/components/EmptyState";
import Monogram from "@/components/Monogram";
import { listHref } from "@/components/FilterBar";
import { SignBand, waitedFor } from "@/components/ListBands";
import Pager from "@/components/Pager";
import { pickSort, CONTRACT_SORTS, contractOrderBy } from "@/lib/list-sort";
import { requirePageActor, canSell, isManager, viaContactScope } from "@/lib/permissions";
import { featureAllowedFor } from "@/lib/plan-gate";
import PlanRequired from "@/components/PlanRequired";
import TemplatesPanel from "./TemplatesPanel";
import type { ContractStatus } from "@prisma/client";

export const metadata: Metadata = { title: "Agreements" };

/**
 * ONE Agreements page doing both jobs: the agreements you've issued
 * (`?view=agreements`, the default) and the reusable templates they start
 * from (`?view=templates`, managers only — the old /app/settings/contracts
 * redirects here). Sellers see the agreements list with no view control.
 */

const statusFilters = [
  { value: "", label: "All", mobile: "All" },
  { value: "SENT", label: "Awaiting Signature", mobile: "Awaiting signature" },
  { value: "SIGNED", label: "Signed", mobile: "Signed" },
  { value: "DRAFT", label: "Drafts", mobile: "Drafts" },
  { value: "VOID", label: "Void", mobile: "Void" },
];

const validValues = statusFilters.map((f) => f.value).filter(Boolean);

const PAGE_SIZE = 100;

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; status?: string; q?: string; page?: string; sort?: string }>;
}) {
  const actor = await requirePageActor((a) => canSell(a.role));
  if (!(await featureAllowedFor(actor.companyId, "agreements")))
    return <PlanRequired feature="agreements" back={{ href: "/app/quotes", label: "Back to quotes" }} />;
  const companyId = actor.companyId;
  const scope = viaContactScope(actor);
  const manager = isManager(actor.role);

  const { view: viewRaw, status, q, page: pageParam, sort: sortRaw } = await searchParams;
  const view: "agreements" | "templates" = manager && viewRaw === "templates" ? "templates" : "agreements";


  // ── Templates view ────────────────────────────────────────────────────
  if (view === "templates") {
    const templates = await prisma.contractTemplate.findMany({
      where: { companyId },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: { id: true, name: true, body: true, isActive: true },
    });
    return (
      <DsPage
        open
        className="rx-templates rx-phone"
        header={
          <PageHeader
            eyebrow={`${templates.filter((t) => t.isActive).length} in use`}
            title="Templates"
            info="The reusable agreements you start from. Pick one when you send an agreement and fill in the client's details."
            actions={
              <>
                {/* Templates aren't in the phone create sheet, so New template stays on every size */}
                <Button href="/app/contracts" variant="outline" icon={ArrowLeft}>
                  Agreements
                </Button>
                <Button href="/app/contracts?view=templates&new=1" icon={Plus}>
                  New template
                </Button>
              </>
            }
          />
        }
      >
        <span className="hidden"><TitleSentinel title="Templates" /></span>
        <TemplatesPanel templates={templates} />
      </DsPage>
    );
  }

  // ── Agreements view ───────────────────────────────────────────────────
  // Dates render in the company's zone — the server clock is UTC.
  const tz =
    (await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } }))
      ?.timezone ?? "America/Chicago";
  const sort = pickSort(sortRaw, CONTRACT_SORTS);
  const validStatus = validValues.includes(status ?? "") ? (status as ContractStatus) : undefined;
  const query = q?.trim() || undefined;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const search = query
    ? {
        OR: [
          { title: { contains: query, mode: "insensitive" as const } },
          ...(Number.isInteger(Number(query)) && query !== ""
            ? [{ contractNumber: Number(query) }]
            : []),
          {
            contact: {
              OR: [
                { firstName: { contains: query, mode: "insensitive" as const } },
                { lastName: { contains: query, mode: "insensitive" as const } },
              ],
            },
          },
        ],
      }
    : {};
  const listWhere = { companyId, ...scope, ...(validStatus ? { status: validStatus } : {}), ...search };

  const since30 = new Date(Date.now() - 30 * 86400000);
  const sheetSelect = { id: true, title: true, sentAt: true, createdAt: true, signedAt: true, contact: { select: { firstName: true, lastName: true } } } as const;
  const [contracts, listCount, outCount, oldestOut, signed30, draftCount, templateCount, outSheets, signedSheets] = await Promise.all([
    prisma.contract.findMany({
      where: listWhere,
      include: { contact: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: contractOrderBy(sort),
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.contract.count({ where: listWhere }),
    prisma.contract.count({ where: { companyId, ...scope, status: "SENT" } }),
    prisma.contract.findFirst({ where: { companyId, ...scope, status: "SENT" }, orderBy: { sentAt: "asc" }, select: { sentAt: true, createdAt: true } }),
    prisma.contract.count({ where: { companyId, ...scope, status: "SIGNED", signedAt: { gte: since30 } } }),
    prisma.contract.count({ where: { companyId, ...scope, status: "DRAFT" } }),
    manager ? prisma.contractTemplate.count({ where: { companyId, isActive: true } }) : Promise.resolve(0),
    prisma.contract.findMany({ where: { companyId, ...scope, status: "SENT" }, orderBy: { sentAt: "asc" }, take: 5, select: sheetSelect }),
    prisma.contract.findMany({ where: { companyId, ...scope, status: "SIGNED", signedAt: { gte: since30 } }, orderBy: { signedAt: "desc" }, take: 2, select: sheetSelect }),
  ]);

  const filtered = Boolean(validStatus || query);
  // Desktop tab counts (same scope, no search)
  const byStatus = await prisma.contract.groupBy({ by: ["status"], where: { companyId, ...scope }, _count: { _all: true } });
  const nStatus = (v: string) =>
    v ? (byStatus.find((b) => b.status === v)?._count._all ?? 0) : byStatus.reduce((t, b) => t + b._count._all, 0);

  return (
    <DsPage
      open
      className="rx-agree rx-phone"
      header={
        <div>
          <PageHeader
            title="Agreements"
            info={
              manager
                ? "Every agreement you've sent, and the templates they start from."
                : "Every agreement you've sent to a client for an e-signature."
            }
            actions={
              <>
                {manager && (
                  <Button href="/app/contracts?view=templates" variant="outline" icon={Files}>
                    Templates{templateCount > 0 ? ` · ${templateCount}` : ""}
                  </Button>
                )}
                <Button href="/app/contracts/new" icon={Plus}>
                  New agreement
                </Button>
              </>
            }
          />
        </div>
      }
    >
      <span className="hidden"><TitleSentinel title="Agreements" /></span>

      <SignBand
        out={outCount}
        oldest={oldestOut ? waitedFor(oldestOut.sentAt ?? oldestOut.createdAt) : null}
        outHref="/app/contracts?status=SENT"
        signed30={signed30}
        signedHref="/app/contracts?status=SIGNED"
        drafts={draftCount}
        draftsHref="/app/contracts?status=DRAFT"
        sheets={[
          ...outSheets.map((c) => ({
            id: c.id,
            title: c.title,
            name: `${c.contact.firstName} ${c.contact.lastName}`.trim(),
            note: `Out ${waitedFor(c.sentAt ?? c.createdAt)}`,
            signed: false,
          })),
          ...signedSheets.map((c) => ({
            id: c.id,
            title: c.title,
            name: `${c.contact.firstName} ${c.contact.lastName}`.trim(),
            note: `Signed ${c.signedAt ? c.signedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz }) : ""}`,
            signed: true,
          })),
        ]}
      />

      {/* Search + underline tabs with counts + sort on one hairline row (phones: search above, tabs scroll) */}
      <div className="rx-tabsrow">
        <div className="clx-filters">
          <form action="/app/contracts" className="clx-search" role="search">
            <Search size={15} aria-hidden />
            <input type="search" name="q" defaultValue={query} placeholder="Search agreements, clients, #" aria-label="Search agreements" />
            {validStatus && <input type="hidden" name="status" value={validStatus} />}
            {sortRaw && <input type="hidden" name="sort" value={sortRaw} />}
          </form>
          <nav className="clx-tabs" aria-label="Show">
            {statusFilters.map((o) => (
              <Link
                key={o.value || "all"}
                prefetch={false}
                href={listHref("/app/contracts", { q: query, sort: sortRaw }, { status: o.value || undefined })}
                aria-current={(validStatus ?? "") === o.value ? "page" : undefined}
                className={`clx-tab ${(validStatus ?? "") === o.value ? "is-on" : ""}`}
              >
                {o.mobile}
                <span className="clx-tab-n">{nStatus(o.value).toLocaleString("en-US")}</span>
              </Link>
            ))}
          </nav>
          <span className="clx-filters-end">
            <FilterSelect
              icon="sort"
              value={sort}
              options={CONTRACT_SORTS.map((o) => ({
                value: o.value,
                label: o.label,
                href: listHref("/app/contracts", { status: validStatus, q: query }, { sort: o.value }),
              }))}
              align="right"
            />
          </span>
        </div>
      </div>

      <div className="ds-card rx-open-card overflow-hidden">
        {contracts.length === 0 ? (
          <EmptyState
            art="quotes"
            title={filtered ? "No agreements match this filter" : "No agreements yet"}
            body={
              filtered
                ? "Try a different search or status, or send a new agreement."
                : "Send one to a client for an e-signature, or attach a template to a price-book service and it goes out with the quote."
            }
            actionHref="/app/contracts/new"
            actionLabel="Send an agreement"
          />
        ) : (
          <>
            <div className="divide-y divide-[color:var(--ds-line)]">
              <div className="rx-thead hidden lg:grid grid-cols-[1fr_70px_140px_150px_40px] gap-4 px-4 py-2 text-xs font-medium text-gray-500 bg-gray-50">
                <span>Client</span>
                <span>#</span>
                <span>Sent</span>
                <span>Status</span>
                <span></span>
              </div>
              {contracts.map((c) => {
                const when = c.signedAt
                  ? `Signed ${shortDate(c.signedAt, tz)}`
                  : c.sentAt
                    ? `Sent ${shortDate(c.sentAt, tz)}`
                    : `Created ${shortDate(c.createdAt, tz)}`;
                return (
                  <Link
                    key={c.id}
                    prefetch={false} href={`/app/contracts/${c.id}`}
                    className="ds-trow block lg:grid lg:grid-cols-[1fr_70px_140px_150px_40px] lg:gap-4 lg:items-center px-4 py-3 lg:py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                  >
                    {/* Phone row: monogram anchor, title + status, then
                        client · date */}
                    <div className="lg:hidden flex min-w-0 items-center gap-3">
                      <Monogram name={`${c.contact.firstName} ${c.contact.lastName}`} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="min-w-0 flex-1 ds-trow-name truncate text-[15.5px] font-semibold text-gray-900">
                            {c.title}
                          </p>
                          <StatusChip kind="contract" status={c.status} className="shrink-0" />
                        </div>
                        <p className="mt-0.5 truncate text-[13px] text-gray-500">
                          {c.contact.firstName} {c.contact.lastName} · {when}
                        </p>
                      </div>
                    </div>
                    <div className="hidden lg:block min-w-0">
                      <p className="ds-trow-name text-sm font-medium text-gray-900 truncate">
                        {c.contact.firstName} {c.contact.lastName}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{c.title}</p>
                    </div>
                    <span className="hidden lg:block text-sm text-gray-500">
                      {c.contractNumber ? `#${c.contractNumber}` : "—"}
                    </span>
                    <span className="hidden lg:block text-sm text-gray-500">
                      {c.sentAt ? shortDate(c.sentAt, tz) : "Not sent"}
                    </span>
                    <span className="hidden lg:block">
                      <StatusChip kind="contract" status={c.status} />
                    </span>
                    <ChevronRight size={14} className="text-gray-400 shrink-0 hidden lg:block" />
                  </Link>
                );
              })}
            </div>
            {/* Ledger foot */}
            <div className="rx-foot flex items-center justify-between gap-4 border-t-2 border-double border-gray-300 bg-gray-50/60 px-4 py-2.5">
              <span className="text-xs font-medium text-gray-500">
                {contracts.length} {contracts.length === 1 ? "agreement" : "agreements"}
              </span>
            </div>
          </>
        )}
      </div>
      <Pager
        basePath="/app/contracts"
        params={{ status: validStatus, q: query, sort: sortRaw }}
        page={page}
        pageSize={PAGE_SIZE}
        total={listCount}
      />
    </DsPage>
  );
}
