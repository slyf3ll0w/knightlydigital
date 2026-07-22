import Link from "next/link";

export type Kpi = {
  label: string;
  /** Shorter label for the phone strip when the desktop one wouldn't fit */
  mobileLabel?: string;
  value: string | number;
  sub?: string;
  /** Omit for a plain (non-link) stat */
  href?: string;
  /** Zero-value stats disappear on phones (still shown as cards on desktop) */
  zero?: boolean;
  tone?: "danger";
  /** Daily values for a mini bar chart on the desktop card */
  spark?: number[];
};

const desktopGrid: Record<3 | 4, string> = {
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
};

/** Tiny bar chart for a desktop stat card — pure SVG, renders on the server. */
function Spark({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const w = 100;
  const gap = 1.5;
  const bw = (w - gap * (values.length - 1)) / values.length;
  return (
    <svg
      viewBox={`0 0 ${w} 24`}
      className="mt-2 h-6 w-full text-green-600"
      preserveAspectRatio="none"
      aria-hidden
    >
      {values.map((v, i) => {
        const h = v > 0 ? Math.max((v / max) * 22, 2) : 1;
        return (
          <rect
            key={i}
            x={i * (bw + gap)}
            y={24 - h}
            width={bw}
            height={h}
            rx={0.75}
            fill="currentColor"
            opacity={v > 0 ? 0.85 : 0.15}
          />
        );
      })}
    </svg>
  );
}

/** Hue dot before a stat label — the stamp language in miniature. */
function DotLabel({
  hue,
  danger,
  className,
  children,
}: {
  hue?: string;
  danger?: boolean;
  className: string;
  children: React.ReactNode;
}) {
  const dot = danger ? "#EF4444" : hue;
  return (
    <p className={`flex items-center gap-1.5 ${className}`}>
      {dot && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: dot }}
          aria-hidden
        />
      )}
      <span className="truncate">{children}</span>
    </p>
  );
}

/**
 * KPI header for list pages. Desktop keeps the big card grid; phones get one
 * compact divided strip instead — a 2×2 wall of mostly-$0.00 cards pushed the
 * actual list below the fold on small screens. Zero stats drop out of the
 * strip entirely, and if everything is zero the strip doesn't render at all.
 */
export default function KpiStrip({
  kpis,
  desktopCols = 3,
  hue,
}: {
  kpis: Kpi[];
  desktopCols?: 3 | 4;
  /** Section hue — a dot beside each label ties the strip to its section */
  hue?: string;
}) {
  const visible = kpis.filter((k) => !k.zero);
  return (
    <>
      {visible.length > 0 && (
        <div className="card-ledger mb-4 flex divide-x divide-gray-100 overflow-hidden lg:hidden">
          {visible.map((k) => {
            const cell = (
              <>
                <DotLabel
                  hue={hue}
                  danger={k.tone === "danger"}
                  className={`truncate text-[11px] font-medium ${
                    k.tone === "danger" ? "text-red-600" : "text-gray-500"
                  }`}
                >
                  {k.mobileLabel ?? k.label}
                </DotLabel>
                <p
                  className={`numeral-ledger truncate text-base font-semibold ${
                    k.tone === "danger" ? "text-red-700" : "text-gray-900"
                  }`}
                >
                  {k.value}
                </p>
              </>
            );
            const cls = "min-w-0 flex-1 px-3 py-2.5 transition-colors active:bg-gray-50";
            return k.href ? (
              <Link key={k.label} href={k.href} className={cls}>
                {cell}
              </Link>
            ) : (
              <div key={k.label} className={cls}>
                {cell}
              </div>
            );
          })}
        </div>
      )}
      <div className={`mb-6 hidden gap-3 lg:grid ${desktopGrid[desktopCols]}`}>
        {kpis.map((k) => {
          const card = (
            <>
              <DotLabel
                hue={hue}
                danger={k.tone === "danger"}
                className={`mb-1 text-xs font-medium ${
                  k.tone === "danger" ? "text-red-600" : "text-gray-500"
                }`}
              >
                {k.label}
              </DotLabel>
              <p
                className={`numeral-ledger text-2xl font-semibold ${
                  k.tone === "danger" ? "text-red-700" : "text-gray-900"
                }`}
              >
                {k.value}
              </p>
              {k.sub && <p className="mt-0.5 text-xs text-gray-500">{k.sub}</p>}
              {k.spark && k.spark.length > 1 && <Spark values={k.spark} />}
            </>
          );
          const cls = `card-ledger p-4 transition-shadow hover:shadow-sm ${
            k.tone === "danger" ? "border-red-200" : ""
          }`;
          return k.href ? (
            <Link key={k.label} href={k.href} className={cls}>
              {card}
            </Link>
          ) : (
            <div key={k.label} className={cls}>
              {card}
            </div>
          );
        })}
      </div>
    </>
  );
}
