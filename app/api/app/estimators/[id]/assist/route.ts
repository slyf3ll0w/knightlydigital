import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell } from "@/lib/permissions";
import { coerceInputs, specFromJson, type EstimatorSpec } from "@/lib/estimator";
import { meteredOneShot, oneShotJson } from "@/lib/atlas-oneshot";

/**
 * POST { description } — the METERED half of an estimate tool. The user
 * describes the job in words; Atlas reads the tool's inputs and fills in
 * what the description supports. Only tools whose spec opted into `assist`
 * accept this. The compute that follows is the free /run route — this call
 * only proposes input values, which the user sees and can change.
 */

function inputsPrompt(spec: EstimatorSpec): string {
  return spec.inputs
    .map((i) => {
      const base = `- ${i.id} (${i.type}): ${i.label}${i.help ? ` — ${i.help}` : ""}`;
      if (i.type === "number") return `${base}${i.unit ? ` [${i.unit}]` : ""}${i.min !== undefined ? ` min ${i.min}` : ""}${i.max !== undefined ? ` max ${i.max}` : ""}`;
      if (i.type === "select") return `${base}. One of: ${i.options.map((o) => `"${o.value}" (${o.label})`).join(", ")}`;
      if (i.type === "toggle") return `${base}. true/false`;
      return `${base}. Free text`;
    })
    .join("\n");
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const row = await prisma.estimator.findFirst({
    where: { id, companyId: actor.companyId, isActive: true },
    select: { id: true, name: true, spec: true },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const spec = specFromJson(row.spec);
  if (!spec) return NextResponse.json({ error: "This tool's saved rules no longer compile." }, { status: 409 });
  if (!spec.assist) return NextResponse.json({ error: "This tool doesn't use Atlas — fill in the inputs directly (it's free)." }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { description?: unknown };
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 3000) : "";
  if (description.length < 8) return NextResponse.json({ error: "Describe the job in a sentence or two first." }, { status: 400 });

  const system = `You fill in an estimate form from a job description for a field-service business. Tool: "${row.name}".${spec.intro ? ` ${spec.intro}` : ""}
Reply with ONLY a JSON object: {"values": {inputId: value, ...}, "notes": "one short line on what you assumed or couldn't tell"}.
Rules:
- numbers as numbers (no units), select inputs by their exact value, toggles as true/false, text inputs as short strings.
- Include ONLY inputs the description actually supports. Never invent measurements or counts — if a size isn't stated or derivable (e.g. "two-car driveway" ≈ 400-600 sq ft is a fair estimate, "big driveway" is not), leave it out and say so in notes.
- Where the description gives a range, use the midpoint and note it.
${spec.assist.instructions ? `Business guidance: ${spec.assist.instructions}\n` : ""}Inputs:
${inputsPrompt(spec)}`;

  const result = await meteredOneShot(actor, { kind: "estimator", system, prompt: `Job description:\n${description}`, maxOutputTokens: 600 });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, ...(result.access ? { access: result.access } : {}), ...(result.atlasLocked ? { atlasLocked: true } : {}) }, { status: result.status });
  }
  const parsed = oneShotJson<{ values?: Record<string, unknown>; notes?: unknown }>(result.text);
  const rawValues = parsed?.values && typeof parsed.values === "object" ? parsed.values : {};
  // Keep only known inputs, coerced the same way the form would be
  const picked: Record<string, unknown> = {};
  for (const inp of spec.inputs) if (inp.id in rawValues && rawValues[inp.id] !== null && rawValues[inp.id] !== "") picked[inp.id] = rawValues[inp.id];
  const { values, problems } = coerceInputs(spec, picked);
  const cleaned: Record<string, unknown> = {};
  for (const inp of spec.inputs) {
    if (!(inp.id in picked)) continue; // don't echo defaults as "filled in"
    if (problems.some((p) => p.id === inp.id)) continue;
    cleaned[inp.id] = values[inp.id];
  }
  void prisma.estimator.update({ where: { id: row.id }, data: { assists: { increment: 1 } } }).catch(() => {});

  return NextResponse.json({
    values: cleaned,
    notes: typeof parsed?.notes === "string" ? parsed.notes.slice(0, 300) : "",
    skipped: problems.map((p) => p.message),
    turnTokens: result.atlasTokens,
    access: result.access,
  });
}
