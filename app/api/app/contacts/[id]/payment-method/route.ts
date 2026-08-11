import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { getProcessor, savedCardLabel } from "@/lib/payments";
import * as finix from "@/lib/finix";
import { addSavedCard, removeSavedCard, setDefaultSavedCard } from "@/lib/saved-cards";
import { reviveAutopayForContact } from "@/lib/auto-charge";

/**
 * Staff side of the client's cards on file (managers only).
 *
 * POST adds a card the client handed over in person or on the phone — the
 * card number never touches our server: the staff browser tokenizes it with
 * finix.js exactly like the client-facing forms, and this route exchanges
 * the one-time token into a vaulted instrument (no charge).
 * PATCH makes a card the default; DELETE removes one.
 */

async function scopedContact(id: string, companyId: string) {
  return prisma.contact.findFirst({
    where: { id, companyId },
    select: {
      id: true,
      companyId: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      finixBuyerIdentityId: true,
      company: {
        select: { suspendedAt: true, finixMerchantId: true, finixOnboardingState: true },
      },
    },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const contact = await scopedContact(id, actor.companyId);
  if (!contact) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  if (contact.company.suspendedAt) {
    return NextResponse.json({ error: "This account is suspended." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const paymentToken = typeof body?.paymentToken === "string" ? body.paymentToken : "";
  if (!paymentToken) {
    return NextResponse.json({ error: "Missing card details — please try again." }, { status: 400 });
  }

  const processor = getProcessor();
  const merchantApproved =
    contact.company.finixMerchantId != null &&
    contact.company.finixOnboardingState === "APPROVED";
  if (processor.name !== "finix" || !processor.live || !merchantApproved) {
    return NextResponse.json(
      { error: "Online payments aren't enabled yet — finish payments onboarding first." },
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

    if (!contact.finixBuyerIdentityId) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { finixBuyerIdentityId: identityId },
      });
    }
    const label = savedCardLabel({
      cardBrand: instrument.brand,
      cardLast4: instrument.last_four,
      cardExpMonth: instrument.expiration_month,
      cardExpYear: instrument.expiration_year,
    });
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
    if (!added.ok) return NextResponse.json({ error: added.error }, { status: 400 });
    // A fresh card un-stalls any autopay invoices whose old card was declining
    await reviveAutopayForContact(contact.id).catch((e) =>
      console.error("[contacts] autopay revive failed", e)
    );
    // cardId lets save-then-charge flows (invoice "Charge Card" with a new
    // card) charge exactly the card that was just vaulted
    return NextResponse.json({ saved: true, label: added.card.label, cardId: added.card.id });
  } catch (err) {
    if (err instanceof finix.FinixError) {
      return NextResponse.json({ error: err.message }, { status: 402 });
    }
    console.error("[contacts] save card failed", err);
    return NextResponse.json(
      { error: "Couldn't save the card. Please try again." },
      { status: 500 }
    );
  }
}

/** PATCH — make one of the saved cards the default. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const contact = await prisma.contact.findFirst({
    where: { id, companyId: actor.companyId },
    select: { id: true },
  });
  if (!contact) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const cardId = typeof body?.cardId === "string" ? body.cardId : "";
  if (!cardId || !(await setDefaultSavedCard(contact.id, cardId))) {
    return NextResponse.json({ error: "Card not found." }, { status: 404 });
  }
  return NextResponse.json({ updated: true });
}

/** DELETE — remove one saved card (body.cardId), or the whole legacy single
 *  card when no cardId is given (old clients of this route). */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const contact = await prisma.contact.findFirst({
    where: { id, companyId: actor.companyId },
    select: { id: true },
  });
  if (!contact) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const cardId = typeof body?.cardId === "string" ? body.cardId : "";
  if (cardId) {
    if (!(await removeSavedCard(contact.id, cardId))) {
      return NextResponse.json({ error: "Card not found." }, { status: 404 });
    }
    return NextResponse.json({ removed: true });
  }

  // Legacy no-body call: clear everything on file.
  await prisma.savedCard.deleteMany({ where: { contactId: contact.id } });
  await prisma.contact.update({
    where: { id: contact.id },
    data: { processorCustomerRef: null, savedCardLabel: null, savedCardAt: null },
  });
  return NextResponse.json({ removed: true });
}
