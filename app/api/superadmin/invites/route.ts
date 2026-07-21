import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSuperadmin } from "@/lib/superadmin";
import { generateInviteCode } from "@/lib/invites";
import { sendEmail as sendEmailNow, inviteCodeEmail } from "@/lib/email";

/** Mint a standalone invite code (no application), optionally emailing it. */
export async function POST(req: NextRequest) {
  const admin = await getSuperadmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) : "";
  const email = typeof body.email === "string" ? body.email.trim().slice(0, 254) : "";
  const expiresInDays = Number(body.expiresInDays) || 0;
  const shouldEmail = body.sendEmail === true;

  if (shouldEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required to send the code." }, { status: 400 });
  }

  const expiresAt =
    expiresInDays > 0 ? new Date(Date.now() + expiresInDays * 24 * 60 * 60_000) : null;

  let invite;
  for (let attempt = 0; ; attempt++) {
    try {
      invite = await prisma.inviteCode.create({
        data: {
          code: generateInviteCode(),
          note: note || null,
          email: email || null,
          expiresAt,
        },
      });
      break;
    } catch (e) {
      const codeClash =
        e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
      if (!codeClash || attempt >= 2) throw e;
    }
  }

  let emailed = false;
  if (shouldEmail) {
    const emailBody = inviteCodeEmail({ name: null, code: invite.code });
    emailed = await sendEmailNow({ to: email, ...emailBody });
  }

  return NextResponse.json({ success: true, code: invite.code, emailed });
}
