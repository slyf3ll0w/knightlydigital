import type { ReactNode } from "react";
import { FilterChip, FilterDivider, SegmentedRow, Segment } from "./FilterChips";
import FilterSelect from "./FilterSelect";
import type { SortOption } from "@/lib/list-sort";

/**
 * THE filter bar for list pages. One component so every list behaves the
 * same way:
 *
 *   phone   ≤4 status options → segmented control (everything visible)
 *           >4 options        → compact dropdown (FilterSelect)
 *           scope chips (e.g. "Mine") and the sort menu sit on the row below
 *           the segments, or beside the dropdown
 *   desktop chip rail · divider · scope chips · sort menu at the far right
 *
 * Before this, Jobs used a segmented control, Invoices crammed six segments,
 * Quotes used a dropdown, Clients a dropdown + chips + a nav link, Requests a
 * dropdown + chip — five idioms on five sibling pages.
 *
 * Server-component friendly: every option is a link, so filters and sort
 * are URLs (shareable, back-button safe). `href(value)` must carry the other
 * active params (search, scope, sort) so switching one never drops another.
 */

export type FilterBarOption = {
  value: string;
  label: string;
  /** Shorter label for the phone segmented control. */
  mobile?: string;
};

const SEGMENT_LIMIT = 4;

export default function FilterBar({
  options,
  value,
  href,
  hue = "",
  scope,
  sort,
  className = "",
}: {
  options: readonly FilterBarOption[];
  /** Active status value ("" = the first/default option). */
  value: string;
  /** Builds the link for a status value, preserving other active params. */
  href: (value: string) => string;
  /** Section hue (accepted for FilterChip compat). */
  hue?: string;
  /** Extra scope chips, e.g. a "Mine" toggle — pass FilterChip elements. */
  scope?: ReactNode;
  /** Sort menu — first option is the default. */
  sort?: {
    options: readonly SortOption[];
    value: string;
    href: (value: string) => string;
  };
  className?: string;
}) {
  const segmented = options.length <= SEGMENT_LIMIT;
  // No fallback highlight: a value outside the options (e.g. Jobs'
  // "unscheduled" KPI drill-in) lights nothing rather than lying with "All".
  const active = value;

  const sortMenu = sort ? (
    <FilterSelect
      icon="sort"
      value={sort.value}
      options={sort.options.map((o) => ({ value: o.value, label: o.label, href: sort.href(o.value) }))}
      align="right"
      className="ml-auto shrink-0"
    />
  ) : null;

  const dropdown = (
    <FilterSelect
      value={active}
      options={options.map((o) => ({
        value: o.value,
        label: o.mobile ?? o.label,
        href: href(o.value),
      }))}
    />
  );

  return (
    <div className={`mb-4 ${className}`}>
      {/* Phone */}
      <div className="flex flex-col gap-2 lg:hidden">
        {segmented ? (
          <>
            <SegmentedRow>
              {options.map((o) => (
                <Segment key={o.value} active={o.value === active} href={href(o.value)}>
                  {o.mobile ?? o.label}
                </Segment>
              ))}
            </SegmentedRow>
            {(scope || sortMenu) && (
              <div className="flex items-center gap-2">
                {scope}
                {sortMenu}
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center gap-2">
            {dropdown}
            {scope}
            {sortMenu}
          </div>
        )}
      </div>

      {/* Desktop */}
      <div className="hidden items-center gap-2 lg:flex">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 py-1">
          {options.map((o) => (
            <FilterChip key={o.value} hue={hue} active={o.value === active} href={href(o.value)}>
              {o.label}
            </FilterChip>
          ))}
          {scope && (
            <>
              <FilterDivider />
              {scope}
            </>
          )}
        </div>
        {sortMenu}
      </div>
    </div>
  );
}

/**
 * Query-string helper for list pages: keeps every active param, overrides
 * the ones you pass, drops empties. `qs("/app/jobs", { status, q, sort }, { sort: "newest" })`.
 */
export function listHref(
  base: string,
  current: Record<string, string | undefined>,
  override: Record<string, string | undefined>
): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, ...override })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}
