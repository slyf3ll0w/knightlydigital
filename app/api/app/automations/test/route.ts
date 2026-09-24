import { NextRequest, NextResponse } from "next/server";
import { getActor, isManager } from "@/lib/permissions";
import { compileAutomation, describeAutomation } from "@/lib/automations";
import { previewAutomation } from "@/lib/automations-server";

/**
 * POST { spec } — the builder's Test button. A DRY RUN: compiles the spec,
 * finds the records the trigger would have matched over the last 30 days,
 * evaluates the leading filter against each, and renders what every step
 * would have done for up to three of them. Nothing is sent or written.
 * Managers only.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const c = compileAutomation(body.spec);
  if (!c.ok) return NextResponse.json({ compiles: false, errors: c.errors, warnings: [] });
  const preview = await previewAutomation(actor.companyId, c.compiled);
  const { warnings, ...rest } = preview;
  return NextResponse.json({ compiles: true, summary: describeAutomation(c.compiled.spec), preview: rest, warnings });
}
