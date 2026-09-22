import { prisma } from "./db";
import type { Actor } from "./permissions";
import { meteredOneShot, oneShotJson } from "./atlas-oneshot";
import { compileSpec, describeSpecChanges, ESTIMATOR_GUIDE, ESTIMATOR_LIMITS, runCompiled, specFromJson, type EstimatorSpec } from "./estimator";
import { checkSpec, ESTIMATOR_SELECT, estimatorSummary, loadPriceBook, snapshotEstimator, type EstimatorRow } from "./estimator-server";

/**
 * The Estimates page's builder (docs/plans/ai-estimators-2026-09-19.md,
 * Batch 5): one sentence from the owner → a saved estimate tool, with no
 * chat and no confirmation card. Runs as a small loop the page watches live:
 *   book  → read the price book (and the current tool, for a change)
 *   draft → one metered model call returns {name, description, spec, sampleInputs}
 *           (or {question} when a price only the owner knows is missing)
 *   check → compileSpec + price-book names, exactly like a save
 *   fix   → the compile errors go back to the model (at most 2 rounds)
 *   test  → run the model's own sample job through the free engine
 *   save  → create, or snapshot + update; the tool is live
 * Everything the model returns passes through the same gates a manual save
 * does — the model never writes to the database, this file does.
 */

export type BuildPhase = "book" | "draft" | "check" | "fix" | "test" | "save";

export type BuildEvent =
  | { phase: BuildPhase; message: string }
  | { ask: string; tokens: number }
  | { done: true; tool: Record<string, unknown>; changes: string[]; sample: { subtotal: number; lines: number } | null; tokens: number }
  | { error: string; tokens: number; atlasLocked?: boolean };

const MAX_ROUNDS = 3;

type Draft = { name?: unknown; description?: unknown; spec?: unknown; sampleInputs?: unknown; question?: unknown };

function systemPrompt(book: { name: string; unitPrice: number; unitCost: number | null }[], current: { name: string; description: string | null; spec: EstimatorSpec } | null, assistantName: string): string {
  const bookText = book.length
    ? book.map((b) => `- ${b.name} — $${b.unitPrice.toFixed(2)}${b.unitCost !== null ? ` (cost $${b.unitCost.toFixed(2)})` : ""}`).join("\n")
    : "(empty — use the rates the owner gives; never invent prices)";
  return `You are ${assistantName}, building an ESTIMATE TOOL for a field-service business inside Workbench. The owner describes how they price a kind of job in plain words. Answer with ONLY a JSON object, no prose:
{"name": "short tool name", "description": "one line (≤ 160 chars) on when to use it", "spec": { ...the spec... }, "sampleInputs": {inputId: value, ...}}
When a price or rule only the owner knows is missing and they gave no placeholder permission, answer instead with {"question": "ONE message asking for everything you need at once"}. Never invent a business's prices.
${current ? `\nThis is a CHANGE to an existing tool. Current tool (JSON):\n${JSON.stringify({ name: current.name, description: current.description, spec: current.spec })}\nApply the owner's change and return the FULL updated tool. Keep ids of unchanged inputs/lines/variables so their history reads cleanly; keep the name unless they ask to rename.\n` : ""}
Design rules for a GOOD tool:
- Ask only what changes the price. Use type "map" (measure "length" for fences/gutters in ft, "area" for lawns/roofs/driveways/patios in sq ft) whenever a size is the main driver — customers draw it instead of guessing.
- More than 5 questions → group them with "section" (2–4 sections). Use "showWhen" so follow-ups only appear when relevant. Use "multi" for pick-several add-ons.
- Write plain-English labels a homeowner understands; put jargon in "help".
- "sampleInputs" must be a realistic job that exercises the main lines (every required input filled).
- Leave "assist" null unless judgment from a written description is genuinely needed.
- Price-book items the owner names: link lines with workItemName (exact name) so cost and price stay in sync.

${ESTIMATOR_GUIDE}

Price book (exact names):
${bookText}`;
}

function summaryOf(row: EstimatorRow | null) {
  if (!row) return null;
  const spec = specFromJson(row.spec);
  return spec ? { ...estimatorSummary(row, spec), spec, updatedAt: row.updatedAt.toISOString() } : null;
}

export async function* buildEstimator(actor: Actor, opts: { prompt: string; estimatorId?: string; assistantName: string }): AsyncGenerator<BuildEvent> {
  let tokens = 0;
  const prompt = opts.prompt.trim().slice(0, 4000);
  if (prompt.length < 8) {
    yield { error: "Describe the tool in a sentence or two first.", tokens };
    return;
  }

  yield { phase: "book", message: opts.estimatorId ? "Reading the tool and your price book…" : "Reading your price book…" };
  const [book, currentRow] = await Promise.all([
    loadPriceBook(actor.companyId),
    opts.estimatorId ? prisma.estimator.findFirst({ where: { id: opts.estimatorId, companyId: actor.companyId }, select: ESTIMATOR_SELECT }) : Promise.resolve(null),
  ]);
  if (opts.estimatorId && !currentRow) {
    yield { error: "That tool is gone.", tokens };
    return;
  }
  const currentSpec = currentRow ? specFromJson(currentRow.spec) : null;
  if (currentRow && !currentSpec) {
    yield { error: "This tool's saved rules no longer compile — rebuild it from scratch.", tokens };
    return;
  }
  if (!currentRow) {
    const count = await prisma.estimator.count({ where: { companyId: actor.companyId } });
    if (count >= ESTIMATOR_LIMITS.perCompany) {
      yield { error: `You have ${ESTIMATOR_LIMITS.perCompany} estimate tools already — delete one to build another.`, tokens };
      return;
    }
  }

  const system = systemPrompt(book, currentRow && currentSpec ? { name: currentRow.name, description: currentRow.description, spec: currentSpec } : null, opts.assistantName);
  let userPrompt = currentRow ? `The owner's change request:\n${prompt}` : `The owner's description:\n${prompt}`;
  let draft: Draft | null = null;
  let compiled: Awaited<ReturnType<typeof checkSpec>> | null = null;
  let sample: { subtotal: number; lines: number } | null = null;

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    yield { phase: round === 1 ? "draft" : "fix", message: round === 1 ? (currentRow ? "Working out the change…" : "Drafting the questions and pricing rules…") : `Fixing what didn't add up (round ${round})…` };
    const res = await meteredOneShot(actor, { kind: "estimator-build", system, prompt: userPrompt, maxOutputTokens: 6000, temperature: 0.2 });
    if (!res.ok) {
      yield { error: res.error, tokens, atlasLocked: res.atlasLocked };
      return;
    }
    tokens += res.atlasTokens;
    draft = oneShotJson<Draft>(res.text);
    if (!draft) {
      userPrompt = `${userPrompt}\n\nYour last answer was not a JSON object. Answer with ONLY the JSON object described.`;
      continue;
    }
    if (typeof draft.question === "string" && draft.question.trim()) {
      yield { ask: draft.question.trim().slice(0, 800), tokens };
      return;
    }

    yield { phase: "check", message: "Checking the rules…" };
    const check = await checkSpec(actor.companyId, draft.spec);
    if (!check.ok) {
      userPrompt = `${userPrompt}\n\nYour previous spec was:\n${JSON.stringify(draft.spec)}\nIt failed these checks:\n- ${check.errors.join("\n- ")}\nReturn the corrected FULL JSON object.`;
      draft = null;
      continue;
    }
    compiled = check;

    yield { phase: "test", message: "Testing with a sample job…" };
    const inputs = draft.sampleInputs && typeof draft.sampleInputs === "object" && !Array.isArray(draft.sampleInputs) ? (draft.sampleInputs as Record<string, unknown>) : null;
    if (inputs) {
      const run = runCompiled(check.compiled, inputs, check.book);
      if (run.ok) sample = { subtotal: run.subtotal, lines: run.lines.length };
      else if (round < MAX_ROUNDS) {
        userPrompt = `${userPrompt}\n\nYour spec compiled but running your own sampleInputs ${JSON.stringify(inputs)} failed:\n- ${run.errors.join("\n- ")}\nFix the spec (or the sample) and return the corrected FULL JSON object:\n${JSON.stringify({ name: draft.name, description: draft.description, spec: check.compiled.spec, sampleInputs: inputs })}`;
        compiled = null;
        draft = null;
        continue;
      }
    }
    break;
  }

  if (!draft || !compiled || !compiled.ok) {
    yield { error: `${opts.assistantName} couldn't get the rules to add up after ${MAX_ROUNDS} tries. Try describing the pricing in a bit more detail (rates, units, extras).`, tokens };
    return;
  }

  yield { phase: "save", message: "Saving…" };
  const spec = compiled.compiled.spec;
  const description = typeof draft.description === "string" ? draft.description.trim().slice(0, 200) || null : null;

  if (currentRow) {
    const before = currentSpec!;
    const changes = describeSpecChanges(before, spec);
    const newName = typeof draft.name === "string" && draft.name.trim() ? draft.name.trim().slice(0, 80) : currentRow.name;
    if (changes.length === 0 && newName === currentRow.name && (description ?? currentRow.description) === currentRow.description) {
      yield { error: `${opts.assistantName} read that as no change to the rules. Say what should be different — a rate, a question, an option.`, tokens };
      return;
    }
    await snapshotEstimator(currentRow, "Atlas update", { id: actor.id, name: actor.name });
    const updated = await prisma.estimator.update({
      where: { id: currentRow.id },
      data: { spec, name: newName, ...(description ? { description } : {}) },
      select: ESTIMATOR_SELECT,
    });
    yield { done: true, tool: summaryOf(updated)!, changes, sample, tokens };
    return;
  }

  let name = typeof draft.name === "string" && draft.name.trim() ? draft.name.trim().slice(0, 80) : "Estimate tool";
  for (let n = 2; n < 20; n++) {
    const dup = await prisma.estimator.findFirst({ where: { companyId: actor.companyId, name: { equals: name, mode: "insensitive" } }, select: { id: true } });
    if (!dup) break;
    name = `${name.replace(/ \d+$/, "")} ${n}`;
  }
  const created = await prisma.estimator.create({ data: { companyId: actor.companyId, name, description, spec }, select: ESTIMATOR_SELECT });
  await snapshotEstimator(created, "Created with Atlas", { id: actor.id, name: actor.name });
  yield { done: true, tool: summaryOf(created)!, changes: [], sample, tokens };
}
