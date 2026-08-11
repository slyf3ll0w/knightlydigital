import { prisma } from "@/lib/db";
import type { SavedCard } from "@prisma/client";

/**
 * Multiple cards on file per client (SavedCard rows), one of them the
 * default. Recurring billing and one-tap staff charges use the default;
 * staff can pick another at charge time. The legacy Contact columns
 * (processorCustomerRef / savedCardLabel / savedCardAt) mirror the default
 * card so older readers keep working — every mutation here ends by calling
 * syncDefaultCardMirror.
 */

export const MAX_SAVED_CARDS = 5;

/** The card charges default to: the default row, else the newest. */
export async function defaultSavedCard(contactId: string): Promise<SavedCard | null> {
  return prisma.savedCard.findFirst({
    where: { contactId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
}

/** Point the legacy Contact mirror columns at the current default card. */
export async function syncDefaultCardMirror(contactId: string): Promise<void> {
  const card = await defaultSavedCard(contactId);
  await prisma.contact.update({
    where: { id: contactId },
    data: {
      processorCustomerRef: card?.instrumentRef ?? null,
      savedCardLabel: card?.label ?? null,
      savedCardAt: card?.createdAt ?? null,
    },
  });
}

export type AddSavedCardResult =
  | { ok: true; card: SavedCard; created: boolean }
  | { ok: false; error: string };

/**
 * Vault a card on the account. Dedupes two ways: the same instrument ref is
 * a no-op, and the same physical card (brand + last4 + expiry) re-tokenized
 * later just refreshes the stored ref instead of listing twice. The first
 * card on an account becomes the default.
 */
export async function addSavedCard(params: {
  companyId: string;
  contactId: string;
  instrumentRef: string;
  label: string;
  brand?: string | null;
  last4?: string | null;
  expMonth?: number | null;
  expYear?: number | null;
}): Promise<AddSavedCardResult> {
  const existing = await prisma.savedCard.findMany({
    where: { contactId: params.contactId },
    orderBy: { createdAt: "asc" },
  });

  const byRef = existing.find((c) => c.instrumentRef === params.instrumentRef);
  if (byRef) return { ok: true, card: byRef, created: false };

  const samePhysical =
    params.last4 &&
    existing.find(
      (c) =>
        c.last4 === params.last4 &&
        c.brand === (params.brand ?? null) &&
        c.expMonth === (params.expMonth ?? null) &&
        c.expYear === (params.expYear ?? null)
    );
  if (samePhysical) {
    const card = await prisma.savedCard.update({
      where: { id: samePhysical.id },
      data: { instrumentRef: params.instrumentRef, label: params.label },
    });
    await syncDefaultCardMirror(params.contactId);
    return { ok: true, card, created: false };
  }

  if (existing.length >= MAX_SAVED_CARDS) {
    return {
      ok: false,
      error: `This account already has ${MAX_SAVED_CARDS} cards on file — remove one first.`,
    };
  }

  const card = await prisma.savedCard.create({
    data: {
      companyId: params.companyId,
      contactId: params.contactId,
      instrumentRef: params.instrumentRef,
      label: params.label,
      brand: params.brand ?? null,
      last4: params.last4 ?? null,
      expMonth: params.expMonth ?? null,
      expYear: params.expYear ?? null,
      isDefault: existing.length === 0,
    },
  });
  await syncDefaultCardMirror(params.contactId);
  return { ok: true, card, created: true };
}

/** Make one card the default (clears the flag on the others). */
export async function setDefaultSavedCard(contactId: string, cardId: string): Promise<boolean> {
  const card = await prisma.savedCard.findFirst({ where: { id: cardId, contactId } });
  if (!card) return false;
  await prisma.$transaction([
    prisma.savedCard.updateMany({ where: { contactId }, data: { isDefault: false } }),
    prisma.savedCard.update({ where: { id: cardId }, data: { isDefault: true } }),
  ]);
  await syncDefaultCardMirror(contactId);
  return true;
}

/** Remove a card; if it was the default, the newest remaining one takes over. */
export async function removeSavedCard(contactId: string, cardId: string): Promise<boolean> {
  const card = await prisma.savedCard.findFirst({ where: { id: cardId, contactId } });
  if (!card) return false;
  await prisma.savedCard.delete({ where: { id: card.id } });
  if (card.isDefault) {
    const next = await prisma.savedCard.findFirst({
      where: { contactId },
      orderBy: { createdAt: "desc" },
    });
    if (next) await prisma.savedCard.update({ where: { id: next.id }, data: { isDefault: true } });
  }
  await syncDefaultCardMirror(contactId);
  return true;
}
