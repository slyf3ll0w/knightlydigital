import {
  AlertCircle,
  Archive,
  ArrowRightCircle,
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock,
  Eye,
  Hand,
  MessageSquareWarning,
  PencilLine,
  Receipt,
  Send,
  Sparkles,
  UserX,
  Wrench,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { statusLabels, statusTones, type StatusKind, type StatusTone } from "@/lib/statuses";

/**
 * The one status indicator used everywhere — list rows, detail headers,
 * dashboard cards. A solid tag: tinted fill in the status tone, an icon for
 * the state, the label (see .ds-chip in app/ds.css; replaced the dot-and-
 * words read 2026-11-21 for the heavy look). Same tones and icons on every
 * page so statuses scan identically app-wide.
 */

// Design-system chips: fixed status tones, blue = the company primary.
const toneClasses: Record<StatusTone, string> = {
  green: "ds-chip ds-chip-good",
  amber: "ds-chip ds-chip-warn",
  red: "ds-chip ds-chip-bad",
  gray: "ds-chip ds-chip-neutral",
  blue: "ds-chip ds-chip-primary",
};

/** The icon a state wears — by kind first, then by status name. */
const kindIcons: Partial<Record<StatusKind, Record<string, LucideIcon>>> = {
  job: { ACTIVE: Wrench, REQUIRES_INVOICING: Receipt, ARCHIVED: CheckCircle2 },
  request: { NEW: Sparkles, NEEDS_APPROVAL: Hand, CONVERTED: ArrowRightCircle },
  quote: { CONVERTED: ArrowRightCircle },
  contact: { LEAD: Sparkles, ACTIVE: CheckCircle2 },
  appointment: { SCHEDULED: CalendarClock, COMPLETED: CheckCircle2, NO_SHOW: UserX },
  contract: { SENT: Clock },
  message: { SENT: Send, LIKELY_OPENED: Eye, OPENED: Eye, VIEWED: Eye },
};
const statusIcons: Record<string, LucideIcon> = {
  DRAFT: PencilLine,
  SCHEDULED: CalendarClock,
  AWAITING_RESPONSE: Clock,
  AWAITING_PAYMENT: Clock,
  APPROVED: CheckCircle2,
  PAID: CheckCircle2,
  SIGNED: CheckCircle2,
  CHANGES_REQUESTED: MessageSquareWarning,
  PAST_DUE: AlertCircle,
  ARCHIVED: Archive,
  CANCELLED: XCircle,
  VOID: XCircle,
};

export function statusIcon(kind: StatusKind, status: string): LucideIcon {
  return kindIcons[kind]?.[status] ?? statusIcons[status] ?? Circle;
}

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
  const Icon = statusIcon(kind, status);
  return (
    <span className={`${toneClasses[tone]} ${className}`}>
      <Icon size={13} strokeWidth={2.4} aria-hidden />
      {label}
    </span>
  );
}
