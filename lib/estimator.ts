/**
 * Estimate tools — AI-built, code-run (docs/plans/ai-estimators-2026-09-19.md).
 *
 * An estimator is a declarative spec: a handful of typed INPUTS the user (or
 * Atlas) fills in, optional named VARIABLES, and LINE rules that turn those
 * numbers into quote line items. Every formula is written in a small, safe
 * expression language — no eval, no code, nothing that can touch the app.
 *
 * Two costs, deliberately separate:
 *   - BUILDING a tool is Atlas work (manage_estimator) and costs tokens once.
 *   - RUNNING a tool is this file: pure arithmetic, no model call, free.
 *   - A spec may opt into `assist` — "describe the job in words and Atlas
 *     fills in the inputs". That one-shot call is metered per use. The
 *     compute that follows is still free, so a locked meter never blocks
 *     quoting: the user just types the inputs by hand.
 *
 * Everything here is pure (no Prisma, no I/O) so unit tests and the client
 * bundle can import it. The tool + routes validate with compileSpec() and
 * refuse to store anything that doesn't compile, so a stored spec always
 * runs.
 */

// ── limits ───────────────────────────────────────────────────────────────────

export const ESTIMATOR_LIMITS = {
  inputs: 40,
  variables: 60,
  lines: 60,
  options: 24,
  exprLen: 500,
  textLen: 300,
  templateLen: 400,
  perCompany: 40,
} as const;

// ── spec types ───────────────────────────────────────────────────────────────

export type EstimatorOption = { value: string; label: string };

/** What every input shares. */
export type EstimatorInputBase = {
  id: string;
  label: string;
  help?: string;
  /** Group heading — consecutive inputs with the same section render under it (the website form makes each section a step). */
  section?: string;
  /** Expression over OTHER inputs: the question only shows (and only counts) when truthy. */
  showWhen?: string;
};

export type EstimatorInput =
  | (EstimatorInputBase & {
      type: "number";
      /** Shown after the field: "sq ft", "hours", "windows". */
      unit?: string;
      min?: number;
      max?: number;
      step?: number;
      default?: number;
      required?: boolean;
    })
  | (EstimatorInputBase & { type: "select"; options: EstimatorOption[]; default?: string; required?: boolean })
  /** Pick several — the value is a list of option values (has(), count(), join()). */
  | (EstimatorInputBase & { type: "multi"; options: EstimatorOption[]; default?: string[]; required?: boolean })
  | (EstimatorInputBase & { type: "toggle"; default?: boolean })
  | (EstimatorInputBase & { type: "text"; placeholder?: string; default?: string; required?: boolean });

export type EstimatorVariable = { id: string; expr: string };

export type EstimatorLine = {
  id: string;
  /** Line-item name on the quote (may be a template: "Mowing — {acres} ac"). */
  name: string;
  /** Template; {expr} placeholders are evaluated ("{sqft} sq ft at {rate|money}"). */
  description?: string;
  /** Condition expression — the line is only emitted when truthy. */
  when?: string;
  /** Expression → number. Default "1". */
  quantity?: string;
  /** Expression → dollars per unit. Falls back to the linked price-book item's price. */
  unitPrice?: string;
  /** Price-book service/product this line sells — brings its cost, id and default price. */
  workItemName?: string;
  /** Client may remove it when approving the quote. */
  isOptional?: boolean;
};

export type EstimatorAssist = {
  /** Extra guidance for the model when it fills inputs from a description. */
  instructions?: string;
};

export type EstimatorSpec = {
  version: 1;
  /** One or two sentences shown above the inputs. */
  intro?: string;
  inputs: EstimatorInput[];
  variables: EstimatorVariable[];
  lines: EstimatorLine[];
  /** Job minimum — a "Minimum job charge" line tops the quote up to this. */
  minimumTotal?: number;
  /** Templates for the quote header + client note. */
  quoteTitle?: string;
  clientMessage?: string;
  /** Present → the runner offers the metered "let Atlas fill this in" step. */
  assist?: EstimatorAssist | null;
};

export type PriceBookEntry = {
  id: string;
  name: string;
  unitPrice: number;
  unitCost: number | null;
};

export type EstimatorResultLine = {
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  unitCost?: number | null;
  workItemId?: string | null;
  isOptional: boolean;
};

export type EstimatorRun =
  | {
      ok: true;
      lines: EstimatorResultLine[];
      /** Sum of the non-optional lines (what the client owes if they change nothing). */
      subtotal: number;
      title?: string;
      clientMessage?: string;
      warnings: string[];
    }
  | { ok: false; errors: string[] };

// ── expression language ──────────────────────────────────────────────────────

export type Value = number | string | boolean | null | Value[] | { [k: string]: Value };

type Tok =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "id"; v: string }
  | { t: "op"; v: string };

const OPS = ["==", "!=", "<=", ">=", "&&", "||", "+", "-", "*", "/", "%", "<", ">", "!", "(", ")", "[", "]", "{", "}", ",", ":", "?"];

export class ExprError extends Error {}

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const m = /^[0-9]*\.?[0-9]+(?:e[+-]?[0-9]+)?|^[0-9]+\.?/i.exec(src.slice(i));
      if (!m) throw new ExprError(`Bad number at ${i}`);
      out.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let s = "";
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\" && j + 1 < src.length) {
          s += src[j + 1];
          j += 2;
        } else {
          s += src[j++];
        }
      }
      if (j >= src.length) throw new ExprError("Unterminated string");
      out.push({ t: "str", v: s });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      out.push({ t: "id", v: m[0] });
      i += m[0].length;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new ExprError(`Unexpected "${c}" at ${i}`);
    out.push({ t: "op", v: op });
    i += op.length;
  }
  return out;
}

export type Node =
  | { k: "lit"; v: Value }
  | { k: "id"; name: string }
  | { k: "un"; op: string; a: Node }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "tern"; c: Node; a: Node; b: Node }
  | { k: "call"; fn: string; args: Node[] }
  | { k: "arr"; items: Node[] }
  | { k: "obj"; entries: { key: string; v: Node }[] };

const KEYWORDS = new Set(["true", "false", "null", "and", "or", "not"]);

class Parser {
  private p = 0;
  constructor(private toks: Tok[]) {}

  parse(): Node {
    if (this.toks.length === 0) throw new ExprError("Empty expression");
    const n = this.ternary();
    if (this.p < this.toks.length) throw new ExprError(`Unexpected "${this.tokText(this.toks[this.p])}"`);
    return n;
  }

  private tokText(t: Tok): string {
    return t.t === "str" ? `"${t.v}"` : String(t.v);
  }
  private peek(): Tok | undefined {
    return this.toks[this.p];
  }
  private isOp(v: string): boolean {
    const t = this.peek();
    return !!t && t.t === "op" && t.v === v;
  }
  private isId(v: string): boolean {
    const t = this.peek();
    return !!t && t.t === "id" && t.v === v;
  }
  private eat(v: string): void {
    if (!this.isOp(v)) throw new ExprError(`Expected "${v}"`);
    this.p++;
  }

  private ternary(): Node {
    const c = this.or();
    if (this.isOp("?")) {
      this.p++;
      const a = this.ternary();
      this.eat(":");
      const b = this.ternary();
      return { k: "tern", c, a, b };
    }
    return c;
  }
  private or(): Node {
    let a = this.and();
    while (this.isOp("||") || this.isId("or")) {
      this.p++;
      a = { k: "bin", op: "||", a, b: this.and() };
    }
    return a;
  }
  private and(): Node {
    let a = this.equality();
    while (this.isOp("&&") || this.isId("and")) {
      this.p++;
      a = { k: "bin", op: "&&", a, b: this.equality() };
    }
    return a;
  }
  private equality(): Node {
    let a = this.compare();
    while (this.isOp("==") || this.isOp("!=")) {
      const op = (this.toks[this.p++] as { v: string }).v;
      a = { k: "bin", op, a, b: this.compare() };
    }
    return a;
  }
  private compare(): Node {
    let a = this.additive();
    while (this.isOp("<") || this.isOp("<=") || this.isOp(">") || this.isOp(">=")) {
      const op = (this.toks[this.p++] as { v: string }).v;
      a = { k: "bin", op, a, b: this.additive() };
    }
    return a;
  }
  private additive(): Node {
    let a = this.multiplicative();
    while (this.isOp("+") || this.isOp("-")) {
      const op = (this.toks[this.p++] as { v: string }).v;
      a = { k: "bin", op, a, b: this.multiplicative() };
    }
    return a;
  }
  private multiplicative(): Node {
    let a = this.unary();
    while (this.isOp("*") || this.isOp("/") || this.isOp("%")) {
      const op = (this.toks[this.p++] as { v: string }).v;
      a = { k: "bin", op, a, b: this.unary() };
    }
    return a;
  }
  private unary(): Node {
    if (this.isOp("-")) {
      this.p++;
      return { k: "un", op: "-", a: this.unary() };
    }
    if (this.isOp("!") || this.isId("not")) {
      this.p++;
      return { k: "un", op: "!", a: this.unary() };
    }
    if (this.isOp("+")) {
      this.p++;
      return this.unary();
    }
    return this.primary();
  }
  private primary(): Node {
    const t = this.peek();
    if (!t) throw new ExprError("Unexpected end of expression");
    if (t.t === "num") {
      this.p++;
      return { k: "lit", v: t.v };
    }
    if (t.t === "str") {
      this.p++;
      return { k: "lit", v: t.v };
    }
    if (t.t === "id") {
      this.p++;
      if (t.v === "true") return { k: "lit", v: true };
      if (t.v === "false") return { k: "lit", v: false };
      if (t.v === "null") return { k: "lit", v: null };
      if (this.isOp("(")) {
        this.p++;
        const args: Node[] = [];
        if (!this.isOp(")")) {
          for (;;) {
            args.push(this.ternary());
            if (this.isOp(",")) {
              this.p++;
              continue;
            }
            break;
          }
        }
        this.eat(")");
        return { k: "call", fn: t.v, args };
      }
      return { k: "id", name: t.v };
    }
    if (t.t === "op" && t.v === "(") {
      this.p++;
      const n = this.ternary();
      this.eat(")");
      return n;
    }
    if (t.t === "op" && t.v === "[") {
      this.p++;
      const items: Node[] = [];
      if (!this.isOp("]")) {
        for (;;) {
          items.push(this.ternary());
          if (this.isOp(",")) {
            this.p++;
            if (this.isOp("]")) break;
            continue;
          }
          break;
        }
      }
      this.eat("]");
      return { k: "arr", items };
    }
    if (t.t === "op" && t.v === "{") {
      this.p++;
      const entries: { key: string; v: Node }[] = [];
      if (!this.isOp("}")) {
        for (;;) {
          const kt = this.peek();
          if (!kt || (kt.t !== "id" && kt.t !== "str" && kt.t !== "num")) throw new ExprError("Object keys must be names or strings");
          this.p++;
          this.eat(":");
          entries.push({ key: String(kt.v), v: this.ternary() });
          if (this.isOp(",")) {
            this.p++;
            if (this.isOp("}")) break;
            continue;
          }
          break;
        }
      }
      this.eat("}");
      return { k: "obj", entries };
    }
    throw new ExprError(`Unexpected "${this.tokText(t)}"`);
  }
}

/** Parse one expression; throws ExprError with a human message. */
export function parseExpr(src: string): Node {
  if (src.length > ESTIMATOR_LIMITS.exprLen) throw new ExprError(`Expression longer than ${ESTIMATOR_LIMITS.exprLen} characters`);
  const toks = tokenize(src);
  // Recursive-descent parser: bound nesting so a hostile spec can't blow the stack
  if (toks.filter((t) => t.t === "op" && (t.v === "(" || t.v === "[" || t.v === "{")).length > 40) throw new ExprError("Expression too deeply nested");
  return new Parser(toks).parse();
}

/** Every bare identifier an expression reads (for compile-time checks). */
export function identifiersIn(n: Node, out = new Set<string>()): Set<string> {
  switch (n.k) {
    case "id":
      out.add(n.name);
      break;
    case "un":
      identifiersIn(n.a, out);
      break;
    case "bin":
      identifiersIn(n.a, out);
      identifiersIn(n.b, out);
      break;
    case "tern":
      identifiersIn(n.c, out);
      identifiersIn(n.a, out);
      identifiersIn(n.b, out);
      break;
    case "call":
      n.args.forEach((a) => identifiersIn(a, out));
      break;
    case "arr":
      n.items.forEach((a) => identifiersIn(a, out));
      break;
    case "obj":
      n.entries.forEach((e) => identifiersIn(e.v, out));
      break;
  }
  return out;
}

/** String literals passed to price()/cost() — the price-book names a spec depends on. */
export function priceBookRefsIn(n: Node, out = new Set<string>()): Set<string> {
  switch (n.k) {
    case "call":
      if ((n.fn === "price" || n.fn === "cost") && n.args[0]?.k === "lit" && typeof n.args[0].v === "string") out.add(n.args[0].v);
      n.args.forEach((a) => priceBookRefsIn(a, out));
      break;
    case "un":
      priceBookRefsIn(n.a, out);
      break;
    case "bin":
      priceBookRefsIn(n.a, out);
      priceBookRefsIn(n.b, out);
      break;
    case "tern":
      priceBookRefsIn(n.c, out);
      priceBookRefsIn(n.a, out);
      priceBookRefsIn(n.b, out);
      break;
    case "arr":
      n.items.forEach((a) => priceBookRefsIn(a, out));
      break;
    case "obj":
      n.entries.forEach((e) => priceBookRefsIn(e.v, out));
      break;
  }
  return out;
}

export const FUNCTIONS = [
  "min", "max", "round", "floor", "ceil", "abs", "sqrt", "if", "clamp", "tier", "lookup",
  "price", "cost", "pct", "roundTo", "len", "contains", "lower", "number",
  "has", "count", "sum", "join",
] as const;

export type EvalCtx = {
  vars: Record<string, Value>;
  /** Lower-cased name → entry. */
  priceBook: Map<string, PriceBookEntry>;
};

function n(v: Value, what: string): number {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new ExprError(`${what} is not a finite number`);
    return v;
  }
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v === null) return 0;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  throw new ExprError(`${what} must be a number (got ${describe(v)})`);
}

function describe(v: Value): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "a list";
  if (typeof v === "object") return "a table";
  if (typeof v === "string") return `"${v}"`;
  return String(v);
}

export function truthy(v: Value): boolean {
  if (v === null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return Boolean(v);
}

function eq(a: Value, b: Value): boolean {
  if (typeof a === "string" && typeof b === "string") return a.trim().toLowerCase() === b.trim().toLowerCase();
  if (typeof a === "number" || typeof b === "number") {
    const x = Number(a), y = Number(b);
    if (Number.isFinite(x) && Number.isFinite(y)) return x === y;
  }
  return a === b;
}

function lookupPrice(ctx: EvalCtx, nameV: Value, field: "unitPrice" | "unitCost"): number {
  if (typeof nameV !== "string") throw new ExprError("price()/cost() take a price-book item name");
  const entry = ctx.priceBook.get(nameV.trim().toLowerCase());
  if (!entry) throw new ExprError(`Price book has no item named "${nameV}"`);
  return field === "unitPrice" ? entry.unitPrice : entry.unitCost ?? 0;
}

export function evaluate(node: Node, ctx: EvalCtx, depth = 0): Value {
  if (depth > 64) throw new ExprError("Expression too deep");
  switch (node.k) {
    case "lit":
      return node.v;
    case "id": {
      if (!(node.name in ctx.vars)) throw new ExprError(`Unknown name "${node.name}"`);
      return ctx.vars[node.name];
    }
    case "un": {
      const a = evaluate(node.a, ctx, depth + 1);
      return node.op === "-" ? -n(a, "Operand") : !truthy(a);
    }
    case "bin": {
      if (node.op === "&&") {
        const a = evaluate(node.a, ctx, depth + 1);
        return truthy(a) ? evaluate(node.b, ctx, depth + 1) : a;
      }
      if (node.op === "||") {
        const a = evaluate(node.a, ctx, depth + 1);
        return truthy(a) ? a : evaluate(node.b, ctx, depth + 1);
      }
      const a = evaluate(node.a, ctx, depth + 1);
      const b = evaluate(node.b, ctx, depth + 1);
      switch (node.op) {
        case "+":
          if (typeof a === "string" || typeof b === "string") return `${a ?? ""}${b ?? ""}`;
          return n(a, "Left side of +") + n(b, "Right side of +");
        case "-":
          return n(a, "Left side of -") - n(b, "Right side of -");
        case "*":
          return n(a, "Left side of *") * n(b, "Right side of *");
        case "/": {
          const d = n(b, "Divisor");
          if (d === 0) throw new ExprError("Division by zero");
          return n(a, "Dividend") / d;
        }
        case "%": {
          const d = n(b, "Divisor");
          if (d === 0) throw new ExprError("Division by zero");
          return n(a, "Dividend") % d;
        }
        case "==":
          return eq(a, b);
        case "!=":
          return !eq(a, b);
        case "<":
          return n(a, "Comparison") < n(b, "Comparison");
        case "<=":
          return n(a, "Comparison") <= n(b, "Comparison");
        case ">":
          return n(a, "Comparison") > n(b, "Comparison");
        case ">=":
          return n(a, "Comparison") >= n(b, "Comparison");
      }
      throw new ExprError(`Unknown operator ${node.op}`);
    }
    case "tern":
      return truthy(evaluate(node.c, ctx, depth + 1)) ? evaluate(node.a, ctx, depth + 1) : evaluate(node.b, ctx, depth + 1);
    case "arr":
      return node.items.map((i) => evaluate(i, ctx, depth + 1));
    case "obj": {
      const o: { [k: string]: Value } = {};
      for (const e of node.entries) o[e.key] = evaluate(e.v, ctx, depth + 1);
      return o;
    }
    case "call": {
      const fn = node.fn;
      // lazy-evaluated forms first
      if (fn === "if") {
        if (node.args.length < 2 || node.args.length > 3) throw new ExprError("if(condition, then, else) takes 2 or 3 arguments");
        const c = evaluate(node.args[0], ctx, depth + 1);
        if (truthy(c)) return evaluate(node.args[1], ctx, depth + 1);
        return node.args[2] ? evaluate(node.args[2], ctx, depth + 1) : 0;
      }
      const args = node.args.map((a) => evaluate(a, ctx, depth + 1));
      const nums = (what: string) => args.map((a, i) => n(a, `${what} argument ${i + 1}`));
      switch (fn) {
        case "min":
          if (args.length === 0) throw new ExprError("min() needs at least one number");
          return Math.min(...nums("min()"));
        case "max":
          if (args.length === 0) throw new ExprError("max() needs at least one number");
          return Math.max(...nums("max()"));
        case "round": {
          const x = n(args[0], "round()");
          const d = args.length > 1 ? Math.max(0, Math.min(6, Math.trunc(n(args[1], "round() decimals")))) : 0;
          const f = 10 ** d;
          return Math.round((x + Number.EPSILON) * f) / f;
        }
        case "floor":
          return Math.floor(n(args[0], "floor()"));
        case "ceil":
          return Math.ceil(n(args[0], "ceil()"));
        case "abs":
          return Math.abs(n(args[0], "abs()"));
        case "sqrt": {
          const x = n(args[0], "sqrt()");
          if (x < 0) throw new ExprError("sqrt() of a negative number");
          return Math.sqrt(x);
        }
        case "clamp": {
          if (args.length !== 3) throw new ExprError("clamp(x, low, high) takes 3 arguments");
          const [x, lo, hi] = nums("clamp()");
          return Math.min(Math.max(x, lo), hi);
        }
        case "pct": {
          if (args.length !== 2) throw new ExprError("pct(amount, percent) takes 2 arguments");
          const [x, p] = nums("pct()");
          return (x * p) / 100;
        }
        case "roundTo": {
          if (args.length !== 2) throw new ExprError("roundTo(x, step) takes 2 arguments");
          const [x, step] = nums("roundTo()");
          if (step <= 0) throw new ExprError("roundTo() step must be positive");
          return Math.round(x / step) * step;
        }
        case "tier": {
          // tier(x, [[upTo, value], ...], elseValue?) — first row whose upTo >= x wins
          if (args.length < 2 || !Array.isArray(args[1])) throw new ExprError("tier(x, [[upTo, value], ...], else) needs a table of [upTo, value] rows");
          const x = n(args[0], "tier() value");
          for (const row of args[1]) {
            if (!Array.isArray(row) || row.length !== 2) throw new ExprError("tier() rows must be [upTo, value]");
            const upTo = row[0];
            if (upTo === null || x <= n(upTo, "tier() upTo")) return row[1];
          }
          if (args.length > 2) return args[2];
          throw new ExprError(`tier(): ${x} is above every tier and no else value was given`);
        }
        case "lookup": {
          // lookup(key, {a: 1, b: 2}, default?)
          if (args.length < 2 || args[1] === null || typeof args[1] !== "object" || Array.isArray(args[1])) throw new ExprError("lookup(key, {key: value, ...}, default) needs a table");
          const key = String(args[0] ?? "").trim().toLowerCase();
          const table = args[1] as { [k: string]: Value };
          for (const k of Object.keys(table)) if (k.trim().toLowerCase() === key) return table[k];
          if (args.length > 2) return args[2];
          throw new ExprError(`lookup(): no entry for "${String(args[0])}" and no default`);
        }
        case "price":
          return lookupPrice(ctx, args[0], "unitPrice");
        case "cost":
          return lookupPrice(ctx, args[0], "unitCost");
        case "len": {
          const a = args[0];
          if (typeof a === "string" || Array.isArray(a)) return a.length;
          return 0;
        }
        case "contains":
        case "has": {
          // has(picks, value) — is value one of a multi-select's picks? On text: does it contain the part?
          if (args.length !== 2) throw new ExprError(`${fn}(list_or_text, value) takes 2 arguments`);
          const needle = String(args[1] ?? "").trim().toLowerCase();
          if (Array.isArray(args[0])) return args[0].some((x) => String(x ?? "").trim().toLowerCase() === needle);
          return String(args[0] ?? "").toLowerCase().includes(needle);
        }
        case "count": {
          // count(picks) — how many were picked; count(a, b, c) — how many arguments are truthy
          if (args.length === 1 && Array.isArray(args[0])) return args[0].length;
          return args.filter((a) => truthy(a)).length;
        }
        case "sum": {
          // sum([a, b, c]) or sum(a, b, c)
          const items = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
          return items.reduce<number>((acc, v, i) => acc + n(v, `sum() item ${i + 1}`), 0);
        }
        case "join": {
          // join(picks, ", ") — the picks as words, for descriptions
          const items = Array.isArray(args[0]) ? args[0] : [args[0]];
          const sep = args.length > 1 ? String(args[1] ?? "") : ", ";
          return items.map((v) => formatValue(v, "text")).join(sep);
        }
        case "lower":
          return String(args[0] ?? "").toLowerCase();
        case "number": {
          const x = Number(args[0]);
          return Number.isFinite(x) ? x : 0;
        }
      }
      throw new ExprError(`Unknown function ${fn}()`);
    }
  }
}

// ── templates ("{sqft} sq ft at {rate|money}") ───────────────────────────────

export type TemplatePart = { text: string } | { expr: Node; fmt: "auto" | "money" | "int" | "text" };

export function parseTemplate(tpl: string): TemplatePart[] {
  if (tpl.length > ESTIMATOR_LIMITS.templateLen * 3) throw new ExprError("Text is too long");
  const parts: TemplatePart[] = [];
  let i = 0;
  while (i < tpl.length) {
    const open = tpl.indexOf("{", i);
    if (open === -1) {
      parts.push({ text: tpl.slice(i) });
      break;
    }
    if (open > i) parts.push({ text: tpl.slice(i, open) });
    // find the matching close, allowing nested braces for table literals
    let depth = 0;
    let close = -1;
    for (let j = open; j < tpl.length; j++) {
      if (tpl[j] === "{") depth++;
      else if (tpl[j] === "}") {
        depth--;
        if (depth === 0) {
          close = j;
          break;
        }
      }
    }
    if (close === -1) throw new ExprError("Unclosed { in text");
    let inner = tpl.slice(open + 1, close).trim();
    let fmt: "auto" | "money" | "int" | "text" = "auto";
    const m = /\|\s*(money|int|text)\s*$/.exec(inner);
    if (m) {
      fmt = m[1] as typeof fmt;
      inner = inner.slice(0, m.index).trim();
    }
    parts.push({ expr: parseExpr(inner), fmt });
    i = close + 1;
  }
  return parts;
}

export function formatValue(v: Value, fmt: "auto" | "money" | "int" | "text" = "auto"): string {
  if (fmt === "money") return `$${n(v, "Value").toFixed(2)}`;
  if (fmt === "int") return String(Math.round(n(v, "Value")));
  if (typeof v === "number") return fmt === "text" ? String(v) : String(Math.round(v * 100) / 100);
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (v === null) return "";
  if (Array.isArray(v)) return v.map((x) => formatValue(x, "text")).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

export function renderTemplate(parts: TemplatePart[], ctx: EvalCtx): string {
  return parts
    .map((p) => ("text" in p ? p.text : formatValue(evaluate(p.expr, ctx), p.fmt)))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

// ── compile (sanitize + validate) ────────────────────────────────────────────

export type CompiledSpec = {
  spec: EstimatorSpec;
  variables: { id: string; node: Node }[];
  lines: {
    rule: EstimatorLine;
    name: TemplatePart[];
    description: TemplatePart[] | null;
    when: Node | null;
    quantity: Node | null;
    unitPrice: Node | null;
  }[];
  quoteTitle: TemplatePart[] | null;
  clientMessage: TemplatePart[] | null;
  /** Price-book names the spec depends on (workItemName + price()/cost()). */
  priceBookNames: string[];
};

export type CompileResult = { ok: true; compiled: CompiledSpec } | { ok: false; errors: string[] };

const ID_RE = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;

function s(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function optNum(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const x = Number(v);
  return Number.isFinite(x) ? x : undefined;
}

/** Slug an arbitrary label into an identifier ("Sq. footage" → sq_footage). */
export function toIdentifier(label: string): string {
  const id = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  if (!id) return "";
  return /^[a-z_]/.test(id) ? id : `x_${id}`;
}

export function compileSpec(raw: unknown): CompileResult {
  const errors: string[] = [];
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  // inputs
  const inputs: EstimatorInput[] = [];
  const seen = new Set<string>();
  const rawInputs = Array.isArray(r.inputs) ? r.inputs : [];
  const parseOptions = (raw: unknown): EstimatorOption[] =>
    (Array.isArray(raw) ? raw : [])
      .slice(0, ESTIMATOR_LIMITS.options)
      .map((op) => {
        if (typeof op === "string") return { value: op.trim().slice(0, 60), label: op.trim().slice(0, 60) };
        const oo = (op ?? {}) as Record<string, unknown>;
        const label = s(oo.label, 60);
        const value = s(oo.value, 60) || label;
        return { value, label: label || value };
      })
      .filter((op) => op.value);
  if (rawInputs.length > ESTIMATOR_LIMITS.inputs) errors.push(`At most ${ESTIMATOR_LIMITS.inputs} inputs`);
  for (const ri of rawInputs.slice(0, ESTIMATOR_LIMITS.inputs)) {
    const o = (ri ?? {}) as Record<string, unknown>;
    const label = s(o.label, 80);
    const id = s(o.id, 40) || toIdentifier(label);
    if (!label) {
      errors.push(`Input "${id || "?"}" needs a label`);
      continue;
    }
    if (!ID_RE.test(id)) {
      errors.push(`Input id "${id}" must be letters, digits and underscores, starting with a letter`);
      continue;
    }
    if (KEYWORDS.has(id) || (FUNCTIONS as readonly string[]).includes(id) || id === "subtotal") {
      errors.push(`Input id "${id}" is a reserved word`);
      continue;
    }
    if (seen.has(id)) {
      errors.push(`Duplicate id "${id}"`);
      continue;
    }
    seen.add(id);
    const help = s(o.help, 200) || undefined;
    const section = s(o.section, 60) || undefined;
    const showWhen = s(o.showWhen, ESTIMATOR_LIMITS.exprLen + 1) || undefined;
    const common = { id, label, help, section, showWhen };
    const type = s(o.type, 10);
    if (type === "number") {
      const min = optNum(o.min), max = optNum(o.max), step = optNum(o.step), def = optNum(o.default);
      if (min !== undefined && max !== undefined && min > max) errors.push(`Input "${id}": min is above max`);
      inputs.push({
        ...common, type,
        unit: s(o.unit, 20) || undefined,
        min, max,
        step: step !== undefined && step > 0 ? step : undefined,
        default: def,
        required: o.required !== false,
      });
    } else if (type === "select") {
      const opts = parseOptions(o.options);
      if (opts.length < 2) {
        errors.push(`Input "${id}" is a select — it needs at least 2 options`);
        continue;
      }
      // the model may send a numeric default (1 vs "1") — option values are strings
      const def = o.default === undefined || o.default === null ? undefined : String(o.default).trim().slice(0, 60) || undefined;
      if (def && !opts.some((op) => op.value === def)) errors.push(`Input "${id}": default "${def}" is not one of its options`);
      inputs.push({ ...common, type, options: opts, default: def, required: o.required !== false });
    } else if (type === "multi") {
      const opts = parseOptions(o.options);
      if (opts.length < 2) {
        errors.push(`Input "${id}" is a multi-select — it needs at least 2 options`);
        continue;
      }
      const defRaw = Array.isArray(o.default) ? o.default : typeof o.default === "string" && o.default ? o.default.split(",") : [];
      const def = defRaw.map((d) => String(d).trim().slice(0, 60)).filter((d) => d && opts.some((op) => op.value === d));
      inputs.push({ ...common, type, options: opts, default: def.length > 0 ? def : undefined, required: o.required === true });
    } else if (type === "toggle") {
      inputs.push({ ...common, type, default: o.default === true || o.default === "true" });
    } else if (type === "text") {
      inputs.push({
        ...common, type,
        placeholder: s(o.placeholder, 80) || undefined,
        default: s(o.default, 200) || undefined,
        required: o.required === true,
      });
    } else {
      errors.push(`Input "${id}": type must be number, select, multi, toggle or text`);
    }
  }

  // showWhen may read any OTHER input — not variables (they come later and may
  // depend on hidden inputs) and not the price book (the form evaluates it
  // client-side, where the price book must never travel).
  for (const inp of inputs) {
    if (!inp.showWhen) continue;
    try {
      const node = parseExpr(inp.showWhen);
      for (const name of identifiersIn(node)) {
        if (name === inp.id) errors.push(`Input "${inp.id}": showWhen can't read itself`);
        else if (!seen.has(name)) errors.push(`Input "${inp.id}": showWhen uses unknown input "${name}" (only inputs, not variables)`);
      }
      if (priceBookRefsIn(node).size > 0) errors.push(`Input "${inp.id}": showWhen can't read the price book`);
    } catch (e) {
      errors.push(`Input "${inp.id}": showWhen ${(e as Error).message}`);
    }
  }

  const known = new Set(seen);
  const priceBookNames = new Set<string>();

  // variables (evaluated in order; may only read inputs + earlier variables)
  const variables: { id: string; node: Node }[] = [];
  const variableSrc: EstimatorVariable[] = [];
  const rawVars = Array.isArray(r.variables) ? r.variables : [];
  if (rawVars.length > ESTIMATOR_LIMITS.variables) errors.push(`At most ${ESTIMATOR_LIMITS.variables} variables`);
  for (const rv of rawVars.slice(0, ESTIMATOR_LIMITS.variables)) {
    const o = (rv ?? {}) as Record<string, unknown>;
    const id = s(o.id, 40);
    const expr = s(o.expr, ESTIMATOR_LIMITS.exprLen + 1);
    if (!ID_RE.test(id)) {
      errors.push(`Variable id "${id}" must be letters, digits and underscores`);
      continue;
    }
    if (KEYWORDS.has(id) || (FUNCTIONS as readonly string[]).includes(id) || id === "subtotal") {
      errors.push(`Variable id "${id}" is a reserved word`);
      continue;
    }
    if (known.has(id)) {
      errors.push(`Duplicate id "${id}" (variables can't reuse an input id)`);
      continue;
    }
    try {
      const node = parseExpr(expr);
      for (const name of identifiersIn(node)) if (!known.has(name)) errors.push(`Variable "${id}": unknown name "${name}"`);
      priceBookRefsIn(node).forEach((p) => priceBookNames.add(p));
      variables.push({ id, node });
      variableSrc.push({ id, expr });
      known.add(id);
    } catch (e) {
      errors.push(`Variable "${id}": ${(e as Error).message}`);
    }
  }

  const compileExpr = (where: string, src: string | undefined): Node | null => {
    if (!src) return null;
    try {
      const node = parseExpr(src);
      for (const name of identifiersIn(node)) if (!known.has(name)) errors.push(`${where}: unknown name "${name}"`);
      priceBookRefsIn(node).forEach((p) => priceBookNames.add(p));
      return node;
    } catch (e) {
      errors.push(`${where}: ${(e as Error).message}`);
      return null;
    }
  };
  const compileTpl = (where: string, src: string | undefined, extra: string[] = []): TemplatePart[] | null => {
    if (!src) return null;
    try {
      const parts = parseTemplate(src);
      for (const p of parts) {
        if ("expr" in p) {
          for (const name of identifiersIn(p.expr)) if (!known.has(name) && !extra.includes(name)) errors.push(`${where}: unknown name "${name}"`);
          priceBookRefsIn(p.expr).forEach((pn) => priceBookNames.add(pn));
        }
      }
      return parts;
    } catch (e) {
      errors.push(`${where}: ${(e as Error).message}`);
      return null;
    }
  };

  // lines
  const lines: CompiledSpec["lines"] = [];
  const rawLines = Array.isArray(r.lines) ? r.lines : [];
  if (rawLines.length === 0) errors.push("Add at least one line rule");
  if (rawLines.length > ESTIMATOR_LIMITS.lines) errors.push(`At most ${ESTIMATOR_LIMITS.lines} lines`);
  const lineIds = new Set<string>();
  rawLines.slice(0, ESTIMATOR_LIMITS.lines).forEach((rl, idx) => {
    const o = (rl ?? {}) as Record<string, unknown>;
    const name = s(o.name, 160);
    let id = s(o.id, 40) || toIdentifier(name) || `line_${idx + 1}`;
    while (lineIds.has(id)) id = `${id}_${idx + 1}`;
    lineIds.add(id);
    const where = `Line "${name || id}"`;
    if (!name) {
      errors.push(`Line ${idx + 1} needs a name`);
      return;
    }
    const workItemName = s(o.workItemName, 120) || undefined;
    if (workItemName) priceBookNames.add(workItemName);
    const unitPriceSrc = s(o.unitPrice, ESTIMATOR_LIMITS.exprLen + 1) || undefined;
    if (!unitPriceSrc && !workItemName) errors.push(`${where}: needs a unitPrice expression or a workItemName`);
    const rule: EstimatorLine = {
      id,
      name,
      description: s(o.description, ESTIMATOR_LIMITS.templateLen + 1) || undefined,
      when: s(o.when, ESTIMATOR_LIMITS.exprLen + 1) || undefined,
      quantity: s(o.quantity, ESTIMATOR_LIMITS.exprLen + 1) || undefined,
      unitPrice: unitPriceSrc,
      workItemName,
      isOptional: o.isOptional === true,
    };
    lines.push({
      rule,
      name: compileTpl(`${where} name`, rule.name) ?? [{ text: name }],
      description: compileTpl(`${where} description`, rule.description),
      when: compileExpr(`${where} when`, rule.when),
      quantity: compileExpr(`${where} quantity`, rule.quantity),
      unitPrice: compileExpr(`${where} unitPrice`, rule.unitPrice),
    });
  });

  const minimumTotal = optNum(r.minimumTotal);
  if (minimumTotal !== undefined && (minimumTotal < 0 || minimumTotal > 1_000_000)) errors.push("minimumTotal must be between 0 and 1,000,000");

  const quoteTitleSrc = s(r.quoteTitle, ESTIMATOR_LIMITS.templateLen) || undefined;
  const clientMessageSrc = s(r.clientMessage, 1200) || undefined;
  // `subtotal` is available to the two quote-level templates only
  const quoteTitle = compileTpl("quoteTitle", quoteTitleSrc, ["subtotal"]);
  const clientMessage = compileTpl("clientMessage", clientMessageSrc, ["subtotal"]);

  let assist: EstimatorAssist | null = null;
  if (r.assist && typeof r.assist === "object") {
    const a = r.assist as Record<string, unknown>;
    if (a.enabled !== false) assist = { instructions: s(a.instructions, 600) || undefined };
  } else if (r.assist === true) {
    assist = {};
  }
  if (assist && !inputs.some((i) => i.type !== "text")) errors.push("assist needs at least one number/select/toggle input for Atlas to fill in");

  if (errors.length > 0) return { ok: false, errors: Array.from(new Set(errors)).slice(0, 25) };

  const spec: EstimatorSpec = {
    version: 1,
    intro: s(r.intro, ESTIMATOR_LIMITS.textLen) || undefined,
    inputs,
    variables: variableSrc,
    lines: lines.map((l) => l.rule),
    minimumTotal: minimumTotal && minimumTotal > 0 ? Math.round(minimumTotal * 100) / 100 : undefined,
    quoteTitle: quoteTitleSrc,
    clientMessage: clientMessageSrc,
    assist,
  };

  return {
    ok: true,
    compiled: { spec, variables, lines, quoteTitle, clientMessage, priceBookNames: Array.from(priceBookNames) },
  };
}

// ── inputs → values ──────────────────────────────────────────────────────────

export type InputProblem = { id: string; message: string };

const NO_BOOK: EvalCtx["priceBook"] = new Map();

/** What an untouched / hidden input is worth: its default, else the type's neutral value. */
export function neutralValue(inp: EstimatorInput): Value {
  switch (inp.type) {
    case "number":
      return inp.default ?? 0;
    case "select":
      return inp.default ?? "";
    case "multi":
      return inp.default ? [...inp.default] : [];
    case "toggle":
      return inp.default === true;
    case "text":
      return inp.default ?? "";
  }
}

function matchOption(inp: { options: EstimatorOption[] }, v: unknown): string | null {
  const want = String(v ?? "").trim().toLowerCase();
  if (!want) return null;
  const hit = inp.options.find((o) => o.value.toLowerCase() === want) ?? inp.options.find((o) => o.label.toLowerCase() === want);
  return hit ? hit.value : null;
}

function multiPicks(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v === undefined || v === null || v === "") return [];
  if (typeof v === "string") return v.split(",");
  return [v];
}

/** Best-effort value with no errors — what showWhen conditions are evaluated against. */
function lenientValue(inp: EstimatorInput, v: unknown): Value {
  const missing = v === undefined || v === null || v === "";
  switch (inp.type) {
    case "number": {
      if (missing) return neutralValue(inp);
      const x = typeof v === "string" ? Number(v.replace(/[,$\s]/g, "")) : Number(v);
      return Number.isFinite(x) ? x : neutralValue(inp);
    }
    case "select":
      return missing ? neutralValue(inp) : matchOption(inp, v) ?? "";
    case "multi": {
      const picks = multiPicks(v).map((p) => matchOption(inp, p)).filter((p): p is string => p !== null);
      return picks.length > 0 ? Array.from(new Set(picks)) : neutralValue(inp);
    }
    case "toggle":
      return missing ? inp.default === true : v === true || v === "true" || v === 1 || v === "1" || v === "yes" || v === "on";
    case "text":
      return missing ? neutralValue(inp) : String(v).slice(0, 500);
  }
}

/**
 * Which inputs show for these raw values (showWhen). Evaluated in spec order:
 * a hidden input counts as untouched for every condition after it. A
 * condition that can't be evaluated fails OPEN — the question shows rather
 * than silently vanishing. Client-safe: the forms call it on every change.
 */
export function visibleInputIds(spec: EstimatorSpec, raw: Record<string, unknown>): Set<string> {
  const vars: Record<string, Value> = {};
  for (const inp of spec.inputs) vars[inp.id] = lenientValue(inp, raw[inp.id]);
  const visible = new Set<string>();
  for (const inp of spec.inputs) {
    let show = true;
    if (inp.showWhen) {
      try {
        show = truthy(evaluate(parseExpr(inp.showWhen), { vars, priceBook: NO_BOOK }));
      } catch {
        show = true;
      }
    }
    if (show) visible.add(inp.id);
    else vars[inp.id] = neutralValue(inp);
  }
  return visible;
}

/** Coerce raw (form / model) values into typed values, applying defaults. Hidden inputs (showWhen false) read as untouched. */
export function coerceInputs(
  spec: EstimatorSpec,
  raw: Record<string, unknown>
): { values: Record<string, Value>; problems: InputProblem[] } {
  const values: Record<string, Value> = {};
  const problems: InputProblem[] = [];
  const visible = visibleInputIds(spec, raw);
  for (const inp of spec.inputs) {
    if (!visible.has(inp.id)) {
      values[inp.id] = neutralValue(inp);
      continue;
    }
    const v = raw[inp.id];
    const missing = v === undefined || v === null || v === "";
    switch (inp.type) {
      case "number": {
        if (missing) {
          if (inp.default !== undefined) values[inp.id] = inp.default;
          else if (inp.required) problems.push({ id: inp.id, message: `${inp.label} is required` });
          else values[inp.id] = 0;
          break;
        }
        const x = typeof v === "string" ? Number(v.replace(/[,$\s]/g, "")) : Number(v);
        if (!Number.isFinite(x)) {
          problems.push({ id: inp.id, message: `${inp.label} must be a number` });
          break;
        }
        if (inp.min !== undefined && x < inp.min) problems.push({ id: inp.id, message: `${inp.label} must be at least ${inp.min}` });
        else if (inp.max !== undefined && x > inp.max) problems.push({ id: inp.id, message: `${inp.label} must be at most ${inp.max}` });
        else values[inp.id] = x;
        break;
      }
      case "select": {
        if (missing) {
          if (inp.default) values[inp.id] = inp.default;
          else if (inp.required) problems.push({ id: inp.id, message: `Choose a ${inp.label.toLowerCase()}` });
          else values[inp.id] = "";
          break;
        }
        const hit = matchOption(inp, v);
        if (!hit) problems.push({ id: inp.id, message: `${inp.label}: "${String(v)}" is not an option` });
        else values[inp.id] = hit;
        break;
      }
      case "multi": {
        const picks: string[] = [];
        for (const item of multiPicks(v)) {
          if (String(item ?? "").trim() === "") continue;
          const hit = matchOption(inp, item);
          if (!hit) problems.push({ id: inp.id, message: `${inp.label}: "${String(item)}" is not an option` });
          else if (!picks.includes(hit)) picks.push(hit);
        }
        if (picks.length === 0 && inp.default?.length) picks.push(...inp.default);
        if (picks.length === 0 && inp.required) problems.push({ id: inp.id, message: `Pick at least one option for ${inp.label.toLowerCase()}` });
        values[inp.id] = picks;
        break;
      }
      case "toggle": {
        if (missing) values[inp.id] = inp.default === true;
        else values[inp.id] = v === true || v === "true" || v === 1 || v === "1" || v === "yes" || v === "on";
        break;
      }
      case "text": {
        if (missing) {
          if (inp.required) problems.push({ id: inp.id, message: `${inp.label} is required` });
          values[inp.id] = inp.default ?? "";
        } else values[inp.id] = String(v).slice(0, 500);
        break;
      }
    }
  }
  return { values, problems };
}

// ── run ──────────────────────────────────────────────────────────────────────

const cents = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

export function runCompiled(
  compiled: CompiledSpec,
  rawInputs: Record<string, unknown>,
  priceBook: PriceBookEntry[]
): EstimatorRun {
  const { spec } = compiled;
  const { values, problems } = coerceInputs(spec, rawInputs);
  if (problems.length > 0) return { ok: false, errors: problems.map((p) => p.message) };

  const ctx: EvalCtx = {
    vars: { ...values },
    priceBook: new Map(priceBook.map((p) => [p.name.trim().toLowerCase(), p])),
  };
  const warnings: string[] = [];

  try {
    for (const v of compiled.variables) ctx.vars[v.id] = evaluate(v.node, ctx);

    const lines: EstimatorResultLine[] = [];
    for (const l of compiled.lines) {
      if (l.when && !truthy(evaluate(l.when, ctx))) continue;
      const item = l.rule.workItemName ? ctx.priceBook.get(l.rule.workItemName.trim().toLowerCase()) : undefined;
      if (l.rule.workItemName && !item) throw new ExprError(`Price book has no item named "${l.rule.workItemName}"`);

      let qty = l.quantity ? n(evaluate(l.quantity, ctx), `Line "${l.rule.name}" quantity`) : 1;
      let unitPrice = l.unitPrice ? n(evaluate(l.unitPrice, ctx), `Line "${l.rule.name}" unitPrice`) : item!.unitPrice;
      if (qty <= 0) continue; // nothing to sell
      if (unitPrice < 0) {
        warnings.push(`"${l.rule.name}" came out negative — clamped to $0`);
        unitPrice = 0;
      }
      let description = l.description ? renderTemplate(l.description, ctx) : "";
      // Quotes sell whole units. A fractional quantity (2.5 hours, 1.5 pallets)
      // folds into one unit at the full extended price so nothing is lost.
      if (!Number.isInteger(qty)) {
        const shown = Math.round(qty * 100) / 100;
        const suffix = `${shown} × $${cents(unitPrice).toFixed(2)}`;
        description = description ? `${description} (${suffix})` : suffix;
        unitPrice = qty * unitPrice;
        qty = 1;
      }
      if (qty > 9999) throw new ExprError(`Line "${l.rule.name}": quantity ${qty} is unreasonably large`);
      if (unitPrice > 1_000_000) throw new ExprError(`Line "${l.rule.name}": price came out above $1,000,000`);
      const cost = item?.unitCost ?? null;
      lines.push({
        name: renderTemplate(l.name, ctx) || l.rule.name,
        description,
        quantity: qty,
        unitPrice: cents(unitPrice),
        unitCost: cost !== null ? cents(cost) : null,
        workItemId: item?.id ?? null,
        isOptional: l.rule.isOptional === true,
      });
    }

    let subtotal = cents(lines.filter((l) => !l.isOptional).reduce((sum, l) => sum + l.quantity * l.unitPrice, 0));
    if (spec.minimumTotal && lines.length > 0 && subtotal < spec.minimumTotal) {
      const diff = cents(spec.minimumTotal - subtotal);
      lines.push({
        name: "Minimum job charge",
        description: `Brings the job up to our $${spec.minimumTotal.toFixed(2)} minimum`,
        quantity: 1,
        unitPrice: diff,
        unitCost: 0,
        workItemId: null,
        isOptional: false,
      });
      subtotal = cents(spec.minimumTotal);
    }
    if (lines.length === 0) return { ok: false, errors: ["Nothing to quote with those inputs — no line applied."] };

    ctx.vars.subtotal = subtotal;
    return {
      ok: true,
      lines,
      subtotal,
      title: compiled.quoteTitle ? renderTemplate(compiled.quoteTitle, ctx) : undefined,
      clientMessage: compiled.clientMessage ? renderTemplate(compiled.clientMessage, ctx) : undefined,
      warnings,
    };
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] };
  }
}

/** Compile + run in one go (stored specs always compile; a failure here is a bug). */
export function runEstimator(rawSpec: unknown, inputs: Record<string, unknown>, priceBook: PriceBookEntry[]): EstimatorRun {
  const c = compileSpec(rawSpec);
  if (!c.ok) return { ok: false, errors: c.errors };
  return runCompiled(c.compiled, inputs, priceBook);
}

/** Read a stored spec back into its type (stored specs passed compileSpec). */
export function specFromJson(raw: unknown): EstimatorSpec | null {
  const c = compileSpec(raw);
  return c.ok ? c.compiled.spec : null;
}

/** Does running this tool ever cost Atlas tokens? Only the assist step does. */
export function usesAtlas(spec: EstimatorSpec): boolean {
  return Boolean(spec.assist);
}

// ── the builder's reference card (returned by manage_estimator action 'guide') ─

export const ESTIMATOR_GUIDE = `ESTIMATE TOOL SPEC — reference

An estimate tool = inputs the user fills in + line rules that turn them into quote lines. Running one is plain math and FREE for the user. Only add "assist" when judgment from a written description is genuinely needed (it costs the user Atlas tokens per use) — a flat-rate or per-unit business never needs it.

spec = {
  intro: "one or two sentences shown above the inputs",
  inputs: [
    { id: "sqft", label: "Driveway size", type: "number", unit: "sq ft", min: 0, required: true, section: "The driveway" },
    { id: "stories", label: "Stories", type: "select", options: [{value:"1",label:"One story"},{value:"2",label:"Two stories"}], default: "1", section: "The driveway" },
    { id: "extras", label: "Also clean", type: "multi", options: ["Sidewalk", "Patio", "Fence"], section: "Extras" },   // several picks → has(extras, 'Fence'), count(extras)
    { id: "fence_ft", label: "Fence length", type: "number", unit: "ft", showWhen: "has(extras, 'Fence')", section: "Extras" },  // only asked when it matters
    { id: "sealant", label: "Add sealant?", type: "toggle", default: false, section: "Extras" },
    { id: "notes", label: "Anything else?", type: "text" }          // text inputs are for descriptions/assist only
  ],
  variables: [ { id: "rate", expr: "tier(sqft, [[500, 0.30], [2000, 0.22]], 0.18)" } ],   // evaluated in order
  lines: [
    { name: "Driveway cleaning", description: "{sqft} sq ft at {rate|money}/sq ft", quantity: "sqft", unitPrice: "rate", workItemName: "Driveway Cleaning" },
    { name: "Two-story surcharge", when: "stories == '2'", quantity: "1", unitPrice: "pct(sqft * rate, 15)" },
    { name: "Fence wash", when: "has(extras, 'Fence')", quantity: "fence_ft", unitPrice: "1.25" },
    { name: "Sealant", when: "sealant", quantity: "sqft", unitPrice: "0.45", isOptional: true }
  ],
  minimumTotal: 150,
  quoteTitle: "Pressure washing — {sqft} sq ft",
  clientMessage: "Thanks for the chance to quote your driveway!",
  assist: null                     // or { instructions: "..." } to enable the metered fill-in step
}

Rules:
- ids: letters/digits/underscores, unique. Inputs are referenced by id inside expressions and {templates}.
- Input types: number, select (one of), multi (several — the value is a LIST of option values), toggle, text. "section" groups questions under a heading (the website form shows one section per step); "showWhen" (an expression over OTHER inputs, no variables/price book) hides a question until it matters — a hidden question reads as untouched (its default). Complex trades (roofing, remodels, HVAC, moving) want 2–4 sections and showWhen branches instead of one wall of questions.
- Line unitPrice/quantity/when are EXPRESSIONS (strings). name/description/quoteTitle/clientMessage are TEMPLATES: {expr}, {expr|money}, {expr|int}. quoteTitle/clientMessage may also use {subtotal}.
- workItemName links a line to a price-book item (exact name): it brings the item's cost, id and — when unitPrice is omitted — its price. price("Name") / cost("Name") read the price book inside any expression. Names must exist in the price book (get_price_book) — never invent items; create them with create_service first.
- Quantity may be fractional (2.5 hours): it folds into one unit at the extended price automatically.
- Lines with quantity <= 0 or a false "when" are skipped. minimumTotal adds a "Minimum job charge" top-up line when needed.
- Expression language: + - * / % ; comparisons == != < <= > >= ; and/or/not (or && || !) ; cond ? a : b ; strings in quotes; lists [a, b]; tables {small: 100, large: 200}.
  Functions: min max round(x, decimals) floor ceil abs sqrt if(c, a, b) clamp(x, lo, hi) pct(amount, percent) roundTo(x, step) tier(x, [[upTo, value], ...], else) lookup(key, {k: v}, default) price("Name") cost("Name") len(text) contains(text, part) lower(text) number(x) has(picks, value) count(picks) sum(list) join(picks, ", ").
- lookup() on a multi: sum the picks' prices with a variable per pick, e.g. has(rooms, 'kitchen') * 250 + has(rooms, 'bath') * 180 (has() is 1/0 in arithmetic).
- Never guess a business's prices. Use the rates the user gave, or the price book. If they gave none, ask (one message, everything at once) — or use a clearly-named placeholder and SAY it's a placeholder.
- Keep it as simple as the pricing really is: a flat-rate business needs one select and two lines, not twelve inputs.
- The owner can also edit labels, rates and formulas by hand (Settings → Estimate tools → pencil) and roll back to any earlier version — every save is kept. So when they want a rate changed, a small 'update' with the new spec is right; they are never stuck with your version.
- Use action 'test' with sample inputs before staging create/update — fix anything it reports.`;

// ── what changed between two specs (version history, Atlas update cards) ─────

function rateText(expr: string | undefined): string {
  if (!expr) return "(price book)";
  return /^\d+(\.\d+)?$/.test(expr) ? `$${Number(expr).toFixed(2)}` : `"${expr}"`;
}

function optionsKey(i: EstimatorInput): string {
  return i.type === "select" || i.type === "multi" ? i.options.map((o) => `${o.value}=${o.label}`).join("|") : "";
}

/** Human lines: `Rate for "Sealant": $0.45 → $0.50`, `Added question "Fence length"`. Empty = the rules are the same. */
export function describeSpecChanges(from: EstimatorSpec, to: EstimatorSpec): string[] {
  const out: string[] = [];
  const fromInputs = new Map(from.inputs.map((i) => [i.id, i]));
  const toInputs = new Map(to.inputs.map((i) => [i.id, i]));
  for (const i of to.inputs) {
    const o = fromInputs.get(i.id);
    if (!o) {
      out.push(`Added question "${i.label}"`);
      continue;
    }
    if (o.label !== i.label) out.push(`Renamed question "${o.label}" → "${i.label}"`);
    if (o.type !== i.type) out.push(`"${i.label}" is now a ${i.type} question`);
    else if (optionsKey(o) !== optionsKey(i)) out.push(`Options for "${i.label}" changed`);
    if ((o.showWhen ?? "") !== (i.showWhen ?? "")) out.push(i.showWhen ? `"${i.label}" now shows only when ${i.showWhen}` : `"${i.label}" now always shows`);
    if ((o.section ?? "") !== (i.section ?? "")) out.push(i.section ? `"${i.label}" moved to section "${i.section}"` : `"${i.label}" left its section`);
    if (o.type === "number" && i.type === "number" && (o.default ?? null) !== (i.default ?? null)) out.push(`Default for "${i.label}": ${o.default ?? "none"} → ${i.default ?? "none"}`);
  }
  for (const o of from.inputs) if (!toInputs.has(o.id)) out.push(`Removed question "${o.label}"`);

  const fromVars = new Map(from.variables.map((v) => [v.id, v.expr]));
  const toVars = new Map(to.variables.map((v) => [v.id, v.expr]));
  for (const [id, expr] of toVars) {
    const prev = fromVars.get(id);
    if (prev === undefined) out.push(`Added variable ${id} = ${expr}`);
    else if (prev !== expr) out.push(`Variable ${id}: ${prev} → ${expr}`);
  }
  for (const id of fromVars.keys()) if (!toVars.has(id)) out.push(`Removed variable ${id}`);

  const fromLines = new Map(from.lines.map((l) => [l.id, l]));
  const toLines = new Map(to.lines.map((l) => [l.id, l]));
  for (const l of to.lines) {
    const o = fromLines.get(l.id);
    if (!o) {
      out.push(`Added line "${l.name}" at ${rateText(l.unitPrice)}`);
      continue;
    }
    if (o.name !== l.name) out.push(`Renamed line "${o.name}" → "${l.name}"`);
    if ((o.unitPrice ?? "") !== (l.unitPrice ?? "")) out.push(`Rate for "${l.name}": ${rateText(o.unitPrice)} → ${rateText(l.unitPrice)}`);
    if ((o.quantity ?? "1") !== (l.quantity ?? "1")) out.push(`Quantity for "${l.name}": ${o.quantity ?? "1"} → ${l.quantity ?? "1"}`);
    if ((o.when ?? "") !== (l.when ?? "")) out.push(l.when ? `"${l.name}" now applies when ${l.when}` : `"${l.name}" now always applies`);
    if ((o.workItemName ?? "") !== (l.workItemName ?? "")) out.push(l.workItemName ? `"${l.name}" now sells price-book item "${l.workItemName}"` : `"${l.name}" no longer tied to the price book`);
    if (Boolean(o.isOptional) !== Boolean(l.isOptional)) out.push(`"${l.name}" is now ${l.isOptional ? "optional" : "required"} on the quote`);
    if ((o.description ?? "") !== (l.description ?? "")) out.push(`Description for "${l.name}" changed`);
  }
  for (const o of from.lines) if (!toLines.has(o.id)) out.push(`Removed line "${o.name}"`);

  if ((from.minimumTotal ?? 0) !== (to.minimumTotal ?? 0)) out.push(`Minimum job charge: $${(from.minimumTotal ?? 0).toFixed(2)} → $${(to.minimumTotal ?? 0).toFixed(2)}`);
  if ((from.intro ?? "") !== (to.intro ?? "")) out.push("Intro text changed");
  if ((from.quoteTitle ?? "") !== (to.quoteTitle ?? "")) out.push("Quote title changed");
  if ((from.clientMessage ?? "") !== (to.clientMessage ?? "")) out.push("Client message changed");
  if (Boolean(from.assist) !== Boolean(to.assist)) out.push(to.assist ? "Atlas fill-in turned on" : "Atlas fill-in turned off");
  else if (from.assist && to.assist && (from.assist.instructions ?? "") !== (to.assist.instructions ?? "")) out.push("Atlas fill-in guidance changed");
  return out;
}

// ── sections (both forms render questions in groups; the website form makes each a step) ──

export type InputSection = { title: string | null; inputs: EstimatorInput[] };

/** The visible inputs grouped by consecutive `section` title (null = no heading). */
export function sectionsOf(inputs: EstimatorInput[], visible: Set<string>): InputSection[] {
  const out: InputSection[] = [];
  for (const inp of inputs) {
    if (!visible.has(inp.id)) continue;
    const title = inp.section ?? null;
    const last = out[out.length - 1];
    if (last && last.title === title) last.inputs.push(inp);
    else out.push({ title, inputs: [inp] });
  }
  return out;
}

/** Form-state defaults for a spec (strings for fields, booleans for toggles, string lists for multi). */
export function formDefaults(spec: EstimatorSpec): Record<string, string | boolean | string[]> {
  const v: Record<string, string | boolean | string[]> = {};
  for (const i of spec.inputs) {
    if (i.type === "toggle") v[i.id] = i.default === true;
    else if (i.type === "multi") v[i.id] = i.default ? [...i.default] : [];
    else if (i.default !== undefined && i.default !== null) v[i.id] = String(i.default);
    else v[i.id] = "";
  }
  return v;
}

/** Is every visible, required input answered? (drives the live running total) */
export function inputsComplete(spec: EstimatorSpec, values: Record<string, unknown>): boolean {
  const visible = visibleInputIds(spec, values);
  return spec.inputs.every((i) => {
    if (!visible.has(i.id) || i.type === "toggle") return true;
    if (!("required" in i) || i.required === false) return true;
    const v = values[i.id];
    if (Array.isArray(v)) return v.length > 0;
    return v !== "" && v !== undefined && v !== null;
  });
}
