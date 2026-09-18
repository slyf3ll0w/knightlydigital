import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { verifyPasswordForUser } from "@/lib/account";
import { createLinkGrant, LINK_GRANT_COOKIE, LINK_GRANT_TTL_MS } from "@/lib/link-grant";

/**
 * POST { currentPassword } — prove it's really you before "Connect Google"
 * on the web sends you through Google's redirect. Sets a ten-minute
 * account-bound cookie the OAuth callback checks before it links anything
 * (lib/link-grant.ts). Logins with no password yet have nothing to re-enter
 * and get the grant on the strength of the session alone.
 *
 * Deliberately lives beside the identities route rather than inside the
 * NextAuth flow: NextAuth's signin endpoint is a plain form POST that any
 * page can submit, so the proof has to be something it can't produce.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { account: { select: { id: true, passwordHash: true } } },
  });
  const account = user?.account ?? null;
  if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  if (account.passwordHash) {
    const body = (await req.json().catch(() => null)) as { currentPassword?: unknown } | null;
    const valid = await verifyPasswordForUser(actor.id, String(body?.currentPassword ?? ""));
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set(LINK_GRANT_COOKIE, await createLinkGrant(account.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(LINK_GRANT_TTL_MS / 1000),
  });
  return res;
}
