/**
 * The Workbench connector: the endpoint's logic (app/api/mcp/route.ts is the
 * thin HTTP shell; docs/plans/workbench-connector-2026-11-17.md is the plan).
 *
 * Speaks the Model Context Protocol over plain JSON-RPC, tools only, no
 * sessions and no streams — each request is answered with one JSON object.
 * Serves both eras of the protocol on the one address:
 *   - newer clients (2026-07-28): every request carries its version; they
 *     may ask `server/discover` first;
 *   - older clients (2025-03-26 … 2025-11-25): they open with `initialize`.
 *
 * A tool call runs the SAME tool Atlas runs, as the person who approved the
 * connection. A read returns its data (password-like links removed). A tool
 * that would change something returns nothing but "waiting for approval":
 * its card is stored and the person confirms it inside Workbench.
 */
import { prisma } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { limit } from "@/lib/rate-limit";
import { notifyUsers } from "@/lib/push";
import { ATLAS_ACCESS_SELECT, atlasAccess } from "@/lib/assistant-access";
import { mergeBulkProposals, toolsForActor, type Proposal, type ToolCtx } from "@/lib/assistant";
import type { ConnectorCaller } from "./oauth";
import { issuer } from "./oauth";
import { connectorInstructions, connectorMode, connectorTools, scrubResult, toolListing } from "./tools";

export const MODERN_VERSIONS = ["2026-07-28"];
export const LEGACY_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
const SERVER_INFO = { name: "Workbench", version: "1.0.0" };
const META_VERSION = "io.modelcontextprotocol/protocolVersion";
const META_SERVER = "io.modelcontextprotocol/serverInfo";
/** Cards one person can have waiting at a time — an outside AI in a loop must not bury them. */
const MAX_PENDING = 30;

export type RpcRequest = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
export type RpcReply = { status: number; body: Record<string, unknown> | null };

const ok = (id: unknown, result: Record<string, unknown>, status = 200): RpcReply => ({ status, body: { jsonrpc: "2.0", id, result } });
const fail = (id: unknown, code: number, message: string, status: number, data?: unknown): RpcReply => ({ status, body: { jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data !== undefined ? { data } : {}) } } });

/** Where the person approves what an outside AI prepared. */
export const approvalUrl = () => `${issuer()}/app/settings/connected-apps`;

/**
 * One JSON-RPC message from a connected app. `headerVersion` is the
 * MCP-Protocol-Version header (may be absent on older clients).
 */
export async function handleRpc(caller: ConnectorCaller, msg: RpcRequest, headerVersion: string | null): Promise<RpcReply> {
  const id = msg.id;
  const method = typeof msg.method === "string" ? msg.method : "";
  if (msg.jsonrpc !== "2.0" || !method) return fail(id, -32600, "Invalid request", 400);
  // a notification (no id) is acknowledged and nothing more
  if (id === undefined || id === null) return { status: 202, body: null };

  const params = msg.params && typeof msg.params === "object" && !Array.isArray(msg.params) ? (msg.params as Record<string, unknown>) : {};
  const meta = params._meta && typeof params._meta === "object" ? (params._meta as Record<string, unknown>) : {};
  const bodyVersion = typeof meta[META_VERSION] === "string" ? (meta[META_VERSION] as string) : null;
  const modern = bodyVersion !== null;
  if (modern) {
    if (headerVersion && headerVersion !== bodyVersion) return fail(id, -32020, `Header mismatch: MCP-Protocol-Version header '${headerVersion}' does not match body value '${bodyVersion}'`, 400);
    if (!MODERN_VERSIONS.includes(bodyVersion)) return fail(id, -32022, "Unsupported protocol version", 400, { supported: MODERN_VERSIONS, requested: bodyVersion });
  }
  /** Results in the shape the client's era expects. */
  const done = (result: Record<string, unknown>) => ok(id, modern ? { resultType: "complete", ...result, _meta: { [META_SERVER]: SERVER_INFO } } : result);

  const company = await prisma.company.findUnique({ where: { id: caller.actor.companyId }, select: { name: true, timezone: true, ...ATLAS_ACCESS_SELECT } });
  if (!company) return fail(id, -32603, "This Workbench company no longer exists.", 200);
  const instructions = connectorInstructions(company.name, caller.actor.name, company.timezone);
  const tools = connectorTools(toolsForActor(caller.actor));

  switch (method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      return ok(id, { protocolVersion: LEGACY_VERSIONS.includes(asked) ? asked : LEGACY_VERSIONS[0], capabilities: { tools: {} }, serverInfo: SERVER_INFO, instructions });
    }
    case "ping":
      return ok(id, {});
    case "server/discover":
      return done({ supportedVersions: MODERN_VERSIONS, capabilities: { tools: {} }, instructions, ttlMs: 3_600_000, cacheScope: "private" });
    case "tools/list":
      return done({ tools: tools.map(toolListing), ...(modern ? { ttlMs: 300_000, cacheScope: "private" } : {}) });
    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      const args = params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments) ? (params.arguments as Record<string, unknown>) : {};
      const tool = tools.find((t) => t.decl.name === name);
      if (!tool) return fail(id, -32602, `Unknown tool: ${name}`, 200);
      const text = (value: Record<string, unknown>, isError = false) => done({ content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value, isError });

      // Atlas switched off for the account switches this off too; a spent token balance does not (nothing here runs a model)
      if (atlasAccess(company).level === "off") return text({ error: "The AI assistant isn't included on this Workbench account, so connected apps are off too." }, true);
      const burst = await limit(`connector:${caller.grantId}`, 240, 10 * 60_000);
      if (!burst.ok) return text({ error: "Too many requests from this app — wait a few minutes." }, true);

      const ctx: ToolCtx = { proposals: [] };
      let result: Record<string, unknown>;
      try {
        result = await tool.run(caller.actor, args, ctx);
      } catch (err) {
        reportError(`connector tool ${name} failed`, err);
        logCall(caller, name, "error");
        return text({ error: "That didn't work on Workbench's side. Try again in a moment." }, true);
      }
      const mode = connectorMode(name);
      const proposals = mergeBulkProposals(ctx.proposals);
      if (proposals.length === 0) {
        logCall(caller, name, typeof result.error === "string" ? "error" : "read");
        return text(scrubResult(result), typeof result.error === "string");
      }
      // a read tool must never stage anything; if one ever does, it does not get through
      if (mode !== "prepare") {
        reportError(`connector: read tool ${name} staged a card`, new Error(name));
        return text({ error: "That can't be done from a connected app." }, true);
      }
      logCall(caller, name, "prepared");
      return text(await holdForApproval(caller, proposals));
    }
    default:
      return fail(id, -32601, `Method not found: ${method}`, modern ? 404 : 200);
  }
}

/**
 * The activity list on Settings → Connected apps: which tool an app used and
 * when. Tool names only — never the arguments or what came back. Best
 * effort; rows older than 90 days are cleared as new ones arrive.
 */
function logCall(caller: ConnectorCaller, tool: string, outcome: "read" | "prepared" | "error"): void {
  void prisma.connectorCall
    .create({ data: { companyId: caller.actor.companyId, userId: caller.actor.id, grantId: caller.grantId, tool, outcome } })
    .then(() => (Math.random() < 0.02 ? prisma.connectorCall.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 90 * 86_400_000) } } }) : null))
    .catch(() => {});
}

/** Store the cards a tool staged and tell the outside AI, in plain words, that nothing has happened yet. */
async function holdForApproval(caller: ConnectorCaller, proposals: Proposal[]): Promise<Record<string, unknown>> {
  const waiting = await prisma.connectorAction.count({ where: { userId: caller.actor.id, status: "pending" } });
  if (waiting + proposals.length > MAX_PENDING) {
    return { status: "not_prepared", message: `${caller.actor.name} already has ${waiting} things waiting for approval in Workbench. Ask them to approve or dismiss those first.`, approveAt: approvalUrl() };
  }
  await prisma.connectorAction.createMany({
    data: proposals.map((p) => ({ companyId: caller.actor.companyId, userId: caller.actor.id, grantId: caller.grantId, proposal: JSON.parse(JSON.stringify(p)) })),
  });
  void notifyUsers(
    [caller.actor.id],
    { title: `${caller.clientName} prepared ${proposals.length === 1 ? "something" : `${proposals.length} things`} for you`, body: proposals[0].title, url: "/app/settings/connected-apps", tag: "connector-approval" },
    { record: true }
  ).catch(() => {});
  return {
    status: "waiting_for_approval",
    message: `Nothing has been saved, sent or charged. ${caller.actor.name} must approve ${proposals.length === 1 ? "this" : "these"} in Workbench first.`,
    approveAt: approvalUrl(),
    prepared: proposals.map((p) => ({ what: p.title, details: p.lines.slice(0, 12) })),
  };
}
