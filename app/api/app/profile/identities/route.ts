import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { listIdentities, unlinkIdentity, type SocialProvider } from "@/lib/social-login";

/**
 * The signed-in person's connected sign-in methods (Settings → My Profile →
 * Connected sign-ins). Connecting one is NOT done here — that's the normal
 * OAuth round-trip (signIn("google") while signed in; the callback links the
 * identity to this session's account, lib/auth-options.ts). This route only
 * lists and disconnects.
 */

const PROVIDERS: SocialProvider[] = ["google", "apple"];

async function accountFor(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { account: { select: { id: true, passwordHash: true } } },
  });
  return user?.account ?? null;
}

export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const account = await accountFor(actor.id);
  if (!account) return NextResponse.json({ identities: [], hasPassword: true });
  const identities = await listIdentities(account.id);
  return NextResponse.json({ identities, hasPassword: Boolean(account.passwordHash) });
}

/** DELETE ?provider=google — disconnect; refused when it's the only way in. */
export async function DELETE(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const provider = req.nextUrl.searchParams.get("provider") as SocialProvider | null;
  if (!provider || !PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "Unknown sign-in method." }, { status: 400 });
  }
  const account = await accountFor(actor.id);
  if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  const result = await unlinkIdentity(account.id, provider);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true });
}
