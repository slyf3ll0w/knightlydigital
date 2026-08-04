"use client";

import { useEffect, useState } from "react";
import { Phone, MessageSquare, Navigation } from "lucide-react";
import { telHref, smsHref, canSendSms } from "@/lib/messaging";

/**
 * Phone-only quick actions under a job/appointment header — the three things
 * a tech does standing in the driveway: call the client, text them, get
 * directions. Legacy FSM apps put these one tap from the job; ours were
 * buried in the Client card at the bottom of the page.
 *
 * Accent-tinted tiles (green utilities bridge to the tenant color).
 * Renders nothing when there's neither a phone nor an address.
 */
export default function JobActionRow({
  phone,
  address,
}: {
  phone?: string | null;
  address?: string | null;
}) {
  const [smsOk, setSmsOk] = useState(false);
  useEffect(() => setSmsOk(canSendSms()), []);

  const actions = [
    ...(phone
      ? [{ href: telHref(phone), icon: Phone, label: "Call" }]
      : []),
    ...(phone && smsOk
      ? [{ href: smsHref(phone), icon: MessageSquare, label: "Text" }]
      : []),
    ...(address
      ? [
          {
            href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
            icon: Navigation,
            label: "Directions",
            external: true,
          },
        ]
      : []),
  ];
  if (actions.length === 0) return null;

  return (
    // 52px action circles (the Daylight & Dusk contact treatment) — round
    // accent-soft targets with the label underneath, like the phone's own
    // contact card. The green utilities bridge to the tenant accent.
    <div className="mb-5 flex justify-around lg:hidden">
      {actions.map(({ href, icon: Icon, label, ...rest }) => (
        <a
          key={label}
          href={href}
          {...("external" in rest && rest.external
            ? { target: "_blank", rel: "noopener noreferrer" }
            : {})}
          className="flex flex-col items-center gap-1.5 text-[12px] font-semibold text-green-700 active:opacity-70"
        >
          <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-green-100 transition-transform active:scale-95">
            <Icon size={22} strokeWidth={2.1} />
          </span>
          {label}
        </a>
      ))}
    </div>
  );
}
