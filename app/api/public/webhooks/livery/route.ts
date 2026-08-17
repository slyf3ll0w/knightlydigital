import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyLiverySignature } from "@/lib/addon";
import { notifyUsers } from "@/lib/push";

/**
 * Livery webhook receiver — the consuming half of the add-on loop
 * (lib/addon.ts). Livery POSTs signed events (paywithlivery.com/developers);
 * the `reference` in each payload is the Workbench companyId we sent as ?ref=
 * on the checkout link.
 *
 * Verification is the Livery-Signature HMAC over the RAW body — read the text
 * BEFORE parsing. Handlers are idempotent (Livery retries failed deliveries
 * on a 5m/30m/2h/12h ladder), and unknown event types 200 so new Livery
 * events never pile up as dead retries.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  if (!verifyLiverySignature(req.headers.get("livery-signature"), rawBody)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let event: { type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const type = typeof event.type === "string" ? event.type : "";
  const data = (event.data ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof data[k] === "string" ? (data[k] as string) : null);

  if (type === "subscription.created") {
    // ?ref= on the checkout link comes back as `reference` = our companyId.
    const companyId = str("reference");
    const subId = str("id");
    if (!companyId || !subId) return NextResponse.json({ received: true, matched: false });
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, addonActiveAt: true },
    });
    if (!company) {
      // Signed + well-formed but unknown reference — nothing to retry into.
      console.warn(`[livery-webhook] subscription.created for unknown company ${companyId}`);
      return NextResponse.json({ received: true, matched: false });
    }
    await prisma.company.update({
      where: { id: company.id },
      data: { addonActiveAt: company.addonActiveAt ?? new Date(), addonLiverySubId: subId },
    });
    console.warn(
      `[livery-webhook] add-on ACTIVATED for "${company.name}" (${company.id}) — Livery sub ${subId}`
    );
    const owners = await prisma.user.findMany({
      where: { companyId: company.id, role: "OWNER", isActive: true },
      select: { id: true },
    });
    notifyUsers(
      owners.map((o) => o.id),
      {
        title: "Workbench Plus is active",
        body: "Your subscription payment went through — premium features are unlocked.",
        url: "/app/settings/addon",
        tag: "addon-active",
      }
    ).catch((e) => console.error("[livery-webhook] owner notify failed", e));
    return NextResponse.json({ received: true, matched: true });
  }

  if (type === "subscription.canceled") {
    const subId = str("id");
    const companyId = str("reference");
    // Prefer the stored subscription id; fall back to the reference for plans
    // that predate the id being stored.
    const company = subId
      ? await prisma.company.findFirst({
          where: { addonLiverySubId: subId },
          select: { id: true, name: true },
        })
      : companyId
        ? await prisma.company.findUnique({
            where: { id: companyId },
            select: { id: true, name: true },
          })
        : null;
    if (!company) return NextResponse.json({ received: true, matched: false });
    await prisma.company.update({
      where: { id: company.id },
      data: { addonActiveAt: null, addonLiverySubId: null },
    });
    console.warn(`[livery-webhook] add-on CANCELED for "${company.name}" (${company.id})`);
    return NextResponse.json({ received: true, matched: true });
  }

  if (type === "payment.failed") {
    // Only a renewal that Livery has GIVEN UP on (hard decline or retries
    // exhausted) revokes the entitlement — soft declines still retrying keep
    // the add-on alive.
    const subId = str("subscription_id");
    if (!subId || data.will_retry !== false) return NextResponse.json({ received: true });
    const company = await prisma.company.findFirst({
      where: { addonLiverySubId: subId },
      select: { id: true, name: true },
    });
    if (!company) return NextResponse.json({ received: true, matched: false });
    await prisma.company.update({
      where: { id: company.id },
      data: { addonActiveAt: null },
    });
    console.warn(
      `[livery-webhook] add-on REVOKED (renewal payment failed for good) for "${company.name}" (${company.id})`
    );
    const owners = await prisma.user.findMany({
      where: { companyId: company.id, role: "OWNER", isActive: true },
      select: { id: true },
    });
    notifyUsers(
      owners.map((o) => o.id),
      {
        title: "Workbench Plus payment failed",
        body: "Your subscription's renewal charge didn't go through — premium features are paused.",
        url: "/app/settings/addon",
        tag: "addon-failed",
      }
    ).catch((e) => console.error("[livery-webhook] owner notify failed", e));
    return NextResponse.json({ received: true, matched: true });
  }

  // test.ping and any events we don't handle yet — acknowledge so Livery
  // doesn't retry them into the dead pile.
  return NextResponse.json({ received: true });
}
