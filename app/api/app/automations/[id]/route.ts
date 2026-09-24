import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { compileAutomation, specFromJson } from "@/lib/automations";
import { AUTOMATION_SELECT, automationShape as shape, cancelAutomationJobs, mintWebhookToken } from "@/lib/automations-server";

async function load(id: string, companyId: string) {
  return prisma.automation.findFirst({ where: { id, companyId }, select: AUTOMATION_SELECT });
}

/** GET — the rule, its last 50 runs, and (webhook triggers) its URL. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const row = await load(id, actor.companyId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [runs, waiting] = await Promise.all([
    prisma.automationRun.findMany({ where: { automationId: row.id, NOT: { status: "skipped", detail: "conditions not met" } }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.automationJob.count({ where: { automationId: row.id, status: "waiting" } }),
  ]);
  return NextResponse.json({ ...shape(row), recentRuns: runs, waiting });
}

/**
 * PATCH — { name?, description?, isActive?, spec? }; a new spec replaces the
 * old whole. Pausing cancels runs parked at a wait step (they'd otherwise
 * wake up and act for a rule the owner switched off).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const row = await load(id, actor.companyId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const data: { name?: string; description?: string | null; isActive?: boolean; spec?: object; webhookToken?: string | null } = {};
  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, 80);
    if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
    if (name.toLowerCase() !== row.name.toLowerCase()) {
      const dup = await prisma.automation.findFirst({ where: { companyId: actor.companyId, name: { equals: name, mode: "insensitive" }, NOT: { id: row.id } }, select: { id: true } });
      if (dup) return NextResponse.json({ error: `An automation named "${name}" already exists.` }, { status: 409 });
    }
    data.name = name;
  }
  if (typeof body.description === "string" || body.description === null) data.description = typeof body.description === "string" ? body.description.trim().slice(0, 200) || null : null;
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;
  let specChanged = false;
  if (body.spec !== undefined) {
    const c = compileAutomation(body.spec);
    if (!c.ok) return NextResponse.json({ error: c.errors.join(" "), errors: c.errors }, { status: 400 });
    data.spec = c.compiled.spec;
    specChanged = JSON.stringify(c.compiled.spec) !== JSON.stringify(specFromJson(row.spec));
    if (c.compiled.spec.trigger.event === "webhook.received") {
      if (!row.webhookToken) data.webhookToken = mintWebhookToken();
    }
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  const updated = await prisma.automation.update({ where: { id: row.id }, data, select: AUTOMATION_SELECT });
  // A paused rule, or one whose steps changed, must not wake parked runs
  // into the old plan
  if (data.isActive === false || specChanged) await cancelAutomationJobs(row.id, data.isActive === false ? "the rule was paused" : "the rule changed");
  return NextResponse.json(shape(updated));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const row = await load(id, actor.companyId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await cancelAutomationJobs(row.id);
  await prisma.automation.delete({ where: { id: row.id } }); // runs + jobs cascade
  return NextResponse.json({ ok: true });
}
