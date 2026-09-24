import { prisma } from "./db";
import type { Actor } from "./permissions";
import { meteredOneShot, oneShotJson } from "./atlas-oneshot";
import { auditSpec, describeSpecChanges, ESTIMATOR_GUIDE, ESTIMATOR_LIMITS, specFromJson, type EstimatorSpec, type SpecAudit } from "./estimator";
import { checkSpec, ESTIMATOR_SELECT, estimatorSummary, snapshotEstimator, type EstimatorRow } from "./estimator-server";
import { loadBusinessContext } from "./estimator-context";
import { sanitizePublicConfig, type EstimatorPublicConfig } from "./estimator-public";
import { ESTIMATOR_PRINCIPLES, guessTrade, playbookByKey, playbookText, PLAYBOOK_INDEX, preferMapInput } from "./estimator-playbook";

/**
 * The Estimates page's builder (docs/plans/ai-estimators-2026-09-19.md,
 * Batch 6): one sentence from the owner → a saved estimate tool, with the
 * work shown as it happens. Two model calls, both on the assistant's model:
 *
 *   plan  → a quick, cheap pass: what trade is this, what drives the price,
 *           which questions and packages a pro would use. Streams back at once
 *           so the page has real content within seconds.
 *   draft → the big one: a LARGE thinking budget, the trade's playbook and
 *           the plan in hand, returns {name, description, spec} with samples.
 *   check → compileSpec + price-book names, exactly like a save
 *   test  → auditSpec: descriptions on every line, sensible controls, the
 *           model's own small/typical/large samples run green and in order
 *   fix   → compile/audit errors go back to the model (at most 2 rounds)
 *   save  → create, or snapshot + update; the tool is live
 *
 * Everything the model returns passes through the same gates a manual save
 * does — the model never writes to the database, this file does. Missing
 * rates never stall the build: the model uses a placeholder and lists it,
 * and the tool card nags until the owner sets it.
 */

export type BuildPhase = "plan" | "draft" | "check" | "fix" | "test" | "save";

export type BuildPlan = {
  trade: string;
  drivers: string[];
  questions: { label: string; control: string }[];
  packages: string[] | null;
  note: string;
};

export type BuildDraft = {
  name: string;
  description: string;
  inputs: { label: string; type: string; section?: string }[];
  lines: { name: string; group?: string }[];
  packages: string[] | null;
};

export type BuildSample = { label: string; subtotal: number | null; lines: number; error?: string };

/** One thing Atlas wants to know before building — asked the way a colleague would, with example answers. */
export type BuildQuestion = { question: string; why: string; suggestions: string[] };
export type BuildAnswer = { question: string; answer: string };

export type BuildEvent =
  | { phase: BuildPhase; message: string }
  | { plan: BuildPlan }
  | { draft: BuildDraft }
  | { samples: BuildSample[] }
  | { questions: BuildQuestion[]; tokens: number }
  | { ask: string; tokens: number }
  | { done: true; tool: Record<string, unknown>; changes: string[]; samples: BuildSample[]; placeholders: string[]; warnings: string[]; tokens: number }
  | { error: string; tokens: number; atlasLocked?: boolean };

/** Spec attempts per build: the first draft plus two fix rounds. */
const MAX_ROUNDS = 3;
/** Thinking budgets (tokens on 2.5 models, mapped to a level on 3.x). Building is a one-time spend — let it think. */
const THINK_PLAN = 1024;
const THINK_DRAFT = 8192;
const THINK_FIX = 4096;
const THINK_CHANGE = 6144;

type PlanReply = { tradeKey?: unknown; trade?: unknown; drivers?: unknown; questions?: unknown; packages?: unknown; ask?: unknown; note?: unknown; askOwner?: unknown };
type Draft = { name?: unknown; description?: unknown; spec?: unknown; question?: unknown };

const strs = (v: unknown, max: number, len = 120): string[] => (Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x.trim().slice(0, len) : "")).filter(Boolean).slice(0, max) : []);

/** The owner's answers as prompt text (blank answers become placeholders downstream). */
function answersText(answers: BuildAnswer[]): string {
  if (answers.length === 0) return "";
  return `\n\nYou asked the owner these questions before building; their answers:\n${answers.map((a) => `Q: ${a.question}\nA: ${a.answer.trim() || "(no answer — use a sensible placeholder and list it under placeholders)"}`).join("\n")}`;
}

function planSystem(assistantName: string, answered: boolean, brief: string, hasImage: boolean): string {
  return `You are ${assistantName}, a veteran estimator inside Workbench, a field-service app. An owner describes how they price a kind of job. Before any tool is built, PLAN it the way a pro would. Answer with ONLY a JSON object:
{"tradeKey": "one key from the list below, or null", "trade": "human name of the trade / job", "drivers": ["what moves the price, most important first — 3 to 6"], "questions": [{"label": "the question as a homeowner would read it", "control": "slider | stepper | field | map | cards | packages | multi | counts | toggle"}], "packages": null, "note": "one sentence on the pricing shape (per sq ft, flat menu, hourly, tiers…)", "askOwner": [], "ask": null}

"packages": null unless THIS business sells tiers — the owner said packages / tiers / levels / good-better-best, or the price book and past quotes show tiered services. Then 2–4 tier names. A per-unit, hourly, flat-menu or repair job gets null. Never invent tiers.
${
  answered
    ? `The owner has ALREADY answered your questions (they're in the message). Do not ask again — "askOwner" must be []. Anything still unknown becomes a placeholder.`
    : `"askOwner": almost always []. The owner wants a tool, not a questionnaire; a missing rate becomes a placeholder they confirm later (that path exists and works). Ask ONLY when both are true: (1) the description is SPECIFIC and names a thing whose price drives the whole tool but leaves it open (e.g. "cedar or chain link" with no rate per material), and (2) neither the price book nor their past quotes show it. At most 2 questions, each {"question": "short and specific", "why": "one clause on what it changes", "suggestions": ["2–4 example answers"]}. NEVER ask about: the minimum, whether they sell packages, the unit, extras, anything a homeowner answers on the form (sizes, counts, choices), or anything you can decide as a pro. A BROAD description ("a tool for my pressure washing jobs", "something for lawn care") gets NO questions — build the trade's standard tool from the playbook and the business's own rates. Each suggestion must be a COMPLETE answer to the whole question that the owner could give as-is — alternatives to pick between, never one suggestion per part.`
}
Set "ask" to ONE short question ONLY when you genuinely cannot tell what job the tool is for.
You already know this business (below). Never ask for a rate the price book or their past quotes already show — use it. If the description is vague about the trade, the business's trade tells you.
${
  hasImage
    ? `\nThe owner attached a PHOTO of their price sheet / rate card / old estimate form. Read every rate, unit, service name, minimum, surcharge and package from it — those are the business's REAL numbers, not placeholders, and they answer most questions you would otherwise ask. Plan the tool around what the sheet prices.`
    : ""
}

${ESTIMATOR_PRINCIPLES}

Trades you know (tradeKey — name):
${PLAYBOOK_INDEX}

The business:
${brief}`;
}

function draftSystem(
  business: string,
  current: { name: string; description: string | null; spec: EstimatorSpec } | null,
  playbook: string | null,
  assistantName: string,
  hasImage: boolean
): string {
  return `You are ${assistantName}, building an ESTIMATE TOOL for a field-service business inside Workbench. The owner describes how they price a kind of job in plain words; you return a tool a homeowner can answer in a minute and a pro would trust. Answer with ONLY a JSON object, no prose:
{"name": "short tool name", "description": "one line (≤ 160 chars) on when to use it", "spec": { ...the spec... }}
${current ? `\nThis is a CHANGE to an existing tool. Current tool (JSON):\n${JSON.stringify({ name: current.name, description: current.description, spec: current.spec })}\nApply the owner's change and return the FULL updated tool. Keep ids of unchanged inputs/lines/variables so their history reads cleanly; keep the name unless they ask to rename; keep samples valid (update them if a question changed); drop a placeholder from "placeholders" once the owner has given that rate.\n` : ""}
${ESTIMATOR_PRINCIPLES}

Design rules for a GOOD tool:
- Follow the plan you are given, then make it real: every question in the plan becomes an input with the right control. Packages ONLY when the plan has them (this business sells tiers) — then a "packages" select whose tiers the lines switch on. Plan says null → no tiers, one clear price; never add a package picker on your own.
${hasImage ? `- The owner attached a PHOTO of their price sheet / rate card / old estimate form. Every rate, unit, service, minimum, surcharge and package on it is a REAL number: use them exactly, name lines the way the sheet does, and list NOTHING from the sheet under "placeholders". Only a rate the sheet and the business data both lack becomes a placeholder.` : ""}
- Use type "map" (measure "length" for fences/gutters in ft, "area" for lawns/roofs/driveways/patios in sq ft) whenever a size is the main driver — customers draw it instead of guessing. Pair it with number presets only when a map makes no sense.
- More than 5 questions → group them with "section" (2–4 sections, in the order a pro asks). Use "showWhen" so follow-ups only appear when relevant. Use "multi" for pick-several add-ons.
- Write plain-English labels a homeowner understands; put jargon in "help". Blurbs on cards and tiers sell the option in a few words.
- Every line: a description that explains the number ({qty} at {rate|money}), and a "group".
- Leave "assist" null unless judgment from a written description or a photo is genuinely needed — but when the owner ASKS for photo / description fill-in, or any question has askAtlas, set "assist": {"instructions": "..."} and WRITE the instructions: 2–4 plain sentences telling Atlas what to look for in the photo or words, what to assume when it can't tell (typical sizes and counts for this trade, the middle option for condition), and the one or two things it must never guess. The owner can edit them later.
- You know this business (below): its trade, its price book, what it has actually charged on quotes, the services it books. USE IT. A rate the owner didn't say but the business data shows is a REAL rate, not a placeholder — take it from the price book (link the line with workItemName, exact name) or from what they've charged. When the tool sells a listed service, link it. Match their vocabulary and their existing tools' naming.
- Rates the owner never gave, that the business data doesn't show either (and they didn't answer when asked): use a sensible placeholder and list it in "placeholders". Never stop to ask for a rate at this stage.
- "samples": small / typical / large, every required question answered with realistic values (a map input is a number of ft or sq ft; a counts input is a table {"value": n}).
- "askAtlas": only where a pro would have to look (condition, access, hazard, scope) AND the price depends on it — it costs the business tokens per estimate. Most tools need none.
${playbook ? `\n${playbook}\n` : ""}
${ESTIMATOR_GUIDE}

${business}`;
}

/**
 * Keep the web form's "visitors may attach a photo" option in step with the
 * rules: when a change turns Atlas fill-in ON (assist / an assessed
 * question) the option switches on too, so the form offers the photo step
 * the owner just asked for. Shared with the PATCH route.
 */
export function publicConfigAfterSpec(row: Pick<EstimatorRow, "publicConfig">, before: EstimatorSpec | null, after: EstimatorSpec): { publicConfig?: EstimatorPublicConfig } {
  const wasOn = Boolean(before?.assist);
  const isOn = Boolean(after.assist);
  if (isOn && !wasOn) {
    const cfg = sanitizePublicConfig(row.publicConfig);
    if (!cfg.photoAssist) return { publicConfig: { ...cfg, photoAssist: true } };
  }
  return {};
}

function summaryOf(row: EstimatorRow | null) {
  if (!row) return null;
  const spec = specFromJson(row.spec);
  return spec ? { ...estimatorSummary(row, spec), spec, updatedAt: row.updatedAt.toISOString() } : null;
}

function draftPreview(draft: Draft, spec: EstimatorSpec): BuildDraft {
  const packages = spec.inputs.find((i) => i.type === "select" && i.style === "packages");
  return {
    name: typeof draft.name === "string" ? draft.name.trim().slice(0, 80) : "Estimate tool",
    description: typeof draft.description === "string" ? draft.description.trim().slice(0, 200) : "",
    inputs: spec.inputs.map((i) => ({ label: i.label, type: i.askAtlas ? "atlas" : i.type === "number" ? i.control ?? "field" : i.type === "select" ? i.style ?? "list" : i.type, ...(i.section ? { section: i.section } : {}) })),
    lines: spec.lines.map((l) => ({ name: l.name, ...(l.group ? { group: l.group } : {}) })),
    packages: packages && packages.type === "select" ? packages.options.map((o) => o.label) : null,
  };
}

/** A loose preview of a spec that did NOT compile yet — enough for the page to show something taking shape. */
function roughPreview(draft: Draft): BuildDraft | null {
  const spec = draft.spec && typeof draft.spec === "object" ? (draft.spec as Record<string, unknown>) : null;
  if (!spec) return null;
  const inputs = (Array.isArray(spec.inputs) ? spec.inputs : []).map((i) => {
    const o = (i ?? {}) as Record<string, unknown>;
    return { label: typeof o.label === "string" ? o.label.slice(0, 80) : "Question", type: typeof o.type === "string" ? o.type : "field", ...(typeof o.section === "string" ? { section: o.section.slice(0, 60) } : {}) };
  });
  const lines = (Array.isArray(spec.lines) ? spec.lines : []).map((l) => {
    const o = (l ?? {}) as Record<string, unknown>;
    return { name: typeof o.name === "string" ? o.name.slice(0, 160) : "Line", ...(typeof o.group === "string" ? { group: o.group.slice(0, 40) } : {}) };
  });
  return {
    name: typeof draft.name === "string" ? draft.name.trim().slice(0, 80) : "Estimate tool",
    description: typeof draft.description === "string" ? draft.description.trim().slice(0, 200) : "",
    inputs: inputs.slice(0, ESTIMATOR_LIMITS.inputs),
    lines: lines.slice(0, ESTIMATOR_LIMITS.lines),
    packages: null,
  };
}

/** A photo of the owner's price sheet / rate card, read by both model calls (base64, no data: prefix). */
export type BuildImage = { base64: string; mime: string };

export async function* buildEstimator(
  actor: Actor,
  opts: {
    prompt: string;
    estimatorId?: string;
    assistantName: string;
    answers?: BuildAnswer[];
    image?: BuildImage | null;
    /** Asked before each model call — true means the owner cancelled, so stop without saving. */
    cancelled?: () => Promise<boolean>;
  }
): AsyncGenerator<BuildEvent> {
  let tokens = 0;
  const image = opts.image ?? null;
  const stop = async () => (opts.cancelled ? await opts.cancelled() : false);
  const prompt = opts.prompt.trim().slice(0, 4000);
  const answers = (opts.answers ?? []).map((a) => ({ question: String(a.question ?? "").slice(0, 300), answer: String(a.answer ?? "").slice(0, 600) })).filter((a) => a.question).slice(0, 6);
  const answered = answers.length > 0;
  if (prompt.length < 8 && !image) {
    yield { error: "Describe the tool in a sentence or two first.", tokens };
    return;
  }

  yield { phase: "plan", message: opts.estimatorId ? "Reading the tool and your business…" : "Reading your price book, past quotes and services…" };
  const [biz, currentRow] = await Promise.all([
    loadBusinessContext(actor.companyId, { excludeEstimatorId: opts.estimatorId }),
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

  // ── plan (new tools only — a change already has its shape) ────────────────
  let plan: BuildPlan | null = null;
  let planKey: string | null = null;
  if (!currentRow) {
    yield { phase: "plan", message: "Working out what drives the price…" };
    if (await stop()) return;
    const res = await meteredOneShot(actor, {
      kind: "estimator-plan",
      system: planSystem(opts.assistantName, answered, biz.brief, Boolean(image)),
      prompt: `The owner's description:\n${prompt || "(see the attached price sheet)"}${answersText(answers)}`,
      maxOutputTokens: 2000,
      temperature: 0.2,
      thinkingBudget: THINK_PLAN,
      ...(image ? { image } : {}),
    });
    if (!res.ok) {
      yield { error: res.error, tokens, atlasLocked: res.atlasLocked };
      return;
    }
    tokens += res.atlasTokens;
    const reply = oneShotJson<PlanReply>(res.text);
    if (reply) {
      if (typeof reply.ask === "string" && reply.ask.trim()) {
        yield { ask: reply.ask.trim().slice(0, 500), tokens };
        return;
      }
      // Clarifying questions — one round, before anything is built
      if (!answered && Array.isArray(reply.askOwner) && reply.askOwner.length > 0) {
        const qs: BuildQuestion[] = reply.askOwner
          .map((q) => {
            const o = (q ?? {}) as Record<string, unknown>;
            return {
              question: typeof o.question === "string" ? o.question.trim().slice(0, 300) : "",
              why: typeof o.why === "string" ? o.why.trim().slice(0, 160) : "",
              suggestions: strs(o.suggestions, 4, 80),
            };
          })
          .filter((q) => q.question)
          .slice(0, 2);
        if (qs.length > 0) {
          yield { questions: qs, tokens };
          return;
        }
      }
      const questions = (Array.isArray(reply.questions) ? reply.questions : [])
        .map((q) => {
          const o = (q ?? {}) as Record<string, unknown>;
          return { label: typeof o.label === "string" ? o.label.trim().slice(0, 80) : "", control: typeof o.control === "string" ? o.control.trim().slice(0, 12) : "field" };
        })
        .filter((q) => q.label)
        .slice(0, 16);
      planKey = typeof reply.tradeKey === "string" ? reply.tradeKey : null;
      plan = {
        trade: typeof reply.trade === "string" && reply.trade.trim() ? reply.trade.trim().slice(0, 60) : playbookByKey(planKey)?.name ?? guessTrade(prompt)?.name ?? "Custom pricing",
        drivers: strs(reply.drivers, 6, 80),
        questions,
        packages: Array.isArray(reply.packages) && reply.packages.length > 0 ? strs(reply.packages, 4, 40) : null,
        note: typeof reply.note === "string" ? reply.note.trim().slice(0, 160) : "",
      };
      yield { plan };
    }
  }

  const trade = playbookByKey(planKey) ?? guessTrade(prompt) ?? (currentSpec ? guessTrade(`${currentRow!.name} ${currentRow!.description ?? ""}`) : null) ?? (biz.industry ? guessTrade(biz.industry) : null);
  const system = draftSystem(biz.text, currentRow && currentSpec ? { name: currentRow.name, description: currentRow.description, spec: currentSpec } : null, trade ? playbookText(trade) : null, opts.assistantName, Boolean(image));
  let userPrompt = currentRow ? `The owner's change request:\n${prompt || "(see the attached price sheet)"}${answersText(answers)}` : `The owner's description:\n${prompt || "(see the attached price sheet)"}${answersText(answers)}${plan ? `\n\nThe plan (follow it, then make it real):\n${JSON.stringify(plan)}` : ""}`;

  let draft: Draft | null = null;
  let compiled: Awaited<ReturnType<typeof checkSpec>> | null = null;
  let audit: SpecAudit | null = null;

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    yield { phase: round === 1 ? "draft" : "fix", message: round === 1 ? (currentRow ? "Working out the change…" : "Writing the questions and pricing rules…") : `Fixing what didn't add up (round ${round})…` };
    if (await stop()) return;
    const res = await meteredOneShot(actor, {
      kind: "estimator-build",
      system,
      prompt: userPrompt,
      maxOutputTokens: 16000,
      temperature: 0.2,
      thinkingBudget: round === 1 ? (currentRow ? THINK_CHANGE : THINK_DRAFT) : THINK_FIX,
      timeoutMs: 170_000,
      ...(image ? { image } : {}),
    });
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
    // A trade that measures on the map (fences, lawns, roofs…) gets its size
    // question as a map even when the model reached for a slider — new tools only.
    if (!currentRow && trade?.mapMeasure) draft.spec = preferMapInput(draft.spec, trade.mapMeasure);
    const check = await checkSpec(actor.companyId, draft.spec);
    if (!check.ok) {
      const rough = roughPreview(draft);
      if (rough && round === 1) yield { draft: rough };
      userPrompt = `${userPrompt}\n\nYour previous spec was:\n${JSON.stringify(draft.spec)}\nIt failed these checks:\n- ${check.errors.join("\n- ")}\nReturn the corrected FULL JSON object.`;
      draft = null;
      continue;
    }
    yield { draft: draftPreview(draft, check.compiled.spec) };

    yield { phase: "test", message: "Pricing a small, a typical and a large job…" };
    audit = auditSpec(check.compiled, check.book);
    yield { samples: audit.samples };
    if (audit.errors.length > 0 && round < MAX_ROUNDS) {
      userPrompt = `${userPrompt}\n\nYour spec compiled and ran, but a pro would send it back:\n- ${audit.errors.join("\n- ")}\nFix the spec (or the samples) and return the corrected FULL JSON object:\n${JSON.stringify({ name: draft.name, description: draft.description, spec: check.compiled.spec })}`;
      draft = null;
      compiled = null;
      continue;
    }
    compiled = check;
    break;
  }

  if (!draft || !compiled || !compiled.ok) {
    yield { error: `${opts.assistantName} couldn't get the rules to add up after ${MAX_ROUNDS} tries. Try describing the pricing in a bit more detail (rates, units, extras).`, tokens };
    return;
  }
  // The last round may still carry audit errors (we ran out of fixes) — the tool saves, the owner sees them as warnings.
  const warnings = audit ? [...audit.errors, ...audit.warnings] : [];
  const samples = audit?.samples ?? [];

  yield { phase: "save", message: "Saving…" };
  if (await stop()) return;
  const spec = compiled.compiled.spec;
  const placeholders = spec.placeholders ?? [];
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
      data: { spec, name: newName, ...(description ? { description } : {}), ...publicConfigAfterSpec(currentRow, before, spec) },
      select: ESTIMATOR_SELECT,
    });
    yield { done: true, tool: summaryOf(updated)!, changes, samples, placeholders, warnings, tokens };
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
  yield { done: true, tool: summaryOf(created)!, changes: [], samples, placeholders, warnings, tokens };
}
