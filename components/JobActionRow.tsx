"use client";

import { useEffect, useState } from "react";
import { Phone, MessageSquare, MessageCircle, Navigation } from "lucide-react";
import { smsHref, canSendSms } from "@/lib/messaging";
import CallLink from "@/components/CallLink";

/**
 * Phone-only quick actions under a job/appointment header — the three things
 * a tech does standing in the driveway: call the client, text them, get
 * directions. Legacy FSM apps put these one tap from the job; ours were
 * buried in the Client card at the bottom of the page.
 *
 * `messageHref` adds a Message tile that opens the client's conversation in
 * WorkBench (/app/messages/thread/…): texts go from the business line and
 * replies land in the inbox, unlike the Text tile, which opens the phone's
 * own Messages app from the tech's personal number.
 *
 * Accent-tinted tiles (green utilities bridge to the tenant color).
 * Renders nothing when there's neither a phone nor an address. Call is
 * components/CallLink.tsx — the business line when the company has one.
 */
export default function JobActionRow({
  phone,
  contactId,
  name,
  address,
  messageHref,
}: {
  phone?: string | null;
  contactId?: string | null;
  name?: string;
  address?: string | null;
  messageHref?: string | null;
}) {
  const [smsOk, setSmsOk] = useState(false);
  useEffect(() => setSmsOk(canSendSms()), []);

  const actions = [
    ...(messageHref
      ? [{ href: messageHref, icon: MessageCircle, label: "Message" }]
      : []),
    ...(phone ? [{ call: true as const, icon: Phone, label: "Call" }] : []),
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
      {actions.map(({ icon: Icon, label, ...rest }) => {
        const cls = "flex flex-col items-center gap-1.5 text-[12px] font-semibold text-green-700 active:opacity-70 disabled:opacity-60";
        const face = (
          <>
            <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-green-100 transition-transform active:scale-95">
              <Icon size={22} strokeWidth={2.1} />
            </span>
            {label}
          </>
        );
        if ("call" in rest) {
          return (
            <CallLink key={label} phone={phone!} contactId={contactId} name={name} className={cls}>
              {face}
            </CallLink>
          );
        }
        return (
          <a
            key={label}
            href={rest.href}
            {...("external" in rest && rest.external
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
            className={cls}
          >
            {face}
          </a>
        );
      })}
    </div>
  );
}
