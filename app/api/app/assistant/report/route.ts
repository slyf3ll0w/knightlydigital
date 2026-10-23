import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { sendEmail, newFeedbackEmail } from "@/lib/email";

/**
 * "Report this conversation" (Atlas drawer, 2026-10-23): the user says what
 * went wrong and the whole chat comes with it — every message, the cards
 * and their states, the recaps Atlas carried between turns, the voice
 * diary (engine, timings, fallbacks) and the device. It lands as a BUG
 * FeedbackTicket tagged pageUrl "atlas-report", so it shows on
 * /superadmin/feedback and the inbox gets the email, and the transcript
 * can be read straight from the database when a bug needs chasing.
 */
const FEEDBACK_INBOX = process.env.APPLICATION_INBOX ?? "info@streamflaire.com";
const MAX_MESSAGES = 40;

type ReportMsg = {
  role?: unknown;
  content?: unknown;
  proposals?: unknown;
  recap?: unknown;
  tokens?: unknown;
  auto?: unknown;
};

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function renderMessages(raw: unknown): string {
  if (!Array.isArray(raw)) return "(no messages)";
  const msgs = raw.slice(-MAX_MESSAGES) as ReportMsg[];
  return msgs
    .map((m, i) => {
      const role = m.role === "user" ? (m.auto ? "USER (auto)" : "USER") : "ATLAS";
      const lines = [`[${i + 1}] ${role}${typeof m.tokens === "number" ? ` (${m.tokens} tokens)` : ""}: ${str(m.content, 6000)}`];
      if (Array.isArray(m.proposals)) {
        for (const p of m.proposals.slice(0, 20) as { title?: unknown; state?: unknown; kind?: unknown; danger?: unknown; money?: unknown }[]) {
          const flags = [p.danger ? "permanent" : "", p.money ? "money" : ""].filter(Boolean).join(",");
          lines.push(`    card: ${str(p.title, 200)} [${str(p.state, 20) || "pending"}${flags ? `; ${flags}` : ""}]`);
        }
      }
      if (typeof m.recap === "string" && m.recap) lines.push(`    recap: ${m.recap.slice(0, 1500)}`);
      return lines.join("\n");
    })
    .join("\n");
}

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { note?: unknown; messages?: unknown; voiceLog?: unknown; device?: unknown; voiceOpen?: unknown }
    | null;
  const note = str(body?.note, 2000).trim();
  if (!note) return NextResponse.json({ error: "Say what went wrong, even briefly." }, { status: 400 });

  const recent = await prisma.feedbackTicket.count({
    where: { userId: actor.id, createdAt: { gte: new Date(Date.now() - 86400000) } },
  });
  if (recent >= 20) {
    return NextResponse.json({ error: "You've sent a lot of reports today — please try again tomorrow." }, { status: 429 });
  }

  const voiceLines = Array.isArray(body?.voiceLog) ? (body!.voiceLog as unknown[]).filter((l): l is string => typeof l === "string").slice(-200) : [];
  const device = body?.device && typeof body.device === "object" ? (body.device as Record<string, unknown>) : {};
  const deviceLines = Object.entries(device)
    .slice(0, 20)
    .map(([k, v]) => `${k}: ${str(typeof v === "string" ? v : JSON.stringify(v), 300)}`);

  const details = [
    `WHAT WENT WRONG\n${note}`,
    `CONTEXT\nuser: ${actor.name} (${actor.id}) · role ${actor.role} · company ${actor.companyId}\nchat model: ${process.env.AI_MODEL_ASSISTANT || (process.env.ANTHROPIC_API_KEY ? "claude-haiku-5-5" : "gemini-2.5-flash")}\nvoice chat model: ${process.env.AI_MODEL_ASSISTANT_VOICE || "(same as chat)"}\nlive model: ${process.env.AI_MODEL_LIVE || "gemini-3.8-live"}\nfiled from: ${body?.voiceOpen ? "voice screen" : "chat"}\n${deviceLines.join("\n")}`,
    `CONVERSATION\n${renderMessages(body?.messages)}`,
    `VOICE DIARY\n${voiceLines.length ? voiceLines.join("\n") : "(voice mode was not used in this tab)"}`,
  ].join("\n\n────────\n\n");

  const firstUser = Array.isArray(body?.messages)
    ? (body!.messages as ReportMsg[]).find((m) => m.role === "user" && typeof m.content === "string")
    : undefined;
  const title = `Atlas report: ${note.length > 70 ? `${note.slice(0, 70)}…` : note}${firstUser ? ` — “${str(firstUser.content, 50)}”` : ""}`.slice(0, 200);

  const ticket = await prisma.feedbackTicket.create({
    data: { type: "BUG", title, details, pageUrl: "atlas-report", companyId: actor.companyId, userId: actor.id },
    include: { user: { select: { name: true, email: true } }, company: { select: { name: true } } },
  });

  // The email carries the note + context; the full transcript stays on the ticket.
  await sendEmail({
    to: FEEDBACK_INBOX,
    ...newFeedbackEmail({
      type: "BUG",
      title: ticket.title,
      details: details.split("\n\n────────\n\n").slice(0, 2).join("\n\n") + `\n\n(full conversation + voice diary on the ticket, id ${ticket.id})`,
      pageUrl: "Atlas conversation report",
      userName: ticket.user?.name ?? actor.name,
      userEmail: ticket.user?.email ?? "",
      companyName: ticket.company.name,
    }),
  }).catch(() => undefined);

  return NextResponse.json({ id: ticket.id }, { status: 201 });
}
