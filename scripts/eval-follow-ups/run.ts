/**
 * The follow-ups model scorecard: what the model actually writes, held
 * against the same check production uses (lib/follow-ups.ts `writeDraft`),
 * then read by a second, stronger model that knows the facts.
 *
 *   npx tsx scripts/eval-follow-ups/run.ts [--out dir] [--label name] [--repeat n] [--concurrency n]
 *
 * No database. Needs ANTHROPIC_API_KEY (or GEMINI_API_KEY) in the
 * environment. The pure scorecard (scripts/test-follow-ups.ts) covers WHO
 * gets a follow-up and proves the check itself; this one answers "how often
 * does the owner get a message written for this client, and is it one they
 * would send".
 *
 * The launch bar (docs/plans/ai-workers-follow-ups-2026-11-17.md):
 *   - nothing that fails the check is ever shown (true by construction: a
 *     failed draft is replaced by the built-in wording);
 *   - at least 90% of cases end with a model-written draft within two tries;
 *   - the grader finds an invented fact in none of the drafts shown;
 *   - at least 90% of the drafts shown are ones the grader would send as is.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { aiChat, extractJsonObject } from "../../lib/ai";
import { followUpPrompt, usd, writeDraft, type DraftFacts, type WrittenDraft } from "../../lib/follow-ups";

const args = process.argv.slice(2);
const arg = (name: string): string | null => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] ?? "" : null;
};
const OUT = arg("out") ?? "eval-results";
const LABEL = arg("label") ?? "follow-ups";
const REPEAT = Math.max(1, Number(arg("repeat") ?? 1));
const CONCURRENCY = Math.max(1, Number(arg("concurrency") ?? 3));
const WRITER = process.env.AI_MODEL_ASSISTANT || (process.env.ANTHROPIC_API_KEY ? "claude-haiku-5-5" : "gemini-2.5-flash");
const GRADER = process.env.EVAL_GRADER_MODEL || "claude-sonnet-5-5";

const text = (parts: Awaited<ReturnType<typeof aiChat>>) => (parts ?? []).map((p) => ("text" in p && typeof p.text === "string" ? p.text : "")).join("").trim();

type Case = { id: string; facts: DraftFacts };
const base: DraftFacts = {
  kind: "invoice", channel: "text", tone: 1, clientFirstName: "Maria", senderFirstName: "Dave", companyName: "Lessly Fence",
  number: 214, title: "Fence repair", amount: 850, total: 850, alsoOwed: [], dueDateLabel: "November 11", validUntilLabel: null,
  daysPastDue: 6, followUpCount: 0, hasLink: true,
};
const who = [
  { clientFirstName: "Maria", senderFirstName: "Dave", companyName: "Lessly Fence", title: "Fence repair" },
  { clientFirstName: "Court", senderFirstName: "Bill", companyName: "Atlas Roofing", title: "Roof leak repair" },
  { clientFirstName: "Jean-Luc", senderFirstName: "Christopher", companyName: "Steadfast Fence and Deck", title: "FENCE - 50% dep" },
  { clientFirstName: "DeShawn", senderFirstName: "", companyName: "Knight Light Electric", title: null },
];
const CASES: Case[] = [];
let n = 0;
for (const kind of ["invoice", "quote"] as const) {
  for (const channel of ["text", "email"] as const) {
    for (const tone of [1, 2, 3] as const) {
      const p = who[n++ % who.length];
      const followUpCount = tone - 1;
      if (kind === "invoice") {
        CASES.push({ id: `invoice-${channel}-t${tone}`, facts: { ...base, ...p, kind, channel, tone, followUpCount, daysPastDue: tone === 1 ? 6 : tone === 2 ? 24 : 50 } });
        if (tone === 2) {
          CASES.push({ id: `invoice-${channel}-two`, facts: { ...base, ...who[n++ % who.length], kind, channel, tone, followUpCount: 1, daysPastDue: 30, alsoOwed: [{ number: 198, amount: 300.5 }] } });
          CASES.push({ id: `invoice-${channel}-partial`, facts: { ...base, ...who[n++ % who.length], kind, channel, tone, followUpCount: 0, amount: 425, total: 850, daysPastDue: 22 } });
        }
      } else {
        const hasLink = channel === "email";
        const q: DraftFacts = { ...base, ...p, kind, channel, tone, followUpCount, number: 108, amount: 4200, total: 4200, dueDateLabel: null, daysPastDue: null, hasLink };
        CASES.push({ id: `quote-${channel}-t${tone}`, facts: q });
        if (tone === 2) CASES.push({ id: `quote-${channel}-expiring`, facts: { ...q, ...who[n++ % who.length], validUntilLabel: "November 21" } });
      }
    }
  }
}

type Grade = { invented: string[]; tone_fits: boolean; sounds_like_a_person: number; would_send: boolean; issue: string };
async function grade(f: DraftFacts, w: WrittenDraft): Promise<Grade | null> {
  const system = [
    "You review a short follow-up message a home-service business owner is about to send to their own client. You are given the only facts the writer had. Judge strictly.",
    "invented: every claim in the message that is NOT supported by the facts (an amount, date, deadline, fee, discount, offer, a past conversation, a promise). Saying the invoice or quote 'is below' is supported when the facts say a link goes with the message. Ordinary courtesy is not a claim, and neither is an offer the tone line itself asks for: answering questions, changing something on the quote, working out a payment plan, keeping the quote open or closing it, or being reachable later. Empty list when there is none.",
    "tone_fits: does it match the tone asked for.",
    "sounds_like_a_person: 1 (a form letter or a collections notice) to 5 (reads like the owner typed it).",
    "would_send: would a careful owner send this exactly as written, to a client they want to keep.",
    "issue: the single most important problem in a few words, or an empty string.",
    'Answer with JSON only: {"invented": [], "tone_fits": true, "sounds_like_a_person": 4, "would_send": true, "issue": ""}',
  ].join("\n");
  const prompt = `FACTS THE WRITER HAD\n${followUpPrompt(f).prompt}\nA link goes with the message: ${f.hasLink ? (f.alsoOwed.length ? `yes, to invoice #${f.number} only` : "yes") : "no"}\nSent as: ${f.channel}\n\nTHE MESSAGE\n${w.draft.subject ? `Subject: ${w.draft.subject}\n\n` : ""}${w.draft.body}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const parts = await aiChat({ system, contents: [{ role: "user", parts: [{ text: prompt }] }], model: GRADER, temperature: 0, maxOutputTokens: 1500, thinkingBudget: 1024 });
    const g = extractJsonObject<Grade>(text(parts));
    if (g && Array.isArray(g.invented)) return g;
  }
  return null;
}

type Row = { id: string; facts: DraftFacts; written: WrittenDraft; grade: Grade | null };
async function runCase(c: Case, rep: number): Promise<Row> {
  const written = await writeDraft(c.facts, async (system, prompt) => {
    const parts = await aiChat({ system, contents: [{ role: "user", parts: [{ text: prompt }] }], model: WRITER, temperature: 0.7, maxOutputTokens: 1200, thinkingBudget: 256 });
    const t = text(parts);
    return t ? { ok: true, text: t } : { ok: false, note: "the model did not answer" };
  });
  const g = written.source === "atlas" ? await grade(c.facts, written) : null;
  const id = REPEAT > 1 ? `${c.id}#${rep + 1}` : c.id;
  console.log(`${written.source === "atlas" ? (g?.would_send && !g.invented.length ? "✓" : "~") : "✗"} ${id}${written.attempts.some((a) => a.length) ? `  (rejected: ${written.attempts.filter((a) => a.length).map((a) => a.join("; ")).join(" | ")})` : ""}${g && (!g.would_send || g.invented.length) ? `  grader: ${[...g.invented, g.issue].filter(Boolean).join("; ")}` : ""}`);
  return { id, facts: c.facts, written, grade: g };
}

async function main() {
  const jobs = CASES.flatMap((c) => Array.from({ length: REPEAT }, (_, r) => [c, r] as const));
  const rows: Row[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < jobs.length) {
        const [c, r] = jobs[next++];
        rows.push(await runCase(c, r));
      }
    })
  );
  rows.sort((a, b) => a.id.localeCompare(b.id));

  const shown = rows.filter((r) => r.written.source === "atlas");
  const firstTry = rows.filter((r) => r.written.source === "atlas" && r.written.attempts.length === 1).length;
  const graded = shown.filter((r) => r.grade);
  const invented = graded.filter((r) => r.grade!.invented.length > 0);
  const wouldSend = graded.filter((r) => r.grade!.would_send && r.grade!.invented.length === 0);
  const human = graded.length ? graded.reduce((s, r) => s + (Number(r.grade!.sounds_like_a_person) || 0), 0) / graded.length : 0;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "n/a");
  const summary = [
    `Writer ${WRITER}, grader ${GRADER}. ${rows.length} cases.`,
    `Model-written within two tries: ${shown.length} of ${rows.length} (${pct(shown.length, rows.length)}); on the first try: ${firstTry}. The rest got the built-in wording.`,
    `Grader found an invented fact in ${invented.length} of ${graded.length} drafts shown.`,
    `Grader would send as is: ${wouldSend.length} of ${graded.length} (${pct(wouldSend.length, graded.length)}). Reads like a person: ${human.toFixed(1)} of 5.`,
  ];
  const pass = shown.length / rows.length >= 0.9 && invented.length === 0 && (graded.length ? wouldSend.length / graded.length >= 0.9 : false);
  console.log(`\n${summary.join("\n")}\n${pass ? "PASSES the launch bar." : "BELOW the launch bar."}`);

  mkdirSync(OUT, { recursive: true });
  const md = [
    `# Follow-ups model scorecard: ${LABEL}`,
    "",
    ...summary.map((s) => `- ${s}`),
    `- ${pass ? "Passes" : "Below"} the launch bar.`,
    "",
    ...rows.flatMap((r) => [
      `## ${r.id}: ${r.written.source === "atlas" ? "model" : "built-in"}`,
      "",
      `${r.facts.kind}, ${r.facts.channel}, tone ${r.facts.tone}, ${r.facts.clientFirstName} / ${r.facts.senderFirstName || "(no sender name)"} / ${r.facts.companyName}, ${usd(r.facts.amount)}`,
      ...r.written.attempts.map((a, i) => (a.length ? `- try ${i + 1} rejected: ${a.join("; ")}` : `- try ${i + 1} passed the check`)),
      ...(r.grade ? [`- grader: would send ${r.grade.would_send ? "yes" : "NO"}, person ${r.grade.sounds_like_a_person}/5, tone ${r.grade.tone_fits ? "fits" : "off"}${r.grade.invented.length ? `, INVENTED: ${r.grade.invented.join("; ")}` : ""}${r.grade.issue ? `, issue: ${r.grade.issue}` : ""}`] : []),
      "",
      "```",
      ...(r.written.draft.subject ? [`Subject: ${r.written.draft.subject}`, ""] : []),
      r.written.draft.body,
      "```",
      "",
    ]),
  ].join("\n");
  writeFileSync(join(OUT, `${LABEL}.md`), md);
  writeFileSync(join(OUT, `${LABEL}.json`), JSON.stringify({ summary, pass, rows }, null, 2));
  console.log(`Report: ${join(OUT, `${LABEL}.md`)}`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
