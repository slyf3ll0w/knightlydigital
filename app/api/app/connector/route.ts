import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { connectorUrl, revokeGrant } from "@/lib/connector/oauth";
import { toolTitle } from "@/lib/connector/tools";

/**
 * Settings → Connected apps (docs/plans/workbench-connector-2026-11-17.md).
 *
 * GET    — the company's connections, the cards waiting for THIS person's
 *          approval, the owner's switch, and the address to paste into an AI app.
 * PATCH  — { connectorsOff } the company-wide switch. Owner only.
 * DELETE — ?grant=<id> ends one connection. Owners and admins.
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [company, grants, actions, calls] = await Promise.all([
    prisma.company.findUnique({ where: { id: actor.companyId }, select: { connectorsOff: true } }),
    prisma.connectorGrant.findMany({
      where: { companyId: actor.companyId, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, clientName: true, createdAt: true, lastUsedAt: true, userId: true, user: { select: { name: true } } },
    }),
    prisma.connectorAction.findMany({
      where: { userId: actor.id, companyId: actor.companyId, status: "pending" },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: { id: true, proposal: true, createdAt: true, grant: { select: { clientName: true } } },
    }),
    prisma.connectorCall.findMany({
      where: { companyId: actor.companyId },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { id: true, tool: true, outcome: true, createdAt: true, grant: { select: { clientName: true, user: { select: { name: true } } } } },
    }),
  ]);
  return NextResponse.json({
    url: connectorUrl(),
    off: company?.connectorsOff ?? false,
    owner: actor.role === "OWNER",
    grants: grants.map((g) => ({ id: g.id, app: g.clientName, by: g.user.name, mine: g.userId === actor.id, createdAt: g.createdAt.toISOString(), lastUsedAt: g.lastUsedAt?.toISOString() ?? null })),
    actions: actions.map((a) => ({ id: a.id, app: a.grant.clientName, createdAt: a.createdAt.toISOString(), proposal: a.proposal })),
    activity: calls.map((c) => ({ id: c.id, app: c.grant.clientName, by: c.grant.user.name, what: toolTitle(c.tool), outcome: c.outcome, at: c.createdAt.toISOString() })),
  });
}

export async function PATCH(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.role !== "OWNER") return NextResponse.json({ error: "Only the owner can turn connected apps on or off." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { connectorsOff?: unknown };
  if (typeof body.connectorsOff !== "boolean") return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  await prisma.company.update({ where: { id: actor.companyId }, data: { connectorsOff: body.connectorsOff } });
  return NextResponse.json({ ok: true, off: body.connectorsOff });
}

export async function DELETE(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("grant") ?? "";
  const grant = await prisma.connectorGrant.findFirst({ where: { id, companyId: actor.companyId }, select: { id: true } });
  if (!grant) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await revokeGrant(grant.id);
  return NextResponse.json({ ok: true });
}
