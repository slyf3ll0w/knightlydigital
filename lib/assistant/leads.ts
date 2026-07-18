import { prisma } from "../db";
import { canSell, canSeePricing, contactScope, isManager } from "../permissions";
import { ensureStages, triggerLabel, PIPELINE_TRIGGERS } from "../pipeline";
import { type Tool, str, money, clientName, findContact, stage } from "./core";

/**
 * Lead pipeline (kanban board) tools: read the board, move/close cards, and
 * manage the stages + intake webhook themselves. Every write goes through
 * the same /api/app/pipeline and /contacts/[id]/stage routes the board uses.
 */

async function resolveStage(
  companyId: string,
  nameOrId: string,
  opts?: { includeConverted?: boolean }
) {
  const all = await ensureStages(companyId);
  const stages = opts?.includeConverted ? all : all.filter((s) => !s.isConverted);
  const q = nameOrId.trim().toLowerCase();
  return (
    stages.find((s) => s.id === nameOrId) ??
    stages.find((s) => s.name.toLowerCase() === q) ??
    stages.find((s) => s.name.toLowerCase().includes(q)) ??
    null
  );
}

export const leadTools: Tool[] = [
  {
    decl: {
      name: "get_lead_board",
      description:
        "The lead pipeline board: every stage with its leads (name, lead source, days sitting in the stage, open quote value, repeat-client flag, assignee). Use for questions like \"what's in my pipeline\", \"which leads are going stale\", or before moving/closing a lead. Leads leave the board by winning (they become clients) or losing.",
      parameters: { type: "object", properties: {} },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor) => {
      const stages = await ensureStages(actor.companyId);
      const leads = await prisma.contact.findMany({
        where: {
          companyId: actor.companyId,
          pipelineStageId: { not: null },
          ...contactScope(actor),
        },
        orderBy: [{ pipelineOrder: "asc" }, { stageChangedAt: "desc" }],
        take: 80,
        select: {
          id: true, firstName: true, lastName: true, companyName: true,
          leadSource: true, status: true, timesWon: true,
          pipelineStageId: true, stageChangedAt: true, createdAt: true,
          assignedTo: { select: { name: true } },
          quotes: {
            where: { status: { in: ["DRAFT", "AWAITING_RESPONSE", "APPROVED"] } },
            select: { total: true },
          },
        },
      });
      const seePrices = canSeePricing(actor.role);
      const board = stages.map((s) => ({
        stage: s.name,
        ...(s.isConverted ? { converted: true } : {}),
        ...(s.autoAdvanceOn ? { autoAdvancesOn: triggerLabel[s.autoAdvanceOn] } : {}),
        leads: leads
          .filter((l) => l.pipelineStageId === s.id)
          .map((l) => ({
            leadId: l.id,
            name: clientName(l),
            source: l.leadSource,
            daysInStage: Math.floor(
              (Date.now() - (l.stageChangedAt ?? l.createdAt).getTime()) / 86400000
            ),
            ...((s.isConverted ? l.timesWon > 1 : l.status === "ACTIVE" || l.timesWon > 0)
              ? { repeatClient: true }
              : {}),
            ...(l.assignedTo ? { assignedTo: l.assignedTo.name } : {}),
            ...(seePrices && l.quotes.length > 0
              ? { quotedValue: money(l.quotes.reduce((sum, q) => sum + Number(q.total), 0)) }
              : {}),
          })),
      }));
      return {
        board,
        note: "Stages are customizable (manage_pipeline_stage). close_lead settles a lead: won lands the card in the built-in Converted section (they become an active client); lost archives it.",
      };
    },
  },
  {
    decl: {
      name: "move_lead",
      description:
        "Stage moving a lead's card to another pipeline stage (by stage name — see get_lead_board). Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "The lead's id (from get_lead_board or search)" },
          stage: { type: "string", description: "Target stage name" },
        },
        required: ["clientId", "stage"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const contact = await findContact(actor, str(args.clientId, 40));
      if (!contact) return { error: "No lead with that id (or not visible to this user)." };
      const target = await resolveStage(actor.companyId, str(args.stage, 40));
      if (!target) return { error: `No stage matching "${str(args.stage, 40)}" — check get_lead_board.` };
      return stage(ctx, {
        kind: "move_lead",
        title: `Move ${clientName(contact)} to "${target.name}"`,
        lines: [],
        endpoint: `/api/app/contacts/${contact.id}/stage`,
        method: "PATCH",
        payload: { stageId: target.id },
      });
    },
  },
  {
    decl: {
      name: "close_lead",
      description:
        "Stage closing a lead off the pipeline board: outcome 'won' makes them an active client (first jobs/invoices also do this automatically); 'lost' archives a lead (a repeat client just leaves the board and stays active) with an optional reason. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          outcome: { type: "string", enum: ["won", "lost"] },
          reason: { type: "string", description: "lost only — why (price, timing, competitor…)" },
        },
        required: ["clientId", "outcome"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const outcome = str(args.outcome, 8);
      if (outcome !== "won" && outcome !== "lost") return { error: "outcome must be won or lost" };
      const contact = await prisma.contact.findFirst({
        where: { id: str(args.clientId, 40), companyId: actor.companyId, ...contactScope(actor) },
        select: {
          id: true, firstName: true, lastName: true, companyName: true,
          status: true, pipelineStageId: true,
        },
      });
      if (!contact) return { error: "No lead with that id (or not visible to this user)." };
      if (!contact.pipelineStageId) return { error: "That contact isn't on the pipeline board." };
      const reason = str(args.reason, 300);
      return stage(ctx, {
        kind: "close_lead",
        title:
          outcome === "won"
            ? `Mark ${clientName(contact)} WON — becomes an active client`
            : `Mark ${clientName(contact)} lost`,
        lines:
          outcome === "won"
            ? ["Their card leaves the board; they show under Clients as Active."]
            : [
                reason && `Reason: ${reason}`,
                contact.status === "LEAD"
                  ? "The lead is archived — a new request from them re-opens it."
                  : "They stay an active client; this only takes them off the board.",
              ].filter(Boolean) as string[],
        endpoint: `/api/app/contacts/${contact.id}/stage`,
        method: "PATCH",
        payload: outcome === "won" ? { action: "won" } : { action: "lost", reason: reason || undefined },
      });
    },
  },
  {
    decl: {
      name: "manage_pipeline_stage",
      description:
        "Stage changes to the pipeline board's columns (managers): create a stage, rename/recolor one, set its auto-advance trigger (request_created / appointment_scheduled / quote_sent / quote_approved — moves a lead's card there when that happens; one stage per trigger; 'none' clears it), reorder all stages, or delete one (its leads move to the first stage). Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create", "rename", "recolor", "set_trigger", "reorder", "delete"] },
          stage: { type: "string", description: "Existing stage name (all actions except create/reorder)" },
          name: { type: "string", description: "create/rename: the (new) stage name" },
          color: { type: "string", description: "recolor/create: hex like #0B57D8" },
          trigger: {
            type: "string",
            enum: ["REQUEST_CREATED", "APPOINTMENT_SCHEDULED", "QUOTE_SENT", "none"],
          },
          orderedNames: {
            type: "array",
            items: { type: "string" },
            description: "reorder: every stage name in the desired order",
          },
        },
        required: ["action"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const action = str(args.action, 16);
      const color = str(args.color, 7);
      if (action === "create") {
        const name = str(args.name, 40);
        if (!name) return { error: "name is required" };
        const trigger = str(args.trigger, 30);
        return stage(ctx, {
          kind: "manage_pipeline_stage",
          title: `Add pipeline stage "${name}"`,
          lines: [
            color && `Color: ${color}`,
            (PIPELINE_TRIGGERS as readonly string[]).includes(trigger) &&
              `Auto-advance: ${triggerLabel[trigger]}`,
          ].filter(Boolean) as string[],
          endpoint: "/api/app/pipeline/stages",
          method: "POST",
          payload: {
            name,
            ...(color && { color }),
            ...((PIPELINE_TRIGGERS as readonly string[]).includes(trigger) && { autoAdvanceOn: trigger }),
          },
        });
      }
      if (action === "reorder") {
        const names = Array.isArray(args.orderedNames)
          ? args.orderedNames.filter((v): v is string => typeof v === "string")
          : [];
        // Converted is pinned last and never reordered
        const stages = (await ensureStages(actor.companyId)).filter((s) => !s.isConverted);
        const ids: string[] = [];
        for (const n of names) {
          const m = stages.find((s) => s.name.toLowerCase() === n.trim().toLowerCase());
          if (!m) return { error: `No stage named "${n}". Current: ${stages.map((s) => s.name).join(", ")}` };
          ids.push(m.id);
        }
        if (ids.length !== stages.length) {
          return { error: `orderedNames must include every stage exactly once. Current: ${stages.map((s) => s.name).join(", ")}` };
        }
        return stage(ctx, {
          kind: "manage_pipeline_stage",
          title: "Reorder pipeline stages",
          lines: [names.join(" → ")],
          endpoint: "/api/app/pipeline/stages/reorder",
          method: "POST",
          payload: { orderedIds: ids },
        });
      }
      const target = await resolveStage(actor.companyId, str(args.stage, 40));
      if (!target) return { error: `No stage matching "${str(args.stage, 40)}" — check get_lead_board.` };
      if (action === "delete") {
        return stage(ctx, {
          kind: "delete_pipeline_stage",
          title: `Delete pipeline stage "${target.name}"`,
          lines: ["Any leads in it move to the board's first stage."],
          endpoint: `/api/app/pipeline/stages/${target.id}`,
          method: "DELETE",
          payload: {},
          danger: true,
        });
      }
      if (action === "rename") {
        const name = str(args.name, 40);
        if (!name) return { error: "name is required" };
        return stage(ctx, {
          kind: "manage_pipeline_stage",
          title: `Rename stage "${target.name}" → "${name}"`,
          lines: [],
          endpoint: `/api/app/pipeline/stages/${target.id}`,
          method: "PATCH",
          payload: { name },
        });
      }
      if (action === "recolor") {
        if (!/^#[0-9a-fA-F]{6}$/.test(color)) return { error: "color must be hex like #0B57D8" };
        return stage(ctx, {
          kind: "manage_pipeline_stage",
          title: `Recolor stage "${target.name}" to ${color}`,
          lines: [],
          endpoint: `/api/app/pipeline/stages/${target.id}`,
          method: "PATCH",
          payload: { color },
        });
      }
      if (action === "set_trigger") {
        const trigger = str(args.trigger, 30);
        const clearing = trigger === "none";
        if (!clearing && !(PIPELINE_TRIGGERS as readonly string[]).includes(trigger)) {
          return { error: "trigger must be REQUEST_CREATED, APPOINTMENT_SCHEDULED, QUOTE_SENT, or none (quote approval always converts the lead — that's built in)" };
        }
        return stage(ctx, {
          kind: "manage_pipeline_stage",
          title: clearing
            ? `Remove automation from stage "${target.name}"`
            : `Auto-advance leads to "${target.name}" when: ${triggerLabel[trigger]}`,
          lines: clearing ? [] : ["Cards only move forward — this never demotes a lead."],
          endpoint: `/api/app/pipeline/stages/${target.id}`,
          method: "PATCH",
          payload: { autoAdvanceOn: clearing ? null : trigger },
        });
      }
      return { error: "action must be create, rename, recolor, set_trigger, reorder, or delete" };
    },
  },
  {
    decl: {
      name: "manage_lead_webhook",
      description:
        "The lead-intake webhook: outside sources (Meta/Google ad leads via Zapier or Make, other form tools) POST leads to a company-specific URL and they land on the pipeline board. action 'status' reads the current URL; 'enable' creates it (or 'rotate' replaces it, killing the old URL); 'disable' turns intake off. enable/rotate/disable need a confirmation card.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["status", "enable", "rotate", "disable"] },
        },
        required: ["action"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const action = str(args.action, 10);
      const company = await prisma.company.findUnique({
        where: { id: actor.companyId },
        select: { leadWebhookToken: true },
      });
      const base = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
      const url = company?.leadWebhookToken
        ? `${base}/api/public/leads/${company.leadWebhookToken}`
        : null;
      if (action === "status") {
        return url
          ? {
              enabled: true,
              url,
              usage:
                "POST JSON with firstName/lastName (or name), email or phone, optional source (e.g. 'Facebook Ads') and message. Works as the webhook target in Zapier/Make.",
            }
          : { enabled: false, note: "No webhook yet — offer to enable it." };
      }
      if (action === "disable") {
        if (!url) return { error: "The webhook is already off." };
        return stage(ctx, {
          kind: "manage_lead_webhook",
          title: "Turn off the lead-intake webhook",
          lines: ["The current URL stops accepting leads immediately."],
          endpoint: "/api/app/pipeline/webhook",
          method: "DELETE",
          payload: {},
        });
      }
      if (action === "enable" || action === "rotate") {
        if (action === "enable" && url) {
          return { enabled: true, url, note: "Already enabled — use rotate to replace the URL." };
        }
        return {
          ...stage(ctx, {
            kind: "manage_lead_webhook",
            title: action === "rotate" ? "Rotate the lead webhook URL" : "Enable the lead-intake webhook",
            lines: [
              action === "rotate"
                ? "Anything using the old URL stops working immediately."
                : "Creates a private URL that drops posted leads onto the board.",
              "The URL shows in Settings → Lead Pipeline after confirming.",
            ],
            endpoint: "/api/app/pipeline/webhook",
            method: "POST",
            payload: {},
          }),
          note: "After the user confirms, call manage_lead_webhook status to fetch the new URL and paste it in your reply.",
        };
      }
      return { error: "action must be status, enable, rotate, or disable" };
    },
  },
];
