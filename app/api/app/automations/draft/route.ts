import { NextRequest, NextResponse } from "next/server";
import { getActor, isManager } from "@/lib/permissions";
import { describeAutomation, specFromJson, type AutomationSpec } from "@/lib/automations";
import { draftAutomation, loadDraftFacts } from "@/lib/automations-draft";

export const dynamic = "force-dynamic";

/**
 * POST { prompt, current?: { name, description, spec } } — Atlas drafts an
 * automation from a sentence (lib/automations-draft.ts). Managers only;
 * metered like any Atlas call. Answers { name, description, spec, summary,
 * notes, atlasTokens, access }; nothing is saved — the builder page loads the
 * spec into its cards and the owner presses Save (POST /api/app/automations).
 * A model failure is 424 (Cloudflare would swallow a 502/504 body).
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  if (prompt.trim().length < 8) return NextResponse.json({ error: "Describe the rule in a sentence first." }, { status: 400 });

  let current: { name: string; description: string | null; spec: AutomationSpec | null } | null = null;
  if (body.current && typeof body.current === "object") {
    const c = body.current as Record<string, unknown>;
    current = {
      name: typeof c.name === "string" ? c.name.trim().slice(0, 80) : "",
      description: typeof c.description === "string" ? c.description.trim().slice(0, 200) : null,
      // a half-built rule on screen may not compile yet — pass what does, the prompt carries the rest
      spec: c.spec ? specFromJson(c.spec) : null,
    };
  }

  const facts = await loadDraftFacts(actor.companyId);
  const res = await draftAutomation(actor, { prompt, current, company: facts });
  if (!res.ok) {
    return NextResponse.json({ error: res.error, ...(res.errors ? { errors: res.errors } : {}), ...(res.atlasLocked ? { atlasLocked: true } : {}) }, { status: res.status });
  }
  return NextResponse.json({
    name: res.name,
    description: res.description,
    spec: res.spec,
    summary: describeAutomation(res.spec),
    notes: res.notes,
    atlasTokens: res.atlasTokens,
    access: res.access,
  });
}
