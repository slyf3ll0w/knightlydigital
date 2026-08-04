import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { emailInUseByOther, ensureAccountForUser } from "@/lib/account";

/**
 * POST { token } — finish a change of sign-in address.
 *
 * Public on purpose: the confirmation link usually gets opened in whatever
 * mail app holds the NEW address, which may be a different device and is
 * certainly not carrying the app session. The token is the proof.
 *
 * It's a POST, not a GET on the link itself, so that scanners and mail-client
 * link prefetchers can't burn a one-time token by looking at the message.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  if (!token) return NextResponse.json({ error: "This link is incomplete." }, { status: 400 });

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const record = await prisma.emailChangeToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: { id: true, name: true, isActive: true, email: true, passwordHash: true, accountId: true },
      },
    },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "This link has expired or already been used. Request the change again." },
      { status: 400 }
    );
  }
  if (!record.user.isActive) {
    return NextResponse.json({ error: "This account is no longer active." }, { status: 400 });
  }

  // The address is the LOGIN — moving it moves the Account and every company
  // membership hanging off it, so all of them (and the Account row) update
  // together below.
  const account = await ensureAccountForUser(record.user);

  // Re-check: the address was free when the link was sent, but someone else
  // could have claimed it in the hour since.
  if (await emailInUseByOther(record.newEmail, account?.id ?? null)) {
    return NextResponse.json(
      { error: "That email is now in use by another account." },
      { status: 400 }
    );
  }

  // Consume the token and move the address together — a failure on either
  // half must not leave a live token or a half-applied change. Any other
  // pending requests for this user die with it.
  await prisma.$transaction(async (tx) => {
    if (account) {
      await tx.account.update({ where: { id: account.id }, data: { email: record.newEmail } });
      await tx.user.updateMany({
        where: { accountId: account.id },
        data: { email: record.newEmail },
      });
    } else {
      await tx.user.update({ where: { id: record.userId }, data: { email: record.newEmail } });
    }
    await tx.emailChangeToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    await tx.emailChangeToken.deleteMany({
      where: { userId: record.userId, usedAt: null },
    });
  });

  return NextResponse.json({ success: true, email: record.newEmail });
}
