import { Phone, MessageSquare } from "lucide-react";
import { telHref, smsHref } from "@/lib/messaging";

/**
 * Call / Text buttons that hand off to the phone's native dialer and
 * Messages app (plain tel:/sms: links — free, and replies come back to
 * the caller's own number). Renders two buttons; the parent lays them out.
 */
export default function CallTextButtons({
  phone,
  compact = false,
}: {
  phone: string;
  compact?: boolean;
}) {
  const cls = compact
    ? "flex items-center justify-center gap-1.5 flex-1 px-3 py-1.5 border border-gray-300 text-xs font-medium text-gray-700 rounded-full hover:bg-gray-50 transition-colors"
    : "flex items-center gap-1.5 px-4 py-2 border border-gray-300 bg-white text-sm font-semibold text-gray-700 rounded-full hover:bg-gray-50 transition-colors";
  return (
    <>
      <a href={telHref(phone)} className={cls}>
        <Phone size={compact ? 12 : 14} />
        Call
      </a>
      <a href={smsHref(phone)} className={cls}>
        <MessageSquare size={compact ? 12 : 14} />
        Text
      </a>
    </>
  );
}
