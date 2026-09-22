import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { specFromJson, type EstimatorSpec } from "@/lib/estimator";
import { meteredOneShot } from "@/lib/atlas-oneshot";
import { LISTING_DESCRIPTION } from "@/lib/estimator-library";

/**
 * POST /api/app/estimators/[id]/share/describe — Atlas writes the Library
 * description for a tool (managers; one metered call, ledger kind
 * "estimator-share"): what it prices and for whom, the questions it asks
 * and the rates an adopter will want to set, where it shines. Plain text
 * the owner can edit before sharing.
 */
function toolBrief(spec: EstimatorSpec): string {
  const inputs = spec.inputs.map((i) => {
    const kind = i.type === "select" && i.style === "packages" ? "packages" : i.type === "map" ? `map (${i.measure})` : i.type;
    const opts = "options" in i ? ` [${i.options.map((o) => o.label).join(", ")}]` : "";
    return `- ${i.label} (${kind}${i.askAtlas ? ", Atlas assesses" : ""})${opts}${i.help ? ` — ${i.help}` : ""}`;
  });
  const lines = spec.lines.map((l) => `- ${l.name}${l.group ? ` [${l.group}]` : ""}: qty ${l.quantity ?? "1"} × ${l.unitPrice ?? l.workItemName ?? "?"}${l.when ? ` when ${l.when}` : ""}${l.isOptional ? " (optional)" : ""}`);
  return [
    spec.intro ? `Intro: ${spec.intro}` : null,
    `Questions:\n${inputs.join("\n")}`,
    spec.variables.length > 0 ? `Variables:\n${spec.variables.map((v) => `- ${v.id} = ${v.expr}`).join("\n")}` : null,
    `Pricing lines:\n${lines.join("\n")}`,
    spec.minimumTotal ? `Minimum job charge: $${spec.minimumTotal}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const [tool, company] = await Promise.all([
    prisma.estimator.findFirst({ where: { id, companyId: actor.companyId }, select: { id: true, name: true, description: true, spec: true } }),
    prisma.company.findUnique({ where: { id: actor.companyId }, select: { assistantName: true, industry: true } }),
  ]);
  if (!tool) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const spec = specFromJson(tool.spec);
  if (!spec) return NextResponse.json({ error: "This tool's rules no longer compile." }, { status: 409 });
  const name = company?.assistantName || "Atlas";

  const system = `You are ${name}, writing the Library description of an estimate tool inside Workbench, a field-service app. Other business owners in the same trade will read it to decide whether to add the tool to their own account. Write PLAIN TEXT — no markdown, no bullets, no headings, no quotes around the text. Two short paragraphs, ${LISTING_DESCRIPTION.max - 300} characters at most in total:
1. What it prices and for whom, in one or two sentences a busy owner reads at a glance.
2. The questions it asks (in words, not field names) and the rates the owner will want to set as their own after adding it (every rate is listed as "rates to confirm" on their side). End with one sentence on where it shines: onsite in the app, as a website form, or both.
Never mention formulas, ids or JSON. Never invent features the tool doesn't have. Don't name the business that built it.`;
  const prompt = `Tool name: ${tool.name}${tool.description ? `\nOwner's one-liner: ${tool.description}` : ""}${company?.industry ? `\nTrade: ${company.industry}` : ""}\n\n${toolBrief(spec)}`;

  const res = await meteredOneShot(actor, { kind: "estimator-share", system, prompt, maxOutputTokens: 700, temperature: 0.4 });
  if (!res.ok) {
    return NextResponse.json({ error: res.error, ...(res.access ? { access: res.access } : {}), ...(res.atlasLocked ? { atlasLocked: true } : {}) }, { status: res.status });
  }
  const description = res.text
    .replace(/^```[a-z]*\s*|\s*```$/g, "")
    .replace(/^["“]|["”]$/g, "")
    .replace(/[*_#>`]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, LISTING_DESCRIPTION.max);
  if (description.length < LISTING_DESCRIPTION.min) return NextResponse.json({ error: `${name} didn't come back with a description — try again.` }, { status: 502 });
  return NextResponse.json({ description, tokens: res.atlasTokens, access: res.access });
}
