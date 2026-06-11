import { statusLabels, statusTones, type StatusKind, type StatusTone } from "@/lib/statuses";

/**
 * The one status chip used everywhere — list rows, detail headers, dashboard
 * cards. Colored dot + tinted pill so statuses scan the same on every page.
 */

const toneClasses: Record<StatusTone, string> = {
  green: "bg-green-50 text-green-700 ring-green-600/20",
  amber: "bg-amber-50 text-amber-700 ring-amber-500/30",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  gray: "bg-gray-100 text-gray-600 ring-gray-500/20",
};

const dotClasses: Record<StatusTone, string> = {
  green: "bg-green-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  gray: "bg-gray-400",
};

export default function StatusChip({
  kind,
  status,
  className = "",
}: {
  kind: StatusKind;
  status: string;
  className?: string;
}) {
  const tone = statusTones[kind][status] ?? "gray";
  const label = statusLabels[kind][status] ?? status;
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${toneClasses[tone]} ${className}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClasses[tone]}`} />
      {label}
    </span>
  );
}
