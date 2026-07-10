import { statusLabels, statusTones, type StatusKind, type StatusTone } from "@/lib/statuses";

/**
 * The one status indicator used everywhere — list rows, detail headers,
 * dashboard cards. A colored dot + uppercase Oxanium text (see .stamp in
 * globals.css) — no box; the dot carries the tone. Same tones on every
 * page so statuses scan identically app-wide.
 */

const toneClasses: Record<StatusTone, string> = {
  green: "text-green-700",
  amber: "text-amber-700",
  red: "text-red-700",
  gray: "text-gray-500",
  blue: "text-blue-700",
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
