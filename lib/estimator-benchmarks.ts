/**
 * Trade baselines — what the work typically sells for and how long it takes,
 * per playbook trade (lib/estimator-playbook.ts keys). The builder
 * (lib/estimator-build.ts) falls back on these when a business has no rates
 * of its own and the owner gave none, and uses them to sanity-check the tool
 * it just wrote: a "typical" job priced at three times the going rate is
 * sent back before the owner ever sees it.
 *
 * These are NOT anyone's prices. They are wide US ranges for what a
 * homeowner pays (labor + materials unless a line says otherwise), put
 * together in late 2026, nudged by a coarse cost-of-living factor per state.
 * Every number that reaches a tool from here is listed under the tool's
 * "rates to confirm". Labor is PERSON-hours: three people for four hours is
 * twelve. Pure data + pure helpers; unit-tested in
 * scripts/test-estimator-benchmarks.ts.
 */

export type BenchmarkRate = { what: string; unit: string; low: number; high: number };

export type TypicalJob = {
  /** The job, specific enough that two estimators would price the same thing. */
  job: string;
  /** What it sells for, pre-tax. */
  low: number;
  high: number;
  /** Person-hours on site. */
  hoursLow: number;
  hoursHigh: number;
};

export type TradeBenchmark = {
  rates: BenchmarkRate[];
  /** How fast the work goes, in person-hours. */
  labor: string;
  typical: TypicalJob;
  /** What businesses in the trade set as their minimum job charge — the cost of showing up at all. */
  minimum?: { low: number; high: number };
};

const r = (what: string, unit: string, low: number, high: number): BenchmarkRate => ({ what, unit, low, high });
const t = (job: string, low: number, high: number, hoursLow: number, hoursHigh: number): TypicalJob => ({ job, low, high, hoursLow, hoursHigh });

export const BENCHMARKS: Record<string, TradeBenchmark> = {
  pressure_washing: {
    rates: [r("Driveway / flatwork cleaning", "sq ft", 0.2, 0.45), r("House wash (by home sq ft)", "sq ft", 0.15, 0.4), r("Roof soft wash", "sq ft", 0.25, 0.6)],
    minimum: { low: 125, high: 200 },
    labor: "One tech cleans 400–700 sq ft of flatwork an hour; a one-story house wash is 1.5–3 person-hours.",
    typical: t("Two-car driveway, about 600 sq ft, cleaning only (no sealant)", 150, 300, 1, 2),
  },
  lawn_care: {
    rates: [r("Mow, edge and blow, ¼-acre lot", "visit", 40, 75), r("Mowing by lawn area", "1,000 sq ft", 4, 9), r("Mulch, delivered and spread", "cu yd", 75, 130), r("Core aeration", "1,000 sq ft", 12, 25)],
    labor: "One person mows, edges and blows a ¼-acre lot in 35–50 minutes; a one-time or overgrown cut takes about twice that.",
    typical: t("Weekly mow, edge and blow on a ¼-acre lot (about 8,000 sq ft of turf), price per visit", 40, 75, 0.5, 1),
  },
  fencing: {
    rates: [
      r("Wood privacy fence, 6 ft", "ft", 28, 55),
      r("Vinyl privacy fence, 6 ft", "ft", 35, 65),
      r("Wood privacy fence, 8 ft (about 1.3–1.5× the 6 ft price)", "ft", 38, 75),
      r("Board-on-board upgrade over side-by-side", "ft", 5, 12),
      r("Cap and trim", "ft", 3, 8),
      r("Steel posts instead of wood", "ft", 3, 8),
      r("Stain and seal, both sides", "ft", 4, 10),
      r("Chain link, 4 ft", "ft", 15, 30),
      r("Ornamental iron / steel / aluminum, 5 ft", "ft", 35, 70),
      r("Ranch rail (wood, 3–4 rail), 4 ft", "ft", 14, 30),
      r("Pipe rail (welded steel), 4–5 ft", "ft", 30, 65),
      r("Walk gate, wood or vinyl", "each", 300, 650),
      r("Walk gate, chain link", "each", 175, 400),
      r("Walk gate, ornamental metal", "each", 400, 900),
      r("Single drive gate (about 8 ft), wood or vinyl", "each", 550, 1200),
      r("Double drive gate (10–16 ft), wood or vinyl", "each", 800, 1900),
      r("Double drive gate (10–16 ft), chain link or pipe", "each", 500, 1400),
      r("Self-closing, self-latching pool gate hardware", "gate", 75, 250),
      r("Corner or end post (braced), added to the per-ft price", "each", 40, 120),
      r("Old wood fence removal and haul-away", "ft", 3, 7),
      r("Old chain link removal with concrete footings", "ft", 5, 11),
      r("Rocky or steep ground", "ft", 4, 12),
    ],
    minimum: { low: 900, high: 1500 },
    labor: "A three-person crew builds 120–180 ft of wood privacy fence a day: 0.13–0.22 person-hours per foot (chain link is faster, rocky ground slower). A gate adds 1.5–3 person-hours.",
    typical: t("150 ft of 6 ft wood privacy fence with one walk gate, normal ground, no tear-out", 4500, 8500, 20, 36),
  },
  roofing: {
    rates: [r("Architectural asphalt shingles, tear-off and replace", "sq ft of roof", 4.5, 8), r("Standing-seam metal", "sq ft of roof", 10, 18), r("Extra layer tear-off", "sq ft of roof", 1, 2), r("Decking replacement", "sheet", 70, 130)],
    labor: "A five- or six-person crew tears off and lays 20–30 squares (2,000–3,000 sq ft) a day: 1.8–3 person-hours per square. Steep or cut-up roofs run 25–50% slower.",
    typical: t("Tear off one layer and replace 2,000 sq ft (20 squares) with architectural shingles, walkable pitch", 9000, 16000, 40, 70),
  },
  painting: {
    rates: [r("Interior, walls only (by floor area)", "sq ft", 2, 4.5), r("Interior, walls + ceilings + trim (by floor area)", "sq ft", 3.5, 6.5), r("Exterior (by home sq ft)", "sq ft", 1.75, 4.5), r("Cabinet door or drawer front", "each", 80, 160)],
    labor: "One painter covers 150–200 sq ft of wall an hour per coat; with prep, a 12×12 bedroom (walls, two coats) is 4–6 person-hours.",
    typical: t("Interior repaint of three bedrooms, walls only, two coats, owner's color staying similar", 1200, 2700, 14, 26),
  },
  house_cleaning: {
    rates: [r("Standard recurring clean", "sq ft", 0.1, 0.2), r("Deep or first-time clean", "sq ft", 0.15, 0.3), r("Hourly, per cleaner", "hour", 35, 65), r("Inside oven or fridge", "each", 25, 50)],
    labor: "One cleaner covers 500–700 sq ft an hour on a standard clean; a deep or move-out clean goes at about half that pace.",
    typical: t("Standard clean of a 2,000 sq ft, 3-bed 2-bath home on an every-two-weeks schedule, price per visit", 190, 380, 3, 5),
  },
  windows: {
    rates: [r("Window, inside and out", "window", 10, 20), r("Window, outside only", "window", 6, 12), r("Screen cleaning", "screen", 3, 6), r("Track detail", "window", 3, 6)],
    labor: "One tech does 4–6 standard windows an hour inside and out; second-story and French-pane windows run slower.",
    typical: t("25 windows inside and out with screens, two-story home", 250, 500, 4, 7),
  },
  hvac: {
    rates: [r("Diagnostic / service call", "visit", 90, 160), r("Seasonal tune-up", "system", 90, 200), r("Full split-system replacement, installed", "ton", 2500, 4500), r("Labor", "hour", 100, 180)],
    labor: "Two techs replace a residential split system in one day: 12–22 person-hours. A tune-up is about one.",
    typical: t("Replace a 3-ton split system (condenser + furnace or air handler) on existing ductwork", 8000, 15000, 12, 22),
  },
  plumbing: {
    rates: [r("Service call / diagnostic", "visit", 80, 180), r("Labor", "hour", 110, 220), r("Tank water heater replacement, 40–50 gal, installed", "each", 1400, 2900), r("Drain clearing", "drain", 150, 400), r("Toilet install (labor)", "each", 150, 350)],
    labor: "One plumber swaps a like-for-like tank water heater in 3–5 hours; most small repairs are 1–2 hours plus the trip.",
    typical: t("Replace a 50-gallon gas tank water heater in the same location, haul away the old one", 1500, 2900, 3, 5),
  },
  electrical: {
    rates: [r("Service call / diagnostic", "visit", 90, 180), r("Labor", "hour", 100, 180), r("Add an outlet or switch", "each", 150, 350), r("Panel upgrade to 200 A", "each", 2200, 4500), r("Level 2 EV charger install", "each", 800, 2000)],
    labor: "A 200-amp panel swap is 8–14 person-hours (usually two people, one day); adding an outlet on an accessible wall is 1–2.",
    typical: t("Upgrade a main panel to 200 amps in the same location, permit included", 2200, 4500, 8, 14),
  },
  handyman: {
    rates: [r("Labor", "hour", 60, 120), r("Half day", "each", 250, 450), r("Full day", "each", 450, 850)],
    minimum: { low: 100, high: 175 },
    labor: "Priced by time: one person, with materials billed on top.",
    typical: t("Half a day of small repairs by one person, materials extra", 250, 450, 4, 4),
  },
  junk_moving: {
    rates: [r("Junk removal, full truck (about 15 cu yd)", "load", 450, 750), r("Junk removal, quarter truck", "load", 150, 275), r("Single bulky item", "each", 75, 150), r("Local move, two movers and a truck", "hour", 110, 180), r("Local move, three movers and a truck", "hour", 150, 240)],
    labor: "Two people load half a truck of junk in about an hour; a local move runs roughly one mover-hour per 100–150 sq ft of home.",
    typical: t("Half a truck of household junk from a garage, two people, disposal included", 275, 450, 1.5, 3),
  },
  concrete: {
    rates: [r("Broom-finish slab or driveway, 4 in", "sq ft", 7, 13), r("Stamped or colored concrete", "sq ft", 12, 20), r("Tear-out and haul-away of old concrete", "sq ft", 2, 5)],
    labor: "A four-person crew forms, pours and finishes 600–1,000 sq ft in a day after a day of prep: 0.06–0.1 person-hours per sq ft all in.",
    typical: t("600 sq ft broom-finish driveway, 4 in thick, including tear-out of the old one", 5500, 10000, 40, 70),
  },
  pest: {
    rates: [r("One-time general treatment", "visit", 150, 350), r("Quarterly plan", "visit", 90, 160), r("Monthly plan", "visit", 45, 75), r("Initial service on a plan", "visit", 150, 300)],
    labor: "One tech treats a typical home inside and out in 30–60 minutes.",
    typical: t("Quarterly general pest plan on a 2,000 sq ft home, price per visit", 90, 160, 0.5, 1),
  },
  gutters: {
    rates: [r("Seamless aluminum gutter, 5 in, installed", "ft", 8, 15), r("Seamless aluminum gutter, 6 in, installed", "ft", 10, 18), r("Gutter guards, installed", "ft", 6, 15), r("Gutter cleaning", "ft", 0.8, 2)],
    labor: "A two-person crew hangs 150–250 ft of seamless gutter a day: 0.08–0.12 person-hours per foot. Cleaning one-story gutters is about 1 person-hour per 100 ft.",
    typical: t("160 ft of 5-in seamless aluminum gutter with six downspouts on a one-story home, old gutters removed", 1400, 2600, 10, 18),
  },
  tree: {
    rates: [r("Tree removal, small (under 30 ft)", "tree", 300, 700), r("Tree removal, medium (30–60 ft)", "tree", 700, 1500), r("Tree removal, large (over 60 ft)", "tree", 1500, 3500), r("Stump grinding", "inch of diameter", 3, 6), r("Trimming / pruning", "tree", 250, 800)],
    labor: "A three-person crew takes down and chips a medium tree with open access in 3–6 hours: 9–18 person-hours.",
    typical: t("Remove one medium tree (about 45 ft) with open access, haul everything away, no stump grinding", 800, 1600, 9, 18),
  },
  pool: {
    rates: [r("Weekly full service, chemicals included", "month", 130, 220), r("Opening", "each", 250, 450), r("Closing / winterizing", "each", 250, 450), r("Green-to-clean recovery", "each", 300, 700)],
    labor: "One tech services a residential pool in 25–45 minutes a visit.",
    typical: t("Weekly full service with chemicals on a standard residential pool, price per MONTH", 130, 220, 2, 3.5),
  },
  flooring: {
    rates: [r("Luxury vinyl plank, material and labor", "sq ft", 5, 10), r("Hardwood, material and labor", "sq ft", 9, 16), r("Tile, material and labor", "sq ft", 10, 20), r("Carpet, material and labor", "sq ft", 3.5, 7.5), r("Old floor removal", "sq ft", 0.75, 2)],
    labor: "Two installers lay 400–600 sq ft of vinyl plank a day: 0.03–0.045 person-hours per sq ft. Tile is three to four times slower.",
    typical: t("500 sq ft of luxury vinyl plank, material and labor, with old carpet removed", 3000, 5500, 16, 28),
  },
  garage_door: {
    rates: [r("Service call", "visit", 80, 130), r("Torsion spring replacement (pair)", "each", 250, 450), r("Opener, supplied and installed", "each", 400, 750), r("New insulated steel door, 16×7, installed", "each", 1500, 3000), r("New door, 8×7 or 9×7, installed", "each", 900, 1800)],
    labor: "One tech replaces a pair of springs in about an hour; two people hang a new double door in 3–5 hours.",
    typical: t("Replace both torsion springs on a two-car door, including the service call", 250, 450, 1, 1.5),
  },
  carpet_cleaning: {
    rates: [r("Room", "room", 40, 75), r("By area", "sq ft", 0.25, 0.5), r("Stairs", "step", 2, 4), r("Sofa", "each", 100, 200)],
    minimum: { low: 120, high: 175 },
    labor: "One tech steam-cleans 350–500 sq ft an hour including setup.",
    typical: t("Five rooms and a hallway, steam cleaned, about 1,000 sq ft", 220, 400, 2, 3),
  },
  appliance: {
    rates: [r("Diagnostic", "visit", 80, 130), r("Labor", "hour", 90, 150), r("Typical repair, common part included", "repair", 180, 400)],
    labor: "Most repairs are 1–2 hours on site once the part is in hand.",
    typical: t("Washer repair: diagnose and replace the drain pump, part included", 200, 380, 1, 2),
  },
  irrigation: {
    rates: [r("New system, installed", "zone", 600, 1100), r("Winterization (blow-out)", "visit", 70, 130), r("Spring start-up", "visit", 70, 130), r("Repair labor", "hour", 75, 120), r("Sprinkler head replacement", "head", 20, 45)],
    labor: "A three-person crew installs a six-zone residential system in 1–1.5 days: 4–7 person-hours per zone.",
    typical: t("New six-zone sprinkler system for a ¼-acre lot", 3600, 6600, 24, 40),
  },
  snow: {
    rates: [r("Two-car driveway, one push", "visit", 40, 80), r("Walks and steps, shoveled", "visit", 25, 60), r("Seasonal driveway contract", "season", 400, 900), r("Salt / ice melt application", "visit", 25, 60)],
    labor: "A plow truck clears a two-car driveway in 10–20 minutes; hand shoveling walks adds 15–30.",
    typical: t("Two-car driveway and front walk, one push, under 6 inches of snow", 45, 90, 0.3, 0.75),
  },
  chimney: {
    rates: [r("Sweep, one flue", "flue", 150, 300), r("Level 2 camera inspection", "each", 250, 500), r("Chimney cap, supplied and installed", "each", 200, 450), r("Crown repair", "each", 400, 1200)],
    labor: "One tech sweeps and inspects a flue in 1–1.5 hours.",
    typical: t("Sweep and level 1 inspection of one wood-burning flue", 175, 325, 1, 1.5),
  },
  locksmith: {
    rates: [r("Service call", "visit", 60, 120), r("Home lockout, daytime", "each", 90, 200), r("Rekey", "lock", 20, 40), r("Deadbolt, supplied and installed", "each", 100, 220), r("Car key, cut and programmed", "each", 150, 400)],
    labor: "A rekey is 10–15 minutes a lock once on site; a lockout is usually under 30 minutes.",
    typical: t("Rekey four locks at a home on a weekday, service call included", 130, 240, 0.75, 1.5),
  },
  remodel: {
    rates: [r("Hall bathroom remodel, 5×8, midrange", "each", 12000, 25000), r("Kitchen remodel, midrange", "each", 30000, 70000), r("Interior remodel by area", "sq ft", 100, 250), r("Carpenter labor", "hour", 70, 120)],
    labor: "A 5×8 bathroom gut-and-rebuild is 120–220 person-hours across the trades, over two to four weeks.",
    typical: t("Full gut remodel of a 5×8 hall bathroom with midrange finishes", 12000, 25000, 120, 220),
  },
  pc_repair: {
    rates: [r("Diagnostic", "each", 50, 100), r("Labor", "hour", 70, 130), r("Virus removal and tune-up", "each", 100, 180), r("Reinstall and data transfer", "each", 120, 220), r("On-site trip", "visit", 40, 80)],
    labor: "Most jobs are 1–2 hours of bench time.",
    typical: t("Virus removal and tune-up on one computer, in the shop", 100, 180, 1, 2),
  },
  auto_detailing: {
    rates: [r("Full detail, sedan", "vehicle", 180, 350), r("Full detail, SUV or truck", "vehicle", 220, 450), r("Interior only", "vehicle", 120, 250), r("Exterior wash and wax", "vehicle", 60, 150), r("Ceramic coating", "vehicle", 700, 1800)],
    labor: "One detailer does a full interior + exterior detail in 3.5–6 hours; heavy pet hair or stains add 1–2.",
    typical: t("Full interior and exterior detail on a mid-size SUV in average condition", 220, 420, 3.5, 6),
  },
  mobile_mechanic: {
    rates: [r("Labor", "hour", 90, 150), r("Diagnostic", "visit", 80, 140), r("Brake pads, parts and labor", "axle", 180, 350), r("Brake pads and rotors, parts and labor", "axle", 350, 600), r("Synthetic oil change", "each", 80, 130)],
    labor: "Pads and rotors on one axle take 1.5–2.5 hours; most driveway jobs are 1–3.",
    typical: t("Front brake pads and rotors on a common sedan, parts included", 350, 600, 1.5, 2.5),
  },
  septic: {
    rates: [r("Pump a 1,000-gallon tank", "each", 300, 600), r("Pump a 1,500-gallon tank", "each", 400, 750), r("Inspection", "each", 200, 500), r("Digging to a buried lid", "lid", 50, 150), r("Riser install", "each", 300, 600)],
    labor: "One operator pumps a tank with an accessible lid in 1–2 hours including the drive to dump.",
    typical: t("Pump a 1,000-gallon tank with the lid accessible", 300, 600, 1, 2),
  },
  solar: {
    rates: [r("Rooftop system, installed, before incentives", "watt", 2.5, 3.75), r("Home battery (about 13 kWh), installed", "each", 11000, 17000)],
    labor: "A four-person crew installs a 7 kW rooftop system in 1.5–2.5 days: 50–90 person-hours.",
    typical: t("7 kW rooftop system on a composition-shingle roof, before incentives", 17500, 26500, 50, 90),
  },
  insulation: {
    rates: [r("Blown-in attic insulation to R-38", "sq ft", 1.25, 2.75), r("Batt insulation", "sq ft", 1, 2.2), r("Open-cell spray foam, 3.5 in", "sq ft", 1.5, 3), r("Closed-cell spray foam, 2 in", "sq ft", 2.5, 4.5), r("Old insulation removal", "sq ft", 1, 2)],
    labor: "Two people blow a 1,200 sq ft attic in 3–6 hours: 6–12 person-hours.",
    typical: t("Blow a 1,200 sq ft attic to R-38 over the existing insulation", 1600, 3200, 6, 12),
  },
  siding: {
    rates: [r("Vinyl siding, installed", "sq ft of wall", 5, 10), r("Fiber cement siding, installed", "sq ft of wall", 9, 15), r("Engineered wood siding, installed", "sq ft of wall", 8, 13), r("Old siding tear-off", "sq ft of wall", 1, 2)],
    labor: "A three-person crew hangs 300–500 sq ft of vinyl a day: 0.05–0.08 person-hours per sq ft, plus tear-off.",
    typical: t("1,600 sq ft of wall re-sided in vinyl with tear-off, one-story home", 9500, 17500, 90, 150),
  },
  decks: {
    rates: [r("Pressure-treated deck, built", "sq ft", 30, 50), r("Composite deck, built", "sq ft", 45, 80), r("Wood railing", "ft", 30, 60), r("Composite or aluminum railing", "ft", 60, 120), r("Old deck demolition", "sq ft", 3, 8)],
    labor: "A three-person crew frames and decks a 12×16 in 3–4 days: 0.4–0.55 person-hours per sq ft including railing and stairs.",
    typical: t("12×16 (192 sq ft) pressure-treated deck about 3 ft off the ground, with railing and one set of stairs", 6500, 11500, 70, 110),
  },
};

// ── where the business is ────────────────────────────────────────────────────

const HIGH = ["CA", "NY", "MA", "HI", "AK", "NJ", "CT", "WA", "DC"];
const ABOVE = ["OR", "CO", "MD", "IL", "NH", "RI", "VT", "MN"];
const BELOW = ["MS", "AR", "AL", "OK", "WV", "KY", "LA", "TN", "SC", "MO", "KS", "NM", "IN", "IA", "NE", "SD", "ND"];
const STATE_NAMES: Record<string, string> = {
  california: "CA", "new york": "NY", massachusetts: "MA", hawaii: "HI", alaska: "AK", "new jersey": "NJ", connecticut: "CT", washington: "WA", "district of columbia": "DC",
  oregon: "OR", colorado: "CO", maryland: "MD", illinois: "IL", "new hampshire": "NH", "rhode island": "RI", vermont: "VT", minnesota: "MN",
  mississippi: "MS", arkansas: "AR", alabama: "AL", oklahoma: "OK", "west virginia": "WV", kentucky: "KY", louisiana: "LA", tennessee: "TN", "south carolina": "SC", missouri: "MO", kansas: "KS", "new mexico": "NM", indiana: "IN", iowa: "IA", nebraska: "NE", "south dakota": "SD", "north dakota": "ND",
};

/** A coarse cost-of-doing-business factor for a US state (abbreviation or full name); 1 when unknown. */
export function regionFactor(state: string | null | undefined): number {
  const s = (state ?? "").trim();
  if (!s) return 1;
  const code = s.length === 2 ? s.toUpperCase() : STATE_NAMES[s.toLowerCase()] ?? "";
  if (HIGH.includes(code)) return 1.2;
  if (ABOVE.includes(code)) return 1.1;
  if (BELOW.includes(code)) return 0.9;
  return 1;
}

/** Round the way a price list would: cents under $10, dollars under $1,000, tens above. */
function tidy(n: number): number {
  if (n < 10) return Math.round(n * 100) / 100;
  if (n < 1000) return Math.round(n);
  return Math.round(n / 10) * 10;
}

/** The trade's baseline with money scaled to the state (hours are the same everywhere). */
export function benchmarkFor(tradeKey: string | null | undefined, state?: string | null): TradeBenchmark | null {
  const base = tradeKey ? BENCHMARKS[tradeKey.trim().toLowerCase()] : undefined;
  if (!base) return null;
  const f = regionFactor(state);
  if (f === 1) return base;
  return {
    labor: base.labor,
    rates: base.rates.map((x) => ({ ...x, low: tidy(x.low * f), high: tidy(x.high * f) })),
    typical: { ...base.typical, low: tidy(base.typical.low * f), high: tidy(base.typical.high * f) },
    ...(base.minimum ? { minimum: { low: tidy(base.minimum.low * f), high: tidy(base.minimum.high * f) } } : {}),
  };
}

// ── the self-check ───────────────────────────────────────────────────────────

export type CheckSample = { label: string; subtotal: number | null; hours?: number };

/** How far outside the range still passes — the ranges are wide already, and a business may sit at either edge. */
export const PRICE_SLACK = { under: 0.6, over: 1.6 };
export const HOURS_SLACK = { under: 0.5, over: 2 };

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** The sample that stands for the typical job: labelled so, else the middle one. */
export function typicalSample<S extends CheckSample>(samples: S[]): S | null {
  const ok = samples.filter((s) => s.subtotal !== null);
  if (ok.length === 0) return null;
  return ok.find((s) => /typical|average|medium|standard/i.test(s.label)) ?? ok[Math.floor((ok.length - 1) / 2)];
}

/**
 * Does the tool price (and time) the trade's typical job anywhere near what
 * that job goes for? Returns plain sentences for the model to act on — empty
 * when it does, or when there is nothing to compare.
 */
export function marketCheck(samples: CheckSample[], typical: TypicalJob | null | undefined, where = ""): string[] {
  if (!typical) return [];
  const s = typicalSample(samples);
  if (!s || s.subtotal === null) return [];
  const out: string[] = [];
  const place = where ? ` around ${where}` : "";
  const job = `this job (${typical.job}) usually sells for ${usd(typical.low)}–${usd(typical.high)}${place}`;
  if (s.subtotal > typical.high * PRICE_SLACK.over) out.push(`The "${s.label}" sample comes to ${usd(s.subtotal)}, but ${job}. That is too HIGH — a rate, a quantity or a multiplier is off.`);
  else if (s.subtotal < typical.low * PRICE_SLACK.under) out.push(`The "${s.label}" sample comes to ${usd(s.subtotal)}, but ${job}. That is too LOW — a rate is thin or a line is missing.`);
  if (s.hours && s.hours > 0) {
    const span = `${typical.hoursLow}–${typical.hoursHigh} person-hours`;
    if (s.hours > typical.hoursHigh * HOURS_SLACK.over) out.push(`The "${s.label}" sample books ${s.hours} hours of labor; that job normally takes ${span}. The "hours" expressions are too high.`);
    else if (s.hours < typical.hoursLow * HOURS_SLACK.under) out.push(`The "${s.label}" sample books ${s.hours} hours of labor; that job normally takes ${span}. The "hours" expressions are too low (hours are PERSON-hours: crew size × time on site).`);
  }
  return out;
}

/** How far the typical job may move across a change before the builder is asked about it. */
export const DRIFT_SLACK = 0.12;

/**
 * Did a CHANGE to a tool move what the typical job costs? Rewriting a tool
 * (new questions, numbers moved onto the rate card) is where a rate gets
 * re-based wrongly — a price that was "per ft at 4 ft" relabelled "6 ft tall"
 * quietly drops every 6 ft quote. One sentence for the model, and for the
 * owner if it stands; empty when the price held or there is nothing to compare.
 */
export function driftCheck(before: CheckSample[], after: CheckSample[]): string[] {
  const was = typicalSample(before);
  const now = typicalSample(after);
  if (!was || !now || was.subtotal === null || now.subtotal === null || was.subtotal <= 0) return [];
  const move = (now.subtotal - was.subtotal) / was.subtotal;
  if (Math.abs(move) <= DRIFT_SLACK) return [];
  return [`The typical job priced ${usd(was.subtotal)} before this change and ${usd(now.subtotal)} after (${move > 0 ? "+" : "−"}${Math.round(Math.abs(move) * 100)}%). Unless the owner asked for prices to change, or the typical job itself now includes more, a rate was carried over wrongly — a price stated at one size, height or grade must be re-based when its label names another. Keep the "Typical job" sample the same job as before and make it come to the same price.`];
}

/**
 * Is the tool's minimum job charge in the trade's range? A minimum well under
 * it means the smallest jobs lose money once the trip, setup and disposal are
 * counted. One sentence for the model (and, on the owner's own numbers, a
 * note) — empty when it is fine or there is nothing to compare.
 */
export function minimumCheck(minimumTotal: number | undefined, range: { low: number; high: number } | null | undefined, where = ""): string[] {
  if (!range) return [];
  const place = where ? ` around ${where}` : "";
  if (!minimumTotal) return [`There is no minimum job charge; businesses in this trade${place} usually set one at ${usd(range.low)}–${usd(range.high)}.`];
  if (minimumTotal < range.low * 0.8) return [`The minimum job charge is ${usd(minimumTotal)}; businesses in this trade${place} usually set ${usd(range.low)}–${usd(range.high)} once the trip, setup, materials run and haul-off are counted. That looks LOW.`];
  return [];
}
