import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { limit, clientIp } from "@/lib/rate-limit";
import { enrollContactInLoyalty, LoyaltyError } from "@/lib/loyalty";

/**
 * POST /api/hub/loyalty { token } — the client joins the business's rewards
 * program from their hub (hub-token authed; Square keys it to the phone on
 * file). Answers the account's points.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  if (!(await limit(`hub-loyalty:${ip}`, 10, 3600_000)).ok) {
    return NextResponse.json({ error: "Too many attempts — please try again later." }, { status: 429 });
  }
  const data = await req.json().catch(() => null);
  const token = typeof data?.token === "string" ? data.token : "";
  const contact = token ? await prisma.contact.findUnique({ where: { hubToken: token }, select: { id: true, companyId: true, company: { select: { suspendedAt: true } } } }) : null;
  if (!contact) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (contact.company.suspendedAt) return NextResponse.json({ error: "This business can't enroll members right now." }, { status: 403 });
  try {
    const account = await enrollContactInLoyalty({ companyId: contact.companyId, contactId: contact.id, actorName: "Client" });
    return NextResponse.json({ balance: account.balance, lifetimePoints: account.lifetimePoints }, { status: 201 });
  } catch (err) {
    if (err instanceof LoyaltyError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    throw err;
  }
}
