import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSuperadmin } from "@/lib/superadmin";
import { generateInviteCode } from "@/lib/invites";
import { sendEmail, inviteCodeEmail, applicationApprovedEmail } from "@/lib/email";

/**
 * Decide an access application.
 *
 * Self-serve applications (companyId set — the account is already open in
 * pending mode): approve clears Company.accessPendingAt and emails the good
 * news; reject suspends the company (they keep nothing) and no email is sent
 * — the suspended screen says to contact support, follow up personally if it
 * warrants one.
 *
 * Legacy applications (no company): approve mints a single-use InviteCode
 * and emails it; reject just closes the application.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getSuperadmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { action } = await req.json();
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const application = await prisma.accessApplication.findUnique({
    where: { id },
    include: { company: { select: { id: true, name: true, suspendedAt: true } } },
  });
  if (!application) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }
  if (application.status !== "PENDING") {
    return NextResponse.json({ error: "This application has already been decided." }, { status: 409 });
  }

  // ── Self-serve: the account exists, the decision acts on it ──────────────
  if (application.company) {
    if (action === "reject") {
      await prisma.$transaction([
        prisma.accessApplication.update({
          where: { id },
          data: { status: "REJECTED", decidedAt: new Date() },
        }),
        prisma.company.update({
          where: { id: application.company.id },
          data: {
            accessPendingAt: null,
            // Reuse the platform suspension machinery — the whole app, public
            // booking, pay pages etc. all go dark through the existing gates.
            suspendedAt: application.company.suspendedAt ?? new Date(),
            suspendedReason:
              "Your WorkBench application wasn't approved. If you think this is a mistake, contact support.",
          },
        }),
      ]);
      console.warn(
        `[superadmin] application REJECTED — company "${application.company.name}" suspended (${application.company.id}) by ${admin.email}`
      );
      return NextResponse.json({ success: true });
    }

    await prisma.$transaction([
      prisma.accessApplication.update({
        where: { id },
        data: { status: "APPROVED", decidedAt: new Date() },
      }),
      prisma.company.update({
        where: { id: application.company.id },
        data: { accessPendingAt: null },
      }),
    ]);
    const emailBody = applicationApprovedEmail({
      name: application.name,
      companyName: application.companyName,
    });
    const emailed = await sendEmail({ to: application.email, ...emailBody });
    return NextResponse.json({ success: true, emailed });
  }

  // ── Legacy: no account yet — the old invite-code flow ────────────────────
  if (action === "reject") {
    await prisma.accessApplication.update({
      where: { id },
      data: { status: "REJECTED", decidedAt: new Date() },
    });
    return NextResponse.json({ success: true });
  }

  // Approve: mint the code + flip the application atomically. The random
  // code space makes a collision (P2002 on code) vanishingly rare — one retry
  // covers it.
  let code = "";
  for (let attempt = 0; ; attempt++) {
    code = generateInviteCode();
    try {
      await prisma.$transaction([
        prisma.inviteCode.create({
          data: {
            code,
            email: application.email,
            note: `Application — ${application.companyName}`,
            applicationId: application.id,
          },
        }),
        prisma.accessApplication.update({
          where: { id },
          data: { status: "APPROVED", decidedAt: new Date() },
        }),
      ]);
      break;
    } catch (e) {
      const codeClash =
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002" &&
        (e.meta?.target as string[] | undefined)?.includes("code");
      if (!codeClash || attempt >= 2) throw e;
    }
  }

  const emailBody = inviteCodeEmail({ name: application.name, code });
  const emailed = await sendEmail({ to: application.email, ...emailBody });

  return NextResponse.json({ success: true, code, emailed });
}
