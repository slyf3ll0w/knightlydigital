import { History } from "lucide-react";

/**
 * The audit trail card on entity detail pages — who changed a status, deleted
 * a payment, ran a refund. Renders nothing when there's no history, so it
 * costs no space on fresh documents.
 */
const ACTION_LABEL: Record<string, string> = {
  status_changed: "Status changed",
  payment_deleted: "Payment deleted",
  payment_edited: "Payment corrected",
  refund: "Refund issued",
  card_on_file_charged: "Card on file charged",
};

export default function ActivityTrail({
  rows,
}: {
  rows: {
    id: string;
    action: string;
    detail: string | null;
    userName: string | null;
    createdAt: Date;
  }[];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="card-ledger overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
        <History size={14} className="text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-700">Activity</h2>
      </div>
      <div className="divide-y divide-gray-50">
        {rows.map((r) => (
          <div key={r.id} className="px-5 py-2.5 text-sm">
            <p className="text-gray-800">
              <span className="font-medium">{ACTION_LABEL[r.action] ?? r.action}</span>
              {r.detail ? <span className="text-gray-500"> — {r.detail}</span> : null}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {r.userName ?? "System"} ·{" "}
              {r.createdAt.toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
