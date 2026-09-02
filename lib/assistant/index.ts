import { prisma } from "../db";
import { type Actor, roleLabel } from "../permissions";
import {
  aiChat,
  AI_THOUGHT_SIGNATURE_SENTINEL,
  type AIContent,
  type AIPart,
} from "../ai";
import { str, type Proposal, type Tool, type ToolCtx } from "./core";
import { recordsTools } from "./records";
import { clientTools } from "./clients";
import { clientExtraTools } from "./client-extras";
import { pipelineTools } from "./pipeline";
import { leadTools } from "./leads";
import { scheduleTools } from "./schedule";
import { fieldTools } from "./field";
import { moneyTools } from "./money";
import { moneyExtraTools } from "./money-extras";
import { agreementTools } from "./agreements";
import { companyTools } from "./company";
import { deleteTools } from "./deletes";

export type { Proposal, BatchItem, Tool, ToolCtx } from "./core";

/**
 * Owner assistant (docs/plans/ai-assistant-plan.md).
 *
 * The registry lives in per-domain modules (records, clients, client-extras,
 * pipeline, leads, schedule, field, money, money-extras, agreements, company,
 * deletes) sharing the plumbing in core.ts.
 *
 * Reads happen through the tool registry — every tool is gated by the
 * same capability checks the pages use and scoped by the same Prisma scopes,
 * so the assistant can only read what the signed-in user could see by
 * clicking around. query_records + report are the two "power" reads: one
 * structured search and one aggregator across every entity, so bulk work
 * and complex questions don't need chains of top-15 lists.
 *
 * Writes NEVER happen here. Action tools stage a Proposal that the drawer
 * renders as a confirmation card; clicking Confirm submits to the SAME
 * existing API route the equivalent button uses (which re-validates role and
 * ownership server-side). Declined cards simply never submit.
 *
 * Results are deliberately small (top-N, minimal fields) — they land in the
 * model's context, so a chatty tool is a token bill and a distraction.
 *
 * Every model call's usageMetadata is summed into the turn's `usage` so the
 * route can price it (lib/assistant-billing.ts) — the paid plan meters spend.
 */

// Tool rounds per turn. Bulk edits over a couple hundred records and
// multi-entity investigations ("which clients with an unpaid invoice also
// have a job scheduled this week") need room to fetch, compute, and stage.
const MAX_TOOL_ROUNDS = 12;
// Tool calls executed per round. Bulk staging (one update card per record)
// leans on this. Overflow calls are NOT silently dropped — they get an
// error response telling the model to re-issue them next round.
const MAX_CALLS_PER_ROUND = 24;
/** Default display name for the assistant; companies can rename it in Settings. */
export const DEFAULT_ASSISTANT_NAME = "Atlas";
// Reasoning quality matters more here than in one-shot drafting — default to
// full Flash. 2.5-flash: the newer 3.x flash tiers allow only ~5 free
// requests/min, too few for multi-tool turns; once the key moves to the paid
// tier, set AI_MODEL_ASSISTANT=gemini-3.5-flash in Railway (no deploy).
const ASSISTANT_MODEL_DEFAULT = "gemini-2.5-flash";
// Per-model free-tier quotas are separate buckets — when the primary 429s,
// finishing the turn on lite beats erroring at the user.
const ASSISTANT_MODEL_FALLBACK = "gemini-flash-lite-latest";
// Thinking budget per model call (2.5-generation models only). Multi-step
// tool work — pick the right tool, chain lookups, compute a bulk edit — is
// measurably better with a little thinking; 0 turns it off for pure latency.
// Thinking tokens bill as output, so this is a cost knob too (ATLAS_THINKING_BUDGET).
const THINKING_BUDGET = (() => {
  const n = Number(process.env.ATLAS_THINKING_BUDGET);
  return Number.isFinite(n) && n >= 0 ? Math.min(8192, Math.round(n)) : 1024;
})();

/**
 * Follow-through for multi-step work. Writes only happen when the user
 * confirms a card, so "assign these jobs, then build the route" can't finish
 * in one turn — the route tool needs the assignments saved first. The model
 * stages step one and queues the rest here; the drawer sends the queued
 * instruction as the next turn by itself once every card from this turn is
 * confirmed (docs/plans/ai-assistant-plan.md, "queued next step").
 */
const queueNextStepTool: Tool = {
  decl: {
    name: "queue_next_step",
    description:
      "Queue the REST of a multi-step task to run automatically after the user confirms the card(s) you staged this turn. Use when a later step needs a change saved first (assign the jobs, then optimize the route; create the client, then quote them; convert the quote, then schedule the job). instruction = the exact follow-up request, self-contained, with every name/id/date it needs. Call at most once per turn, and only in a turn where you also staged at least one card. Then tell the user, briefly, what will happen after they confirm.",
    parameters: {
      type: "object",
      properties: {
        instruction: { type: "string", description: "the complete follow-up request, as if the user typed it" },
      },
      required: ["instruction"],
    },
  },
  allowed: () => true,
  run: async (_actor, args, ctx) => {
    const instruction = str(args.instruction, 600);
    if (!instruction) return { error: "instruction is required" };
    if (ctx.proposals.length === 0) {
      return {
        error:
          "Nothing is staged yet this turn — stage the first step's card(s) first, then queue the rest.",
      };
    }
    ctx.nextStep = instruction;
    return {
      queued: true,
      runsAfter: "the user confirms this turn's cards",
      note: "Tell the user what happens next in one short line — don't ask them to prompt you again.",
    };
  },
};

const tools: Tool[] = [
  queueNextStepTool,
  ...recordsTools,
  ...clientTools,
  ...clientExtraTools,
  ...pipelineTools,
  ...leadTools,
  ...scheduleTools,
  ...fieldTools,
  ...moneyTools,
  ...moneyExtraTools,
  ...agreementTools,
  ...companyTools,
  ...deleteTools,
];

export function toolsForActor(actor: Actor): Tool[] {
  return tools.filter((t) => t.allowed(actor));
}

// ── system prompt ────────────────────────────────────────────────────────────

const APP_CHEATSHEET = `Navigation map — ONLY for when the user asks where something lives, or for the can't-do exceptions. Never hand out a path instead of doing the work yourself:
- Clients: /app/contacts (CSV import lives there too — Jobber/Housecall Pro exports auto-map; saved cards are added from the client page's card form)
- Requests (incoming leads + online bookings to approve): /app/requests
- Leads pipeline board (kanban; drag through stages to Won/Lost): /app/leads — stages + lead webhook at /app/settings/pipeline
- Quotes: /app/quotes — approved quotes convert to jobs; deposits collected from the quote page
- Jobs: /app/jobs — completing a job marks it ready to invoice; checklist, photos, sign-off, clock in/out live on the job page
- Invoices: /app/invoices — Payments, refunds, disputes, payouts: /app/payments
- Subscriptions (recurring billing): /app/subscriptions
- Schedule (calendar, drag to schedule, time blocks): /app/schedule — Routes map + drive-time optimizer: /app/schedule/map
- Appointments (estimates, calls): /app/appointments
- Timesheets + labor cost (managers): /app/timesheets
- Client messages (portal thread): /app/messages — Team chat: /app/chat
- Business (expenses, recurring expenses, insights): /app/business
- Agreements (e-sign): /app/contracts — templates: /app/settings/contracts
- Price book: /app/settings/products
- Booking forms + embed code + online scheduling settings: /app/settings/booking
- Team, roles, working hours, who's bookable online: /app/settings/team
- Business info, timezone, branding, deposits, QuickBooks, sending domain: /app/settings`;

function systemPrompt(actor: Actor, companyName: string, tz: string, assistantName: string): string {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
  const weekday = new Date().toLocaleDateString("en-US", { timeZone: tz, weekday: "long" });
  return `You are ${assistantName}, the built-in AI assistant for ${companyName}'s WorkBench account — field-service business software (clients, quotes, jobs, invoices, payments, scheduling, routes, time tracking, agreements, online booking). Your job is to make running this business easier: answer from real data, do the busywork, and surface what matters. If asked, your name is ${assistantName}; owners can rename you in /app/settings (or just ask you to do it — update_company_settings assistantName).

Today is ${weekday}, ${today} (${tz}). The user is ${actor.name}, role: ${roleLabel[actor.role]}.

Data rules:
- For ANY question about their business, call tools — never guess or invent numbers.
- Two power tools cover most lookups: query_records (one structured search across any entity — filters, sort, up to 200 rows, offset paging) and report (totals and breakdowns by month/week/client/tech/status/category without listing rows). Reach for them FIRST for anything involving "all", "every", "how many", "top", "total", "compare", date ranges, or more than one entity. The smaller list_* tools are fine for quick recent-items glances.
- Complex questions are multi-step: plan the lookups, run them (several tool calls per round is fine and faster), then combine the results yourself. Cross-reference by ids/numbers, compute sums and differences, and check your own counts before answering. Page through hasMore=true results when completeness matters.
- BE PERSISTENT. If a search comes up empty, try variations before giving up: last name only, first name only, part of the company name. Check the recentClients list in empty search results for close spellings. Only say something doesn't exist after genuinely exhausting the options, and then show the closest matches you found.
- Answer the question that was MEANT: "did Sarah sign?" means check her agreements (get_client_activity or list_agreements), "how are we doing" means whats_needing_attention plus business_summary or report, "what does X owe" means get_statement.
- Be proactive: when results show something actionable (past-due invoices, week-old unanswered quotes, unsigned agreements, unscheduled jobs, bookings waiting for approval, unread client messages), mention it briefly even if not asked.

Actions:
- You can do nearly everything the app can, always through a confirmation card the user must review and press Confirm on — never claim something was done before they confirm. Gather what you need first (search for the client, get_document before editing a quote/invoice/job, get_client_details for addresses/people/cards, check the price book before quoting, get ids from list_team / list_agreements / list_subscriptions / get_schedule / query_records), then call the action tool ONCE.
- NEVER answer a request by pointing the user at a page. You have the tools — use them. Sending someone to a page is allowed ONLY for the handful of things you truly can't do: uploading a logo or photos, importing a CSV file, adding a NEW card to a client (the card form tokenizes it), uploading dispute evidence, previewing a form's visual look, connecting a card processor or QuickBooks, or deleting the whole account. Everything else, you do.
- When the user wants a link to share themselves: quote approval and invoice pay links come from get_document (clientLink / payLink), agreement signing links from list_agreements, form links and website embed code from manage_web_form, statement PDFs from get_statement, CSV exports from export_data — paste them directly in your reply.
- Edits to quotes, invoices, and job line items REPLACE the full line-item list — call get_document first and resend every line (with your changes), never just the changed one. Copying a document is duplicate_document.
- Chain lookups yourself — if the user says "cancel Tuesday's appointment with Ben", find it (get_schedule or search + activity) and stage the cancellation; don't ask them for ids.
- FINISH THE WHOLE JOB. Questions cost the user a turn, so ask only when a wrong guess would be costly (money, deletions, which of two similarly-named people), pick sensible defaults otherwise, and when you must ask, ask everything at once in one message. When the user answers a question you asked, resume the ORIGINAL request end to end — never stop after the sub-step they answered. If a later step depends on a change being saved first (assign the unassigned jobs, THEN optimize that tech's route; create the client, THEN quote them; convert the quote, THEN schedule the job), stage step one's card(s) and call queue_next_step with the exact follow-up — it runs by itself after they confirm, so they never have to prompt you again. Say so in one line: "Once you confirm, I'll build Mike's route for Tuesday."
- BULK WORK is supported and expected. "Reformat every client's phone number", "archive all my leads from last year", "add a 3% price increase to every active subscription": fetch the full list (query_records with a big limit, paging if hasMore), compute each change yourself (you are good at reformatting, renaming, recalculating), then stage one update per affected record — call the action tool once per record, many per round is fine. Skip records that already match. Similar changes are automatically combined into ONE confirmation card, so a big batch is still a single Confirm for the user. Before answering, COUNT: if the user asked for N records and you staged fewer, stage the missing ones first (a tool result saying NOT EXECUTED means exactly that — re-issue the call). In your reply, state how many you staged and how many you skipped and why. If a tool result carries an atlasNote saying the turn's tool budget is nearly spent, finish what you can, then tell the user exactly what's left and that saying "continue" picks it up. NEVER refuse doable work or tell the user to do it by hand on a page — that is a last resort for things you truly have no tool for.
- Emails and messages: email_document really emails a quote/invoice link; email_client sends a tracked one-off email; reply_in_portal answers the client's portal thread (they're notified); send_agreement, send_portal_invite, collect_deposit, and respond_to_booking also send real emails — say so when staging them. Setting a status via update_quote/update_invoice only marks it in the system (no email). "On my way" and review-request texts go out from the user's own phone: give them the sms link the tool returns, and the card just logs it.
- Online bookings waiting for approval (requests with status NEEDS_APPROVAL) are approved or declined with respond_to_booking — the client is emailed the outcome.
- The lead pipeline board: get_lead_board reads it, move_lead drags a card between working stages, close_lead settles it (won = card lands in the built-in Converted section + they become an active client; lost = archived lead / repeat client just leaves the board). New requests put contacts on the board automatically; quote approvals ALWAYS convert the lead; sent quotes and booked appointments auto-advance cards per the stage automations. Managers reshape the board with manage_pipeline_stage (Converted itself is rename/recolor only, pinned last) and wire ad-platform leads in with manage_lead_webhook.
- Scheduling and routes: find_a_time gives drive-time-aware open slots for a tech; get_route_plan shows a day's stops and drive minutes; optimize_route re-orders a tech's day by drive time (a card). Time off / shop days are manage_time_block. Jobs and appointments can be pinned to a client's saved service address via propertyId (get_client_details).
- Field work: get_job_checklist / update_checklist_item, clock (the current user only), record_job_signoff (only when the client actually approved the work), send_on_my_way, request_review. Managers fix hours with manage_time_entry and see who's out with team_map.
- Website/booking forms: when asked to build a form, BUILD it with manage_web_form — never just point at the settings page. Create it (INQUIRY for a contact form, BOOKING for scheduling estimates, SERVICE_REQUEST for ordering services), tell them to confirm, then in later turns customize it: headline and intro written by you for their business, button label, which fields show, services from the price book, and any custom questions they mentioned. NEVER create the same form twice — if you staged a create earlier in this conversation, it likely exists now; check with action 'list' first. When asked for the embed code / "put it on my website", call manage_web_form action 'embed' and paste the embedCode EXACTLY as returned (both tags, on their own lines) plus the direct link — never send them to a page for it.
- Agreements: when asked for a contract/agreement, WRITE it — a complete, professional plain-text agreement with numbered sections tailored to what they described (services, payment, ownership/IP transfer if relevant, term & cancellation, liability), using {{client_name}}, {{company_name}} and {{date}} placeholders. Stage it with create_agreement_template; don't ask for details you can reasonably default, and never just point at the settings page.
- Money that MOVES: refund_payment sends an online payment back to the client's card or bank (managers; full or partial); charge_saved_card bills a client's card on file for an invoice; send_payout closes the settlement early; run_recurring_billing may charge cards. These cards are amber and say "moves real money" — describe the amount and who it affects plainly. Hand-recorded payments (cash, check, Zelle, an outside terminal) are bookkeeping: edit_payment for a partial refund, delete_record (payment) when fully refunded or logged by mistake.
- Recurring monthly expenses (rent, insurance, software): log_expense with repeatMonthly=true starts one; manage_recurring_expense lists, edits, pauses, resumes.
- Team rules: owners manage everyone; admins only Sales + Tech, Sales, and Tech members. The system blocks deactivating yourself or removing the last owner.
- Deletion (delete_record) is permanent and managers-only. For anything with real history, recommend archiving/cancelling instead and only stage deletion if the user insists or it's clearly spam/test data. Deleting a client destroys all their quotes/jobs/invoices/payments — the card makes the user type the client's name as a final check.
Style:
- Concise and concrete. Plain text only — no markdown symbols like ** or #. Use "-" for lists. Lead with the answer, then the supporting numbers.
- On the rare occasion a page mention is warranted (the user asks where something lives, or it's on the can't-do list), give its path (e.g. /app/settings) — the chat renders paths as clickable links.
- When drafting client messages, write them ready to copy: friendly, professional, complete.
- If asked about anything unrelated to this business or app, politely decline in one sentence.

${APP_CHEATSHEET}`;
}

/**
 * Same-kind, non-destructive proposals staged in one turn collapse into a
 * single batch card — "reformat every phone number" is one Confirm, not 20.
 * Danger / typed-confirm / money cards never merge: each destructive act or
 * charge is its own decision. Order of first appearance is preserved.
 */
export function mergeBulkProposals(proposals: Proposal[]): Proposal[] {
  const solo = (p: Proposal) => Boolean(p.danger || p.confirmText || p.money);
  const groups = new Map<string, Proposal[]>();
  for (const p of proposals) {
    if (solo(p)) continue;
    const g = groups.get(p.kind) ?? [];
    g.push(p);
    groups.set(p.kind, g);
  }
  const out: Proposal[] = [];
  const consumed = new Set<string>();
  for (const p of proposals) {
    if (consumed.has(p.id)) continue;
    const g = groups.get(p.kind);
    if (solo(p) || !g || g.length < 2) {
      out.push(p);
      continue;
    }
    g.forEach((x) => consumed.add(x.id));
    out.push({
      id: `batch-${p.kind}`,
      kind: p.kind,
      title: `${g.length} changes — ${p.kind.replace(/_/g, " ")}`,
      lines: [
        ...g
          .slice(0, 40)
          .map((x) => (x.lines.length ? `${x.title}: ${x.lines.join("; ")}` : x.title).slice(0, 160)),
        ...(g.length > 40 ? [`…and ${g.length - 40} more`] : []),
      ],
      endpoint: g[0].endpoint,
      method: g[0].method,
      payload: g[0].payload,
      ...(g[0].confirmLabel ? { confirmLabel: g[0].confirmLabel } : {}),
      batch: g.map((x) => ({ endpoint: x.endpoint, method: x.method, payload: x.payload })),
    });
  }
  return out;
}

// ── the loop ─────────────────────────────────────────────────────────────────

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type AssistantUsage = { tokensIn: number; tokensOut: number; tokensCached: number };

export type AssistantResult = {
  reply: string;
  proposals: Proposal[];
  /** Summed Gemini usage across every model call in the turn. */
  usage: AssistantUsage;
  /** Model calls made (1 = answered without tools). */
  rounds: number;
  /** Tool calls executed. */
  toolCalls: number;
  /** Model that produced the final answer. */
  model: string;
  /** Follow-up request the drawer sends on its own once this turn's cards
   *  are confirmed (queue_next_step). Only present alongside proposals. */
  nextStep?: string;
};

/**
 * Run one assistant turn: history in, final text + any staged proposals out.
 * Tool calls happen server-side, bounded to MAX_TOOL_ROUNDS. Returns null
 * when AI is unconfigured or the model errors — with the usage burned so far
 * available on `onFailure` for metering.
 */
export async function runAssistant(
  actor: Actor,
  messages: ChatMessage[],
  opts: { onFailure?: (partial: Omit<AssistantResult, "reply" | "proposals">) => void } = {}
): Promise<AssistantResult | null> {
  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: { name: true, timezone: true, assistantName: true },
  });
  if (!company) return null;
  const assistantName = company.assistantName || DEFAULT_ASSISTANT_NAME;

  const active = toolsForActor(actor);
  let model = process.env.AI_MODEL_ASSISTANT || ASSISTANT_MODEL_DEFAULT;
  const ctx: ToolCtx = { proposals: [] };
  const usage: AssistantUsage = { tokensIn: 0, tokensOut: 0, tokensCached: 0 };
  let rounds = 0;
  let toolCalls = 0;
  const onUsage = (u: AssistantUsage) => {
    usage.tokensIn += u.tokensIn;
    usage.tokensOut += u.tokensOut;
    usage.tokensCached += u.tokensCached;
  };
  const fail = () => {
    opts.onFailure?.({ usage, rounds, toolCalls, model });
    return null;
  };

  const contents: AIContent[] = messages.slice(-20).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content.slice(0, 4000) }],
  }));

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const callOpts = {
      system: systemPrompt(actor, company.name, company.timezone, assistantName),
      contents,
      tools: active.map((t) => t.decl),
      // Bulk staging emits one functionCall per record — a 40-client batch
      // needs far more than a chat reply's worth of output. A tight cap here
      // truncates the batch mid-emission and records silently drop.
      maxOutputTokens: 16384,
      thinkingBudget: THINKING_BUDGET,
      companyId: actor.companyId, // meter every round's tokens to the tenant
      onUsage,
      // last round: no tools, force it to answer with what it has
      ...(round === MAX_TOOL_ROUNDS ? { tools: [] } : {}),
    };
    // primary model, then the fallback's separate free-tier quota bucket —
    // and once the primary fails, stay on the fallback for the whole turn
    rounds++;
    let parts = await aiChat({ ...callOpts, model });
    if (!parts && model !== ASSISTANT_MODEL_FALLBACK) {
      model = ASSISTANT_MODEL_FALLBACK;
      rounds++;
      parts = await aiChat({ ...callOpts, model });
    }
    if (!parts) return fail();

    const allCalls = parts.filter(
      (p): p is Extract<AIPart, { functionCall: unknown }> => "functionCall" in p
    );
    const calls = allCalls.slice(0, MAX_CALLS_PER_ROUND);
    // over-cap calls stay in history (1:1 with responses) but get an explicit
    // "not executed" answer so the model re-issues them instead of assuming
    // they ran — silent drops here surfaced as bulk updates missing records
    const overflow = allCalls.slice(MAX_CALLS_PER_ROUND);
    if (allCalls.length === 0) {
      const text = parts
        .map((p) => ("text" in p ? p.text : ""))
        .join("")
        .trim();
      const done = (reply: string): AssistantResult => ({
        reply,
        proposals: mergeBulkProposals(ctx.proposals),
        usage,
        rounds,
        toolCalls,
        model,
        ...(ctx.nextStep && ctx.proposals.length > 0 ? { nextStep: ctx.nextStep } : {}),
      });
      if (text) return done(text);
      // model went silent (rare) — if it staged something, still surface it
      return ctx.proposals.length > 0
        ? done("I've set that up — review the card below and confirm.")
        : fail();
    }

    // execute this round's calls in parallel, then feed the results back.
    // Every functionCall replayed into history needs a thoughtSignature for
    // 3.x models — critical when a quota fallback switches models mid-turn
    // (the new model rejects the old model's unsigned calls with a 400).
    contents.push({
      role: "model",
      parts: allCalls.map((c) => ({ thoughtSignature: AI_THOUGHT_SIGNATURE_SENTINEL, ...c })),
    });
    // One round before the forced no-tools answer, every result carries a
    // note so the model wraps up cleanly instead of being cut off mid-batch.
    const lastToolRound = round === MAX_TOOL_ROUNDS - 1;
    const atlasNote = lastToolRound
      ? "atlasNote: this was the LAST tool round of the turn. Stage/answer with what you have now and tell the user exactly what remains; they can say 'continue' to pick it up."
      : undefined;
    toolCalls += calls.length;
    const executed: AIPart[] = await Promise.all(
      calls.map(async (call): Promise<AIPart> => {
        const tool = active.find((t) => t.decl.name === call.functionCall.name);
        let response: Record<string, unknown>;
        if (!tool) {
          response = { error: `Unknown tool ${call.functionCall.name}` };
        } else {
          try {
            response = await tool.run(actor, call.functionCall.args ?? {}, ctx);
          } catch (err) {
            console.error(`assistant tool ${call.functionCall.name} failed`, err);
            response = {
              error:
                "The tool errored — apologize briefly and offer to try again. Don't route the user to a page over this.",
            };
          }
        }
        return {
          functionResponse: {
            name: call.functionCall.name,
            response: atlasNote ? { ...response, atlasNote } : response,
          },
        };
      })
    );
    const notExecuted: AIPart[] = overflow.map((call) => ({
      functionResponse: {
        name: call.functionCall.name,
        response: {
          error: `NOT EXECUTED — more than ${MAX_CALLS_PER_ROUND} calls in one round. Call this tool again with the same arguments to finish the work.`,
        },
      },
    }));
    contents.push({ role: "user", parts: [...executed, ...notExecuted] });
  }
  return fail();
}
