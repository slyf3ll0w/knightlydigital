import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import type { ScheduleAppearance } from "@/app/book/[slug]/schedule/shell";
import { embedAccent, embedOnAccent, embedWash } from "@/lib/embed-style";
import "@/app/client-heavy.css";

/**
 * One row of the booking page menu (an item, an estimate tool, the Shop):
 * in the heavy look a solid white card, the icon on a solid accent tile, a
 * bold title, the description and one quiet line of facts. The booking
 * look's dark / transparent themes keep the rows they had.
 */
export default function ClientMenuRow({
  href,
  icon: Icon,
  title,
  description,
  meta,
  appearance,
  index = 0,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description?: string | null;
  /** "30 min · instant confirmation" */
  meta?: string | null;
  appearance: Pick<ScheduleAppearance, "dark" | "transparent" | "accent">;
  /** Place in the list: rows rise in one after another. */
  index?: number;
}) {
  const { dark, accent: savedAccent, transparent } = appearance;
  // Saved accent, or the host website's once an embed matches it (lib/embed-style.ts)
  const accent = embedAccent(savedAccent);
  if (!dark && !transparent) {
    const vars = { "--ch-accent": accent, "--ch-on-accent": embedOnAccent(savedAccent), "--i": index } as React.CSSProperties;
    return (
      <Link href={href} className="ch-card ch-row ch-rise" style={vars}>
        <span className="ch-tile">
          <Icon size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="ch-h3 block text-gray-900">{title}</span>
          {description && <span className="mt-1 block text-[14px] leading-snug text-gray-600">{description}</span>}
          {meta && <span className="mt-1.5 block text-[13px] font-medium text-gray-500">{meta}</span>}
        </span>
        <ChevronRight size={20} className="shrink-0 text-gray-400" />
      </Link>
    );
  }
  const card = transparent ? "border" : "bg-[#101410] border border-white/10";
  return (
    <Link
      href={href}
      className={`${card} flex items-center gap-4 rounded-lg p-4 transition-opacity hover:opacity-90 ${dark ? "border-white/10" : ""}`}
      style={transparent ? { borderColor: embedWash(savedAccent, 33) } : undefined}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: embedWash(savedAccent, 13), color: accent }}>
        <Icon size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-base font-semibold ${dark ? "text-white" : "text-gray-900"}`}>{title}</span>
        {description && <span className={`mt-0.5 block text-sm ${dark ? "text-gray-400" : "text-gray-600"}`}>{description}</span>}
        {meta && <span className={`mt-1 block text-xs ${dark ? "text-gray-500" : "text-gray-400"}`}>{meta}</span>}
      </span>
      <ChevronRight size={18} className={dark ? "text-gray-600" : "text-gray-300"} />
    </Link>
  );
}
