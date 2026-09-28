/**
 * The estimator's playbook — what a seasoned estimator in each trade asks
 * before naming a price, and how they package the answer. The builder
 * (lib/estimator-build.ts) hands the matching entry to the model so a
 * "fence tool" comes out the way a fence company would build it, not as
 * three questions and two lines. Pure data; nothing here is a price.
 */

export type TradePlaybook = {
  key: string;
  name: string;
  /** Lower-case words that mark a description as this trade. */
  keywords: string[];
  /** What actually moves the price, most important first. */
  drivers: string[];
  /** The questions a good tool asks (label — how to ask it). */
  questions: string[];
  /** How the quote usually breaks down (groups → lines). */
  lines: string[];
  /** Good / better / best when the trade sells that way. */
  packages?: string[];
  /**
   * The main size is something the customer can DRAW on the satellite map —
   * a fence line (length, ft) or a lawn / roof / driveway (area, sq ft). The
   * builder turns the trade's primary size question into a map question
   * (lib/estimator-build.ts) even when the model reached for a slider.
   */
  mapMeasure?: "length" | "area";
  /** Things that trip up a naive tool. */
  gotchas: string[];
};

export const PLAYBOOK: TradePlaybook[] = [
  {
    key: "pressure_washing",
    mapMeasure: "area",
    name: "Pressure / soft washing",
    keywords: ["pressure wash", "power wash", "soft wash", "driveway clean", "house wash", "roof wash"],
    drivers: ["surface area (driveway / house / roof / deck)", "surface type", "stories", "stains and add-ons (sealant, gutters, fence)"],
    questions: [
      "Driveway or area size — slider in sq ft with presets (one-car 300, two-car 550, three-car 850) or a map area",
      "Surfaces — multi: driveway, walkway, patio, house siding, roof, deck, fence",
      "Stories — cards 1 / 2 / 3 (surcharge for ladder work)",
      "Heavy stains? — toggle (oil, rust, mildew)",
      "Sealant — toggle or a package tier",
    ],
    lines: ["Cleaning: per-sq-ft by surface (tiers by size)", "Surcharges: stories, heavy stains", "Add-ons: sealant per sq ft, gutters per ft, fence per ft"],
    packages: ["Basic (driveway only)", "Plus (driveway + walkways + porch)", "Premium (Plus + sealant)"],
    gotchas: ["Rates fall as area rises — use tier()", "Set a trip minimum", "A house wash is priced by home sq ft and stories, not driveway size"],
  },
  {
    key: "lawn_care",
    mapMeasure: "area",
    name: "Lawn care & landscaping",
    keywords: ["lawn", "mow", "landscap", "sod", "mulch", "yard", "fertiliz", "aerat", "hedge", "leaf"],
    drivers: ["lawn area (map)", "frequency (weekly / biweekly / one-time)", "service tier (mow only vs mow+edge+blow vs full)", "obstacles / slope / gates"],
    questions: [
      "Lawn area — map area (sq ft), presets for typical lots (¼ acre 10,890, ½ acre 21,780)",
      "How often — cards weekly / every other week / one-time (one-time costs more per visit)",
      "Service level — packages: Mow & go / Full service (mow, edge, trim, blow) / Premium (+ beds, hedges)",
      "Extras — multi: mulch (beds sq ft), leaf cleanup, aeration, fertilizing",
      "Fenced back yard with a narrow gate? — toggle (small mower surcharge)",
    ],
    lines: ["Mowing: tiered per sq ft or per acre band", "Frequency adjustment", "Extras: mulch per cubic yard (beds sq ft ÷ 100 × depth), aeration per 1,000 sq ft"],
    packages: ["Mow & go", "Full service", "Premium care"],
    gotchas: ["Per-visit price, say so on the line — and link the recurring price-book service (weekly / biweekly mowing) so the quote sets up the subscription; without one, never multiply visits into a lump sum", "One-time cuts on an overgrown lawn — ask 'over 6 inches tall?' toggle", "Minimum per visit"],
  },
  {
    key: "fencing",
    mapMeasure: "length",
    name: "Fence installation",
    keywords: ["fence", "fencing", "gate", "privacy fence", "chain link", "vinyl fence", "picket"],
    drivers: ["linear feet (map length)", "material and style", "height", "gates (count and width)", "removal of an old fence", "terrain / rock / slope"],
    questions: [
      "Fence line — map length (ft)",
      "Material — cards with blurb: cedar privacy, vinyl privacy, chain link, wrought iron / aluminum, picket",
      "Height — cards 4 ft / 6 ft / 8 ft",
      "Gates — stepper: walk gates; stepper: double drive gates",
      "Tear out an old fence? — toggle → stepper feet to remove",
      "Ground — cards: normal / rocky / steep (surcharge per ft)",
    ],
    lines: ["Fence: per-ft by material × height factor (group Materials & labor)", "Gates: each by type", "Removal & haul-away: per ft", "Surcharges: terrain per ft", "Permit / survey as optional"],
    packages: ["Standard", "Premium (post caps, kickboard, stained)", "Deluxe (steel posts, lattice top)"],
    gotchas: ["Height changes material cost — multiply, don't add", "Minimums are real (short runs still need a crew day)", "Corners and end posts — a per-ft rate already absorbs them; don't ask"],
  },
  {
    key: "roofing",
    mapMeasure: "area",
    name: "Roofing",
    keywords: ["roof", "shingle", "metal roof", "re-roof", "tear-off", "roofing"],
    drivers: ["roof area (map area or home footprint × pitch factor)", "material", "pitch / stories (labor)", "tear-off layers", "penetrations (skylights, chimneys, vents)", "decking repair"],
    questions: [
      "Roof area — map area, or home footprint sq ft with a pitch select (flat / normal / steep → factor 1.0 / 1.15 / 1.4)",
      "Material — packages: 3-tab / architectural / designer or metal (each with includes)",
      "Layers to tear off — stepper 0–3",
      "Stories — cards 1 / 2 / 3",
      "Skylights and chimneys — steppers",
      "Decking condition — cards: good / some repair / unknown (allowance)",
    ],
    lines: ["Roofing system: per sq ft (or per 'square' = 100 sq ft) by material", "Tear-off: per sq ft × layers", "Labor surcharges: steep pitch, stories", "Flashing & penetrations: each", "Decking allowance: optional per sheet", "Dump fees, permit"],
    packages: ["Good (3-tab, 25-yr)", "Better (architectural, 30-yr, synthetic underlayment)", "Best (designer or standing-seam metal, lifetime)"],
    gotchas: ["Roofers quote per square (100 sq ft) — round up to whole squares with ceil(sqft / 100)", "Waste factor 10–15% on materials", "Show the range on the website, exact in the app"],
  },
  {
    key: "painting",
    name: "Painting",
    keywords: ["paint", "painting", "painter", "interior paint", "exterior paint", "cabinet"],
    drivers: ["wall area (rooms × size, or sq ft)", "ceilings / trim / doors / windows", "coats and paint grade", "prep (patching, wallpaper removal)", "height (vaulted, two-story exterior)"],
    questions: [
      "Interior or exterior — cards",
      "Rooms — stepper per size (small / medium / large) or total wall sq ft slider with presets (bedroom 350, living room 600)",
      "Include ceilings? trim? — toggles; doors and windows — steppers",
      "Paint grade — packages: standard / premium / designer (includes: coats, brand tier, warranty)",
      "Prep needed — cards: light / moderate (patching) / heavy (wallpaper, peeling)",
      "Exterior: home sq ft slider, stories cards, siding type cards",
    ],
    lines: ["Walls: per sq ft by grade", "Ceilings: per sq ft", "Trim & doors & windows: each", "Prep: per room or per sq ft by level", "Materials: per gallon (sq ft ÷ 350 per coat)"],
    packages: ["Refresh (one coat, standard paint)", "Full (two coats, premium)", "Designer (two coats, top-tier, color consult)"],
    gotchas: ["Two coats is not 2× — usually +30–40%", "Cabinets are their own tool (per door/drawer)", "Empty vs furnished rooms — a toggle for moving furniture"],
  },
  {
    key: "house_cleaning",
    name: "House cleaning",
    keywords: ["house clean", "maid", "housekeep", "deep clean", "move-out clean", "residential clean", "cleaning service"],
    drivers: ["bedrooms + bathrooms (or sq ft)", "cleaning type (standard / deep / move-out)", "frequency", "pets, extras (oven, fridge, windows, laundry)"],
    questions: [
      "Bedrooms — stepper 1–7; Bathrooms — stepper 1–5",
      "Home size — presets (under 1,000 / 1,000–2,000 / 2,000–3,000 / 3,000+)",
      "Type — packages: Standard / Deep / Move-in-move-out (includes lists)",
      "How often — cards: one-time / weekly / every other week / monthly (recurring discount)",
      "Extras — multi: inside oven, inside fridge, interior windows, laundry, baseboards",
      "Pets? — toggle",
    ],
    lines: ["Base clean: by bedrooms & bathrooms", "Type multiplier (deep 1.5×, move-out 1.8×)", "Frequency discount", "Extras: each", "Pet surcharge"],
    packages: ["Standard clean", "Deep clean", "Move-in / move-out"],
    gotchas: ["Price per visit; say the first deep clean is priced separately from recurring", "Recurring cleans link the recurring price-book service so the quote sets up the plan", "Minimum visit", "Bedrooms and bathrooms as tap cards ADD fine ('3' + '2' = 5) — but price them separately, they cost different amounts"],
  },
  {
    key: "windows",
    name: "Window cleaning",
    keywords: ["window clean", "window washing", "screens", "skylight clean"],
    drivers: ["window count by type", "inside and out vs outside only", "stories", "screens and tracks"],
    questions: ["Windows — steppers: standard, large / picture, French panes", "Inside & out or outside only — cards", "Stories — cards", "Screens and tracks — toggles", "Hard-water stains — toggle"],
    lines: ["Panes: each by type", "Inside surcharge", "Story surcharge", "Screens & tracks: each", "Stain treatment: each"],
    gotchas: ["Count panes, not openings, for French windows", "Minimum per visit"],
  },
  {
    key: "hvac",
    name: "HVAC",
    keywords: ["hvac", "furnace", "air condition", "ac ", "a/c", "heat pump", "mini split", "ductless", "duct"],
    drivers: ["system type and tonnage (home sq ft)", "efficiency tier (SEER)", "replace vs new install (ductwork, electrical)", "brand tier", "add-ons (thermostat, air purifier, zoning)"],
    questions: [
      "Home sq ft — slider with presets → tonnage variable (sq ft ÷ 600, ceil)",
      "System — cards: AC only / furnace only / full system / heat pump / mini-split (zones stepper)",
      "Efficiency — packages: Standard 14 SEER / High 16–17 / Premium 18+ variable speed (includes)",
      "Replacing an existing system? — toggle; existing ductwork OK? — cards good / needs sealing / none",
      "Add-ons — multi: smart thermostat, air purifier, surge protector, zoning",
      "Home age / electrical upgrade needed — toggle",
    ],
    lines: ["Equipment: per ton by tier", "Installation labor: by system type", "Ductwork: per run or flat", "Add-ons: each", "Permit & disposal", "Extended warranty as optional"],
    packages: ["Standard", "High efficiency", "Premium variable-speed"],
    gotchas: ["Tonnage drives everything — compute it, don't ask a homeowner", "Financing note in the client message", "Show a range on the website (a load calc confirms)", "This tool is for REPLACEMENTS and installs; repairs are diagnosed on site — a repair branch is a trip / diagnostic fee line and 'we'll quote the fix on site' in the client message, never a made-up repair price"],
  },
  {
    key: "plumbing",
    name: "Plumbing",
    keywords: ["plumb", "water heater", "drain", "sewer", "faucet", "toilet", "repipe", "leak"],
    drivers: ["the job type (flat-rate menu)", "fixture count", "access / age of home", "parts tier"],
    questions: [
      "What do you need? — cards: water heater, drain clog, faucet / fixture, toilet, leak repair, garbage disposal, repipe",
      "Water heater — showWhen: tank size cards 40 / 50 / 75 gal, fuel cards gas / electric, tankless upgrade package",
      "Fixtures — steppers by kind (showWhen)",
      "Repipe — bathrooms stepper + stories",
      "Emergency / after hours — toggle",
    ],
    lines: ["Flat-rate line per job type", "Parts / fixture tier", "Per-fixture lines", "After-hours surcharge", "Permit where needed"],
    packages: ["Standard part", "Premium part (longer warranty)"],
    gotchas: ["Use showWhen heavily — one tool, many branches", "Diagnostic / trip fee as a line, and the client message says it's credited on approval", "Flat-rate menus run long: keep the tool to the 6–10 jobs they price online; the rest is 'something else' → a request, no price"],
  },
  {
    key: "electrical",
    name: "Electrical",
    keywords: ["electric", "electrician", "panel", "outlet", "ev charger", "lighting", "ceiling fan", "generator"],
    drivers: ["job type (menu)", "counts (outlets, fixtures, fans)", "panel amperage and distance", "drywall / finished walls (fishing wire)"],
    questions: ["Job — cards: panel upgrade, EV charger, outlets & switches, lighting / fans, generator, whole-home rewire", "Counts — steppers (showWhen)", "Panel — cards 100 / 200 / 400 A; distance to meter slider", "Finished walls? — toggle (surcharge per point)"],
    lines: ["Per-point lines", "Panel / charger flat lines by size", "Wire run per ft", "Permit & inspection", "Surcharges"],
    gotchas: ["Every 'per point' line needs a description saying what a point is", "Permit is nearly always a line", "Panel and rewire work gets a range online; a walk-through confirms"],
  },
  {
    key: "handyman",
    name: "Handyman / hourly work",
    keywords: ["handyman", "hourly", "labor rate", "repairs", "odd jobs", "install", "assembly", "drywall"],
    drivers: ["hours (or per-task menu)", "number of techs", "materials allowance", "trip fee"],
    questions: ["Tasks — multi with a line each, or Estimated hours — stepper 1–16 (help: we confirm on site)", "Materials — cards: I'll supply / add an allowance slider", "Same-day or weekend — toggle"],
    lines: ["Labor: hours × rate (fractional hours fold into one unit)", "Task lines", "Materials allowance", "Trip fee", "Surcharge"],
    gotchas: ["Two-hour minimum is typical — minimumTotal", "The labor line's description names the work ('Mounting the TV and patching the old holes'); the quote shows hours × rate on its own", "Put hours on the labor line so the job books for the right length"],
  },
  {
    key: "junk_moving",
    name: "Junk removal / moving",
    keywords: ["junk", "haul", "removal", "dumpster", "moving", "movers", "move out", "furniture removal"],
    drivers: ["volume (truck fraction / cubic yards) or item list", "labor (stairs, distance to truck)", "heavy items (pianos, safes, hot tubs)", "moving: home size, distance, packing"],
    questions: [
      "Junk: How much — cards ¼ / ½ / ¾ / full truck with blurbs (what fits), or items — multi with heavy-item steppers",
      "Stairs or long carry — cards none / one flight / more",
      "Moving: Home — cards studio … 4+ bed; Distance — slider miles; Packing — packages: none / partial / full",
    ],
    lines: ["Volume line by fraction", "Heavy items each", "Labor surcharges", "Moving: crew hours by home size, mileage, packing package"],
    packages: ["Load only", "Load + packing", "Full service"],
    gotchas: ["Disposal fees for mattresses, tires, TVs — per item lines", "Minimum load"],
  },
  {
    key: "concrete",
    mapMeasure: "area",
    name: "Concrete / paving / driveways",
    keywords: ["concrete", "driveway", "paver", "asphalt", "sealcoat", "patio", "slab", "sidewalk", "stamped"],
    drivers: ["area (map)", "thickness / finish", "removal of existing", "reinforcement, grading", "access"],
    questions: ["Area — map area (sq ft)", "Finish — packages: broom / exposed aggregate / stamped or pavers (includes)", "Thickness — cards 4 in / 6 in (driveways)", "Remove existing? — toggle → cards concrete / asphalt", "Rebar or fiber — toggle", "Access — cards easy / tight (pump truck)"],
    lines: ["Pour & finish: per sq ft by finish", "Removal: per sq ft", "Reinforcement: per sq ft", "Grading / base: per sq ft", "Pump truck flat"],
    packages: ["Broom finish", "Exposed aggregate", "Stamped / decorative"],
    gotchas: ["Cubic yards = sqft × thickness_in / 12 / 27 — show it in a description", "Minimum pour (short-load fees)"],
  },
  {
    key: "pest",
    name: "Pest control",
    keywords: ["pest", "exterminat", "termite", "rodent", "mosquito", "bed bug", "ant", "wasp"],
    drivers: ["pest type", "home sq ft", "one-time vs plan", "severity"],
    questions: ["Pest — cards: general, ants, rodents, termites, mosquitoes, bed bugs, wasps", "Home size — presets", "Plan — packages: one-time / quarterly / monthly (includes)", "Severity — cards light / moderate / heavy"],
    lines: ["Initial treatment by pest and size", "Plan per visit", "Severity surcharge", "Exclusion work (rodents) per opening as optional"],
    packages: ["One-time", "Quarterly plan", "Monthly plan"],
    gotchas: ["Termites and bed bugs need an inspection — show a range and say so", "Recurring price is per visit — the quarterly / monthly plan links the recurring price-book service"],
  },
  {
    key: "gutters",
    mapMeasure: "length",
    name: "Gutters",
    keywords: ["gutter", "downspout", "gutter guard", "leaf guard"],
    drivers: ["linear feet (map length)", "stories", "material (aluminum / copper)", "guards", "downspouts"],
    questions: ["Gutter run — map length (ft)", "Stories — cards", "Material — cards aluminum 5 in / 6 in / copper", "Downspouts — stepper", "Guards — packages: none / mesh / micro-mesh", "Cleaning only? — toggle branch"],
    lines: ["Gutters per ft by material", "Downspouts each", "Guards per ft", "Story surcharge", "Removal per ft"],
    packages: ["Gutters only", "Gutters + mesh guards", "Gutters + micro-mesh guards"],
    gotchas: ["Cleaning is priced by stories + feet — separate branch via showWhen"],
  },
  {
    key: "tree",
    name: "Tree service",
    keywords: ["tree", "stump", "arborist", "trim", "limb", "removal"],
    drivers: ["tree height / diameter", "distance from structures & lines", "removal vs trimming", "stump grinding", "haul-away"],
    questions: ["Trees — stepper per size class (small under 30 ft / medium 30–60 / large 60+)", "Job — cards: remove / trim / both", "Near a house or power line? — toggle (surcharge)", "Grind the stumps? — toggle → stepper stumps", "Haul away debris? — toggle"],
    lines: ["Per tree by size and job", "Hazard surcharge per tree", "Stumps each by size", "Debris haul flat"],
    gotchas: ["Always range on the website — crane work needs a visit", "Minimum job"],
  },
  {
    key: "pool",
    name: "Pool service",
    keywords: ["pool", "spa", "hot tub", "pool clean", "pool opening"],
    drivers: ["pool size (gallons or sq ft)", "service level", "frequency", "equipment / chemicals", "opening / closing"],
    questions: ["Pool size — presets small / medium / large", "Service — packages: chemicals only / standard weekly / full service", "One-time — cards: opening, closing, green-to-clean", "Screen enclosure or spa attached — toggles"],
    lines: ["Weekly service per visit by size and tier", "One-time services flat", "Chemical surcharge", "Spa add-on"],
    packages: ["Chemical check", "Standard weekly", "Full service"],
    gotchas: ["Per-visit vs per-month — say which; weekly service links the recurring price-book service (billed monthly) so the quote sets up the subscription"],
  },
  {
    key: "flooring",
    name: "Flooring",
    keywords: ["floor", "flooring", "hardwood", "laminate", "vinyl plank", "lvp", "tile", "carpet", "refinish"],
    drivers: ["area (rooms or sq ft)", "material tier", "removal of old floor", "subfloor prep", "stairs, transitions, baseboards"],
    questions: ["Area — slider sq ft with presets (bedroom 150, living 300, whole 1,500 sq ft home)", "Material — packages: LVP / engineered hardwood / solid hardwood or tile (includes)", "Remove existing — cards: none / carpet / hardwood / tile", "Stairs — stepper steps", "Furniture to move — toggle"],
    lines: ["Material per sq ft (+10% waste)", "Install labor per sq ft", "Removal per sq ft by type", "Stairs per step", "Transitions & baseboards", "Furniture moving"],
    packages: ["Value", "Popular", "Premium"],
    gotchas: ["Waste factor in the description", "Tile is 2–3× LVP labor"],
  },
  {
    key: "garage_door",
    name: "Garage doors",
    keywords: ["garage door", "opener", "garage spring"],
    drivers: ["door size (single / double)", "style & insulation tier", "opener", "removal"],
    questions: ["Doors — stepper single; stepper double", "Style — packages: standard steel / insulated / carriage-house (includes)", "Opener — cards none / chain / belt / smart", "Remove old door — toggle"],
    lines: ["Door each by size and tier", "Opener each", "Removal each", "Labor flat"],
    packages: ["Standard", "Insulated", "Carriage house"],
    gotchas: ["Spring repair is a separate flat-rate branch", "Repairs the tool can't see ('it makes a noise') get a trip fee and a request, not a price"],
  },
  {
    key: "carpet_cleaning",
    name: "Carpet & upholstery cleaning",
    keywords: ["carpet clean", "upholstery", "rug clean", "steam clean", "tile and grout"],
    drivers: ["rooms or sq ft", "soil level / pet stains", "upholstery pieces", "stairs", "protectant"],
    questions: ["Rooms — counts: bedroom, living room, hallway, stairs (per flight)", "Condition — cards light / moderate / heavy", "Pet treatment — toggle", "Upholstery — counts: sofa, loveseat, chair, ottoman", "Protectant — toggle"],
    lines: ["Per room by size class", "Stairs per flight", "Soil / pet surcharge", "Upholstery each", "Protectant per room"],
    packages: ["Basic clean", "Deep clean + pet", "Deep clean + protectant"],
    gotchas: ["Minimum per visit", "Big open-plan rooms count as two — say so in help"],
  },
  {
    key: "appliance",
    name: "Appliance repair",
    keywords: ["appliance", "washer", "dryer", "dishwasher", "refrigerator repair", "oven repair"],
    drivers: ["appliance type", "symptom (menu)", "parts tier", "brand (premium brands)"],
    questions: ["Appliance — cards", "What's wrong — select per appliance (showWhen)", "Brand — cards standard / premium (LG, Samsung, Sub-Zero)", "Same-day — toggle"],
    lines: ["Diagnostic fee (credited on repair)", "Flat-rate repair by symptom", "Parts allowance", "Premium brand surcharge", "Same-day"],
    gotchas: ["Always show a range online — parts are unknown until diagnosed", "The diagnostic fee is the one firm number: a line, credited on repair (say so in the client message)"],
  },
  {
    key: "irrigation",
    mapMeasure: "area",
    name: "Irrigation / sprinklers",
    keywords: ["irrigation", "sprinkler", "drip", "zone"],
    drivers: ["zones (or lawn area)", "heads per zone", "controller", "backflow / permit", "repair vs install"],
    questions: ["Install: lawn area — map area → zones variable (ceil(sqft / 2500))", "Controller — cards basic / smart", "Drip for beds — toggle → beds sq ft slider", "Repair: symptom — cards; heads to replace — stepper; zones affected — stepper", "Spring start-up / winterization — cards"],
    lines: ["Per zone install", "Controller", "Drip per sq ft", "Backflow + permit", "Repair per head / per zone", "Seasonal service flat"],
    gotchas: ["Zones drive install price — compute from area", "Winterization is per zone count"],
  },
  {
    key: "snow",
    name: "Snow removal",
    keywords: ["snow", "plow", "salt", "de-ice", "shovel"],
    drivers: ["driveway size / length", "walkways", "per-push vs seasonal", "salting", "trigger depth"],
    questions: ["Driveway — cards: 1-car / 2-car / 3-car / long (per push)", "Walkways & steps — toggle", "Salting — toggle", "Plan — packages: per push / monthly / seasonal"],
    lines: ["Per push by size", "Walkways", "Salt per visit", "Seasonal or monthly flat"],
    packages: ["Per push", "Monthly", "Seasonal"],
    gotchas: ["Say the trigger depth (2 in) in the intro", "Seasonal is a flat line, not per push"],
  },
  {
    key: "chimney",
    name: "Chimney & fireplace",
    keywords: ["chimney", "fireplace", "flue", "sweep", "chimney cap"],
    drivers: ["flues", "stories", "inspection level", "repairs (cap, damper, crown)", "creosote level"],
    questions: ["Flues — stepper", "Stories — cards", "Service — packages: sweep / sweep + level 2 inspection / sweep + inspection + cap", "Creosote — cards light / moderate / heavy", "Repairs — multi: cap, damper, crown seal, tuckpointing allowance"],
    lines: ["Sweep per flue", "Inspection", "Story surcharge", "Repairs each"],
    packages: ["Sweep", "Sweep + inspection", "Full service"],
    gotchas: ["Level 2 inspection is required on sale — mention in help"],
  },
  {
    key: "locksmith",
    name: "Locksmith",
    keywords: ["locksmith", "rekey", "lockout", "deadbolt", "smart lock"],
    drivers: ["service type", "lock count", "after hours", "hardware tier"],
    questions: ["Service — cards: lockout, rekey, new deadbolt, smart lock, mailbox", "Locks — stepper (showWhen)", "Hardware — cards standard / grade 1 / smart", "After hours — toggle"],
    lines: ["Trip fee", "Per lock by service", "Hardware each", "After-hours"],
    gotchas: ["Lockouts are flat + trip; rekey is per cylinder"],
  },
  {
    key: "remodel",
    name: "Remodeling (kitchen / bath)",
    keywords: ["remodel", "renovation", "kitchen", "bathroom", "bath", "countertop", "cabinet", "tile shower"],
    drivers: ["room size", "scope (cosmetic / mid / full gut)", "finish tier", "layout changes (plumbing / electrical moves)"],
    questions: ["Room — cards kitchen / bathroom / other", "Size — presets (small / medium / large sq ft)", "Scope — packages: refresh / mid-range / full (includes)", "Moving plumbing or walls? — toggles", "Finish level — cards builder / mid / high-end"],
    lines: ["Base by room size × scope", "Finish multiplier", "Layout changes flat", "Design & permits", "Contingency as optional"],
    packages: ["Refresh", "Mid-range", "Full remodel"],
    gotchas: ["Always a range on the website", "Say what's excluded in the client message"],
  },
  {
    key: "pc_repair",
    name: "PC building & repair",
    keywords: ["pc", "computer", "laptop", "desktop", "virus", "malware", "screen replacement", "data recovery", "custom build", "gaming pc"],
    drivers: ["the job (flat-rate menu: diagnostic, virus removal, screen, upgrade, custom build)", "parts tier", "on-site vs drop-off", "rush"],
    questions: ["What do you need? — cards: tune-up / virus removal, screen or keyboard, upgrade (RAM, SSD), data recovery, custom build, on-site help", "Custom build — showWhen: budget tier cards (entry / mid / high-end), use cards gaming / work / creator", "Upgrade — showWhen: parts multi (RAM, SSD, graphics card, power supply)", "On-site or drop-off — cards", "Need it back fast? — toggle (rush)"],
    lines: ["Flat-rate line per job type", "Parts by tier (placeholder rates, the owner sets them)", "Build labor flat", "On-site trip fee", "Rush surcharge"],
    gotchas: ["Parts prices move weekly — parts lines are placeholders the owner confirms", "Diagnostic fee credited on the repair — say so in the client message", "Custom builds: show a range online"],
  },
  {
    key: "auto_detailing",
    name: "Auto detailing",
    keywords: ["detail", "detailing", "car wash", "ceramic", "paint correction", "interior clean", "mobile detail"],
    drivers: ["vehicle size", "interior / exterior / both", "condition (pet hair, stains)", "add-ons (ceramic, paint correction, headlights)"],
    questions: ["Vehicle — cards: sedan / SUV or truck / van or 3-row / oversized", "Service — packages: exterior / interior / full detail (includes), only if the owner sells tiers", "Condition — cards: normal / heavy (pet hair, stains, sand)", "Add-ons — multi: ceramic coating, paint correction, headlight restore, engine bay, odor treatment", "Where — cards: my location / your shop (mobile trip fee)"],
    lines: ["Base detail by vehicle size and service", "Condition surcharge", "Add-ons each", "Mobile trip fee"],
    packages: ["Exterior", "Interior", "Full detail"],
    gotchas: ["Vehicle size drives everything — never ask for square footage", "Ceramic coating is priced by vehicle size, not a flat number", "Recurring maintenance washes link a recurring price-book service"],
  },
  {
    key: "mobile_mechanic",
    name: "Mobile mechanic / auto repair",
    keywords: ["mechanic", "brake", "oil change", "alternator", "battery", "tune up", "auto repair", "car repair"],
    drivers: ["the job (menu)", "vehicle (parts cost)", "parts tier (OEM / aftermarket)", "mobile trip fee"],
    questions: ["What's wrong? — cards: brakes, oil change, battery, alternator / starter, belts, diagnostic, other", "Brakes — showWhen: front / rear / both cards; pads only or pads + rotors", "Vehicle — cards: car / SUV or truck / heavy-duty or European (parts cost more)", "Parts — cards: aftermarket / OEM", "Where — cards: at my place / at the shop"],
    lines: ["Labor flat per job", "Parts by vehicle class and tier (placeholders)", "Mobile trip fee", "Diagnostic fee (credited on repair)"],
    gotchas: ["Parts vary by make — vehicle class + parts tier, and a range online", "The diagnostic fee is a line that the client message says is credited on approval", "Never quote a repair the tool can't see — 'other' gets a request, not a price"],
  },
  {
    key: "septic",
    name: "Septic & drain field",
    keywords: ["septic", "drain field", "leach field", "pump out", "tank pumping", "aerobic"],
    drivers: ["service (pumping / inspection / repair / install)", "tank size", "access (dig to lid, distance from truck)", "system type"],
    questions: ["Service — cards: pump-out, inspection, repair, new system", "Tank size — cards: 750 / 1,000 / 1,500 gal / not sure", "Lid access — cards: risers at grade / needs digging / not sure", "Distance from the truck — presets in ft (hose length)", "System — cards: conventional / aerobic (aerobic adds a service contract)"],
    lines: ["Pump-out by tank size", "Dig to lid flat", "Extra hose per 100 ft", "Inspection flat", "Aerobic service per visit"],
    gotchas: ["New systems are a site visit — request only, no price online", "Aerobic maintenance is recurring: link the recurring price-book service", "Dump fees are real — a per-gallon or flat disposal line"],
  },
  {
    key: "solar",
    name: "Solar installation",
    keywords: ["solar", "panels", "photovoltaic", "pv", "battery backup", "powerwall"],
    drivers: ["system size in kW (from the monthly bill or roof area)", "roof type and pitch", "battery", "panel tier"],
    questions: ["Monthly electric bill — presets ($100 / $200 / $300+) → kW variable, or roof area on the map", "Roof — cards: shingle / metal / tile / flat", "Battery backup — toggle (kWh cards when on)", "Panel tier — cards: standard / premium (blurbs on warranty and output)", "Stories — cards 1 / 2"],
    lines: ["System: per watt by panel tier", "Roof type adder per watt", "Battery flat by kWh", "Permits & interconnection flat", "Two-story adder"],
    gotchas: ["Compute kW from the bill (bill ÷ 15 is a common rough rule) — don't ask a homeowner for kW", "Always show a range online — a site survey confirms shading", "Financing note in the client message; the 30% tax credit is a note, never a discount line"],
  },
  {
    key: "insulation",
    name: "Insulation",
    keywords: ["insulation", "blown-in", "spray foam", "attic insulation", "batt", "radiant barrier"],
    drivers: ["attic / wall area (sq ft)", "material (blown cellulose / fiberglass / spray foam)", "target depth / R-value", "removal of old insulation", "access"],
    questions: ["Attic size — presets from home sq ft, or map area", "Material — cards: blown-in fiberglass / cellulose / spray foam (blurb on R-value)", "Depth — cards: top-up to R-38 / full R-49 / R-60", "Remove the old insulation? — toggle", "Add-ons — multi: radiant barrier, air sealing, baffles"],
    lines: ["Insulation: per sq ft by material and depth", "Removal: per sq ft", "Air sealing flat", "Radiant barrier per sq ft", "Access surcharge"],
    gotchas: ["Spray foam is 3–5× blown-in — separate rates, never one blended number", "Minimum job", "Removal is often more than the install — its own line"],
  },
  {
    key: "siding",
    name: "Siding & exterior",
    keywords: ["siding", "hardie", "vinyl siding", "soffit", "fascia", "exterior trim"],
    drivers: ["wall area (sq ft — from home sq ft and stories)", "material (vinyl / fiber cement / wood / metal)", "removal of old siding", "stories and access", "trim, soffit, fascia"],
    questions: ["Home size — presets (sq ft) and stories cards → wall area variable", "Material — cards: vinyl / fiber cement / engineered wood / metal (blurbs)", "Remove the old siding? — toggle", "Also — multi: soffit & fascia, house wrap, window trim, gutters", "Stories — cards 1 / 2 / 3"],
    lines: ["Siding: per sq ft of wall by material", "Removal: per sq ft", "Soffit & fascia per linear ft", "House wrap per sq ft", "Story surcharge"],
    gotchas: ["Wall area ≈ perimeter × wall height × stories — compute it from home sq ft, don't ask", "Always a range online; a walk-around confirms rot", "Materials and labor as separate groups — clients compare"],
  },
  {
    key: "decks",
    name: "Decks, patios & pergolas",
    keywords: ["deck", "pergola", "porch", "composite", "trex", "deck build", "deck repair", "railing"],
    drivers: ["deck area (map or presets)", "material (pressure-treated / cedar / composite)", "height (stairs, railing)", "features (railing, stairs, pergola, lighting)", "removal of an old deck"],
    questions: ["Deck size — map area (sq ft) or presets (12×12, 16×20)", "Material — packages: pressure-treated / cedar / composite (includes) — only if the owner sells tiers, else cards", "Height — cards: ground level / up to 4 ft / over 4 ft (railing and stairs required)", "Features — multi: railing, stairs, pergola, built-in bench, lighting", "Remove an old deck? — toggle"],
    lines: ["Deck: per sq ft by material", "Railing per linear ft", "Stairs flat per flight", "Pergola flat by size", "Demo per sq ft", "Permit flat"],
    packages: ["Pressure-treated", "Cedar", "Composite"],
    gotchas: ["Railing is linear feet (perimeter minus the house side), not area — a variable from the deck size", "Permits nearly always — a line", "Composite is materials-heavy: put a unitCost on it so the margin shows"],
  },
];

/** One-line index for the plan step: "key — name". */
export const PLAYBOOK_INDEX = PLAYBOOK.map((t) => `${t.key} — ${t.name}`).join("\n");

/** Best-guess trade from the owner's own words (null when nothing matches). */
export function guessTrade(text: string): TradePlaybook | null {
  const t = text.toLowerCase();
  let best: { trade: TradePlaybook; hits: number } | null = null;
  for (const trade of PLAYBOOK) {
    const hits = trade.keywords.filter((k) => t.includes(k)).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { trade, hits };
  }
  return best?.trade ?? null;
}

export function playbookByKey(key: string | null | undefined): TradePlaybook | null {
  if (!key) return null;
  return PLAYBOOK.find((t) => t.key === key.trim().toLowerCase()) ?? null;
}

/** The entry as prompt text. */
export function playbookText(t: TradePlaybook): string {
  return [
    `TRADE PLAYBOOK — ${t.name}`,
    `What drives the price (most important first): ${t.drivers.join("; ")}.`,
    `Questions a good tool asks:\n${t.questions.map((q) => `- ${q}`).join("\n")}`,
    `How the quote breaks down:\n${t.lines.map((l) => `- ${l}`).join("\n")}`,
    ...(t.mapMeasure
      ? [
          `MEASURE ON THE MAP: the main size question MUST be type "map" with measure "${t.mapMeasure}" (${t.mapMeasure === "length" ? "the customer traces the line; the value is feet" : "the customer traces the outline; the value is square feet"}). Never a slider or a typed number for that size — presets and sliders are only for sizes that can't be drawn (rooms, stories, counts).`,
        ]
      : []),
    ...(t.packages ? [`Packages SOME businesses in this trade sell (only if THIS owner sells tiers — never invent them): ${t.packages.join(" / ")}.`] : []),
    `Gotchas:\n${t.gotchas.map((g) => `- ${g}`).join("\n")}`,
  ].join("\n");
}

/** What every trade has in common — the estimator's interview, in prompt form. */
export const ESTIMATOR_PRINCIPLES = `HOW A GOOD ESTIMATOR THINKS
- Ask only what changes the price, in the order a pro would ask it: the size first, then the material or level, then the extras, then the things that make the job harder.
- Homeowners don't know numbers cold. Offer presets ("Two-car — 550 sq ft"), sliders with sane ranges, steppers for counts, and the map for anything you can draw.
- Packages ONLY when this business sells that way: the owner said tiers / packages / levels / good-better-best, or their price book and past quotes show tiered services (Basic / Plus / Premium, Standard / Deep). A per-unit trade, a flat menu, an hourly trade, a repair — those get ONE clear number. Never invent tiers so the tool has tiers; a fake "Premium" nobody sells makes the tool wrong.
- Every quote line explains itself in its description: what was counted, the rate, the unit. The client reads the quote without the owner in the room.
- Group lines under 2–4 headings ("Labor", "Materials", "Add-ons", "Package") so the breakdown reads like a real quote.
- Never leave the owner at a dead end: when a rate is missing, use a reasonable placeholder and list it under "placeholders" so they can set it. Only ask a question when you truly can't tell what the tool is for.
- Decide, don't interview. The owner came to build, not to fill in a form: anything a seasoned estimator in this trade would simply decide (the unit, a sensible minimum, which extras to offer, how to group the lines) you decide. A question is for a hole in a SPECIFIC description that only the owner can fill and that changes the price a lot — never for a broad one ("a tool for my lawn care business"), which you build from the trade's standard shape and the business's own rates.
- Set a minimum job charge unless the owner said there is none.
- The quote is for the CLIENT: every line's description says what the work is, in plain words — never the formula (the quote prints quantity × price itself). Money off is a discount rule, not a negative line. Recurring work links the recurring price-book service. Put labor hours on the lines that take time so the job books for the right length.
- Prove the math: samples for a small, typical and large job with every required question answered.`;

const FT_UNIT = /^(linear\s*)?(ft|feet|foot|lf)\.?$/i;
const SQFT_UNIT = /^(sq\.?\s*ft\.?|square\s*feet|sqft|sf|ft2|ft²)$/i;
const SIZE_WORDS = /\b(size|area|length|footage|sq ?ft|square|feet|run|line|perimeter|lawn|roof|driveway|yard|fence|gutter|slab|patio)\b/i;

/**
 * A trade that measures on the map gets its primary size question as a map
 * question, whatever control the model reached for. Works on the RAW draft
 * (before compile): the first number question whose unit is feet / square
 * feet (matching the trade's measure) — or, failing a unit, whose label
 * reads like a size — becomes {type: "map", measure}. Map inputs coerce like
 * numbers, so the lines, variables and samples keep working untouched.
 * Returns the same object when nothing applies (already a map, no candidate).
 */
export function preferMapInput(raw: unknown, measure: "length" | "area"): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const spec = raw as Record<string, unknown>;
  const inputs = Array.isArray(spec.inputs) ? (spec.inputs as Record<string, unknown>[]) : null;
  if (!inputs) return raw;
  if (inputs.some((i) => i && i.type === "map")) return raw;
  const unitRe = measure === "length" ? FT_UNIT : SQFT_UNIT;
  const byUnit = inputs.findIndex((i) => i && i.type === "number" && typeof i.unit === "string" && unitRe.test(i.unit.trim()));
  const idx =
    byUnit >= 0
      ? byUnit
      : inputs.findIndex((i) => i && i.type === "number" && !i.unit && typeof i.label === "string" && SIZE_WORDS.test(i.label) && (measure === "length" ? /\b(ft|feet|length|run|line|perimeter|fence|gutter)\b/i.test(i.label) : /\b(area|sq|square|lawn|roof|driveway|yard|slab|patio|size)\b/i.test(i.label)));
  if (idx < 0) return raw;
  const src = inputs[idx];
  const next: Record<string, unknown> = { id: src.id, label: src.label, type: "map", measure };
  for (const k of ["help", "section", "showWhen", "image", "min", "max", "required", "askAtlas"] as const) if (src[k] !== undefined) next[k] = src[k];
  if (next.required === undefined) next.required = true;
  if (typeof next.help !== "string" || !next.help) next.help = measure === "length" ? "Tap the corners along the line on the map — we measure it in feet." : "Tap the corners of the area on the map — we measure it in square feet.";
  const outInputs = inputs.slice();
  outInputs[idx] = next;
  return { ...spec, inputs: outInputs };
}
