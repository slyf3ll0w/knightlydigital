import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSeeMoney } from "@/lib/permissions";
import { limit } from "@/lib/rate-limit";
import { squareEnvironment } from "@/lib/square";
import { squareTokenForCompany, SquareNotConnectedError } from "@/lib/square-connection";
import { requestIsNativeShell, tapToPayEnabled } from "@/lib/tap-to-pay";
import { hasInPersonScope } from "@/lib/tap-to-pay-shared";

/**
 * GET — the seller's Square access token for the phone app's Mobile
 * Payments SDK (Square's design: the device authorizes with the seller's
 * OAuth token; `authorize(accessToken, locationId)`). Kept tight:
 *   - only a signed-in member who can take money, only from the native
 *     shell (the plugin exists nowhere else), only while TAP_TO_PAY is on;
 *   - never the refresh token; the access token is the same 30-day one the
 *     server already refreshes (lib/square-connection.ts sweep);
 *   - rate-limited per user, and every issue is logged (who, when).
 * The plugin keeps it in the Keychain / EncryptedSharedPreferences and the
 * page calls deauthorize() on sign-out and company switch.
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!tapToPayEnabled()) return NextResponse.json({ error: "Tap to Pay isn't available yet." }, { status: 404 });
  if (!(await requestIsNativeShell()) && process.env.TAP_TO_PAY_ALLOW_WEB !== "1") {
    return NextResponse.json({ error: "Tap to Pay only works in the WorkBench phone app." }, { status: 403 });
  }
  const rl = await limit(`square-mobile-token:${actor.id}`, 20, 60 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many requests — try again in a bit." }, { status: 429 });
  }

  try {
    const { token, conn } = await squareTokenForCompany(actor.companyId);
    const grant = await prisma.squareConnection.findUnique({ where: { companyId: actor.companyId }, select: { scopes: true } });
    if (!hasInPersonScope(grant?.scopes)) {
      return NextResponse.json(
        { error: "Reconnect Square in Settings → Online Payments to turn on Tap to Pay.", code: "needs_reconnect" },
        { status: 409 }
      );
    }
    const company = await prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { squareLocationId: true },
    });
    if (!company?.squareLocationId) {
      return NextResponse.json({ error: "Square has no charge location for this account." }, { status: 409 });
    }
    console.log(`[tap-to-pay] token issued company=${actor.companyId} user=${actor.id}`);
    return NextResponse.json(
      {
        accessToken: token,
        locationId: company.squareLocationId,
        environment: squareEnvironment(),
        expiresAt: conn.expiresAt.toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    if (err instanceof SquareNotConnectedError) {
      return NextResponse.json({ error: "Connect Square in Settings → Online Payments first." }, { status: 409 });
    }
    return NextResponse.json({ error: "Square didn't answer. Try again." }, { status: 424 });
  }
}
