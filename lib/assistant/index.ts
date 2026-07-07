import { prisma } from "../db";
import { type Actor, roleLabel } from "../permissions";
import {
  aiChat,
  AI_THOUGHT_SIGNATURE_SENTINEL,
  type AIContent,
  type AIPart,
} from "../ai";
import { type Proposal, type Tool, type ToolCtx } from "./core";
import { clientTools } from "./clients";
import { pipelineTools } from "./pipeline";
import { scheduleTools } from "./schedule";
import { moneyTools } from "./money";
import { agreementTools } from "./agreements";
import { companyTools } from "./company";
import { deleteTools } from "./deletes";

export type { Proposal, BatchItem, Tool, ToolCtx } from "./core";

/**
 * Owner assistant (docs/plans/ai-assistant-plan.md).
 *
 * The registry lives in per-domain modules (clients, pipeline, schedule,
 * money, agreements, company, deletes) sharing the plumbing in core.ts.
 *
 * Reads happen through the tool registry — every tool is gated by the
 * same capability checks the pages use and scoped by the same Prisma scopes,
 * so the assistant can only read what the signed-in user could see by
 * clicking around.
 *
 * Writes NEVER happen here. Action tools stage a Proposal that the drawer
 * renders as a confirmation card; clicking Confirm submits to the SAME
 * existing API route the equivalent button uses (which re-validates role and
 * ownership server-side). Declined cards simply never submit.
 *
 * Results are deliberately small (top-N, minimal fields) — they land in the
 * model's context, so a chatty tool is a token bill and a distraction.
 */

const MAX_TOOL_ROUNDS = 8;
// Tool calls executed per round. Bulk staging (one update card per record)
// leans on this. Overflow calls are NOT silently dropped — they get an
// error response telling the model to re-issue them next round.
const MAX_CALLS_PER_ROUND = 16;
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

const tools: Tool[] = [
  ...clientTools,
  ...pipelineTools,
  ...scheduleTools,
  ...moneyTools,
  ...agreementTools,
  ...companyTools,
  ...deleteTools,
];

export function toolsForActor(actor: Actor): Tool[] {
  return tools.filter((t) => t.allowed(actor));
}

// ── system prompt ────────────────────────────────────────────────────────────

const APP_CHEATSHEET = `Where things live in the app (always give these as paths, e.g. /app/contacts — the chat renders them as links):
- Clients: /app/contacts (CSV import lives there too — Jobber/Housecall Pro exports auto-map)
- Requests (incoming leads + online bookings to approve): /app/requests
- Quotes: /app/quotes — approved quotes convert to jobs; deposits collected from the quote page
- Jobs: /app/jobs — completing a job marks it ready to invoice
- Invoices & payments: /app/invoices
- Subscriptions (recurring billing): /app/subscriptions
- Schedule (calendar, drag to schedule): /app/schedule
- Insights (charts): /app/insights
- Price book: /app/settings/products
- Booking forms + embed code + online scheduling settings: /app/settings/booking
- Contract templates (e-sign agreements): /app/settings/contracts
- Team, roles, who's bookable online: /app/settings/team
- Business info, timezone, branding, deposits: /app/settings
- AI setup assistant (re-runnable): /app/setup`;

function systemPrompt(actor: Actor, companyName: string, tz: string, assistantName: string): string {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
  const weekday = new Date().toLocaleDateString("en-US", { timeZone: tz, weekday: "long" });
  return `You are ${assistantName}, the built-in AI assistant for ${companyName}'s Streamflaire Hub account — field-service business software (clients, quotes, jobs, invoices, scheduling, agreements, online booking). Your job is to make running this business easier: answer from real data, do the busywork, and surface what matters. If asked, your name is ${assistantName}; owners can rename you in /app/settings (or just ask you to do it — update_company_settings assistantName).

Today is ${weekday}, ${today} (${tz}). The user is ${actor.name}, role: ${roleLabel[actor.role]}.

Data rules:
- For ANY question about their business, call tools — never guess or invent numbers.
- BE PERSISTENT. If a search comes up empty, try variations before giving up: last name only, first name only, part of the company name. Check the recentClients list in empty search results for close spellings. Only say something doesn't exist after genuinely exhausting the options, and then show the closest matches you found.
- Answer the question that was MEANT: "did Sarah sign?" means check her agreements (get_client_activity or list_agreements), "how are we doing" means whats_needing_attention plus business_summary.
- Be proactive: when results show something actionable (past-due invoices, week-old unanswered quotes, unsigned agreements, unscheduled jobs, bookings waiting for approval), mention it briefly even if not asked.

Actions:
- You can do nearly everything the app can, always through a confirmation card the user must review and press Confirm on — never claim something was done before they confirm. Gather what you need first (search for the client, get_document before editing a quote/invoice/job, check the price book before quoting, get ids from list_team / list_agreements / list_subscriptions / get_schedule), then call the action tool ONCE.
- Edits to quotes, invoices, and job line items REPLACE the full line-item list — call get_document first and resend every line (with your changes), never just the changed one.
- Chain lookups yourself — if the user says "cancel Tuesday's appointment with Ben", find it (get_schedule or search + activity) and stage the cancellation; don't ask them for ids.
- BULK WORK is supported and expected. "Reformat every client's phone number", "archive all my leads from last year": fetch the full list (list_clients etc.), compute each change yourself (you are good at reformatting, renaming, recalculating), then stage one update per affected record — call the action tool once per record, several per round is fine. Skip records that already match. Similar changes are automatically combined into ONE confirmation card, so a big batch is still a single Confirm for the user. Before answering, COUNT: if the user asked for N records and you staged fewer, stage the missing ones first (a tool result saying NOT EXECUTED means exactly that — re-issue the call). In your reply, state how many you staged and how many you skipped and why. NEVER refuse doable work or tell the user to do it by hand on a page — that is a last resort for things you truly have no tool for.
- Emails: email_document really emails a quote/invoice link to the client; send_agreement, send_portal_invite, collect_deposit, and respond_to_booking also send real emails — say so when staging them. Setting a status via update_quote/update_invoice only marks it in the system (no email).
- Online bookings waiting for approval (requests with status NEEDS_APPROVAL) are approved or declined with respond_to_booking — the client is emailed the outcome.
- Website/booking forms: when asked to build a form, BUILD it with manage_web_form — never just point at the settings page. Create it (INQUIRY for a contact form, BOOKING for scheduling estimates, SERVICE_REQUEST for ordering services), tell them to confirm, then in your NEXT turn customize it: headline and intro written by you for their business, button label, which fields show, services from the price book, and any custom questions they mentioned. After it's built, mention the embed code and visual polish live at /app/settings/booking.
- Agreements: when asked for a contract/agreement, WRITE it — a complete, professional plain-text agreement with numbered sections tailored to what they described (services, payment, ownership/IP transfer if relevant, term & cancellation, liability), using {{client_name}}, {{company_name}} and {{date}} placeholders. Stage it with create_agreement_template; don't ask for details you can reasonably default, and never just point at the settings page.
- Refunds are bookkeeping here (no card processor yet): the money goes back to the client outside the app, then you correct the books — edit_payment for a partial refund, delete_record (payment) when fully refunded or logged by mistake. Owners/admins only.
- Team rules: owners manage everyone; admins only Sales + Tech, Sales, and Tech members. The system blocks deactivating yourself or removing the last owner.
- Deletion (delete_record) is permanent and managers-only. For anything with real history, recommend archiving/cancelling instead and only stage deletion if the user insists or it's clearly spam/test data. Deleting a client destroys all their quotes/jobs/invoices/payments — the card makes the user type the client's name as a final check.
- The few things you can't stage: uploading a logo or photos, importing a CSV. Point them to the right page path from the list below.

Style:
- Concise and concrete. Plain text only — no markdown symbols like ** or #. Use "-" for lists.
- Refer to app pages by path (e.g. /app/invoices) — the chat renders paths as clickable links.
- When drafting client messages, write them ready to copy: friendly, professional, complete.
- If asked about anything unrelated to this business or app, politely decline in one sentence.

${APP_CHEATSHEET}`;
}

/**
 * Same-kind, non-destructive proposals staged in one turn collapse into a
 * single batch card — "reformat every phone number" is one Confirm, not 20.
 * Danger/typed-confirm cards never merge: each destructive act is its own
 * decision. Order of first appearance is preserved.
 */
export function mergeBulkProposals(proposals: Proposal[]): Proposal[] {
  const groups = new Map<string, Proposal[]>();
  for (const p of proposals) {
    if (p.danger || p.confirmText) continue;
    const g = groups.get(p.kind) ?? [];
    g.push(p);
    groups.set(p.kind, g);
  }
  const out: Proposal[] = [];
  const consumed = new Set<string>();
  for (const p of proposals) {
    if (consumed.has(p.id)) continue;
    const g = groups.get(p.kind);
    if (p.danger || p.confirmText || !g || g.length < 2) {
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
          .slice(0, 20)
          .map((x) => (x.lines.length ? `${x.title}: ${x.lines.join("; ")}` : x.title).slice(0, 140)),
        ...(g.length > 20 ? [`…and ${g.length - 20} more`] : []),
      ],
      endpoint: g[0].endpoint,
      method: g[0].method,
      payload: g[0].payload,
      batch: g.map((x) => ({ endpoint: x.endpoint, method: x.method, payload: x.payload })),
    });
  }
  return out;
}

// ── the loop ─────────────────────────────────────────────────────────────────

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type AssistantResult = { reply: string; proposals: Proposal[] };

/**
 * Run one assistant turn: history in, final text + any staged proposals out.
 * Tool calls happen server-side, bounded to MAX_TOOL_ROUNDS. Returns null
 * when AI is unconfigured or the model errors.
 */
export async function runAssistant(
  actor: Actor,
  messages: ChatMessage[]
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

  const contents: AIContent[] = messages.slice(-20).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content.slice(0, 4000) }],
  }));

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const opts = {
      system: systemPrompt(actor, company.name, company.timezone, assistantName),
      contents,
      tools: active.map((t) => t.decl),
      // Bulk staging emits one functionCall per record — a 20-client batch
      // needs far more than a chat reply's worth of output. A tight cap here
      // truncates the batch mid-emission and records silently drop.
      maxOutputTokens: 8192,
      thinkingBudget: 0, // chat latency beats marginal quality here
      // last round: no tools, force it to answer with what it has
      ...(round === MAX_TOOL_ROUNDS ? { tools: [] } : {}),
    };
    // primary model, then the fallback's separate free-tier quota bucket —
    // and once the primary fails, stay on the fallback for the whole turn
    let parts = await aiChat({ ...opts, model });
    if (!parts && model !== ASSISTANT_MODEL_FALLBACK) {
      model = ASSISTANT_MODEL_FALLBACK;
      parts = await aiChat({ ...opts, model });
    }
    if (!parts) return null;

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
      if (text) return { reply: text, proposals: mergeBulkProposals(ctx.proposals) };
      // model went silent (rare) — if it staged something, still surface it
      return ctx.proposals.length > 0
        ? {
            reply: "I've set that up — review the card below and confirm.",
            proposals: mergeBulkProposals(ctx.proposals),
          }
        : null;
    }

    // execute this round's calls in parallel, then feed the results back.
    // Every functionCall replayed into history needs a thoughtSignature for
    // 3.x models — critical when a quota fallback switches models mid-turn
    // (the new model rejects the old model's unsigned calls with a 400).
    contents.push({
      role: "model",
      parts: allCalls.map((c) => ({ thoughtSignature: AI_THOUGHT_SIGNATURE_SENTINEL, ...c })),
    });
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
            response = { error: "The lookup failed — suggest the user check the page directly." };
          }
        }
        return { functionResponse: { name: call.functionCall.name, response } };
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
  return null;
}
