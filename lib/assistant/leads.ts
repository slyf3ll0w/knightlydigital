import { prisma } from "../db";
import { canSell, canSeePricing, contactScope, isManager } from "../permissions";
import { ensureStages, listBoards, triggerLabel, PIPELINE_TRIGGERS, MAIN_BOARD_NAME } from "../pipeline";
import { type Tool, str, money, clientName, findContact, stage } from "./core";
import { quoted } from "./untrusted";

/**
 * Lead pipeline (kanban board) tools: read the board, move/close cards, and
 * manage the stages + intake webhook themselves. Every write goes through
 * the same /api/app/pipeline and /contacts/[id]/stage routes the board uses.
 */

/**
 * A board by name ("main" / "Main board" / "" = the main board → null).
 * undefined = no board by that name.
 */
async function resolveBoard(companyId: string, name: string): Promise<{ id: string | null; name: string } | undefined> {
  const q = name.trim().toLowerCase();
  if (!q || q === "main" || q === MAIN_BOARD_NAME.toLowerCase()) return { id: null, name: MAIN_BOARD_NAME };
  const boards = await listBoards(prisma, companyId);
  const hit = boards.find((b) => b.id === name) ?? boards.find((b) => b.name.toLowerCase() === q) ?? boards.find((b) => b.name.toLowerCase().includes(q));
  return hit ? { id: hit.id, name: hit.name } : undefined;
}

/** Stage names repeat across boards: `boardId` (the board asked for, or the card's own) is searched first. */
async function resolveStage(
  companyId: string,
  nameOrId: string,
  opts?: { includeConverted?: boolean; boardId?: string | null; onlyBoard?: boolean }
) {
  const all = await ensureStages(companyId);
  const pool = opts?.includeConverted ? all : all.filter((s) => !s.isConverted);
  const prefer = opts?.boardId ?? null;
  const mine = pool.filter((s) => (s.boardId ?? null) === prefer);
  const stages = opts?.onlyBoard ? mine : [...mine, ...pool.filter((s) => (s.boardId ?? null) !== prefer)];
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
        "The lead pipeline board: every stage with its leads (name, lead source, days sitting in the stage, open quote value, repeat-client flag, assignee). Use for questions like \"what's in my pipeline\", \"which leads are going stale\", or before moving/closing a lead. Leads leave the board by winning (they become clients) or losing. Pass lost: true for the leads closed as lost in the last 90 days WITH the reason each was lost — the answer to \"why am I losing leads\" or \"what happened to my lost leads\".",
      parameters: {
        type: "object",
        properties: {
          lost: { type: "boolean", description: "also list recently lost leads and their lost reasons" },
          board: { type: "string", description: "only this board, by name ('main' for the main board). Omit for every board." },
        },
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args) => {
      const allStages = await ensureStages(actor.companyId);
      const boards = await listBoards(prisma, actor.companyId);
      const boardName = (id: string | null) => (id ? boards.find((b) => b.id === id)?.name ?? "?" : MAIN_BOARD_NAME);
      const only = str(args.board, 40) ? await resolveBoard(actor.companyId, str(args.board, 40)) : null;
      if (only === undefined) return { error: `No board named "${str(args.board, 40)}". Boards: ${[MAIN_BOARD_NAME, ...boards.map((b) => b.name)].join(", ")}` };
      const stages = only ? allStages.filter((s) => s.isConverted || (s.boardId ?? null) === only.id) : allStages;
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
        ...(boards.length > 0 && !s.isConverted ? { board: boardName(s.boardId ?? null) } : {}),
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
      // Lost leads live off the board (ARCHIVED) with the reason typed at close
      // time — the 2026-10-27 report had Atlas insisting there were no reasons.
      const lost = args.lost === true
        ? await prisma.contact.findMany({
            where: {
              companyId: actor.companyId,
              ...contactScope(actor),
              lostAt: { gte: new Date(Date.now() - 90 * 86400000) },
            },
            orderBy: { lostAt: "desc" },
            take: 30,
            select: { id: true, firstName: true, lastName: true, companyName: true, leadSource: true, lostAt: true, lostReason: true },
          })
        : null;
      return {
        board,
        ...(boards.length > 0
          ? {
              boards: [MAIN_BOARD_NAME, ...boards.map((b) => b.name)],
              boardsNote: "This company has more than one leads board. Each has its own stages; a lead is on one board at a time. The Converted section is shared. New leads land on the main board unless a form or a lead source sends them to another (manage_lead_board).",
            }
          : {}),
        ...(lost
          ? {
              lost: lost.map((l) => ({
                leadId: l.id,
                name: clientName(l),
                source: l.leadSource,
                lostOn: l.lostAt?.toISOString().slice(0, 10) ?? null,
                reason: l.lostReason ? quoted(l.lostReason, 200) : "(no reason was entered)",
              })),
              ...(lost.length === 0 ? { lostNote: "No leads were closed as lost in the last 90 days." } : {}),
            }
          : {}),
        note: "Stages are customizable (manage_pipeline_stage). close_lead settles a lead: won lands the card in the built-in Converted section (they become an active client); lost archives it with a reason (get_lead_board lost: true, or get_client_activity, shows the reasons).",
      };
    },
  },
  {
    decl: {
      name: "move_lead",
      description:
        "Stage moving a lead's card to another pipeline stage (by stage name — see get_lead_board). With more than one leads board, the stage is looked for on the lead's own board first; pass board to move the lead to another board (its first stage when no stage is named). Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "The lead's id (from get_lead_board or search)" },
          stage: { type: "string", description: "Target stage name" },
          board: { type: "string", description: "Move to this board (by name; 'main' = the main board)" },
        },
        required: ["clientId"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const contact = await findContact(actor, str(args.clientId, 40));
      if (!contact) return { error: "No lead with that id (or not visible to this user)." };
      const wantStage = str(args.stage, 40);
      const wantBoard = str(args.board, 40);
      if (!wantStage && !wantBoard) return { error: "Give a stage, a board, or both." };
      const toBoard = wantBoard ? await resolveBoard(actor.companyId, wantBoard) : null;
      if (toBoard === undefined) return { error: `No board named "${wantBoard}" — check get_lead_board.` };
      const all = await ensureStages(actor.companyId);
      const on = await prisma.contact.findUnique({ where: { id: contact.id }, select: { pipelineStageId: true } });
      const current = all.find((s) => s.id === on?.pipelineStageId);
      const boardId = toBoard ? toBoard.id : current && !current.isConverted ? current.boardId ?? null : null;
      const target = wantStage
        ? await resolveStage(actor.companyId, wantStage, { boardId, onlyBoard: Boolean(toBoard) })
        : all.find((s) => !s.isConverted && (s.boardId ?? null) === boardId) ?? null;
      if (!target) return { error: `No stage matching "${wantStage}"${toBoard ? ` on ${toBoard.name}` : ""} — check get_lead_board.` };
      const crossing = current && !current.isConverted && (current.boardId ?? null) !== (target.boardId ?? null);
      return stage(ctx, {
        kind: "move_lead",
        title: `Move ${clientName(contact)} to "${target.name}"${toBoard || crossing ? ` on ${toBoard?.name ?? "another board"}` : ""}`,
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
      name: "manage_lead_board",
      description:
        "Stage adding, renaming or removing a leads board, or setting which lead sources land on it (managers). A company has a main board and can add more, each with its own stages; a lead is on one board at a time. create: a new board with the starter stages. set_sources: the lead source names whose NEW leads land on this board (an empty list clears it; a source belongs to one board). delete: its leads move to the first stage of the main board. A booking form can also send its leads to a board (manage_booking_item is not needed: that is set on the form's page, Booking & forms). Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create", "rename", "set_sources", "delete"] },
          board: { type: "string", description: "Existing board name (all actions except create)" },
          name: { type: "string", description: "create/rename: the (new) board name" },
          sources: { type: "array", items: { type: "string" }, description: "set_sources: lead source names, e.g. Facebook, Google Ads" },
        },
        required: ["action"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const action = str(args.action, 16);
      if (action === "create") {
        const name = str(args.name, 40);
        if (!name) return { error: "name is required" };
        return stage(ctx, {
          kind: "manage_lead_board",
          title: `Add leads board "${name}"`,
          lines: ["It starts with the standard stages; change them under Customize stages."],
          endpoint: "/api/app/pipeline/boards",
          method: "POST",
          payload: { name },
          href: "/app/leads",
        });
      }
      const target = await resolveBoard(actor.companyId, str(args.board, 40));
      if (!target) return { error: `No board named "${str(args.board, 40)}" — check get_lead_board.` };
      if (!target.id) return { error: "The main board can't be renamed, removed or given sources: it is where every lead lands unless a rule sends it elsewhere." };
      if (action === "rename") {
        const name = str(args.name, 40);
        if (!name) return { error: "name is required" };
        return stage(ctx, {
          kind: "manage_lead_board",
          title: `Rename board "${target.name}" to "${name}"`,
          lines: [],
          endpoint: `/api/app/pipeline/boards/${target.id}`,
          method: "PATCH",
          payload: { name },
        });
      }
      if (action === "set_sources") {
        const sources = Array.isArray(args.sources) ? args.sources.filter((v): v is string => typeof v === "string").map((v) => v.slice(0, 60)).slice(0, 30) : [];
        return stage(ctx, {
          kind: "manage_lead_board",
          title: sources.length ? `Send new leads from ${sources.join(", ")} to "${target.name}"` : `Stop sending leads to "${target.name}" by source`,
          lines: sources.length ? ["Only new leads follow this; leads already on a board stay where they are."] : [],
          endpoint: `/api/app/pipeline/boards/${target.id}`,
          method: "PATCH",
          payload: { sources },
        });
      }
      if (action === "delete") {
        return stage(ctx, {
          kind: "delete_lead_board",
          title: `Delete leads board "${target.name}"`,
          lines: ["Its leads move to the first stage of the main board. Its stages are removed."],
          endpoint: `/api/app/pipeline/boards/${target.id}`,
          method: "DELETE",
          payload: {},
          danger: true,
        });
      }
      return { error: "action must be create, rename, set_sources, or delete" };
    },
  },
  {
    decl: {
      name: "manage_pipeline_stage",
      description:
        "Stage changes to the pipeline board's columns (managers): create a stage, rename/recolor one, set its auto-advance trigger (REQUEST_CREATED / CONTACT_MADE / CALL_NO_ANSWER / APPOINTMENT_SCHEDULED / QUOTE_SENT — moves a lead's card there when that happens, forward only; one stage per trigger; 'none' clears it; quote approval isn't a trigger — an approved quote always converts the lead), reorder all stages, or delete one (its leads move to the first stage). Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create", "rename", "recolor", "set_trigger", "reorder", "delete"] },
          stage: { type: "string", description: "Existing stage name (all actions except create/reorder)" },
          board: { type: "string", description: "Which leads board, by name, when there is more than one ('main' or omitted = the main board)" },
          name: { type: "string", description: "create/rename: the (new) stage name" },
          color: { type: "string", description: "recolor/create: hex like #0B57D8" },
          trigger: {
            type: "string",
            enum: [...PIPELINE_TRIGGERS, "none"],
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
      const onBoard = await resolveBoard(actor.companyId, str(args.board, 40));
      if (onBoard === undefined) return { error: `No board named "${str(args.board, 40)}" — check get_lead_board.` };
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
            ...(onBoard.id && { boardId: onBoard.id }),
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
        const stages = (await ensureStages(actor.companyId)).filter((s) => !s.isConverted && (s.boardId ?? null) === onBoard.id);
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
      const target = await resolveStage(actor.companyId, str(args.stage, 40), { boardId: onBoard.id, onlyBoard: Boolean(str(args.board, 40)) });
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
          return { error: `trigger must be one of ${PIPELINE_TRIGGERS.join(", ")}, or none (quote approval always converts the lead — that's built in)` };
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
              "The URL shows in Settings → Clients & documents → Lead pipeline after confirming.",
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
