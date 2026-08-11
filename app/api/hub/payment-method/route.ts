import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { limit, clientIp } from "@/lib/rate-limit";
import { getProcessor, savedCardLabel } from "@/lib/payments";
import * as finix from "@/lib/finix";
import { suspendedResponse } from "@/lib/suspension";
import { addSavedCard, removeSavedCard, setDefaultSavedCard } from "@/lib/saved-cards";
import { reviveAutopayForContact } from "@/lib/auto-charge";

/**
 * Public (hub-token-authed): the client's saved cards.
 *
 * POST tokenizes a card WITHOUT charging it — finix.js hands us a one-time
 * token, we exchange it into a vaulted payment instrument under the client's
 * buyer identity, and store it as a SavedCard row (multiple cards per
 * account; the first becomes the default). This is how a client puts a card
 * on file before any invoice exists (memberships, autopay migration).
 * PATCH makes one of the saved cards the default; DELETE removes a card
 * (the Finix instrument simply stops being referenced).
 */

async function contactByToken(token: string) {
  if (!token) return null;
  return prisma.contact.findUnique({
    where: { hubToken: token },
    select: {
      id: true,
      companyId: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      finixBuyerIdentityId: true,
      company: {
        select: {
          suspendedAt: true,
          finixMerchantId: true,
          finixOnboardingState: true,
        },
      },
    },
  });
}

/** The card list the hub UI renders — default first, then oldest-to-newest. */
async function cardList(contactId: string) {
  return prisma.savedCard.findMany({
    where: { contactId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { id: true, label: true, brand: true, last4: true, isDefault: true },
  });
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  if (!limit(`hub-pm:${ip}`, 10, 3600_000).ok) {
    return NextResponse.json(
      { error: "Too many attempts — please try again later." },
      { status: 429 }
    );
  }

  const data = await req.json().catch(() => null);
  const token = typeof data?.token === "string" ? data.token : "";
  const paymentToken = typeof data?.paymentToken === "string" ? data.paymentToken : "";
  if (!paymentToken) {
    return NextResponse.json({ error: "Missing card details — please try again." }, { status: 400 });
  }

  const contact = await contactByToken(token);
  if (!contact) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (contact.company.suspendedAt) {
    return suspendedResponse("This business can't accept payment methods right now.");
  }

  const processor = getProcessor();
  const merchantApproved =
    contact.company.finixMerchantId != null &&
    contact.company.finixOnboardingState === "APPROVED";
  if (processor.name !== "finix" || !processor.live || !merchantApproved) {
    return NextResponse.json(
      { error: "Online payments aren't enabled for this business yet." },
      { status: 503 }
    );
  }

  try {
    const identityId =
      contact.finixBuyerIdentityId ??
      (
        await finix.createBuyerIdentity({
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          phone: contact.phone,
        })
      ).id;

    const instrument = await finix.exchangeToken({ token: paymentToken, identityId });
    if (instrument.instrument_type && instrument.instrument_type !== "PAYMENT_CARD") {
      return NextResponse.json(
        { error: "Only cards can be saved on file right now." },
        { status: 400 }
      );
    }

    const label = savedCardLabel({
      cardBrand: instrument.brand,
      cardLast4: instrument.last_four,
      cardExpMonth: instrument.expiration_month,
      cardExpYear: instrument.expiration_year,
    });
    if (!contact.finixBuyerIdentityId) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { finixBuyerIdentityId: identityId },
      });
    }
    const added = await addSavedCard({
      companyId: contact.companyId,
      contactId: contact.id,
      instrumentRef: instrument.id,
      label,
      brand: instrument.brand ?? null,
      last4: instrument.last_four ?? null,
      expMonth: instrument.expiration_month ?? null,
      expYear: instrument.expiration_year ?? null,
    });
    if (!added.ok) {
      return NextResponse.json({ error: added.error }, { status: 400 });
    }
    // A fresh card un-stalls any autopay invoices whose old card was
    // declining — the next cron pass retries them against it.
    await reviveAutopayForContact(contact.id).catch((e) =>
      console.error("[hub] autopay revive failed", e)
    );
    return NextResponse.json({ saved: true, label, cards: await cardList(contact.id) });
  } catch (err) {
    if (err instanceof finix.FinixError) {
      return NextResponse.json({ error: err.message }, { status: 402 });
    }
    console.error("[hub] save payment method failed", err);
    return NextResponse.json(
      { error: "Couldn't save the card. Please try again." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const data = await req.json().catch(() => null);
  const token = typeof data?.token === "string" ? data.token : "";
  const cardId = typeof data?.cardId === "string" ? data.cardId : "";
  const contact = await contactByToken(token);
  if (!contact) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (!cardId || !(await setDefaultSavedCard(contact.id, cardId))) {
    return NextResponse.json({ error: "Card not found." }, { status: 404 });
  }
  return NextResponse.json({ updated: true, cards: await cardList(contact.id) });
}

export async function DELETE(req: NextRequest) {
  const data = await req.json().catch(() => null);
  const token = typeof data?.token === "string" ? data.token : "";
  const cardId = typeof data?.cardId === "string" ? data.cardId : "";
  const contact = await contactByToken(token);
  if (!contact) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (!cardId || !(await removeSavedCard(contact.id, cardId))) {
    return NextResponse.json({ error: "Card not found." }, { status: 404 });
  }
  return NextResponse.json({ removed: true, cards: await cardList(contact.id) });
}
