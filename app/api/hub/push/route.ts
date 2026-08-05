import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { pushPublicKey } from "@/lib/push";

/**
 * Public (hub-token-authed): web-push subscriptions for CLIENTS — the hub
 * counterpart of /api/app/push. Web-only (clients install the hub as a PWA;
 * there's no native shell for them). GET hands out the VAPID public key,
 * POST registers this device against the token's contact, DELETE removes it.
 */

async function contactFromToken(token: string) {
  if (!token) return null;
  return prisma.contact.findUnique({ where: { hubToken: token }, select: { id: true } });
}

export async function GET() {
  return NextResponse.json({ publicKey: pushPublicKey });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const contact = await contactFromToken(typeof body?.token === "string" ? body.token : "");
  if (!contact) return NextResponse.json({ error: "Hub not found." }, { status: 404 });

  const endpoint = typeof body?.subscription?.endpoint === "string" ? body.subscription.endpoint : "";
  const p256dh = typeof body?.subscription?.keys?.p256dh === "string" ? body.subscription.keys.p256dh : "";
  const auth = typeof body?.subscription?.keys?.auth === "string" ? body.subscription.keys.auth : "";
  if (!endpoint.startsWith("https://") || !p256dh || !auth) {
    return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  }

  // endpoint is unique per browser profile — a shared family iPad
  // re-subscribing under a different hub link takes the row over
  await prisma.contactPushSubscription.upsert({
    where: { endpoint },
    create: {
      contactId: contact.id,
      endpoint,
      p256dh,
      auth,
      userAgent: req.headers.get("user-agent")?.slice(0, 255) ?? null,
    },
    update: { contactId: contact.id, p256dh, auth },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const contact = await contactFromToken(typeof body?.token === "string" ? body.token : "");
  if (!contact) return NextResponse.json({ error: "Hub not found." }, { status: 404 });

  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  if (!endpoint) return NextResponse.json({ error: "Endpoint required." }, { status: 400 });

  await prisma.contactPushSubscription.deleteMany({
    where: { endpoint, contactId: contact.id },
  });
  return NextResponse.json({ ok: true });
}
