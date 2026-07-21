import Link from "next/link";

export type Kpi = {
  label: string;
  /** Shorter label for the phone strip when the desktop one wouldn't fit */
  mobileLabel?: string;
  value: string | number;
  sub?: string;
  href: string;
  /** Zero-value stats disappear on phones (still shown as cards on desktop) */
  zero?: boolean;
  tone?: "danger";
};

const desktopGrid: Record<3 | 4, string> = {
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
};

/**
 * KPI header for list pages. Desktop keeps the big card grid; phones get one
 * compact divided strip instead — a 2×2 wall of mostly-$0.00 cards pushed the
 * actual list below the fold on small screens. Zero stats drop out of the
 * strip entirely, and if everything is zero the strip doesn't render at all.
 */
export default function KpiStrip({ kpis, desktopCols = 3 }: { kpis: Kpi[]; desktopCols?: 3 | 4 }) {
  const visible = kpis.filter((k) => !k.zero);
  return (
    <>
      {visible.length > 0 && (
        <div className="card-ledger mb-4 flex divide-x divide-gray-100 overflow-hidden lg:hidden">
          {visible.map((k) => (
            <Link
              key={k.label}
              href={k.href}
              className="min-w-0 flex-1 px-3 py-2.5 transition-colors active:bg-gray-50"
            >
              <p
                className={`truncate text-[11px] font-medium ${
                  k.tone === "danger" ? "text-red-600" : "text-gray-500"
                }`}
              >
                {k.mobileLabel ?? k.label}
              </p>
              <p
                className={`numeral-ledger truncate text-base font-semibold ${
                  k.tone === "danger" ? "text-red-700" : "text-gray-900"
                }`}
              >
                {k.value}
              </p>
            </Link>
          ))}
        </div>
      )}
      <div className={`mb-6 hidden gap-3 lg:grid ${desktopGrid[desktopCols]}`}>
        {kpis.map((k) => (
          <Link
            key={k.label}
            href={k.href}
            className={`card-ledger p-4 transition-shadow hover:shadow-sm ${
              k.tone === "danger" ? "border-red-200" : ""
            }`}
          >
            <p
              className={`mb-1 text-xs font-medium ${
                k.tone === "danger" ? "text-red-600" : "text-gray-500"
              }`}
            >
              {k.label}
            </p>
            <p
              className={`numeral-ledger text-2xl font-semibold ${
                k.tone === "danger" ? "text-red-700" : "text-gray-900"
              }`}
            >
              {k.value}
            </p>
            {k.sub && <p className="mt-0.5 text-xs text-gray-500">{k.sub}</p>}
          </Link>
        ))}
      </div>
    </>
  );
}
