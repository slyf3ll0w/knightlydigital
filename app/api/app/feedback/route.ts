import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { sendEmail, newFeedbackEmail } from "@/lib/email";

const FEEDBACK_INBOX = process.env.APPLICATION_INBOX ?? "info@streamflaire.com";

/** File a bug report or suggestion — any signed-in role. */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const type = body?.type === "BUG" || body?.type === "SUGGESTION" ? body.type : null;
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 200) : "";
  const details = typeof body?.details === "string" ? body.details.trim().slice(0, 5000) : "";
  // Free text ("Invoices page") — always rendered escaped, never as a link
  const pageUrl =
    typeof body?.pageUrl === "string" && body.pageUrl.trim()
      ? body.pageUrl.trim().slice(0, 300)
      : null;
  if (!type || !title || !details) {
    return NextResponse.json({ error: "Type, title, and details are required." }, { status: 400 });
  }

  // Soft flood guard — nobody files 20 legitimate tickets in a day
  const recent = await prisma.feedbackTicket.count({
    where: { userId: actor.id, createdAt: { gte: new Date(Date.now() - 86400000) } },
  });
  if (recent >= 20) {
    return NextResponse.json(
      { error: "You've sent a lot of feedback today — please try again tomorrow." },
      { status: 429 }
    );
  }

  const ticket = await prisma.feedbackTicket.create({
    data: { type, title, details, pageUrl, companyId: actor.companyId, userId: actor.id },
    include: {
      user: { select: { name: true, email: true } },
      company: { select: { name: true } },
    },
  });

  // Best-effort notify — the ticket is saved either way.
  await sendEmail({
    to: FEEDBACK_INBOX,
    ...newFeedbackEmail({
      type,
      title: ticket.title,
      details: ticket.details,
      pageUrl: ticket.pageUrl,
      userName: ticket.user?.name ?? actor.name,
      userEmail: ticket.user?.email ?? "",
      companyName: ticket.company.name,
    }),
  });

  return NextResponse.json(
    { id: ticket.id, type: ticket.type, status: ticket.status, createdAt: ticket.createdAt },
    { status: 201 }
  );
}
