import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { normalizeEmail } from "@/lib/user-email";
import { sendEmail, emailChangeVerifyEmail, emailChangeNoticeEmail } from "@/lib/email";
import { emailInUseByOther, ensureAccountForUser, verifyPasswordForUser } from "@/lib/account";

/**
 * POST { newEmail, currentPassword } — start a change of sign-in address.
 *
 * Nothing moves yet. We store a hashed token and email the new address a
 * confirmation link; only opening that link (see /api/public/verify-email)
 * writes the new address. Two reasons it works this way: a typo would
 * otherwise lock the owner out of their own account, and a borrowed session
 * can't quietly walk the account off to another inbox — the password check
 * and the old-address notice below both stand in the way.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const newEmail = normalizeEmail(body?.newEmail);
  const currentPassword = String(body?.currentPassword ?? "");

  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: actor.id } });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const valid = await verifyPasswordForUser(actor.id, currentPassword);
  if (!valid) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  }

  if (newEmail === user.email.trim().toLowerCase()) {
    return NextResponse.json({ error: "That's already your email address." }, { status: 400 });
  }

  // The address moves the whole LOGIN (every company membership with it), so
  // it must not collide with any other person's login or membership. Checked
  // here for a clean message and again at verification time, since someone
  // else could claim it in between.
  const account = await ensureAccountForUser(user);
  if (await emailInUseByOther(newEmail, account?.id ?? null)) {
    return NextResponse.json({ error: "That email is already in use." }, { status: 400 });
  }

  // One live request per user — asking again replaces the last link.
  await prisma.emailChangeToken.deleteMany({ where: { userId: user.id, usedAt: null } });

  const token = randomBytes(32).toString("hex");
  await prisma.emailChangeToken.create({
    data: {
      userId: user.id,
      newEmail,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 60 * 60_000), // 1 hour
    },
  });

  const base = process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com";
  const verifyUrl = `${base}/app/verify-email?token=${token}`;

  const verify = emailChangeVerifyEmail({ name: user.name, newEmail, verifyUrl });
  await sendEmail({ to: newEmail, subject: verify.subject, html: verify.html });

  // The old inbox is the one that would notice a takeover, so tell it too.
  // A send failure here must not strand the request the user just made.
  try {
    const notice = emailChangeNoticeEmail({ name: user.name, newEmail });
    await sendEmail({ to: user.email, subject: notice.subject, html: notice.html });
  } catch {
    // best effort
  }

  return NextResponse.json({ success: true, sentTo: newEmail });
}

/** DELETE — cancel a pending change. */
export async function DELETE() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await prisma.emailChangeToken.deleteMany({ where: { userId: actor.id, usedAt: null } });
  return NextResponse.json({ success: true });
}
