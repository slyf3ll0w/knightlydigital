import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { ChevronRight, FileSignature, Plus } from "lucide-react";
import PageTitle from "@/components/PageTitle";
import { SECTION_HUES } from "@/lib/section-colors";
import { shortDate } from "@/lib/statuses";
import StatusChip from "@/components/StatusChip";
import EmptyState from "@/components/EmptyState";
import Monogram from "@/components/Monogram";
import MobileSearch from "@/components/MobileSearch";
import FilterBar, { listHref } from "@/components/FilterBar";
import { SegmentedRow, Segment } from "@/components/FilterChips";
import Pager from "@/components/Pager";
import { pickSort, CONTRACT_SORTS, contractOrderBy } from "@/lib/list-sort";
import { requirePageActor, canSell, isManager, viaContactScope } from "@/lib/permissions";
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
  const companyId = actor.companyId;
  const scope = viaContactScope(actor);
  const manager = isManager(actor.role);

  const { view: viewRaw, status, q, page: pageParam, sort: sortRaw } = await searchParams;
  const view: "agreements" | "templates" = manager && viewRaw === "templates" ? "templates" : "agreements";

  const viewSwitch = manager ? (
    <SegmentedRow className="mb-4 max-w-xs">
      <Segment active={view === "agreements"} href="/app/contracts">
        Agreements
      </Segment>
      <Segment active={view === "templates"} href="/app/contracts?view=templates">
        Templates
      </Segment>
    </SegmentedRow>
  ) : null;

  // ── Templates view ────────────────────────────────────────────────────
  if (view === "templates") {
    const templates = await prisma.contractTemplate.findMany({
      where: { companyId },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: { id: true, name: true, body: true, isActive: true },
    });
    return (
      <div className="p-4 lg:p-8 max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-y-3 mb-4 lg:mb-6">
          <PageTitle
            section="contracts"
            icon={FileSignature}
            sub="Every agreement you've sent, and the templates they start from."
          >
            Agreements
          </PageTitle>
          {/* Templates aren't in the phone create sheet, so the button stays
              on every screen size — icon-only under sm */}
          <Link
            href="/app/contracts?view=templates&new=1"
            aria-label="New template"
            className="btn-primary h-10 shrink-0 justify-center sm:px-4"
          >
            <Plus size={15} />
            <span className="hidden sm:inline">New Template</span>
          </Link>
        </div>
        {viewSwitch}
        <TemplatesPanel templates={templates} />
      </div>
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

  const [contracts, listCount] = await Promise.all([
    prisma.contract.findMany({
      where: listWhere,
      include: { contact: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: contractOrderBy(sort),
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.contract.count({ where: listWhere }),
  ]);

  const filtered = Boolean(validStatus || query);

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-y-3 mb-4 lg:mb-6">
        <PageTitle
          section="contracts"
          icon={FileSignature}
          sub={
            manager
              ? "Every agreement you've sent, and the templates they start from."
              : "Every agreement you've sent to a client for an e-signature."
          }
        >
          Agreements
        </PageTitle>
        {/* Phones create from the tab-bar FAB */}
        <div className="hidden lg:flex items-center gap-2">
          <Link href="/app/contracts/new" className="btn-primary">
            <Plus size={15} />
            New Agreement
          </Link>
        </div>
      </div>

      {viewSwitch}

      <MobileSearch
        action="/app/contracts"
        placeholder="Search agreements, clients…"
        defaultValue={query}
        params={{ status: validStatus, sort: sortRaw }}
      />

      <FilterBar
        hue={SECTION_HUES.contracts}
        options={statusFilters}
        value={validStatus ?? ""}
        href={(v) => listHref("/app/contracts", { q: query, sort: sortRaw }, { status: v })}
        sort={{
          options: CONTRACT_SORTS,
          value: sort,
          href: (v) => listHref("/app/contracts", { status: validStatus, q: query }, { sort: v }),
        }}
      />

      <div className="card-ledger overflow-hidden">
        {contracts.length === 0 ? (
          <EmptyState
            art="quotes"
            hue={SECTION_HUES.contracts}
            title={filtered ? "No agreements match this filter" : "No agreements yet"}
            body={
              filtered
                ? "Try a different search or status, or send a new agreement."
                : "Send one to a client for an e-signature, or attach a template to a price-book service and it goes out with the quote."
            }
            actionHref="/app/contracts/new"
            actionLabel="Send an Agreement"
          />
        ) : (
          <>
            <div className="divide-y divide-gray-100">
              <div className="hidden lg:grid grid-cols-[1fr_70px_140px_150px_40px] gap-4 px-4 py-2 text-xs font-medium text-gray-500 bg-gray-50">
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
                    className="block lg:grid lg:grid-cols-[1fr_70px_140px_150px_40px] lg:gap-4 lg:items-center px-4 py-3 lg:py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                  >
                    {/* Phone row: monogram anchor, title + status, then
                        client · date */}
                    <div className="lg:hidden flex min-w-0 items-center gap-3">
                      <Monogram name={`${c.contact.firstName} ${c.contact.lastName}`} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="min-w-0 flex-1 truncate text-[15.5px] font-semibold text-gray-900">
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
                      <p className="text-sm font-medium text-gray-900 truncate">
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
            <div className="flex items-center justify-between gap-4 border-t-2 border-double border-gray-300 bg-gray-50/60 px-4 py-2.5">
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
    </div>
  );
}
