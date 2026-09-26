import { statusLabels, statusTones, type StatusKind, type StatusTone } from "@/lib/statuses";

/**
 * The one status indicator used everywhere — list rows, detail headers,
 * dashboard cards. A quiet tinted pill in sentence case (see .stamp in
 * globals.css). Same tones on every page so statuses scan identically
 * app-wide.
 */

// Design-system chips: fixed status tones, blue = the company primary.
const toneClasses: Record<StatusTone, string> = {
  green: "ds-chip ds-chip-good",
  amber: "ds-chip ds-chip-warn",
  red: "ds-chip ds-chip-bad",
  gray: "ds-chip ds-chip-neutral",
  blue: "ds-chip ds-chip-primary",
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
  return <span className={`${toneClasses[tone]} ${className}`}>{label}</span>;
}
