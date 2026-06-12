import { statusLabels, statusTones, type StatusKind, type StatusTone } from "@/lib/statuses";

/**
 * The one status indicator used everywhere — list rows, detail headers,
 * dashboard cards. Styled as a ledger "stamp": bordered, uppercase,
 * letterspaced, lightly inked. Same tones on every page so statuses scan
 * identically app-wide.
 */

const toneClasses: Record<StatusTone, string> = {
  green: "border-green-600/30 bg-green-600/[0.06] text-green-700",
  amber: "border-amber-600/35 bg-amber-500/[0.07] text-amber-700",
  red: "border-red-600/30 bg-red-600/[0.06] text-red-700",
  gray: "border-gray-400/40 bg-gray-500/[0.06] text-gray-600",
  blue: "border-blue-600/30 bg-blue-600/[0.06] text-blue-700",
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
  return <span className={`stamp ${toneClasses[tone]} ${className}`}>{label}</span>;
}
