import type { EstimatorInput, EstimatorSpec } from "@/lib/estimator";

/**
 * Pictures of an estimate tool, shaped by the tool itself (heavy pilot
 * round 6, 2026-11-23): the questions it asks, in order, ending in the
 * price; what it charges for its sample jobs; how its quotes went; and the
 * website's views → estimates → leads. Styles live in app/ds-estimates.css.
 */

type Group = { title: string | null; inputs: EstimatorInput[] };

function groupsOf(spec: EstimatorSpec): Group[] {
  const out: Group[] = [];
  for (const inp of spec.inputs) {
    const title = inp.section?.trim() || null;
    const last = out[out.length - 1];
    if (last && last.title === title) last.inputs.push(inp);
    else out.push({ title, inputs: [inp] });
  }
  return out;
}

function kindOf(inp: EstimatorInput): string {
  if (inp.type === "select" && inp.style === "packages") return "packages";
  return inp.type;
}

const KIND_WORDS: Record<string, string> = {
  number: "a number",
  select: "pick one",
  packages: "pick a package",
  multi: "pick any",
  counts: "how many of each",
  map: "measured on a map",
  toggle: "yes or no",
  text: "in their words",
};

function describe(inp: EstimatorInput, atlasName: string): string {
  const bits = [inp.label, KIND_WORDS[kindOf(inp)] ?? ""];
  if ("options" in inp && inp.options.length) bits.push(`${inp.options.length} choices`);
  if (inp.showWhen) bits.push("only asked sometimes");
  if (inp.askAtlas) bits.push(`${atlasName} can answer it`);
  return bits.filter(Boolean).join(" · ");
}

/** The glyph for one question: its shape says what kind of answer it takes. */
function Glyph({ inp }: { inp: EstimatorInput }) {
  const kind = kindOf(inp);
  const n = "options" in inp ? Math.min(4, Math.max(2, inp.options.length)) : 0;
  return (
    <span className={`ds-qg is-${kind}`} aria-hidden>
      {kind === "number" && (
        <>
          <i style={{ height: "35%" }} />
          <i style={{ height: "60%" }} />
          <i style={{ height: "90%" }} />
        </>
      )}
      {kind === "packages" && (
        <>
          <i style={{ height: "45%" }} />
          <i style={{ height: "70%" }} />
          <i style={{ height: "95%" }} />
        </>
      )}
      {(kind === "select" || kind === "multi") && Array.from({ length: n }, (_, k) => <i key={k} className={kind === "select" && k === 0 ? "is-on" : kind === "multi" && k % 2 === 0 ? "is-on" : ""} />)}
      {kind === "counts" && <b>+</b>}
      {kind === "map" && <i />}
      {kind === "toggle" && <i />}
      {kind === "text" && (
        <>
          <i />
          <i />
        </>
      )}
    </span>
  );
}

/**
 * Small: a dotted line of the tool's questions for a list card — one dot per
 * question (hollow = only asked sometimes, brand = Atlas can answer it),
 * sections set apart, ending in the price.
 */
export function FlowDots({ spec }: { spec: EstimatorSpec }) {
  const groups = groupsOf(spec);
  const n = spec.inputs.length;
  return (
    <span className="ds-fdots" role="img" aria-label={`${n} question${n === 1 ? "" : "s"}${groups.length > 1 ? ` in ${groups.length} steps` : ""}, then the price`}>
      {groups.map((g, gi) => (
        <span key={gi} className="ds-fdots-group">
          {g.inputs.map((inp) => (
            <span key={inp.id} className={`ds-fdot ${inp.showWhen ? "is-maybe" : ""} ${inp.askAtlas ? "is-atlas" : ""}`} title={inp.label} />
          ))}
        </span>
      ))}
      <span className="ds-fdots-price">$</span>
    </span>
  );
}

/**
 * Large: the tool's flow as a picture — each step's questions as shaped
 * nodes with their names, a line drawn through them, the price at the end
 * (the sample range when we have it).
 */
export function FlowMap({ spec, atlasName, price }: { spec: EstimatorSpec; atlasName: string; price?: string | null }) {
  const groups = groupsOf(spec);
  let k = 0;
  return (
    <div className="ds-fmap" role="list" aria-label="The questions it asks, in order">
      {groups.map((g, gi) => (
        <div key={gi} className="ds-fmap-step" role="listitem">
          <p className="ds-fmap-step-title">{g.title ?? (groups.length > 1 ? `Step ${gi + 1}` : "Questions")}</p>
          <div className="ds-fmap-nodes">
            {g.inputs.map((inp) => (
              <div key={inp.id} className={`ds-fmap-node ${inp.showWhen ? "is-maybe" : ""} ${inp.askAtlas ? "is-atlas" : ""}`} style={{ "--k": k++ } as React.CSSProperties} title={describe(inp, atlasName)}>
                <Glyph inp={inp} />
                <span className="ds-fmap-label">{inp.label}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="ds-fmap-step is-price" role="listitem">
        <p className="ds-fmap-step-title">Price</p>
        <div className="ds-fmap-nodes">
          <div className="ds-fmap-node is-price" style={{ "--k": k } as React.CSSProperties}>
            <span className="ds-qg is-price" aria-hidden>
              $
            </span>
            <span className="ds-fmap-label">{price || "The estimate"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One sample job on the price line. */
export type SamplePoint = { label: string; price: number | null; tiny: boolean; minimumAdded?: number };

/**
 * What it charges: the sample jobs placed on one price line, smallest to
 * largest, with the job minimum marked where it sits.
 */
export function PriceLine({ points, minimum, fmt }: { points: SamplePoint[]; minimum?: number; fmt: (n: number) => string }) {
  const priced = points.filter((p): p is SamplePoint & { price: number } => typeof p.price === "number");
  if (priced.length === 0) return null;
  const values = [...priced.map((p) => p.price), ...(minimum ? [minimum] : [])];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const at = (v: number) => (hi === lo ? 50 : 4 + ((v - lo) / span) * 92);
  const sorted = [...priced].sort((a, b) => a.price - b.price);
  return (
    <div className="ds-pline" role="list" aria-label="Sample jobs by price">
      <div className="ds-pline-track" aria-hidden />
      {minimum ? (
        <span className="ds-pline-min" style={{ left: `${at(minimum)}%` }} title={`Job minimum ${fmt(minimum)}`} />
      ) : null}
      {sorted.map((p, i) => (
        <div
          key={p.label}
          role="listitem"
          className={`ds-pline-pt ${p.tiny ? "is-tiny" : ""} ${i % 2 ? "is-low" : ""}`}
          style={{ left: `${at(p.price)}%`, "--k": i } as React.CSSProperties}
          title={`${p.label}: ${fmt(p.price)}${p.minimumAdded ? ` (${fmt(p.price - p.minimumAdded)} of work, topped up to the minimum)` : ""}`}
        >
          <span className="ds-pline-dot" aria-hidden />
          <span className="ds-pline-tag">
            <b>{fmt(p.price)}</b>
            <span>{p.label.replace(/^tiny job:?\s*/i, "").replace(/^./, (c) => c.toUpperCase())}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** How the quotes went: one bar split won / open / lost. */
export function OutcomeBar({ won, open, lost }: { won: number; open: number; lost: number }) {
  const total = won + open + lost;
  if (total === 0) return null;
  const parts = [
    { key: "won", n: won, label: "won" },
    { key: "open", n: open, label: "waiting" },
    { key: "lost", n: lost, label: "lost" },
  ].filter((p) => p.n > 0);
  return (
    <div className="ds-obar-wrap">
      <div className="ds-obar" role="img" aria-label={parts.map((p) => `${p.n} ${p.label}`).join(", ")}>
        {parts.map((p) => (
          <span key={p.key} className={`ds-obar-part is-${p.key}`} style={{ flexGrow: p.n }} title={`${p.n} ${p.label}`} />
        ))}
      </div>
      <div className="ds-obar-keys">
        {parts.map((p) => (
          <span key={p.key} className={`ds-obar-key is-${p.key}`}>
            <i aria-hidden />
            <b>{p.n}</b> {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The website's funnel: views → estimates → leads, each bar as wide as its share of the views (the words first, then the bar). */
export function WebFunnel({ views, calcs, leads }: { views: number; calcs: number; leads: number }) {
  const top = Math.max(1, views, calcs, leads);
  const rows = [
    { key: "views", n: views, label: views === 1 ? "person opened it" : "people opened it" },
    { key: "calcs", n: calcs, label: "got a price" },
    { key: "leads", n: leads, label: "sent it to you" },
  ];
  return (
    <div className="ds-funnel" role="list" aria-label="Website: views, estimates, leads">
      {rows.map((r, i) => (
        <div key={r.key} role="listitem" className={`ds-funnel-row is-${r.key}`} style={{ "--k": i } as React.CSSProperties}>
          <span className="ds-funnel-text">
            <b>{r.n.toLocaleString("en-US")}</b> {r.label}
          </span>
          <span className="ds-funnel-track" aria-hidden>
            <span className="ds-funnel-bar" style={{ width: `${r.n > 0 ? Math.max(2, (r.n / top) * 100) : 0}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}
