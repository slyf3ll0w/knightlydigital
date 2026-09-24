import { coerceInputs, type EstimatorSpec } from "./estimator";
import { meteredOneShot, oneShotJson } from "./atlas-oneshot";

/**
 * The METERED half of an estimate tool — "describe the job (or snap a photo)
 * and Atlas fills in the inputs" — shared by the in-app runner
 * (/api/app/estimators/[id]/assist) and, when the owner opts in, the website
 * form (/api/public/estimate/[slug]/[tool]/assist). Only proposes input
 * VALUES; the compute that follows is the free run. Every value is coerced
 * exactly as the form would be, so nothing the model says reaches the math
 * unchecked.
 */

export const ASSIST_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
/** ≈ 2 MB decoded — the clients downscale to ~1280 px before sending. */
export const ASSIST_IMAGE_MAX_BASE64 = 2_800_000;

export type AssistImage = { base64: string; mime: string };

/** null = no image sent; "bad" = something sent but unusable. */
export function readAssistImage(body: Record<string, unknown>): AssistImage | null | "bad" {
  const raw = typeof body.imageBase64 === "string" ? body.imageBase64.trim() : "";
  if (!raw) return null;
  const base64 = raw.replace(/^data:[^;]+;base64,/, "");
  const mime = typeof body.imageMime === "string" ? body.imageMime.toLowerCase().trim() : "";
  if (!ASSIST_IMAGE_MIMES.has(mime)) return "bad";
  if (base64.length > ASSIST_IMAGE_MAX_BASE64 || !/^[A-Za-z0-9+/=]+$/.test(base64.slice(0, 400))) return "bad";
  return { base64, mime };
}

export function inputsPrompt(spec: EstimatorSpec): string {
  return spec.inputs
    .map((i) => {
      const tag = i.askAtlas ? " [ASSESS — always answer this one, best judgment]" : "";
      const base = `- ${i.id} (${i.type})${tag}: ${i.label}${i.help ? ` — ${i.help}` : ""}${i.showWhen ? ` [only relevant when ${i.showWhen}]` : ""}`;
      if (i.type === "number") return `${base}${i.unit ? ` [${i.unit}]` : ""}${i.min !== undefined ? ` min ${i.min}` : ""}${i.max !== undefined ? ` max ${i.max}` : ""}`;
      if (i.type === "select") return `${base}. One of: ${i.options.map((o) => `"${o.value}" (${o.label})`).join(", ")}`;
      if (i.type === "multi") return `${base}. A LIST of any of: ${i.options.map((o) => `"${o.value}" (${o.label})`).join(", ")}`;
      if (i.type === "counts") return `${base}. A TABLE {value: count} over: ${i.options.map((o) => `"${o.value}" (${o.label})`).join(", ")}`;
      if (i.type === "map") return `${base}. Normally drawn on a map — a number in ${i.measure === "length" ? "FEET (a line)" : "SQUARE FEET (an area)"}; include only if the description or photo gives the size`;
      if (i.type === "toggle") return `${base}. true/false`;
      return `${base}. Free text`;
    })
    .join("\n");
}

export function assistSystemPrompt(spec: EstimatorSpec, toolName: string, hasImage: boolean): string {
  const assessed = spec.inputs.filter((i) => i.askAtlas);
  return `You are an experienced estimator filling in an estimate form from a job description${hasImage ? " and a photo" : ""} for a field-service business. Tool: "${toolName}".${spec.intro ? ` ${spec.intro}` : ""}
Reply with ONLY a JSON object: {"values": {inputId: value, ...}, "notes": "one short line: what you assumed or guessed, and anything you couldn't tell"}.
Rules:
- numbers as numbers (no units), select inputs by their exact value, multi inputs as a list of exact values, counts inputs as a table {"value": count}, toggles as true/false, text inputs as short strings.
- Be useful, not timid: a pro looking at this job would commit to a number. Fill in every input the evidence supports, and make a confident best estimate wherever the words or picture give you SOMETHING to go on ("two-car driveway" → about 500 sq ft; a photo showing a typical suburban lawn → a typical size for one). Say in notes which values are estimates so the person can adjust them.
- Leave an input out only when there is truly nothing to go on (no size, no count, no clue) — then say so in notes in a few words. Never pad the form with made-up counts of things that aren't mentioned or visible.
- Where the description gives a range, use the midpoint and note it.
${assessed.length > 0 ? `- The inputs marked ASSESS are yours to judge — the business built the tool so a pro's eye answers them. ALWAYS give a value for each, using the evidence and the "what to look for" guidance; when the evidence is thin, off-topic or the photo is unclear, pick the most typical option for this kind of job and say so in notes.\n` : ""}${hasImage ? "- From the photo: read what is visibly there (surface type, stories, condition, counts of windows/doors/fixtures, obvious add-ons). Estimate sizes from reference points (a car ≈ 15 ft, a door ≈ 7 ft, a standard window ≈ 3 ft wide) and say the estimate is from the photo in notes. If the photo doesn't show the job at all (a selfie, a screenshot, something unrelated), say so in notes and fill in from the words alone.\n" : ""}${spec.assist?.instructions ? `Guidance from the business (follow it — it overrides the general rules above):\n${spec.assist.instructions}\n` : ""}Inputs:
${inputsPrompt(spec)}`;
}

export type AssistOutcome =
  | { ok: true; values: Record<string, unknown>; notes: string; skipped: string[]; turnTokens: number; access: Awaited<ReturnType<typeof meteredOneShot>> extends { access: infer A } ? A : never }
  | { ok: false; status: number; error: string; access?: unknown; atlasLocked?: boolean };

/** One metered call → coerced input values (only the inputs the model filled and that validate). */
export async function runAssist(
  actor: { id: string; companyId: string },
  spec: EstimatorSpec,
  toolName: string,
  description: string,
  image: AssistImage | null
): Promise<AssistOutcome> {
  const result = await meteredOneShot(actor, {
    kind: "estimator",
    system: assistSystemPrompt(spec, toolName, Boolean(image)),
    prompt: description ? `Job description:\n${description}` : "No written description — go by the photo.",
    maxOutputTokens: 600,
    image: image ?? undefined,
  });
  if (!result.ok) return { ok: false, status: result.status, error: result.error, access: result.access, atlasLocked: result.atlasLocked };
  const parsed = oneShotJson<{ values?: Record<string, unknown>; notes?: unknown }>(result.text);
  const rawValues = parsed?.values && typeof parsed.values === "object" ? parsed.values : {};
  const picked: Record<string, unknown> = {};
  for (const inp of spec.inputs) {
    const v = rawValues[inp.id];
    if (inp.id in rawValues && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)) picked[inp.id] = v;
  }
  const { values, problems } = coerceInputs(spec, picked);
  const cleaned: Record<string, unknown> = {};
  for (const inp of spec.inputs) {
    if (!(inp.id in picked)) continue; // don't echo defaults as "filled in"
    if (problems.some((p) => p.id === inp.id)) continue;
    cleaned[inp.id] = values[inp.id];
  }
  return {
    ok: true,
    values: cleaned,
    notes: typeof parsed?.notes === "string" ? parsed.notes.slice(0, 300) : "",
    skipped: problems.map((p) => p.message),
    turnTokens: result.atlasTokens,
    access: result.access as never,
  };
}
