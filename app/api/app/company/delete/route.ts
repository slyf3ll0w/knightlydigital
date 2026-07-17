import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { limit } from "@/lib/rate-limit";

/**
 * POST — permanently delete the company account and every record under it.
 * Deliberately hard to reach: OWNER role only, the exact company name must be
 * retyped, and the owner's password re-verified. There is no soft-delete and
 * no recovery — this exists so test accounts can be removed cleanly.
 */

/** The public demo/showcase company must never be deletable from the UI. */
const PROTECTED_EMAILS = ["demo@streamflaremedia.com"];

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.role !== "OWNER") {
    return NextResponse.json({ error: "Only the account owner can delete the account." }, { status: 403 });
  }
  const companyId = actor.companyId;

  // brute-forcing the password through this endpoint should be impossible
  const rl = limit(`company-delete:${actor.id}`, 5, 60 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts — try again later." }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const confirmName = typeof body.confirmName === "string" ? body.confirmName.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  const [company, user] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, users: { select: { email: true } } },
    }),
    prisma.user.findUnique({ where: { id: actor.id }, select: { passwordHash: true } }),
  ]);
  if (!company || !user) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }
  if (company.users.some((u) => PROTECTED_EMAILS.includes(u.email.toLowerCase()))) {
    return NextResponse.json({ error: "This demo account can't be deleted." }, { status: 403 });
  }
  if (confirmName !== company.name) {
    return NextResponse.json(
      { error: "The name you typed doesn't match the company name exactly." },
      { status: 400 }
    );
  }
  if (!password || !(await bcrypt.compare(password, user.passwordHash))) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 403 });
  }

  // Children before parents (FK order); *LineItem / notes / photos / reminders
  // cascade from their parent deletes.
  await prisma.$transaction(
    async (tx) => {
      const where = { companyId };
      await tx.payment.deleteMany({ where });
      await tx.invoice.deleteMany({ where }); // cascades line items + reminders
      await tx.contract.deleteMany({ where });
      await tx.reviewRequest.deleteMany({ where });
      await tx.quote.deleteMany({ where }); // references jobs — before jobs
      await tx.locationPing.deleteMany({ where }); // references time entries
      await tx.timeEntry.deleteMany({ where }); // references jobs + users
      await tx.job.deleteMany({ where }); // cascades items/assignments/notes/photos
      await tx.appointment.deleteMany({ where });
      await tx.bookingRequest.deleteMany({ where });
      await tx.request.deleteMany({ where });
      await tx.subscription.deleteMany({ where }); // references work items — before them
      await tx.contact.deleteMany({ where }); // cascades contact notes
      await tx.contactFieldDef.deleteMany({ where });
      await tx.workItem.deleteMany({ where }); // references contract templates — before them
      await tx.contractTemplate.deleteMany({ where });
      await tx.webForm.deleteMany({ where });
      await tx.expense.deleteMany({ where });
      await tx.user.deleteMany({ where });
      await tx.company.delete({ where: { id: companyId } });
    },
    { timeout: 60_000 }
  );

  console.warn(`Company account deleted: "${company.name}" (${companyId}) by user ${actor.id}`);
  return NextResponse.json({ success: true });
}
