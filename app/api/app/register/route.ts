import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { verifyCaptcha } from "@/lib/captcha";
import { checkInviteCode } from "@/lib/invites";
import { normalizeEmail } from "@/lib/user-email";
import { ensureAccountForUser, findOrAdoptAccountByEmail } from "@/lib/account";
import { createCompanySignup, InviteClaimedError } from "@/lib/signup";

/**
 * POST — create a company. Three ways in, all invite-gated:
 *
 * 1. Fresh signup: creates the Account (login) + Company + OWNER membership.
 * 2. Signed-in user ("New company" in the switcher): attaches a new Company +
 *    OWNER membership to their existing Account — no email/password asked.
 * 3. Signed-out but the email already has an Account: the typed password must
 *    match that login; the new company then attaches to it instead of failing
 *    the old "email already exists" way.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { companyName, yourName, password, captchaToken } = body;
  // Stored lowercased so the address they type at sign-in (and at password
  // reset, which also normalizes) always finds this account.
  const email = normalizeEmail(body.email);
  // Optional — seeds the starter price book; signup never hard-fails on it
  const { industry } = body;

  if (!(await verifyCaptcha(captchaToken, "signup"))) {
    return NextResponse.json(
      { error: "Captcha verification failed. Please try again." },
      { status: 400 }
    );
  }

  // Signed-in mode: the session's account owns the new company.
  const session = await getServerSession(authOptions);
  let account: { id: string; email: string } | null = null;
  let ownerName: string | null = null;
  if (session?.user?.id) {
    const current = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, email: true, passwordHash: true, accountId: true },
    });
    const owned = current ? await ensureAccountForUser(current) : null;
    if (owned) {
      account = owned;
      ownerName = current!.name;
    }
  }

  // A session that resolves to no usable account (user deleted from the
  // superadmin console, or a legacy row that can't own one) rendered the
  // attach-mode form, which never collects name/email/password — say what's
  // actually wrong instead of "all fields required".
  if (session?.user?.id && !account) {
    return NextResponse.json(
      { error: "Your session is no longer valid. Please sign out, then try again." },
      { status: 401 }
    );
  }

  if (!companyName || (!account && (!yourName || !email || !password))) {
    return NextResponse.json({ error: "All required fields must be filled." }, { status: 400 });
  }

  if (
    String(companyName).length > 120 ||
    String(yourName ?? "").length > 120 ||
    String(body.email ?? "").length > 254 ||
    String(industry ?? "").length > 80
  ) {
    return NextResponse.json({ error: "Input too long." }, { status: 400 });
  }

  if (!account && (password.length < 8 || password.length > 72)) {
    return NextResponse.json({ error: "Password must be 8–72 characters." }, { status: 400 });
  }

  // WorkBench is invite-only: no live code, no company — even for the second
  // company on an existing account.
  const invite = await checkInviteCode(body.inviteCode);
  if (!invite.ok) {
    return NextResponse.json({ error: invite.reason }, { status: 403 });
  }

  // Signed-out with an already-registered email: attach instead of reject,
  // but only when the typed password matches that login. The generic message
  // on mismatch never confirms the address exists.
  if (!account) {
    const existing = await findOrAdoptAccountByEmail(email);
    if (existing) {
      const valid = await bcrypt.compare(String(password), existing.passwordHash);
      if (!valid) {
        return NextResponse.json(
          { error: "Unable to register. Please try again, or sign in if you already have an account." },
          { status: 400 }
        );
      }
      account = existing;
      ownerName = String(yourName).trim();
    }
  }

  const hash = account ? null : await bcrypt.hash(password, 12);

  let created;
  try {
    created = await createCompanySignup({
      companyName,
      industry,
      inviteId: invite.id,
      owner: account
        ? { account: { id: account.id, email: account.email }, ownerName: ownerName ?? "Owner" }
        : { newLogin: { email, hash: hash!, name: String(yourName).trim() } },
    });
  } catch (e) {
    if (e instanceof InviteClaimedError) {
      return NextResponse.json(
        { error: "That invite code has already been used." },
        { status: 403 }
      );
    }
    throw e;
  }

  return NextResponse.json({
    success: true,
    companyId: created.companyId,
    userId: created.userId,
    attached: Boolean(account),
  });
}
