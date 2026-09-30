"use client";

import { useState, useEffect } from "react";
import { Phone, MessageSquare } from "lucide-react";
import { smsHref, canSendSms } from "@/lib/messaging";
import CallLink from "@/components/CallLink";

/**
 * Call / Text buttons. Text hands off to the phone's Messages app (a plain
 * sms: link — free, and replies come back to the caller's own number) and
 * only appears on devices with a texting app (phones, tablets, Macs). Call
 * is components/CallLink.tsx: tel: for a company without a business line,
 * the line itself once there is one. Renders two buttons; the parent lays
 * them out.
 */
export default function CallTextButtons({
  phone,
  contactId,
  name,
  compact = false,
}: {
  phone: string;
  contactId?: string | null;
  name?: string;
  compact?: boolean;
}) {
  const [smsOk, setSmsOk] = useState(false);
  useEffect(() => setSmsOk(canSendSms()), []);

  const cls = compact
    ? "flex items-center justify-center gap-1.5 flex-1 px-3 py-1.5 btn-tool-line bg-white text-xs font-medium text-gray-700 rounded-[10px] hover:bg-gray-50 transition-colors"
    : "flex items-center gap-1.5 px-4 py-2 btn-tool-line bg-white text-sm font-semibold text-gray-700 rounded-[10px] hover:bg-gray-50 transition-colors";
  return (
    <>
      <CallLink phone={phone} contactId={contactId} name={name} className={cls}>
        <Phone size={compact ? 12 : 14} />
        Call
      </CallLink>
      {smsOk && (
        <a href={smsHref(phone)} className={cls}>
          <MessageSquare size={compact ? 12 : 14} />
          Text
        </a>
      )}
    </>
  );
}
