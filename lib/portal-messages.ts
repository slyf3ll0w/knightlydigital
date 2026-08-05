/**
 * Portal messaging fan-out — the notification side of the two-way client ↔
 * company thread (PortalMessage). Three callers share these helpers: the hub
 * composer (client → team), the team inbox reply (team → client), and the
 * Telnyx inbound webhook (client's SMS reply → team).
 *
 * Notification philosophy: push is the fast path and always fires (it
 * collapses per-thread via tags). SMS mirrors the reply to the client's
 * phone when Telnyx is live — they can answer the text directly and it lands
 * back in the thread. Email is the catch-all, throttled to the FIRST unread
 * message in a thread so a rapid back-and-forth doesn't carpet-bomb an inbox.
 */

import { prisma } from "@/lib/db";
import {
  sendEmail,
  portalMessageEmail,
  portalMessageTeamEmail,
} from "@/lib/email";
import { companyNotifyAddress } from "@/lib/notify";
import { notifyUsers, notifyContact, requestNotifyUserIds } from "@/lib/push";
import { sendSms, smsEnabled } from "@/lib/sms";

const baseUrl = () =>
  (process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com").replace(/\/+$/, "");

const absUrl = (u: string | null | undefined) =>
  u ? (u.startsWith("http") ? u : `${baseUrl()}${u}`) : undefined;

const preview = (s: string, max: number) =>
  s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;

export type PortalThreadContact = {
  id: string;
  companyId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  smsOptOut: boolean;
  hubToken: string;
  assignedToId: string | null;
  company: {
    name: string;
    email: string | null;
    logoUrl: string | null;
    brandColor: string | null;
    brandColorSecondary: string | null;
    documentColor: string | null;
  };
};

export const portalThreadContactInclude = {
  company: {
    select: {
      name: true,
      email: true,
      logoUrl: true,
      brandColor: true,
      brandColorSecondary: true,
      documentColor: true,
    },
  },
} as const;

/**
 * Client sent a message (portal composer or inbound SMS) — wake the team.
 * `messageId` is the just-created INBOUND row; anything unread BESIDES it
 * means the team was already pinged by email, so only push goes out.
 */
export async function notifyTeamOfClientMessage(
  contact: PortalThreadContact,
  messageId: string,
  body: string,
  via: "portal" | "sms"
): Promise<void> {
  const contactName = `${contact.firstName} ${contact.lastName}`.trim();

  await notifyUsers(await requestNotifyUserIds(contact.companyId, contact.assignedToId), {
    title: `Message from ${contactName}`,
    body: preview(body, 140),
    url: `/app/messages/thread/${contact.id}`,
    tag: `portal-thread-${contact.id}`,
  });

  const olderUnread = await prisma.portalMessage.count({
    where: {
      contactId: contact.id,
      direction: "INBOUND",
      readByTeamAt: null,
      id: { not: messageId },
    },
  });
  if (olderUnread > 0) return;

  const notifyTo = await companyNotifyAddress(contact.companyId, contact.company.email);
  if (!notifyTo) return;
  const { subject, html } = portalMessageTeamEmail({
    companyName: contact.company.name,
    contactId: contact.id,
    contactName,
    messageBody: body,
    via,
  });
  await sendEmail({
    companyId: contact.companyId,
    to: notifyTo,
    subject,
    html,
    replyTo: contact.email ?? undefined,
  });
}

/**
 * Team replied — reach the client wherever they are: web push (hub PWA),
 * an SMS mirror they can answer directly, and an email fallback when the
 * text couldn't go out. `messageId` is the just-created OUTBOUND row.
 */
export async function notifyClientOfReply(
  contact: PortalThreadContact,
  messageId: string,
  body: string
): Promise<void> {
  const messagesUrl = `${baseUrl()}/hub/${contact.hubToken}/messages`;

  await notifyContact(contact.id, {
    title: contact.company.name,
    body: preview(body, 140),
    url: `/hub/${contact.hubToken}/messages`,
    tag: `portal-thread-${contact.id}`,
    icon: absUrl(contact.company.logoUrl),
  });

  // SMS mirror: the message itself, from the pool number — replying to the
  // text drops their answer straight back into the thread via the webhook.
  let smsSent = false;
  if (smsEnabled() && contact.phone && !contact.smsOptOut) {
    smsSent = await sendSms({
      to: contact.phone,
      text: `${contact.company.name}: ${preview(body, 300)}`,
      companyId: contact.companyId,
    });
  }
  if (smsSent) return;

  // Email fallback, first-unread-only: while earlier replies sit unread the
  // client already has a "new message" mail pointing at the same thread.
  if (!contact.email) return;
  const olderUnread = await prisma.portalMessage.count({
    where: {
      contactId: contact.id,
      direction: "OUTBOUND",
      readByClientAt: null,
      id: { not: messageId },
    },
  });
  if (olderUnread > 0) return;

  const { subject, html } = portalMessageEmail({
    brand: contact.company,
    companyName: contact.company.name,
    contactFirstName: contact.firstName,
    messageBody: body,
    messagesUrl,
  });
  await sendEmail({
    companyId: contact.companyId,
    to: contact.email,
    subject,
    html,
    fromName: contact.company.name,
    replyTo: contact.company.email ?? undefined,
  });
}
