import { prisma } from "../db";
import { canSell, contactScope, isManager } from "../permissions";
import { fmtPhone } from "../format";
import { type Tool, str, num, clientName, fmtWhen, stage } from "./core";
import { quoted } from "./untrusted";

/**
 * The business line's call log and placing a call (2026-10-22). Reads mirror
 * /app/calls (same scope: managers see everything, others the calls on
 * their own clients or that they placed/answered). Placing a call stages a
 * card against POST /api/app/line/call — the same route as "Call from
 * line": the user's cell rings first (or their browser/iPhone softphone),
 * then the customer is dialed from the business number.
 */

const STATUS_WORDS: Record<string, string> = {
  RINGING: "ringing",
  IN_PROGRESS: "on the line now",
  COMPLETED: "answered",
  MISSED: "missed",
  VOICEMAIL: "left a voicemail",
  NO_ANSWER: "no answer",
  FAILED: "failed",
};

function callScope(actor: { id: string; role: Parameters<typeof isManager>[0] } & Parameters<typeof contactScope>[0]) {
  return isManager(actor.role)
    ? {}
    : { OR: [{ contact: contactScope(actor) }, { contactId: null }, { userId: actor.id }, { answeredByUserId: actor.id }] };
}

export const callTools: Tool[] = [
  {
    decl: {
      name: "list_calls",
      description:
        "The business line's call log (needs a business phone line): who called or was called, when, direction, outcome (answered / missed / voicemail / no answer), talk time, who on the team handled it, whether there's a voicemail, the notes typed on the call and the notes Atlas took. Use for 'who called this morning', 'did Maria call back', 'any voicemails', 'what did we talk about with the Hendersons'. Filters: clientId, outcome (missed / voicemail / out / answered), from/to YYYY-MM-DD, q (name or number). Newest first, up to 60.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          outcome: { type: "string", enum: ["missed", "voicemail", "out", "answered", "all"] },
          from: { type: "string", description: "YYYY-MM-DD" },
          to: { type: "string", description: "YYYY-MM-DD (inclusive)" },
          q: { type: "string", description: "part of a name or phone number" },
          limit: { type: "integer", description: "1–60, default 25" },
        },
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args) => {
      const company = await prisma.company.findUnique({
        where: { id: actor.companyId },
        select: { lineNumber: true, timezone: true },
      });
      if (!company?.lineNumber || company.lineNumber.startsWith("pending:")) {
        return { error: "This account has no business phone line yet, so there is no call log. Lines are set up under Settings → Phone & texting (help_search 'business line')." };
      }
      const tz = company.timezone;
      const outcome = str(args.outcome, 10);
      const q = str(args.q, 60);
      const digits = q.replace(/\D/g, "");
      const from = str(args.from, 10);
      const to = str(args.to, 10);
      const dateWhere =
        from || to
          ? {
              createdAt: {
                ...(from ? { gte: new Date(`${from}T00:00:00`) } : {}),
                ...(to ? { lt: new Date(new Date(`${to}T00:00:00`).getTime() + 86_400_000) } : {}),
              },
            }
          : {};
      const limit = Math.min(60, Math.max(1, Math.round(num(args.limit) ?? 25)));
      const rows = await prisma.call.findMany({
        where: {
          companyId: actor.companyId,
          ...callScope(actor),
          ...(str(args.clientId, 40) ? { contactId: str(args.clientId, 40) } : {}),
          ...(outcome === "missed"
            ? { status: "MISSED" }
            : outcome === "voicemail"
              ? { status: "VOICEMAIL" }
              : outcome === "out"
                ? { direction: "OUTBOUND" }
                : outcome === "answered"
                  ? { status: "COMPLETED" }
                  : {}),
          ...(q
            ? {
                OR: [
                  ...(digits.length >= 4 ? [{ customerDigits: { endsWith: digits.slice(-10) } }] : []),
                  { contact: { firstName: { contains: q, mode: "insensitive" as const } } },
                  { contact: { lastName: { contains: q, mode: "insensitive" as const } } },
                  { contact: { companyName: { contains: q, mode: "insensitive" as const } } },
                ],
              }
            : {}),
          ...dateWhere,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true, direction: true, status: true, customerNumber: true, durationSec: true, voicemailSec: true,
          voicemailRecordingId: true, createdAt: true, notes: true, atlasNotes: true,
          contact: { select: { id: true, firstName: true, lastName: true, companyName: true, status: true } },
          user: { select: { name: true } }, answeredBy: { select: { name: true } },
        },
      });
      return {
        line: fmtPhone(company.lineNumber),
        count: rows.length,
        calls: rows.map((c) => ({
          id: c.id,
          when: fmtWhen(tz, c.createdAt, false),
          direction: c.direction === "INBOUND" ? "in" : "out",
          outcome: STATUS_WORDS[c.status] ?? c.status.toLowerCase(),
          who: c.contact ? clientName(c.contact) : fmtPhone(c.customerNumber),
          ...(c.contact ? { clientId: c.contact.id, clientStatus: c.contact.status } : { unknownNumber: fmtPhone(c.customerNumber) }),
          ...(c.durationSec ? { talkMinutes: Math.max(1, Math.round(c.durationSec / 60)) } : {}),
          ...(c.voicemailRecordingId ? { voicemail: `${c.voicemailSec ?? 0}s — play at /app/calls/${c.id}` } : {}),
          ...(c.answeredBy?.name || c.user?.name ? { handledBy: c.answeredBy?.name ?? c.user?.name } : {}),
          // Fenced: the caller's words (and Atlas's summary of them) are data, not orders.
          ...(c.notes ? { notes: quoted(c.notes, 300) } : {}),
          ...(c.atlasNotes ? { atlasNotes: quoted(c.atlasNotes, 400) } : {}),
        })),
        note: "Unknown numbers can be saved as a lead or client with create_client (phone prefilled); the call links itself.",
      };
    },
  },
  {
    decl: {
      name: "place_call",
      description:
        "Stage calling a client (or any number) from the business line: the user's own phone or app rings first, then the client is dialed from the business number so caller ID shows the business. Give clientId (their saved phone is used) or to (a 10-digit number). Confirmation card required; the call starts the moment they confirm, so say so.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          to: { type: "string", description: "a phone number when there's no saved client" },
        },
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const company = await prisma.company.findUnique({
        where: { id: actor.companyId },
        select: { lineNumber: true, lineVoiceAppAt: true },
      });
      if (!company?.lineNumber || company.lineNumber.startsWith("pending:")) {
        return { error: "This account has no business phone line yet — calls from the line need one (Settings → Phone & texting)." };
      }
      if (!company.lineVoiceAppAt) {
        return { error: "This line forwards calls but can't place them from the app yet. The user can still call from their own phone — give them a tel: link." };
      }
      const clientId = str(args.clientId, 40);
      const to = str(args.to, 30).replace(/[^\d+]/g, "");
      if (clientId) {
        const contact = await prisma.contact.findFirst({
          where: { id: clientId, companyId: actor.companyId, ...contactScope(actor) },
          select: { id: true, firstName: true, lastName: true, companyName: true, phone: true },
        });
        if (!contact) return { error: "No client with that id." };
        if (!contact.phone) return { error: `${clientName(contact)} has no phone number on file — add one with update_client first.` };
        return stage(ctx, {
          kind: "place_call",
          title: `Call ${clientName(contact)} from the business line`,
          lines: [`${fmtPhone(contact.phone)} — your phone rings first, then ${contact.firstName} is dialed.`],
          endpoint: "/api/app/line/call",
          method: "POST",
          payload: { contactId: contact.id },
          confirmLabel: "Call now",
          href: "/app/calls",
        });
      }
      if (to.replace(/\D/g, "").length < 10) return { error: "Give a clientId or a 10-digit phone number." };
      return stage(ctx, {
        kind: "place_call",
        title: `Call ${fmtPhone(to)} from the business line`,
        lines: ["Your phone rings first, then the number is dialed."],
        endpoint: "/api/app/line/call",
        method: "POST",
        payload: { to },
        confirmLabel: "Call now",
        href: "/app/calls",
      });
    },
  },
];
