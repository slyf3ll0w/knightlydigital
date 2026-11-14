/**
 * The estimator's answer key (docs/plans/estimator-standard-2026-11-14.md).
 *
 * Each case is one owner describing how they price a kind of job, plus real
 * jobs with the price that owner would charge — worked out by hand from the
 * rates in their own words, written here as plain arithmetic so anyone can
 * check it. The runner (run.ts) has the real builder make the tool, fills the
 * tool's form from each job's facts, runs it, and compares.
 *
 * Two kinds of expected price:
 *   exact → the owner gave the rates, so there is ONE right answer
 *           (or two, when the owner's words leave a real choice open).
 *   range → the owner gave nothing, so the tool prices from the market and
 *           must land inside what published cost guides say the job goes for
 *           (sources in docs/plans/estimator-market-ranges-2026-11-14.md).
 *
 * Add a case whenever a real tool gets a real job wrong: the owner's words,
 * the job, the right price. That is how the standard grows.
 */

export type Expect =
  | { kind: "exact"; totals: number[]; /** fraction either way; default 0.02 */ tolerance?: number }
  | { kind: "range"; low: number; high: number };

export type EvalJob = {
  label: string;
  /** Everything a customer or estimator knows about the job, in plain words. */
  facts: string;
  expect: Expect;
  /**
   * The same job in the CUSTOMER's own words, as typed into "describe the job"
   * on the web form. When set (and the tool has Atlas fill-in on), the job is
   * also priced by the real fill-in (lib/estimator-assist.ts) and must come to
   * the same answer.
   */
  said?: string;
  /** What counts instead when the builder never asked the owner anything (so the owner's numbers never reached it). */
  expectIfNotAsked?: Expect;
  /** A photo of the job for the fill-in, a file under scripts/eval-estimator/photos/ (jpg, png or webp). */
  photo?: string;
};

export type EvalCase = {
  id: string;
  trade: string;
  company: { industry: string; city: string; state: string; priceBook?: { name: string; unitPrice: number }[] };
  /** The owner's words to the builder. */
  prompt: string;
  /**
   * What the owner knows, for when the builder asks questions first. Absent =
   * the owner skips every question (the worst case the tool must survive).
   */
  ownerKnows?: string;
  /**
   * Numbers the owner gave that must be on the rate card exactly, marked as
   * theirs. A list inside the list = any one of those forms counts
   * (35% may be stored as 35, 0.35 or 1.35).
   */
  ownerRates?: (number | number[])[];
  /** The owner's minimum job charge, when they named one. */
  minimum?: number;
  /** true = the owner gave no rates: every price must be labelled an estimate to confirm, none passed off as theirs. */
  cold?: boolean;
  /** The owner asked for photo / description fill-in in their words: the tool must come back with it turned on and instructions written. */
  wantsFillIn?: boolean;
  jobs: EvalJob[];
  /** A follow-up change request on the finished tool, scored as its own row. */
  change?: { prompt: string; ownerRates?: (number | number[])[]; minimum?: number; jobs: EvalJob[] };
};

const exact = (...totals: number[]): Expect => ({ kind: "exact", totals });
const TX = { city: "Allen", state: "TX" };

export const CASES: EvalCase[] = [
  // ── fencing ────────────────────────────────────────────────────────────────
  {
    id: "fence-simple",
    trade: "Fencing",
    company: { industry: "Fencing", ...TX },
    prompt:
      "I build cedar privacy fences. 6 ft tall is $34 a foot installed, 8 ft tall is $46 a foot. Walk gates are $375 each and double drive gates are $950 each. Tearing out and hauling off an old fence is $4 a foot. My minimum job is $1,200. I charge for the full length of the fence line and gates are added on top — I don't take the gate openings out of the footage.",
    ownerRates: [34, 46, 375, 950, 4],
    minimum: 1200,
    jobs: [
      { label: "150 ft, 6 ft, one walk gate", facts: "150 ft of 6 ft tall cedar privacy fence with one walk gate. Flat normal ground, 4 corners, no old fence to remove, not around a pool, no HOA, property line is known.", expect: exact(150 * 34 + 375) },
      { label: "220 ft, 8 ft, two gates, tear-out", facts: "220 ft of 8 ft tall cedar privacy fence with one walk gate and one double drive gate. Tear out and haul away 180 ft of old wood fence. Normal ground, 4 corners, not around a pool.", expect: exact(220 * 46 + 375 + 950 + 180 * 4) },
      { label: "Tiny: 20 ft, no gate", facts: "20 ft of 6 ft tall cedar privacy fence, no gates, normal ground, no old fence, 2 ends.", expect: exact(1200) },
    ],
    change: {
      prompt:
        "Change these: raise the 6 ft price to $36 a foot. Add vinyl privacy fence at 6 ft for $45 a foot. Add stain and seal as an option on cedar for $6 a foot. Rocky ground adds $5 a foot. Walk gates go up to $395. Leave everything else exactly as it is.",
      ownerRates: [36, 46, 45, 6, 5, 395, 950, 4],
      minimum: 1200,
      jobs: [
        { label: "150 ft cedar 6 ft, one walk gate, stained", facts: "150 ft of 6 ft tall cedar privacy fence with one walk gate, stained and sealed. Normal ground, no old fence to remove, not around a pool.", expect: exact(150 * 36 + 395 + 150 * 6) },
        { label: "100 ft vinyl 6 ft", facts: "100 ft of 6 ft tall vinyl privacy fence, no gates. Normal ground, no old fence to remove.", expect: exact(100 * 45) },
        { label: "220 ft cedar 8 ft, drive gate, rocky", facts: "220 ft of 8 ft tall cedar privacy fence with one double drive gate, no stain. The ground is rocky. No old fence to remove.", expect: exact(220 * 46 + 950 + 220 * 5) },
        { label: "Tiny: 20 ft cedar", facts: "20 ft of 6 ft tall cedar privacy fence, no gates, no stain, normal ground, no old fence.", expect: exact(1200) },
      ],
    },
  },
  {
    id: "fence-materials",
    trade: "Fencing",
    company: { industry: "Fencing", ...TX },
    prompt:
      "Fence installs. Prices per foot installed: cedar privacy 6 ft $36, vinyl privacy 6 ft $44, chain link 4 ft $19, chain link 6 ft $24. Walk gates: $400 for cedar or vinyl, $225 for chain link. A walk gate is 4 ft wide and I don't charge fence footage for the gate opening — customers measure the whole line and the gate widths come out. Minimum job $1,000.",
    ownerRates: [36, 44, 19, 24, 400, 225],
    minimum: 1000,
    jobs: [
      { label: "Vinyl, 100 ft line, one gate", facts: "6 ft vinyl privacy fence. The whole fence line measures 100 ft including one walk gate. Normal ground, no old fence to remove, not around a pool.", expect: exact((100 - 4) * 44 + 400) },
      { label: "Chain link 4 ft, 300 ft line, two gates", facts: "4 ft chain link fence. The whole line measures 300 ft including two walk gates. Normal ground, no old fence to remove, not around a pool.", expect: exact((300 - 8) * 19 + 2 * 225) },
      { label: "Chain link 6 ft, 80 ft, no gate", facts: "6 ft tall chain link fence, 80 ft, no gates. Normal ground, no old fence to remove.", expect: exact(80 * 24) },
      { label: "Cedar, 60 ft line, one gate", facts: "6 ft cedar privacy fence. The whole line measures 60 ft including one walk gate. Normal ground, no old fence.", expect: exact((60 - 4) * 36 + 400) },
    ],
  },
  {
    id: "fence-upgrades",
    trade: "Fencing",
    company: { industry: "Fencing", ...TX },
    prompt:
      "Wood privacy fence, 6 ft, side-by-side pickets is $32 a foot. Board-on-board adds $8 a foot. Cap and trim adds $5 a foot. Steel posts instead of wood add $6 a foot. Stain and seal is $7 a foot. Rocky or steep ground adds $6 a foot. Walk gates $350, double drive gates $900. Old fence removal $3.50 a foot. $1,500 minimum. Footage is the full line, gates on top.",
    ownerRates: [32, 8, 5, 6, 7, 350, 900, 3.5],
    minimum: 1500,
    jobs: [
      { label: "180 ft board-on-board, cap and trim, stained, one gate", facts: "180 ft of 6 ft wood privacy fence, board-on-board, with cap and trim, stained and sealed, one walk gate. Wood posts. Normal ground. No old fence to remove.", expect: exact(180 * (32 + 8 + 5 + 7) + 350) },
      { label: "90 ft side-by-side, rocky, steel posts", facts: "90 ft of 6 ft wood privacy fence, side-by-side pickets, steel posts, no cap or trim, no stain, no gates. The ground is rocky. No old fence to remove.", expect: exact(90 * (32 + 6 + 6)) },
      { label: "240 ft side-by-side, three gates, tear-out", facts: "240 ft of 6 ft wood privacy fence, side-by-side pickets, wood posts, no cap or trim, no stain. One double drive gate and two walk gates. Remove and haul away 240 ft of old wood fence. Normal ground.", expect: exact(240 * 32 + 900 + 2 * 350 + 240 * 3.5) },
    ],
  },
  {
    id: "fence-percent",
    trade: "Fencing",
    company: { industry: "Fencing", ...TX },
    prompt:
      "I price wood privacy fence at $30 a foot for 6 ft. 8 ft is 35% more than the 6 ft price. Picket fence at 4 ft is $22 a foot. Gates are $325 each, any style. 10% off the whole job for paying cash. Minimum $900. Full line footage, gates extra.",
    ownerRates: [30, [35, 0.35, 1.35], 22, 325, [10, 0.1, 0.9]],
    minimum: 900,
    jobs: [
      { label: "100 ft, 8 ft privacy", facts: "100 ft of 8 ft tall wood privacy fence, no gates, not paying cash. Normal ground, no old fence to remove.", expect: exact(100 * 30 * 1.35) },
      { label: "120 ft picket, one gate, cash", facts: "120 ft of 4 ft picket fence with one gate. The customer is paying cash. Normal ground, no old fence to remove.", expect: exact((120 * 22 + 325) * 0.9) },
      { label: "200 ft, 6 ft privacy, two gates", facts: "200 ft of 6 ft tall wood privacy fence with two gates, not paying cash. Normal ground, no old fence to remove.", expect: exact(200 * 30 + 2 * 325) },
    ],
  },
  {
    id: "fence-pricebook",
    trade: "Fencing",
    company: {
      industry: "Fencing",
      ...TX,
      priceBook: [
        { name: "Cedar Privacy Fence 6 ft (per ft)", unitPrice: 35 },
        { name: "Vinyl Privacy Fence 6 ft (per ft)", unitPrice: 42 },
        { name: "Walk Gate", unitPrice: 425 },
        { name: "Old Fence Removal (per ft)", unitPrice: 4.5 },
      ],
    },
    prompt: "Make an estimate tool for my fence jobs using my price list.",
    jobs: [
      // the owner didn't say whether gate openings come out of the footage — either reading is right
      { label: "Cedar, 120 ft, one gate", facts: "120 ft of 6 ft cedar privacy fence with one walk gate. Normal ground, no old fence to remove, not around a pool.", expect: exact(120 * 35 + 425, 116 * 35 + 425) },
      { label: "Vinyl, 200 ft, two gates, tear-out", facts: "200 ft of 6 ft vinyl privacy fence with two walk gates. Remove 150 ft of old wood fence. Normal ground, not around a pool.", expect: exact(200 * 42 + 2 * 425 + 150 * 4.5, 192 * 42 + 2 * 425 + 150 * 4.5) },
    ],
  },

  // ── customer photo / description fill-in ──────────────────────────────────
  // The owner asks for it; each job is priced twice — by the form, and by Atlas reading the customer's own words.
  // Photos: drop a file in scripts/eval-estimator/photos/ and name it on the job ("photo") — none yet.
  {
    id: "fence-fill-in",
    trade: "Fencing",
    company: { industry: "Fencing", ...TX },
    prompt:
      "I build cedar privacy fences. 6 ft tall is $34 a foot installed, 8 ft tall is $46 a foot. Walk gates are $375 each and double drive gates are $950 each. Tearing out and hauling off an old fence is $4 a foot. My minimum job is $1,200. I charge for the full length of the fence line and gates are added on top. Let customers upload a photo or describe the job and have it fill in the form for them.",
    ownerRates: [34, 46, 375, 950, 4],
    minimum: 1200,
    wantsFillIn: true,
    jobs: [
      {
        label: "150 ft, 6 ft, one walk gate",
        facts: "150 ft of 6 ft tall cedar privacy fence with one walk gate. Flat normal ground, no old fence to remove, not around a pool.",
        said: "Need about 150 feet of 6 foot cedar privacy fence along the back of my yard with one walk gate. Yard is flat and there's nothing to tear out.",
        expect: exact(150 * 34 + 375),
      },
      {
        label: "180 ft, 8 ft, drive gate, tear-out",
        facts: "180 ft of 8 ft tall cedar privacy fence with one double drive gate and no walk gates. Tear out and haul away 180 ft of old wood fence. Normal ground, not around a pool.",
        said: "looking to replace my old wood fence, its 180 ft total. want the 8 ft tall cedar this time and a double gate for the driveway. old fence needs to come out and get hauled off",
        expect: exact(180 * 46 + 950 + 180 * 4),
      },
      {
        label: "Tiny: 20 ft, no gate",
        facts: "20 ft of 6 ft tall cedar privacy fence, no gates, normal ground, no old fence.",
        said: "just a short section between me and my neighbor, 20 feet, 6ft tall. no gate, no old fence there",
        expect: exact(1200),
      },
    ],
  },

  // ── other trades ───────────────────────────────────────────────────────────
  {
    id: "pressure-wash",
    trade: "Pressure washing",
    company: { industry: "Pressure washing", ...TX },
    prompt:
      "Pressure washing. Driveways and flatwork: $0.30 a sq ft up to 1,000 sq ft; jobs over 1,000 sq ft are $0.22 a sq ft for the whole job. House wash is $275 for a one-story and $400 for a two-story. Oil stain treatment is $45. $150 minimum.",
    ownerRates: [0.3, 0.22, 275, 400, 45],
    minimum: 150,
    jobs: [
      { label: "600 sq ft driveway", facts: "Clean a 600 sq ft driveway. No house wash, no oil stains.", expect: exact(600 * 0.3) },
      { label: "1,500 sq ft driveway + two-story house wash + stains", facts: "Clean a 1,500 sq ft driveway that has one oil-stained area needing the oil stain treatment, and wash a two-story house.", expect: exact(1500 * 0.22 + 400 + 45) },
      { label: "Tiny: 300 sq ft patio", facts: "Clean a 300 sq ft patio. No house wash, no oil stains.", expect: exact(150) },
      { label: "House wash only, one story", facts: "Wash a one-story house only. No driveway or other flatwork at all.", expect: exact(275) },
    ],
  },
  {
    id: "lawn-mowing",
    trade: "Lawn care",
    company: { industry: "Lawn care", ...TX },
    prompt:
      "Weekly mowing, priced per visit by lawn size: up to 5,000 sq ft is $45, 5,000 to 10,000 sq ft is $60, 10,000 to 20,000 sq ft is $85. Every-other-week service is $10 more per visit. Bagging the clippings adds $10 a visit. An overgrown first cut is 1.5 times the normal visit price.",
    ownerRates: [45, 60, 85, 10, [1.5, 50, 150]],
    jobs: [
      { label: "8,000 sq ft weekly", facts: "Lawn is 8,000 sq ft. Weekly mowing. No bagging. The lawn is not overgrown.", expect: exact(60) },
      { label: "4,000 sq ft every other week, bagged", facts: "Lawn is 4,000 sq ft. Mowing every other week, with the clippings bagged. Not overgrown.", expect: exact(45 + 10 + 10) },
      { label: "15,000 sq ft, overgrown first cut", facts: "Lawn is 15,000 sq ft. Weekly mowing, no bagging. The lawn is overgrown — this is the price for the first cut.", expect: exact(85 * 1.5) },
    ],
  },
  {
    id: "interior-paint",
    trade: "Painting",
    company: { industry: "Painting", ...TX },
    prompt:
      "Interior painting priced by floor square footage: walls only is $2.75 a sq ft. Adding ceilings is $1.25 a sq ft more. Adding trim and doors is $1.00 a sq ft more. A big color change (dark to light) adds 15% to the whole job. Minimum job $600.",
    ownerRates: [2.75, 1.25, 1, [15, 0.15, 1.15]],
    minimum: 600,
    jobs: [
      { label: "1,200 sq ft, walls + ceilings", facts: "Paint 1,200 sq ft of floor area: walls and ceilings, no trim or doors. Similar color, no big color change.", expect: exact(1200 * (2.75 + 1.25)) },
      { label: "800 sq ft walls, dark to light", facts: "Paint 800 sq ft of floor area: walls only. Going from a dark color to a light one.", expect: exact(800 * 2.75 * 1.15) },
      { label: "150 sq ft bathroom, everything", facts: "Paint a 150 sq ft room: walls, ceiling, and trim and doors. Similar color.", expect: exact(150 * (2.75 + 1.25 + 1)) },
      { label: "Tiny: 100 sq ft walls", facts: "Paint 100 sq ft of floor area: walls only, similar color.", expect: exact(600) },
    ],
  },
  {
    id: "house-cleaning",
    trade: "House cleaning",
    company: { industry: "House cleaning", ...TX },
    prompt:
      "House cleaning by square footage. A standard clean is $0.11 a sq ft, a deep clean is $0.22 a sq ft. Inside the oven is $35, inside the fridge is $35. Customers on an every-two-weeks schedule get 10% off. Minimum $140 per visit.",
    ownerRates: [0.11, 0.22, 35, [10, 0.1, 0.9]],
    minimum: 140,
    jobs: [
      { label: "2,000 sq ft standard, every two weeks", facts: "2,000 sq ft home, standard clean, on an every-two-weeks schedule. No oven, no fridge.", expect: exact(2000 * 0.11 * 0.9) },
      { label: "1,500 sq ft deep, oven + fridge", facts: "1,500 sq ft home, one-time deep clean, plus inside the oven and inside the fridge.", expect: exact(1500 * 0.22 + 35 + 35) },
      { label: "Tiny: 900 sq ft standard, one time", facts: "900 sq ft apartment, one-time standard clean, no extras.", expect: exact(140) },
    ],
  },
  {
    id: "gutter-cleaning",
    trade: "Gutters",
    company: { industry: "Gutter cleaning", ...TX },
    prompt: "Gutter cleaning: $1.25 a foot on one-story homes, $1.75 a foot on two-story homes. Flushing downspouts is $15 each. Minimum $150.",
    ownerRates: [1.25, 1.75, 15],
    minimum: 150,
    jobs: [
      { label: "160 ft one-story, six downspouts", facts: "One-story home with 160 ft of gutter. Flush 6 downspouts.", expect: exact(160 * 1.25 + 6 * 15) },
      { label: "220 ft two-story", facts: "Two-story home with 220 ft of gutter. No downspout flushing.", expect: exact(220 * 1.75) },
      { label: "Tiny: 80 ft one-story", facts: "One-story home with 80 ft of gutter. No downspout flushing.", expect: exact(150) },
    ],
  },
  {
    id: "tree-removal",
    trade: "Tree service",
    company: { industry: "Tree service", ...TX },
    prompt:
      "Tree removal by size: small (under 30 ft) $450, medium (30 to 60 ft) $1,100, large (over 60 ft) $2,400. The price includes hauling everything away. A tree close to a house or power lines is 25% more. Stump grinding is $4 per inch of diameter, with a $120 minimum per stump.",
    ownerRates: [450, 1100, 2400, [25, 0.25, 1.25], 4, 120],
    jobs: [
      { label: "One medium tree, open access", facts: "Remove one medium tree, about 45 ft tall, in the open — not near the house or power lines. No stump grinding.", expect: exact(1100) },
      { label: "One large tree by power lines + 20 in stump", facts: "Remove one large tree, about 70 ft tall, that is close to power lines. Grind its stump, which is 20 inches across.", expect: exact(2400 * 1.25 + 120) },
      { label: "Two small trees + two 40 in stumps", facts: "Remove two small trees, each about 20 ft tall, in the open, not near anything. Grind both stumps; each is 40 inches across.", expect: exact(2 * 450 + 2 * 40 * 4) },
    ],
  },
  {
    id: "junk-removal",
    trade: "Junk removal",
    company: { industry: "Junk removal", ...TX },
    prompt:
      "Junk removal by truck load: quarter truck $199, half truck $349, three-quarter truck $479, full truck $599. Mattresses are $40 extra each. Carrying from upstairs or a basement adds $25.",
    ownerRates: [199, 349, 479, 599, 40, 25],
    jobs: [
      { label: "Half truck, ground level", facts: "About half a truck of junk from a garage at ground level. No mattresses.", expect: exact(349) },
      { label: "Full truck, two mattresses, basement", facts: "A full truck load including 2 mattresses, carried up from a basement.", expect: exact(599 + 2 * 40 + 25) },
      { label: "Quarter truck, one mattress", facts: "A quarter truck load from the driveway, including 1 mattress. Nothing upstairs or in a basement.", expect: exact(199 + 40) },
    ],
  },
  {
    id: "roof-replace",
    trade: "Roofing",
    company: { industry: "Roofing", ...TX },
    prompt:
      "Roof replacement with architectural shingles: $525 per square, tear-off of one layer included. I add 10% to the roof area for waste. A second layer of tear-off is $90 a square. Steep roofs (8/12 pitch and up) are 15% more on the shingle price. Replacing bad decking is $95 a sheet.",
    ownerRates: [525, [10, 0.1, 1.1], 90, [15, 0.15, 1.15], 95],
    jobs: [
      { label: "2,000 sq ft, walkable, one layer", facts: "Replace a roof of 2,000 sq ft of roof area. One existing layer of shingles. Walkable pitch (5/12). No decking needs replacing.", expect: exact(22 * 525) },
      // roofers commonly bill whole squares (the roofing playbook rounds up); the owner didn't say, so both readings are right
      { label: "2,600 sq ft, steep", facts: "Replace a roof of 2,600 sq ft of roof area. One existing layer. Steep pitch (9/12). No decking needs replacing.", expect: exact(28.6 * 525 * 1.15, 29 * 525 * 1.15) },
      { label: "1,500 sq ft, three sheets of decking", facts: "Replace a roof of 1,500 sq ft of roof area. One existing layer. Walkable pitch. 3 sheets of decking need replacing.", expect: exact(16.5 * 525 + 3 * 95, 17 * 525 + 3 * 95) },
      // the owner didn't say whether the second layer is charged on the waste-added squares — either reading is right
      { label: "2,000 sq ft, two layers", facts: "Replace a roof of 2,000 sq ft of roof area. Two existing layers of shingles to tear off. Walkable pitch. No decking needs replacing.", expect: exact(22 * 525 + 20 * 90, 22 * 525 + 22 * 90) },
    ],
  },
  {
    id: "concrete-flatwork",
    trade: "Concrete",
    company: { industry: "Concrete", ...TX },
    prompt: "Concrete flatwork: a broom-finish 4 inch slab is $9.50 a sq ft, stamped is $16 a sq ft. Tearing out and hauling off old concrete is $3.50 a sq ft. Minimum job $2,500.",
    ownerRates: [9.5, 16, 3.5],
    minimum: 2500,
    jobs: [
      { label: "600 sq ft broom driveway with tear-out", facts: "Pour a 600 sq ft broom-finish driveway, 4 inches thick. Tear out and haul off the old 600 sq ft driveway first.", expect: exact(600 * 9.5 + 600 * 3.5) },
      { label: "400 sq ft stamped patio", facts: "Pour a new 400 sq ft stamped concrete patio. Nothing to tear out.", expect: exact(400 * 16) },
      { label: "Tiny: 120 sq ft pad", facts: "Pour a 120 sq ft broom-finish pad for a shed. Nothing to tear out.", expect: exact(2500) },
    ],
  },
  // ── no rates given: the tool prices from the market ────────────────────────
  // Ranges are the span of the published cost guides (see the market-ranges doc); the owner skips every question.
  {
    id: "cold-fence",
    trade: "Fencing",
    company: { industry: "Fencing", ...TX },
    prompt: "I need an estimate tool for my fence jobs.",
    cold: true,
    jobs: [
      { label: "150 ft of 6 ft wood privacy, no gate", facts: "150 ft of 6 ft tall wood (cedar) privacy fence, side-by-side pickets, no gates, no upgrades, no stain. Normal flat ground, 2 corners, no old fence to remove, not around a pool, no HOA, property line known.", expect: { kind: "range", low: 3000, high: 8100 } },
      { label: "200 ft of 4 ft chain link, no gate", facts: "200 ft of 4 ft tall chain link fence, no gates. Normal flat ground, 2 corners, no old fence to remove, not around a pool, no HOA, property line known.", expect: { kind: "range", low: 1600, high: 7400 } },
    ],
  },
  {
    id: "cold-fence-answered",
    trade: "Fencing",
    company: { industry: "Fencing", ...TX },
    prompt: "I need a fence quote tool for my website.",
    ownerKnows: "A 6 ft cedar privacy fence is $38 a foot installed. My three-man crew builds about 150 ft a day. My minimum job is $1,200. I haven't worked out prices for anything else yet.",
    ownerRates: [38],
    jobs: [{ label: "150 ft of 6 ft cedar, no gate", facts: "150 ft of 6 ft tall cedar privacy fence, side-by-side pickets, no gates, no upgrades, no stain. Normal flat ground, no old fence to remove, not around a pool.", expect: { kind: "exact", totals: [150 * 38], tolerance: 0.06 }, expectIfNotAsked: { kind: "range", low: 3000, high: 8100 } }],
  },
  {
    id: "cold-lawn",
    trade: "Lawn care",
    company: { industry: "Lawn care", ...TX },
    prompt: "Build me a tool for quoting mowing.",
    cold: true,
    jobs: [{ label: "Quarter-acre lot, weekly", facts: "Weekly mowing, edging and blowing on a quarter-acre lot — about 8,000 sq ft of grass. Not overgrown, no bagging, no extras. Price per visit.", expect: { kind: "range", low: 41, high: 75 } }],
  },
  {
    id: "cold-pressure-wash",
    trade: "Pressure washing",
    company: { industry: "Pressure washing", ...TX },
    prompt: "I want an estimate tool for pressure washing.",
    cold: true,
    jobs: [{ label: "600 sq ft driveway", facts: "Clean a two-car concrete driveway, about 600 sq ft. Cleaning only: no sealing, no house wash, no stains, nothing else.", expect: { kind: "range", low: 100, high: 330 } }],
  },
  {
    id: "cold-house-cleaning",
    trade: "House cleaning",
    company: { industry: "House cleaning", ...TX },
    prompt: "Make a quote tool for my cleaning business.",
    cold: true,
    jobs: [{ label: "2,000 sq ft standard clean", facts: "A standard clean of a 2,000 sq ft home with 3 bedrooms and 2 bathrooms, on an every-two-weeks schedule. No extras, no pets. Price per visit.", expect: { kind: "range", low: 190, high: 400 } }],
  },
  {
    id: "cold-concrete",
    trade: "Concrete",
    company: { industry: "Concrete", ...TX },
    prompt: "I need an estimate tool for concrete driveways and patios.",
    cold: true,
    jobs: [{ label: "600 sq ft broom-finish driveway", facts: "Pour a new 600 sq ft broom-finish concrete driveway, 4 inches thick. Nothing to tear out, flat site, easy truck access.", expect: { kind: "range", low: 3000, high: 7200 } }],
  },
  {
    id: "hvac-flat-menu",
    trade: "HVAC",
    company: { industry: "HVAC", ...TX },
    prompt: "Flat prices: AC tune-up $129, furnace tune-up $119, both together $219. A diagnostic visit is $99. After-hours calls add $75.",
    ownerRates: [129, 119, 219, 99, 75],
    jobs: [
      { label: "AC tune-up", facts: "An AC tune-up only, during normal hours.", expect: exact(129) },
      { label: "Both tune-ups", facts: "An AC tune-up and a furnace tune-up together, during normal hours.", expect: exact(219) },
      { label: "Diagnostic, after hours", facts: "A diagnostic visit, after hours.", expect: exact(99 + 75) },
    ],
  },
];
