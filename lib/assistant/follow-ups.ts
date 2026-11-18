import { canSeeMoney, canSell } from "../permissions";
import { loadFollowUps } from "../follow-ups-server";
import { FOLLOW_UP_BAR, type FollowUpKind } from "../follow-ups";
import { type Tool, str, money, stage } from "./core";

/**
 * Follow-ups (lib/follow-ups.ts, the /app/follow-ups page): which quotes and
 * unpaid invoices are worth a personal nudge today, and the person's "not
 * now" / "never" on one of them. The message itself is written in the
 * conversation and staged with reply_in_portal or email_client, so it goes
 * through the same card, and the same Send, as any other message.
 */
const TONE = { 1: "first nudge, light", 2: "second nudge, direct and courteous", 3: "last nudge, calm, offer a way out" } as const;

export const followUpTools: Tool[] = [
  {
    decl: {
      name: "list_follow_ups",
      description:
        "The quotes and unpaid invoices worth a personal follow-up today, one per client, with the facts behind each: how long it has been, whether the client opened it, which automatic reminders went out, and follow-ups already sent. Also lists clients who wrote and are still waiting on a reply, and how many open documents were left alone and why (the client just wrote, a person just reached out, a note says to hold, a visit is coming up).",
      parameters: { type: "object", properties: {} },
    },
    allowed: (a) => canSell(a.role) || canSeeMoney(a),
    run: async (actor) => {
      const list = await loadFollowUps(actor);
      return {
        followUps: list.items.map((i) => ({
          kind: i.kind,
          id: i.id,
          clientId: i.clientId,
          client: i.clientName,
          clientFirstName: i.clientFirstName,
          document: `${i.kind === "invoice" ? "Invoice" : "Quote"} #${i.number}`,
          title: i.title,
          amount: money(i.amount),
          ...(i.alsoOwed.length ? { alsoPastDue: i.alsoOwed.map((o) => ({ invoice: `#${o.number}`, owed: money(o.amount) })) } : {}),
          why: i.why,
          tone: TONE[i.tone],
          reachBy: i.channels,
          followUpsAlreadySent: i.followUpCount,
        })),
        waitingOnAReply: list.waiting.map((w) => ({ clientId: w.clientId, client: w.clientName })),
        leftAlone: list.heldBack.map((h) => ({ why: h.label, count: h.count })),
        page: "/app/follow-ups",
      };
    },
  },
  {
    decl: {
      name: "update_follow_up",
      description:
        `Stage the user's answer to a follow-up from list_follow_ups: 'later' hides it for ${FOLLOW_UP_BAR.snoozeDays} days, 'never' stops offering it for that quote or invoice, 'undo' brings it back. Confirmation card required.`,
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["quote", "invoice"] },
          id: { type: "string", description: "the id from list_follow_ups" },
          mode: { type: "string", enum: ["later", "never", "undo"] },
        },
        required: ["kind", "id", "mode"],
      },
    },
    allowed: (a) => canSell(a.role) || canSeeMoney(a),
    run: async (actor, args, ctx) => {
      const kind = str(args.kind, 10) as FollowUpKind;
      const mode = str(args.mode, 10);
      const id = str(args.id, 40);
      if ((kind !== "quote" && kind !== "invoice") || !id) return { error: "kind (quote or invoice) and id are required — take them from list_follow_ups." };
      if (mode !== "later" && mode !== "never" && mode !== "undo") return { error: "mode is later, never or undo." };
      if (kind === "invoice" ? !canSeeMoney(actor) : !canSell(actor.role)) return { error: "Not allowed for this role." };
      const list = await loadFollowUps(actor);
      const item = list.items.find((i) => i.kind === kind && i.id === id);
      const what = item ? `${item.clientName}, ${kind} #${item.number}` : `That ${kind}`;
      return stage(ctx, {
        kind: "update_follow_up",
        title: mode === "later" ? "Follow up later" : mode === "never" ? "Stop following up" : "Bring the follow-up back",
        lines: [what, mode === "later" ? `Hidden from Follow-ups for ${FOLLOW_UP_BAR.snoozeDays} days` : mode === "never" ? "It won't be offered again for this one" : "It can be offered again"],
        endpoint: "/api/app/follow-ups/skip",
        method: "POST",
        payload: { kind, id, mode },
        confirmLabel: mode === "later" ? "Hide for a week" : mode === "never" ? "Stop asking" : "Bring it back",
        href: "/app/follow-ups",
      });
    },
  },
];
