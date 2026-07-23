import { Eye } from "lucide-react";
import { shortDate } from "@/lib/statuses";

/**
 * "Viewed" header fact for the quote/invoice/contract detail pages — when the
 * client first opened the public document page (stamped by the view beacon).
 * Sent-but-unopened documents show "Not viewed yet"; documents that were never
 * sent render nothing (there's no open to report on a draft).
 */
export default function ViewedFact({
  firstViewedAt,
  lastViewedAt,
  viewCount,
  sent,
}: {
  firstViewedAt: Date | null;
  lastViewedAt: Date | null;
  viewCount: number;
  sent: boolean;
}) {
  if (!firstViewedAt && !sent) return null;
  return (
    <div>
      <span className="text-xs uppercase font-semibold text-gray-400 block">Viewed</span>
      {firstViewedAt ? (
        <span
          className="inline-flex items-center gap-1 font-medium text-green-700"
          title={
            viewCount > 1 && lastViewedAt
              ? `Opened ${viewCount} times — last on ${shortDate(lastViewedAt)}`
              : undefined
          }
        >
          <Eye size={13} />
          {shortDate(firstViewedAt)}
          {viewCount > 1 ? ` · ${viewCount}×` : ""}
        </span>
      ) : (
        <span className="text-gray-400">Not viewed yet</span>
      )}
    </div>
  );
}
