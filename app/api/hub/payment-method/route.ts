import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { limit, clientIp } from "@/lib/rate-limit";
import { getProcessor, savedCardLabel } from "@/lib/payments";
import * as finix from "@/lib/finix";
import { suspendedResponse } from "@/lib/suspension";

/**
 * Public (hub-token-authed): the client's saved payment method.
 *
 * POST tokenizes a card WITHOUT charging it — finix.js hands us a one-time
 * token, we exchange it into a vaulted payment instrument under the client's
 * buyer identity, and store the ref on the contact. This is how a client puts
 * a card on file before any invoice exists (memberships, autopay migration).
 * DELETE removes the card from the account (the Finix instrument simply stops
 * being referenced).
 */

async function contactByToken(token: string) {
  if (!token) return null;
  return prisma.contact.findUnique({
    where: { hubToken: token },
    select: {
      id: true,
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
    await prisma.contact.update({
      where: { id: contact.id },
      data: {
        finixBuyerIdentityId: identityId,
        processorCustomerRef: instrument.id,
        savedCardLabel: label,
        savedCardAt: new Date(),
      },
    });
    return NextResponse.json({ saved: true, label });
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

export async function DELETE(req: NextRequest) {
  const data = await req.json().catch(() => null);
  const token = typeof data?.token === "string" ? data.token : "";
  const contact = await contactByToken(token);
  if (!contact) return NextResponse.json({ error: "Not found." }, { status: 404 });

  await prisma.contact.update({
    where: { id: contact.id },
    data: { processorCustomerRef: null, savedCardLabel: null, savedCardAt: null },
  });
  return NextResponse.json({ removed: true });
}
