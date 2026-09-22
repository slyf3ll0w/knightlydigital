import { prisma } from "../db";
import { canSell, isManager } from "../permissions";
import { str, stage, type Tool } from "./core";
import {
  compileSpec,
  describeSpecChanges,
  runCompiled,
  ESTIMATOR_GUIDE,
  ESTIMATOR_LIMITS,
  specFromJson,
  usesAtlas,
  type EstimatorSpec,
} from "../estimator";
import { checkSpec, ESTIMATOR_SELECT, estimatorSummary, loadPriceBook, publicEstimatePath, runStoredEstimator } from "../estimator-server";
import { describePublicConfig, publicSlugFrom, sanitizePublicConfig, type EstimatorPublicConfig } from "../estimator-public";

/**
 * Estimate tools (docs/plans/ai-estimators-2026-09-19.md).
 *
 * manage_estimator is the BUILDER: the user describes how they price a kind
 * of job, the model writes a spec (lib/estimator.ts), tests it, and stages a
 * create/update card. That conversation costs tokens like any other turn.
 * run_estimator RUNS a saved tool for a client — plain arithmetic, no extra
 * model call — and hands the lines to create_quote.
 */

const SPEC_PARAM = {
  type: "object",
  description:
    "The estimate tool's rules. Call action 'guide' first for the exact format, expression language and examples.",
  properties: {
    intro: { type: "string", description: "one or two sentences shown above the inputs" },
    inputs: {
      type: "array",
      description: "questions the user answers before the estimate is computed",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "identifier used in expressions (letters/digits/_)" },
          label: { type: "string" },
          type: { type: "string", enum: ["number", "select", "multi", "counts", "map", "toggle", "text"] },
          help: { type: "string" },
          askAtlas: { type: "boolean", description: "Atlas answers this from the job description/photo at run time (costs the business tokens) — only for what a pro must look at: condition, access, hazard, scope" },
          section: { type: "string", description: "group heading; the website form shows one section per step" },
          showWhen: { type: "string", description: "expression over other inputs; the question only shows when truthy" },
          unit: { type: "string", description: "number inputs: sq ft, hours, windows…" },
          min: { type: "number" },
          max: { type: "number" },
          step: { type: "number" },
          control: { type: "string", enum: ["field", "slider", "stepper"], description: "number inputs: how it's answered (slider needs max)" },
          presets: {
            type: "array",
            description: "number inputs: quick-picks ('Two-car — 550 sq ft')",
            items: { type: "object", properties: { label: { type: "string" }, value: { type: "number" } }, required: ["label", "value"] },
          },
          measure: { type: "string", enum: ["length", "area"], description: "map inputs: a line in feet or an area in square feet" },
          style: { type: "string", enum: ["list", "cards", "packages"], description: "select inputs: dropdown, tap cards, or good/better/best tiers with live prices" },
          default: { type: "string", description: "default value as text ('1', 'medium', 'true')" },
          required: { type: "boolean" },
          options: {
            type: "array",
            description: "select / multi inputs: the choices",
            items: {
              type: "object",
              properties: {
                value: { type: "string" },
                label: { type: "string" },
                blurb: { type: "string", description: "one line under the label on cards / tiers" },
                includes: { type: "array", items: { type: "string" }, description: "package tiers: what the tier includes" },
                recommended: { type: "boolean", description: "package tiers: the one to badge" },
              },
              required: ["value", "label"],
            },
          },
        },
        required: ["id", "label", "type"],
      },
    },
    variables: {
      type: "array",
      description: "named intermediate values, evaluated in order",
      items: { type: "object", properties: { id: { type: "string" }, expr: { type: "string" } }, required: ["id", "expr"] },
    },
    lines: {
      type: "array",
      description: "line-item rules; each produces one quote line when its 'when' is true and quantity > 0",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "template" },
          description: { type: "string", description: "template" },
          when: { type: "string", description: "expression; omit for always" },
          quantity: { type: "string", description: "expression; default 1" },
          unitPrice: { type: "string", description: "expression in dollars; omit to use the workItemName's price" },
          workItemName: { type: "string", description: "exact price-book item name this line sells" },
          isOptional: { type: "boolean" },
          group: { type: "string", description: "breakdown heading (Labor, Materials, Add-ons, Package)" },
        },
        required: ["name"],
      },
    },
    placeholders: { type: "array", items: { type: "string" }, description: "rates you had to guess, one human line each; [] when none" },
    samples: {
      type: "array",
      description: "small / typical / large jobs with every required input answered — the build runs them",
      items: { type: "object", properties: { label: { type: "string" }, inputs: { type: "object" } }, required: ["label", "inputs"] },
    },
    minimumTotal: { type: "number", description: "job minimum in dollars" },
    quoteTitle: { type: "string", description: "template for the quote title" },
    clientMessage: { type: "string", description: "template for the note to the client" },
    assist: {
      type: "object",
      description: "ONLY when judgment from a written description is needed — costs the user tokens per use. Omit for simple pricing.",
      properties: { enabled: { type: "boolean" }, instructions: { type: "string" } },
    },
  },
} as const;

/** Gemini declarations want concrete properties, so inputs travel as [{id, value}] —
 *  but a model that sends {id: value} anyway is accepted too. */
const INPUTS_PARAM = {
  type: "array",
  description: "the tool's inputs as [{id, value}] pairs — numbers plain ('1200'), toggles 'true'/'false', selects by option value",
  items: {
    type: "object",
    properties: { id: { type: "string" }, value: { type: "string" } },
    required: ["id", "value"],
  },
} as const;

function inputsArg(raw: unknown): Record<string, unknown> {
  if (Array.isArray(raw)) {
    const out: Record<string, unknown> = {};
    for (const item of raw.slice(0, ESTIMATOR_LIMITS.inputs)) {
      const r = (item ?? {}) as Record<string, unknown>;
      const id = str(r.id, 40);
      if (id) out[id] = r.value;
    }
    return out;
  }
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  return {};
}

function badgeLines(spec: EstimatorSpec): string[] {
  const lines = [
    `Inputs: ${spec.inputs.map((i) => i.label).join(", ") || "none"}`,
    `Line rules: ${spec.lines.length}`,
  ];
  if (spec.minimumTotal) lines.push(`Job minimum: $${spec.minimumTotal.toFixed(2)}`);
  lines.push(usesAtlas(spec) ? "Cost to run: Atlas tokens per assisted estimate (manual entry stays free)" : "Cost to run: free — plain math, no Atlas tokens");
  return lines;
}

/** Website form settings (lib/estimator-public.ts) as the model passes them. */
const WEBSITE_PARAM = {
  type: "object",
  description:
    "Optional: put this tool on the business's website as a lead-capture form. Visitors answer the questions, see the estimate the owner wants shown, leave their details and become a lead + request (+ quote). Free for the owner — visitors never spend tokens.",
  properties: {
    enabled: { type: "boolean", description: "true = live on the website; false = off (link shows nothing)" },
    slug: { type: "string", description: "link name, e.g. 'driveway-estimate'; default from the tool name" },
    showPrice: { type: "string", enum: ["exact", "range", "hidden"], description: "exact lines + total (default) · a ± range · no number (owner follows up)" },
    rangePct: { type: "number", description: "range half-width in percent, 5–50 (default 15)" },
    reveal: { type: "string", enum: ["instant", "after_contact"], description: "instant (default) = estimate first, then ask for details · after_contact = details first, estimate on the thank-you screen" },
    onSubmit: { type: "string", enum: ["draft", "send", "request"], description: "draft (default) = lead + request + draft quote · send = email the quote for approval · request = lead + request only" },
    heading: { type: "string" },
    intro: { type: "string" },
    buttonLabel: { type: "string" },
    askPhone: { type: "boolean", description: "default true" },
    requirePhone: { type: "boolean", description: "default false" },
    askAddress: { type: "boolean", description: "default false" },
    requireAddress: { type: "boolean" },
    disclaimer: { type: "string", description: "fine print under the estimate; a sensible default exists" },
    successMessage: { type: "string", description: "thank-you text; default fits onSubmit" },
    photoAssist: { type: "boolean", description: "visitors may attach a photo / describe the job and Atlas fills in the answers — spends the OWNER's tokens (capped per day); needs the tool's assist; default false. Offer it only when the owner asks for photos or the tool already uses assist." },
  },
} as const;

function websiteConfigFrom(raw: Record<string, unknown>, base: EstimatorPublicConfig): EstimatorPublicConfig {
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const askPhone = bool(raw.askPhone, base.fields.phone.show);
  const askAddress = bool(raw.askAddress, base.fields.address.show);
  return sanitizePublicConfig({
    ...base,
    ...(raw.showPrice !== undefined ? { showPrice: raw.showPrice } : {}),
    ...(raw.rangePct !== undefined ? { rangePct: raw.rangePct } : {}),
    ...(raw.reveal !== undefined ? { reveal: raw.reveal } : {}),
    ...(raw.onSubmit !== undefined ? { onSubmit: raw.onSubmit } : {}),
    ...(typeof raw.heading === "string" ? { heading: raw.heading } : {}),
    ...(typeof raw.intro === "string" ? { intro: raw.intro } : {}),
    ...(typeof raw.buttonLabel === "string" ? { buttonLabel: raw.buttonLabel } : {}),
    ...(typeof raw.disclaimer === "string" ? { disclaimer: raw.disclaimer } : {}),
    ...(typeof raw.successMessage === "string" ? { successMessage: raw.successMessage } : {}),
    ...(typeof raw.photoAssist === "boolean" ? { photoAssist: raw.photoAssist } : {}),
    fields: {
      ...base.fields,
      phone: { show: askPhone, required: askPhone && bool(raw.requirePhone, base.fields.phone.required) },
      address: { show: askAddress, required: askAddress && bool(raw.requireAddress, base.fields.address.required) },
    },
  });
}

/** Turn the model's `website` argument into route payload + card lines. */
function websiteFromArgs(
  raw: unknown,
  toolName: string,
  companySlug: string,
  current: { isPublic: boolean; publicSlug: string | null; publicConfig: unknown } | null
): { payload: Record<string, unknown>; lines: string[] } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const base = sanitizePublicConfig(current?.publicConfig);
  const enabled = typeof r.enabled === "boolean" ? r.enabled : current?.isPublic ?? true;
  const slug = (typeof r.slug === "string" && publicSlugFrom(r.slug)) || current?.publicSlug || publicSlugFrom(toolName) || "estimate";
  const config = websiteConfigFrom(r, base);
  const payload: Record<string, unknown> = { isPublic: enabled, publicSlug: slug, publicConfig: config };
  const lines = enabled
    ? [`Website form: ON at /book/${companySlug}/estimate/${slug}`, ...describePublicConfig(config)]
    : ["Website form: off"];
  return { payload, lines };
}

async function companySlugOf(companyId: string): Promise<string> {
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { slug: true } });
  return c?.slug ?? "";
}

function websiteState(row: { isPublic: boolean; publicSlug: string | null; publicConfig: unknown }, companySlug: string) {
  const path = publicEstimatePath(companySlug, row);
  return path ? { on: true, url: path, embedNote: "embed snippet under Settings → Estimate tools → globe button", ...Object.fromEntries(describePublicConfig(sanitizePublicConfig(row.publicConfig)).map((l, i) => [`detail${i + 1}`, l])) } : { on: false };
}

const manageEstimator: Tool = {
  decl: {
    name: "manage_estimator",
    description:
      "Build and maintain the company's estimate tools (managers): saved calculators that turn a few inputs (square footage, rooms, hours, options) into quote line items using the business's own pricing rules. Running a tool is plain math and free; building one is your job here. Workflow: action 'guide' (spec format + expression reference + the price book — call it before writing a spec), then 'test' the spec with sample inputs until it's right, then 'update' (with estimatorId) which shows a confirmation card. A NEW tool is different: call 'create' with request = the owner's words — it opens the Estimates page's builder, which drafts, tests and saves the tool while they watch; you never write a spec for a new tool. 'list' shows saved tools; 'get' returns one tool's full spec for editing. Use the rates the user gives you or the price book — never invent a business's prices. Only add 'assist' when judgment from a written description is genuinely needed (it costs the user tokens per use). Any tool can also be a WEBSITE FORM (pass 'website' on create/update): visitors on the business's site answer the questions, see the estimate the owner chooses to show (exact, a range, or none) and become a lead + request (+ quote) — free for the owner.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["guide", "list", "get", "test", "create", "update"] },
        estimatorId: { type: "string", description: "for get/update/test-of-saved (from list)" },
        request: { type: "string", description: "create: the owner's words describing the tool they want, verbatim, plus any rates they gave" },
        name: { type: "string", description: "tool name, e.g. 'Driveway & house wash', 'Interior paint by room'" },
        description: { type: "string", description: "one line: when to use this tool" },
        spec: SPEC_PARAM,
        inputs: { ...INPUTS_PARAM, description: `sample inputs for 'test': ${INPUTS_PARAM.description}` },
        isActive: { type: "boolean", description: "update: turn the tool on/off" },
        website: WEBSITE_PARAM,
      },
      required: ["action"],
    },
  },
  allowed: (a) => isManager(a.role),
  run: async (actor, args, ctx) => {
    const action = str(args.action, 10);

    if (action === "guide") {
      const book = await loadPriceBook(actor.companyId);
      return {
        guide: ESTIMATOR_GUIDE,
        priceBook: book.slice(0, 80).map((b) => `${b.name}: $${b.unitPrice.toFixed(2)}`),
        priceBookNote: book.length > 80 ? `${book.length - 80} more — use get_price_book` : undefined,
        limits: ESTIMATOR_LIMITS,
        websiteForms:
          "Any tool can be published as a website form: pass website: {enabled: true, showPrice: 'exact'|'range'|'hidden', reveal: 'instant'|'after_contact', onSubmit: 'draft'|'send'|'request', …} on create or update. Ask the owner two things at most: what visitors should see (exact price / range / no price) and what should happen (draft quote for review / email the quote / just the lead). Default = exact price shown right away, then name + email + phone, lead + request + draft quote. The link is /book/<companySlug>/estimate/<slug>; the embed snippet lives under the Estimates page (Website button on the tool). Visitors never spend the owner's tokens unless the owner turns on photoAssist (a photo / description fill-in on the form, capped per day, needs the tool's assist). Text inputs are fine on a public form — they land in the request as answers. Every saved change keeps the previous version (Estimates → Edit → History), and the owner can edit rates by hand there too.",
        next: "Draft the spec from what the user told you, run action 'test' with realistic sample inputs, then stage 'create'.",
      };
    }

    if (action === "list") {
      const rows = await prisma.estimator.findMany({
        where: { companyId: actor.companyId },
        select: ESTIMATOR_SELECT,
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
      });
      return {
        tools: await (async () => {
          const companySlug = await companySlugOf(actor.companyId);
          return rows.map((r) => {
            const spec = specFromJson(r.spec);
            if (!spec) return { id: r.id, name: r.name, broken: true };
            const { publicConfig: _pc, publicSlug: _ps, isPublic: _ip, ...summary } = estimatorSummary(r, spec);
            return { ...summary, website: websiteState(r, companySlug) };
          });
        })(),
        page: "/app/estimates",
      };
    }

    if (action === "get") {
      const row = await prisma.estimator.findFirst({ where: { id: str(args.estimatorId, 40), companyId: actor.companyId }, select: ESTIMATOR_SELECT });
      if (!row) return { error: "No estimate tool with that id — use action 'list'." };
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        isActive: row.isActive,
        spec: row.spec,
        runs: row.runs,
        assists: row.assists,
        website: websiteState(row, await companySlugOf(actor.companyId)),
        websiteSubmissions: row.submissions,
      };
    }

    if (action === "test") {
      let rawSpec: unknown = args.spec;
      const id = str(args.estimatorId, 40);
      if (!rawSpec && id) {
        const row = await prisma.estimator.findFirst({ where: { id, companyId: actor.companyId }, select: { spec: true } });
        if (!row) return { error: "No estimate tool with that id — use action 'list'." };
        rawSpec = row.spec;
      }
      if (!rawSpec) return { error: "Pass the spec to test (or an estimatorId for a saved tool)." };
      const check = await checkSpec(actor.companyId, rawSpec);
      if (!check.ok) return { compiles: false, errors: check.errors, fix: "Correct the spec and test again before creating." };
      const inputs = inputsArg(args.inputs);
      const result = runCompiled(check.compiled, inputs, check.book);
      if (!result.ok) return { compiles: true, ran: false, errors: result.errors, note: "The spec compiles; the sample inputs didn't produce a quote. Fix the inputs or the rules." };
      return {
        compiles: true,
        ran: true,
        lines: result.lines.map((l) => ({ name: l.name, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, isOptional: l.isOptional || undefined, priceBookItem: l.workItemId ? true : undefined })),
        subtotal: result.subtotal,
        title: result.title,
        clientMessage: result.clientMessage,
        warnings: result.warnings,
        costToRun: usesAtlas(check.compiled.spec) ? "Atlas tokens per assisted estimate" : "free",
        note: "Sanity-check the numbers against what the user told you, then stage create/update.",
      };
    }

    if (action === "create") {
      // New tools are built on the Estimates page (streaming builder, no card):
      // hand the owner's words over and send the drawer there.
      const request = str(args.request, 1500) || str(args.description, 1500) || str(args.name, 200);
      if (!request) return { error: "Pass request: the owner's own words describing the tool (and any rates they gave)." };
      ctx.navigate = `/app/estimates?prompt=${encodeURIComponent(request)}`;
      return {
        opened: "/app/estimates",
        note: "The Estimates builder is opening with their request filled in. Reply in ONE short sentence — the builder is open, press Build it and the tool appears in a few seconds. Do not draft, describe or promise a spec here.",
      };
    }

    if (action === "update") {
      const row = await prisma.estimator.findFirst({ where: { id: str(args.estimatorId, 40), companyId: actor.companyId }, select: ESTIMATOR_SELECT });
      if (!row) return { error: "No estimate tool with that id — use action 'list' first." };
      const payload: Record<string, unknown> = {};
      const lines: string[] = [];
      const name = str(args.name, 80);
      if (name && name !== row.name) {
        payload.name = name;
        lines.push(`Rename to: ${name}`);
      }
      const description = str(args.description, 200);
      if (description && description !== row.description) {
        payload.description = description;
        lines.push(`Use it for: ${description}`);
      }
      if (typeof args.isActive === "boolean" && args.isActive !== row.isActive) {
        payload.isActive = args.isActive;
        lines.push(args.isActive ? "Turn it on" : "Turn it off (hidden from quotes)");
      }
      if (args.spec) {
        const check = await checkSpec(actor.companyId, args.spec);
        if (!check.ok) return { error: "The new spec doesn't compile.", errors: check.errors };
        // Say WHAT changes when it's a handful of things; fall back to the summary badges for a rewrite.
        // An identical spec is simply not a change (the name/website parts of the card still apply).
        const before = specFromJson(row.spec);
        const changes = before ? describeSpecChanges(before, check.compiled.spec) : [];
        if (!before || changes.length > 0) {
          payload.spec = check.compiled.spec;
          if (changes.length > 0 && changes.length <= 10) lines.push("Changes to the rules:", ...changes);
          else lines.push("Replace the rules:", ...badgeLines(check.compiled.spec));
        }
      }
      const web = websiteFromArgs(args.website, name || row.name, await companySlugOf(actor.companyId), row);
      if (web) {
        Object.assign(payload, web.payload);
        lines.push(...web.lines);
      }
      if (lines.length === 0) return { error: "Nothing to change — pass a new spec, name, description, isActive or website." };
      payload.source = "atlas";
      return stage(ctx, {
        kind: "manage_estimator",
        title: `Update estimate tool "${row.name}"`,
        lines,
        endpoint: `/api/app/estimators/${row.id}`,
        method: "PATCH",
        payload,
        href: "/app/estimates",
      });
    }

    return { error: "action must be guide, list, get, test, create or update" };
  },
};

const runEstimatorTool: Tool = {
  decl: {
    name: "run_estimator",
    description:
      "Price a job with one of the company's saved estimate tools — free, no extra AI cost. Pass the tool (estimatorId or exact name; call with no arguments to see the list) and its inputs as {inputId: value}, taken from what the user told you (ask once for anything missing). Returns ready-to-use quote line items plus a suggested title and client message: follow up with create_quote (or update_quote to add them to an existing quote).",
    parameters: {
      type: "object",
      properties: {
        estimatorId: { type: "string" },
        name: { type: "string", description: "exact tool name instead of the id" },
        inputs: INPUTS_PARAM,
      },
    },
  },
  allowed: (a) => canSell(a.role),
  run: async (actor, args) => {
    const rows = await prisma.estimator.findMany({
      where: { companyId: actor.companyId, isActive: true },
      select: ESTIMATOR_SELECT,
      orderBy: { name: "asc" },
    });
    const wantedId = str(args.estimatorId, 40);
    const wantedName = str(args.name, 80).toLowerCase();
    const row = rows.find((r) => r.id === wantedId) ?? rows.find((r) => r.name.toLowerCase() === wantedName);
    if (!row) {
      if (rows.length === 0) return { error: "This company has no estimate tools yet. A manager can ask me to build one (manage_estimator)." };
      return {
        error: wantedId || wantedName ? "No active estimate tool matches — pick one of these." : "Which tool? Pick one and pass its inputs.",
        tools: rows.map((r) => {
          const spec = specFromJson(r.spec);
          return {
            id: r.id,
            name: r.name,
            description: r.description,
            inputs: spec?.inputs.map((i) => ({
              id: i.id,
              label: i.label,
              type: i.type,
              ...(i.type === "select" ? { options: i.options.map((o) => o.value) } : {}),
              ...(i.type === "number" && i.unit ? { unit: i.unit } : {}),
            })),
          };
        }),
      };
    }
    const spec = specFromJson(row.spec);
    if (!spec) return { error: "This tool's saved rules no longer compile — a manager should rebuild it with manage_estimator." };
    const inputs = inputsArg(args.inputs);
    const result = await runStoredEstimator(row, actor.companyId, inputs);
    if (!result.ok) {
      return {
        error: result.errors.join("; "),
        inputs: spec.inputs.map((i) => ({
          id: i.id,
          label: i.label,
          type: i.type,
          required: "required" in i ? i.required !== false : false,
          ...(i.type === "select" ? { options: i.options.map((o) => o.value) } : {}),
          ...(i.type === "number" && i.unit ? { unit: i.unit } : {}),
        })),
        note: "Fill in the missing inputs from what the user said, or ask for them (all at once).",
      };
    }
    return {
      tool: row.name,
      lineItems: result.lines.map((l) => ({
        name: l.name,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        ...(l.isOptional ? { isOptional: true } : {}),
      })),
      subtotal: result.subtotal,
      title: result.title,
      clientMessage: result.clientMessage,
      warnings: result.warnings.length > 0 ? result.warnings : undefined,
      next: "Show the user the lines and subtotal, then call create_quote with these lineItems (and the title/clientMessage) for the client — or update_quote to add them to an existing quote.",
    };
  },
};

export const estimatorTools: Tool[] = [manageEstimator, runEstimatorTool];

// keep the compile helper reachable for tests that import the module
export { compileSpec };
