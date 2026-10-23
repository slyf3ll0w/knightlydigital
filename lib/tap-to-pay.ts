import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { getProcessor } from "@/lib/payments";
import { squareEnvironment } from "@/lib/square";
import { isManager, canSeeMoney, type Actor } from "@/lib/permissions";
import { isNativeShellUserAgent } from "@/lib/sign-in-options";
import { hasInPersonScope, type TapToPayOffer } from "@/lib/tap-to-pay-shared";

/**
 * Tap to Pay — server side. The native plugin (Square Mobile Payments SDK in
 * the phone app) does the card; this decides WHO gets offered it and hands
 * the plugin what it needs. Plan: docs/plans/checkout-tap-to-pay-2026-10-22.md § 2.
 *
 * `TAP_TO_PAY=1` turns the offer on (ships dark until the native builds are
 * out and David's device pass is green). `TAP_TO_PAY_ALLOW_WEB=1` (staging
 * only) lets a desktop browser see the button so the share step can be
 * eyeballed without a phone — the plugin is still absent there, so the
 * button itself stays hidden.
 */

export function tapToPayEnabled(): boolean {
  return process.env.TAP_TO_PAY === "1";
}

/** The request comes from the phone app (the only place the plugin exists). */
export async function requestIsNativeShell(): Promise<boolean> {
  try {
    const h = await headers();
    return isNativeShellUserAgent(h.get("user-agent"));
  } catch {
    return false;
  }
}

/**
 * What to offer this actor on this request, or null: feature off, not the
 * phone app, processor not Square, company not connected, or a role that
 * can't take money. A connection whose grant lacks the in-person scope is
 * still returned (`needsReconnect`) so the UI can say so to a manager.
 */
export async function tapToPayOffer(actor: Actor): Promise<TapToPayOffer> {
  if (!tapToPayEnabled()) return null;
  if (!canSeeMoney(actor)) return null;
  const processor = getProcessor();
  if (processor.name !== "square" || !processor.live) return null;
  if (!(await requestIsNativeShell()) && process.env.TAP_TO_PAY_ALLOW_WEB !== "1") return null;

  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: {
      squareLocationId: true,
      squareConnectedAt: true,
      surchargeEnabled: true,
      surchargeRate: true,
      squareConnection: { select: { scopes: true } },
    },
  });
  if (!company?.squareConnection || !company.squareLocationId || !company.squareConnectedAt) return null;

  return {
    environment: squareEnvironment(),
    locationId: company.squareLocationId,
    surchargeRate: company.surchargeEnabled ? Number(company.surchargeRate) : 0,
    needsReconnect: !hasInPersonScope(company.squareConnection.scopes),
    canSetUp: isManager(actor.role),
  };
}
