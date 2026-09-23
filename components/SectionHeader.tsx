import type { ReactNode } from "react";

/**
 * THE section heading — card titles and in-page block headings as one
 * component instead of the 39 `<h2>` recipes the 2026-09-03 audit counted.
 *
 * - size="card"  → the card-title recipe the newest settings cards set
 *                  (text-sm font-semibold text-gray-700) with the hint line
 *                  under it (text-xs text-gray-500). Replaces the older
 *                  text-[13px] text-gray-500 title and its mb-1/2/3/4 forks.
 * - size="block" → the in-page block heading (text-base font-semibold
 *                  text-gray-900), hint in text-sm.
 *
 * `action` renders right-aligned on the title row (an Add button, a stamp,
 * a link) so callers stop hand-rolling the flex row around the heading.
 * `className` takes the outer margin (mb-3 etc.) — the heading itself has
 * none, so a header sitting on a `space-y-*` card needs nothing.
 */
export default function SectionHeader({
  size = "card",
  title,
  hint,
  action,
  as: Tag = "h2",
  className = "",
}: {
  size?: "card" | "block";
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  /** Heading level — h2 on cards, h3 inside a dialog or a nested group. */
  as?: "h2" | "h3";
  className?: string;
}) {
  const titleCls =
    size === "block" ? "text-base font-semibold text-gray-900" : "text-sm font-semibold text-gray-700";
  const hintCls = size === "block" ? "mt-0.5 text-sm text-gray-500" : "mt-0.5 text-xs text-gray-500";
  const heading = (
    <>
      <Tag className={`flex items-center gap-1.5 ${titleCls}`}>{title}</Tag>
      {hint && <p className={hintCls}>{hint}</p>}
    </>
  );
  if (!action) return <div className={className}>{heading}</div>;
  return (
    <div className={`flex ${hint ? "items-start" : "items-center"} justify-between gap-3 ${className}`}>
      <div className="min-w-0">{heading}</div>
      <div className="flex shrink-0 items-center gap-2">{action}</div>
    </div>
  );
}
