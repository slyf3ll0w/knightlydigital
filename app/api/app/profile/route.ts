import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { accountUserIdsFor, setPasswordForUser } from "@/lib/account";
import { proveIdentity, proofError } from "@/lib/reauth";

/**
 * PATCH — the signed-in user's own profile: name, phone, and password. A new
 * password takes the current one, or a fresh "verify it's you" (lib/reauth.ts)
 * — which is how a login that opens with Google sets its first password
 * without a trip through Forgot password.
 *
 * Name and phone are account-level identity — one person, however many
 * companies — so they fan out to every membership row. The email signature
 * stays per-company (it reads naturally next to that company's details), and
 * the password lives on the Account itself.
 */
export async function PATCH(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const identity: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (!String(body.name).trim()) return NextResponse.json({ error: "Name is required." }, { status: 400 });
    identity.name = String(body.name).trim().slice(0, 100);
  }
  if (body.phone !== undefined) identity.phone = body.phone ? String(body.phone).trim().slice(0, 30) : null;

  let newPassword: string | null = null;
  if (body.newPassword !== undefined) {
    if (String(body.newPassword).length < 8 || String(body.newPassword).length > 72) {
      return NextResponse.json({ error: "New password must be 8–72 characters." }, { status: 400 });
    }
    const proof = await proveIdentity(actor.id, body.currentPassword ? String(body.currentPassword) : undefined);
    if (!proof.ok) return NextResponse.json(proofError(proof.reason), { status: 400 });
    newPassword = String(body.newPassword);
  }

  if (Object.keys(identity).length > 0) {
    const ids = await accountUserIdsFor(actor.id);
    await prisma.user.updateMany({ where: { id: { in: ids } }, data: identity });
  }

  // Plain text only — rendered escaped into client emails
  if (body.emailSignature !== undefined) {
    await prisma.user.update({
      where: { id: actor.id },
      data: {
        emailSignature: body.emailSignature
          ? String(body.emailSignature).trim().slice(0, 1000)
          : null,
      },
    });
  }

  if (newPassword !== null) {
    await setPasswordForUser(actor.id, newPassword);
  }

  return NextResponse.json({ success: true });
}
