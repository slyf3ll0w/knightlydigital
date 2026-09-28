import StatusChip from "@/components/StatusChip";

/**
 * Contact status, quietly. An active client is the normal state — stamping
 * ACTIVE on every row is noise, so it renders nothing. Leads get a small dot
 * + plain text; only Archived still reads as a stamp. Always renders a span
 * so fixed grid templates keep their column alignment.
 */
export default function ContactStatus({
  status,
  kind,
  className = "",
}: {
  status: string;
  /** Contact.kind — a CONTACT (business connection) reads as such instead of silently passing for a client. */
  kind?: string | null;
  className?: string;
}) {
  return (
    <span className={className}>
      {status === "ARCHIVED" ? (
        <StatusChip kind="contact" status={status} />
      ) : status === "LEAD" ? (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
          Lead
        </span>
      ) : kind === "CONTACT" ? (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500">
          <span className="h-1.5 w-1.5 rounded-full bg-gray-400" aria-hidden />
          Contact
        </span>
      ) : null}
    </span>
  );
}
