/**
 * Score the estimate-tool builder against the answer key (cases.ts).
 *
 *   npx tsx scripts/eval-estimator/run.ts [--only id,id] [--concurrency 4] [--out dir] [--label name]
 *
 * For each case: a throwaway company → the REAL builder (lib/estimator-build.ts,
 * the same code and model the app runs) → the saved tool. Then each job in the
 * case is put through the tool the way a customer would: a second, stronger
 * model reads the job's facts and fills in the tool's form, the tool's own
 * math prices it, and the total is held against the hand-worked answer.
 *
 * Needs a database it may write to (never production — the script refuses a
 * Railway host) and the model keys in the environment. See the plan doc.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../../lib/db";
import { aiChat, extractJsonObject } from "../../lib/ai";
import { buildEstimator, type BuildAnswer, type BuildEvent, type BuildQuestion } from "../../lib/estimator-build";
import { runEstimator, type EstimatorSpec, type PriceBookEntry } from "../../lib/estimator";
import { loadPriceBook } from "../../lib/estimator-server";
import type { Actor } from "../../lib/permissions";
import { CASES, type EvalCase, type EvalJob, type Expect } from "./cases";

const args = process.argv.slice(2);
const arg = (name: string): string | null => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] ?? "" : null;
};
const ONLY = (arg("only") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const CONCURRENCY = Math.max(1, Number(arg("concurrency") ?? 4));
const OUT = arg("out") ?? "eval-results";
const LABEL = arg("label") ?? "run";
/** The model that fills in forms and answers the builder's questions — deliberately stronger than the one being tested. */
const GRADER = process.env.EVAL_GRADER_MODEL || "claude-sonnet-5-5";
const BUILDER = process.env.AI_MODEL_ASSISTANT || (process.env.ANTHROPIC_API_KEY ? "claude-haiku-5-5" : "gemini-2.5-flash");

if (/railway|rlwy|proxy\.rlwy/i.test(process.env.DATABASE_URL ?? "")) {
  console.error("Refusing to run against a Railway database — point DATABASE_URL at a local throwaway one.");
  process.exit(2);
}

// ── the grader ───────────────────────────────────────────────────────────────

async function ask<T>(system: string, prompt: string): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const parts = await aiChat({ system, contents: [{ role: "user", parts: [{ text: prompt }] }], model: GRADER, temperature: 0, maxOutputTokens: 4000, thinkingBudget: 2048, timeoutMs: 90_000 });
    const text = (parts ?? []).map((p) => ("text" in p && typeof p.text === "string" ? p.text : "")).join("");
    const parsed = extractJsonObject<T>(text);
    if (parsed) return parsed;
  }
  return null;
}

/** The owner answering the builder's questions from what they know — or skipping them all. */
async function ownerAnswers(c: EvalCase, questions: BuildQuestion[]): Promise<BuildAnswer[]> {
  if (!c.ownerKnows) return questions.map((q) => ({ question: q.question, answer: "" }));
  const reply = await ask<{ answers?: unknown }>(
    `You are a busy home-service business owner answering a few questions from software that is building you an estimate tool. Answer ONLY from what you know (below), in a short plain sentence with the number. If what you know doesn't cover a question, answer "" — never make a number up. Reply with ONLY JSON: {"answers": ["...", "..."]} — one per question, in order.\n\nWhat you know:\n${c.ownerKnows}`,
    questions.map((q, i) => `${i + 1}. ${q.question}`).join("\n")
  );
  const list = Array.isArray(reply?.answers) ? reply!.answers : [];
  return questions.map((q, i) => ({ question: q.question, answer: typeof list[i] === "string" ? (list[i] as string) : "" }));
}

type Filled = { inputs: Record<string, unknown>; noPlace: string[] };

const FILL_SYSTEM = `You fill in a price-estimate form for a home-service job, exactly as a careful customer would, from the JOB FACTS. Reply with ONLY JSON:
{"inputs": {"<question id>": <answer>}, "noPlace": ["..."]}

How to answer each question type:
- number / map: a plain number in the question's unit.
- select: the option's "value" (not its label).
- multi: a list of option values (possibly []).
- counts: a table {"<option value>": <how many>} — leave out options with none.
- toggle: true or false.
- text: a short string, or leave it out.

Rules:
- Answer every question the facts speak to. A question with "showWhen" only applies when that condition holds for your other answers — leave it out otherwise.
- When the form asks about something the facts say nothing about, give the answer that means "none / no / normal / standard" (never "not sure" unless the facts say the customer doesn't know). Never invent work the facts don't mention.
- Use exactly what the facts state. If the form asks for a measurement and the question's help text says how to measure it (for example "trace the whole line including gates"), follow the help text using the facts.
- "noPlace": every fact that would change the price but has NO question or option to put it in (for example the job needs a double drive gate and the form has no way to add one). [] when everything fits. Do not list facts that simply mean "nothing extra".`;

function formForGrader(spec: EstimatorSpec): string {
  return JSON.stringify(
    spec.inputs.map((i) => {
      const o = i as unknown as Record<string, unknown>;
      const keep: Record<string, unknown> = {};
      for (const k of ["id", "label", "help", "type", "unit", "min", "max", "step", "measure", "required", "default", "showWhen", "section"]) if (o[k] !== undefined) keep[k] = o[k];
      if (Array.isArray(o.options)) keep.options = (o.options as unknown[]).map((x) => (typeof x === "string" ? x : (({ value, label, blurb, showWhen }) => ({ value, label, ...(blurb ? { blurb } : {}), ...(showWhen ? { showWhen } : {}) }))(x as Record<string, unknown>)));
      return keep;
    }),
    null,
    1
  );
}

async function fill(spec: EstimatorSpec, job: EvalJob, problems: string[] = []): Promise<Filled | null> {
  const reply = await ask<{ inputs?: unknown; noPlace?: unknown }>(
    FILL_SYSTEM,
    `${spec.intro ? `FORM INTRO: ${spec.intro}\n\n` : ""}THE FORM (questions in order):\n${formForGrader(spec)}\n\nJOB FACTS:\n${job.facts}${problems.length > 0 ? `\n\nYour last answers were rejected by the form:\n- ${problems.join("\n- ")}\nFix them.` : ""}`
  );
  if (!reply || !reply.inputs || typeof reply.inputs !== "object") return null;
  return { inputs: reply.inputs as Record<string, unknown>, noPlace: Array.isArray(reply.noPlace) ? reply.noPlace.filter((x): x is string => typeof x === "string") : [] };
}

// ── scoring ──────────────────────────────────────────────────────────────────

const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

function judge(total: number, e: Expect): { ok: boolean; want: string; offBy: number } {
  if (e.kind === "range") {
    const ok = total >= e.low && total <= e.high;
    const mid = (e.low + e.high) / 2;
    return { ok, want: `${money(e.low)}–${money(e.high)}`, offBy: ok ? 0 : (total - (total < e.low ? e.low : e.high)) / mid };
  }
  const tol = e.tolerance ?? 0.02;
  const errs = e.totals.map((t) => (total - t) / t);
  const best = errs.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a));
  // a dollar of rounding never fails a job
  const ok = e.totals.some((t) => Math.abs(total - t) <= Math.max(1, t * tol));
  return { ok, want: e.totals.map(money).join(" or "), offBy: best };
}

type JobResult = { label: string; ok: boolean; want: string; got: number | null; offBy: number | null; error?: string; noPlace: string[]; inputs?: Record<string, unknown>; lines?: { name: string; amount: number }[]; flags?: string[] };

async function scoreJob(spec: EstimatorSpec, book: PriceBookEntry[], job: EvalJob): Promise<JobResult> {
  let filled = await fill(spec, job);
  if (!filled) return { label: job.label, ok: false, want: "", got: null, offBy: null, error: "The grader could not fill in the form.", noPlace: [] };
  let run = runEstimator(spec, filled.inputs, book);
  if (!run.ok && run.inputProblems) {
    const again = await fill(spec, job, run.errors);
    if (again) {
      filled = again;
      run = runEstimator(spec, filled.inputs, book);
    }
  }
  if (!run.ok) return { label: job.label, ok: false, want: judge(0, job.expect).want, got: null, offBy: null, error: run.errors.join("; "), noPlace: filled.noPlace, inputs: filled.inputs };
  const j = judge(run.total, job.expect);
  return {
    label: job.label,
    ok: j.ok,
    want: j.want,
    got: run.total,
    offBy: j.offBy,
    noPlace: filled.noPlace,
    inputs: filled.inputs,
    lines: run.lines.filter((l) => !l.isOptional).map((l) => ({ name: l.name, amount: Math.round(l.quantity * l.unitPrice * 100) / 100 })),
    flags: run.flags,
  };
}

type RateCheck = { missing: string[]; notOwner: string[]; falselyOwner: string[]; unconfirmed: number };

/** Are the owner's numbers on the rate card, as theirs — and is nothing else passed off as theirs? */
function checkRates(spec: EstimatorSpec, want: (number | number[])[] | undefined, cold: boolean): RateCheck {
  const rates = spec.rates ?? [];
  const near = (a: number, b: number) => Math.abs(a - b) < 0.0051;
  const missing: string[] = [], notOwner: string[] = [];
  for (const w of want ?? []) {
    const forms = Array.isArray(w) ? w : [w];
    const hits = rates.filter((r) => forms.some((f) => near(r.value, f)));
    if (hits.length === 0) missing.push(forms.join(" / "));
    else if (!hits.some((r) => r.source === "owner")) notOwner.push(forms.join(" / "));
  }
  const falselyOwner = cold ? rates.filter((r) => r.source === "owner" && r.kind !== "time").map((r) => `${r.label} (${r.value})`) : [];
  return { missing, notOwner, falselyOwner, unconfirmed: rates.filter((r) => r.source !== "owner").length };
}

type BuildOutcome = { ok: true; spec: EstimatorSpec; toolId: string; warnings: string[]; tokens: number; asked: BuildQuestion[] } | { ok: false; error: string; asked: BuildQuestion[] };

async function build(actor: Actor, prompt: string, c: EvalCase, estimatorId?: string): Promise<BuildOutcome> {
  let answers: BuildAnswer[] | undefined;
  let asked: BuildQuestion[] = [];
  for (let pass = 0; pass < 2; pass++) {
    let last: BuildEvent | null = null;
    for await (const ev of buildEstimator(actor, { prompt, assistantName: "Atlas", ...(estimatorId ? { estimatorId } : {}), ...(answers ? { answers } : {}) })) last = ev;
    if (!last) return { ok: false, error: "The build ended without a result.", asked };
    if ("questions" in last && pass === 0) {
      asked = last.questions;
      answers = await ownerAnswers(c, last.questions);
      continue;
    }
    if ("done" in last) {
      const tool = last.tool as { id: string; spec: EstimatorSpec };
      return { ok: true, spec: tool.spec, toolId: tool.id, warnings: last.warnings, tokens: last.tokens, asked };
    }
    if ("error" in last) return { ok: false, error: last.error, asked };
    if ("ask" in last) return { ok: false, error: `Asked instead of building: ${last.ask}`, asked };
    return { ok: false, error: "The build stopped early.", asked };
  }
  return { ok: false, error: "The builder asked questions twice.", asked };
}

type Row = {
  id: string;
  trade: string;
  kind: "exact" | "market" | "change";
  built: boolean;
  error?: string;
  seconds: number;
  jobs: JobResult[];
  rates?: RateCheck;
  minimum?: { want: number; got: number | null };
  warnings: string[];
  asked: string[];
  pass: boolean;
  spec?: EstimatorSpec;
};

async function scoreTool(spec: EstimatorSpec, companyId: string, jobs: EvalJob[]): Promise<JobResult[]> {
  const book = await loadPriceBook(companyId);
  return Promise.all(jobs.map((j) => scoreJob(spec, book, j)));
}

function finish(row: Omit<Row, "pass">): Row {
  const ratesOk = !row.rates || (row.rates.missing.length === 0 && row.rates.notOwner.length === 0 && row.rates.falselyOwner.length === 0);
  const minOk = !row.minimum || row.minimum.got === row.minimum.want;
  return { ...row, pass: row.built && row.jobs.length > 0 && row.jobs.every((j) => j.ok) && ratesOk && minOk };
}

async function runCase(c: EvalCase): Promise<Row[]> {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const company = await prisma.company.create({ data: { name: `Eval ${c.trade} Co`, slug: `eval-${c.id}-${stamp}`, industry: c.company.industry, city: c.company.city, state: c.company.state, assistantEnabled: true }, select: { id: true } });
  const user = await prisma.user.create({ data: { email: `owner-${stamp}@eval.test`, name: "Eval Owner", role: "OWNER", companyId: company.id }, select: { id: true } });
  for (const item of c.company.priceBook ?? []) await prisma.workItem.create({ data: { companyId: company.id, name: item.name, unitPrice: item.unitPrice } });
  const actor: Actor = { id: user.id, name: "Eval Owner", role: "OWNER", companyId: company.id, salesSeePayments: true };
  const kind = c.cold ? "market" : "exact";
  const rows: Row[] = [];

  let t0 = Date.now();
  const first = await build(actor, c.prompt, c);
  if (!first.ok) {
    rows.push(finish({ id: c.id, trade: c.trade, kind, built: false, error: first.error, seconds: (Date.now() - t0) / 1000, jobs: [], warnings: [], asked: first.asked.map((q) => q.question) }));
    if (c.change) rows.push(finish({ id: `${c.id}:change`, trade: c.trade, kind: "change", built: false, error: "The first build failed, so there was nothing to change.", seconds: 0, jobs: [], warnings: [], asked: [] }));
    return rows;
  }
  const seconds = (Date.now() - t0) / 1000;
  rows.push(
    finish({
      id: c.id,
      trade: c.trade,
      kind,
      built: true,
      seconds,
      jobs: await scoreTool(first.spec, company.id, c.jobs),
      rates: checkRates(first.spec, c.ownerRates, Boolean(c.cold)),
      ...(c.minimum !== undefined ? { minimum: { want: c.minimum, got: first.spec.minimumTotal ?? null } } : {}),
      warnings: first.warnings,
      asked: first.asked.map((q) => q.question),
      spec: first.spec,
    })
  );

  if (c.change) {
    t0 = Date.now();
    const second = await build(actor, c.change.prompt, c, first.toolId);
    if (!second.ok) rows.push(finish({ id: `${c.id}:change`, trade: c.trade, kind: "change", built: false, error: second.error, seconds: (Date.now() - t0) / 1000, jobs: [], warnings: [], asked: [] }));
    else
      rows.push(
        finish({
          id: `${c.id}:change`,
          trade: c.trade,
          kind: "change",
          built: true,
          seconds: (Date.now() - t0) / 1000,
          jobs: await scoreTool(second.spec, company.id, c.change.jobs),
          rates: checkRates(second.spec, c.change.ownerRates, false),
          ...(c.change.minimum !== undefined ? { minimum: { want: c.change.minimum, got: second.spec.minimumTotal ?? null } } : {}),
          warnings: second.warnings,
          asked: [],
          spec: second.spec,
        })
      );
  }
  return rows;
}

// ── the report ───────────────────────────────────────────────────────────────

function report(rows: Row[]): string {
  const jobs = rows.flatMap((r) => r.jobs);
  const pct = (n: number, d: number) => (d === 0 ? "—" : `${Math.round((n / d) * 100)}%`);
  const exactJobs = rows.filter((r) => r.kind !== "market").flatMap((r) => r.jobs);
  const marketJobs = rows.filter((r) => r.kind === "market").flatMap((r) => r.jobs);
  const out: string[] = [];
  out.push(`# Estimator scorecard — ${LABEL}`, "");
  out.push(`Builder model: ${BUILDER} · grader: ${GRADER} · ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`, "");
  out.push(`| Measure | Score |`, `|---|---|`);
  out.push(`| Tools that built | ${rows.filter((r) => r.built).length} of ${rows.length} |`);
  out.push(`| Tools with every job right | ${rows.filter((r) => r.pass).length} of ${rows.length} (${pct(rows.filter((r) => r.pass).length, rows.length)}) |`);
  out.push(`| Jobs priced right, owner's own rates | ${exactJobs.filter((j) => j.ok).length} of ${exactJobs.length} (${pct(exactJobs.filter((j) => j.ok).length, exactJobs.length)}) |`);
  if (marketJobs.length > 0) out.push(`| Jobs inside the published market range, no rates given | ${marketJobs.filter((j) => j.ok).length} of ${marketJobs.length} (${pct(marketJobs.filter((j) => j.ok).length, marketJobs.length)}) |`);
  out.push(`| Jobs where the form had no place for something | ${jobs.filter((j) => j.noPlace.length > 0).length} of ${jobs.length} |`, "");
  out.push(`| Case | Kind | Built | Jobs right | Owner's rates on the card | Minimum | Seconds |`, `|---|---|---|---|---|---|---|`);
  for (const r of rows) {
    const rates = !r.rates ? "—" : r.rates.missing.length + r.rates.notOwner.length + r.rates.falselyOwner.length === 0 ? "yes" : [r.rates.missing.length ? `missing ${r.rates.missing.join(", ")}` : "", r.rates.notOwner.length ? `not marked theirs: ${r.rates.notOwner.join(", ")}` : "", r.rates.falselyOwner.length ? `passed off as theirs: ${r.rates.falselyOwner.length}` : ""].filter(Boolean).join("; ");
    const min = !r.minimum ? "—" : r.minimum.got === r.minimum.want ? "yes" : `wanted ${money(r.minimum.want)}, got ${r.minimum.got === null ? "none" : money(r.minimum.got)}`;
    out.push(`| ${r.pass ? "✅" : "❌"} ${r.id} | ${r.kind} | ${r.built ? "yes" : "NO"} | ${r.jobs.filter((j) => j.ok).length}/${r.jobs.length} | ${rates} | ${min} | ${Math.round(r.seconds)} |`);
  }
  out.push("", "## What went wrong", "");
  for (const r of rows.filter((x) => !x.pass)) {
    out.push(`### ${r.id}`);
    if (r.error) out.push(`- Build failed: ${r.error}`);
    for (const j of r.jobs.filter((x) => !x.ok || x.noPlace.length > 0)) {
      out.push(`- **${j.label}** — wanted ${j.want}, got ${j.got === null ? "no price" : money(j.got)}${j.offBy ? ` (${j.offBy > 0 ? "+" : ""}${(j.offBy * 100).toFixed(1)}%)` : ""}${j.error ? ` — ${j.error}` : ""}`);
      if (j.lines) out.push(`  - Lines: ${j.lines.map((l) => `${l.name} ${money(l.amount)}`).join(" · ")}`);
      if (j.inputs) out.push(`  - Answers given: \`${JSON.stringify(j.inputs)}\``);
      if (j.noPlace.length > 0) out.push(`  - No place on the form for: ${j.noPlace.join("; ")}`);
    }
    if (r.warnings.length > 0) out.push(`- Builder's own warnings: ${r.warnings.join(" | ")}`);
    out.push("");
  }
  return out.join("\n");
}

async function main() {
  const cases = CASES.filter((c) => ONLY.length === 0 || ONLY.includes(c.id));
  console.log(`${cases.length} cases · builder ${BUILDER} · grader ${GRADER} · ${CONCURRENCY} at a time`);
  const rows: Row[] = [];
  const queue = [...cases];
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let c = queue.shift(); c; c = queue.shift()) {
        try {
          const got = await runCase(c);
          rows.push(...got);
          for (const r of got) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.id} — ${r.built ? `${r.jobs.filter((j) => j.ok).length}/${r.jobs.length} jobs` : `did not build: ${r.error}`} (${Math.round(r.seconds)} s)`);
        } catch (err) {
          console.log(`FAIL ${c.id} — the harness threw: ${err instanceof Error ? err.message : String(err)}`);
          rows.push(finish({ id: c.id, trade: c.trade, kind: c.cold ? "market" : "exact", built: false, error: `Harness error: ${err instanceof Error ? err.message : String(err)}`, seconds: 0, jobs: [], warnings: [], asked: [] }));
        }
      }
    })
  );
  const order = cases.flatMap((c) => [c.id, `${c.id}:change`]);
  rows.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${LABEL}.json`), JSON.stringify({ label: LABEL, builder: BUILDER, grader: GRADER, at: new Date().toISOString(), rows }, null, 1));
  writeFileSync(join(OUT, `${LABEL}.md`), report(rows));
  console.log(`\n${rows.filter((r) => r.pass).length}/${rows.length} passed → ${join(OUT, `${LABEL}.md`)}`);
  await new Promise((r) => setTimeout(r, 1500)); // let the usage ledger writes land
  await prisma.$disconnect();
  process.exit(0);
}

void main();
