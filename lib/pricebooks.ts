/**
 * Industry-specific starter price books seeded at onboarding
 * (Jobber seeds vertical-specific services the same way — see
 * docs/plans/industry-price-books.md).
 *
 * unitCost powers the job profit-margin features, so presets include a
 * realistic ballpark cost, not just a price. "Other" seeds nothing — those
 * companies build their price book from scratch in Settings → Products & Services.
 */

export type StarterWorkItem = {
  name: string;
  description: string;
  unitPrice: number;
  unitCost?: number;
};

export const INDUSTRIES = [
  "Pressure Washing",
  "Lawn Care & Landscaping",
  "Cleaning Services",
  "HVAC",
  "Plumbing",
  "Electrical",
  "Handyman",
  "Painting",
  "Pest Control",
  "Roofing & Gutters",
  "Pool & Spa Service",
  "Junk Removal",
  "Window Cleaning",
  "Appliance Repair",
  "Garage Door Services",
  "PC Building & Repair",
  "Other",
] as const;

export type Industry = (typeof INDUSTRIES)[number];

export const INDUSTRY_PRICEBOOKS: Record<Industry, StarterWorkItem[]> = {
  "Pressure Washing": [
    { name: "House Washing", description: "Soft wash of home exterior including gutters, soffits, and trim.", unitPrice: 250, unitCost: 60 },
    { name: "Driveway Cleaning", description: "Pressure washing of driveway including treatment for oil stains.", unitPrice: 120, unitCost: 30 },
    { name: "Patio / Porch Cleaning", description: "Pressure washing of patio surfaces to remove dirt and organic growth.", unitPrice: 100, unitCost: 25 },
    { name: "Deck Cleaning", description: "Pressure washing of wood decks to prep for sealing or staining.", unitPrice: 150, unitCost: 40 },
    { name: "Fence Cleaning", description: "Both sides of fence included. Removes dirt, algae, and mildew.", unitPrice: 130, unitCost: 35 },
    { name: "Gutter Cleaning", description: "Removal of debris from gutters and downspouts.", unitPrice: 120, unitCost: 25 },
    { name: "Roof Soft Wash", description: "Low-pressure roof treatment to remove black streaks and algae.", unitPrice: 350, unitCost: 90 },
    { name: "Commercial Flatwork (per sq ft)", description: "Sidewalks, storefronts, and parking surfaces.", unitPrice: 0.25, unitCost: 0.08 },
  ],
  "Lawn Care & Landscaping": [
    { name: "Lawn Mowing (Standard Lot)", description: "Mow, edge, trim, and blow clippings from hard surfaces.", unitPrice: 55, unitCost: 18 },
    { name: "Lawn Mowing (Large Lot)", description: "Mow, edge, trim, and blow for lots over a quarter acre.", unitPrice: 85, unitCost: 28 },
    { name: "Fertilization Treatment", description: "Seasonal fertilizer application for turf health.", unitPrice: 75, unitCost: 30 },
    { name: "Weed Control Application", description: "Pre- and post-emergent weed treatment.", unitPrice: 65, unitCost: 25 },
    { name: "Shrub & Hedge Trimming", description: "Shaping and trimming of shrubs and hedges, debris hauled away.", unitPrice: 120, unitCost: 35 },
    { name: "Mulch Installation (per cu yd)", description: "Mulch delivered and installed in beds, edges redefined.", unitPrice: 110, unitCost: 45 },
    { name: "Leaf Cleanup", description: "Full-property leaf removal and haul-away.", unitPrice: 180, unitCost: 55 },
    { name: "Sod Installation (per pallet)", description: "Remove old turf, grade, and lay new sod.", unitPrice: 350, unitCost: 200 },
    { name: "Sprinkler System Check", description: "Inspect zones, adjust heads, and report needed repairs.", unitPrice: 85, unitCost: 25 },
  ],
  "Cleaning Services": [
    { name: "Standard House Cleaning", description: "Dust, vacuum, mop, kitchen and bathroom cleaning.", unitPrice: 140, unitCost: 55 },
    { name: "Deep Cleaning", description: "Standard clean plus baseboards, inside appliances, and detail work.", unitPrice: 280, unitCost: 110 },
    { name: "Move-In / Move-Out Cleaning", description: "Empty-home top-to-bottom clean including inside cabinets.", unitPrice: 320, unitCost: 130 },
    { name: "Recurring Cleaning (Weekly)", description: "Discounted standard clean on a weekly schedule.", unitPrice: 110, unitCost: 45 },
    { name: "Carpet Cleaning (per room)", description: "Hot water extraction carpet cleaning.", unitPrice: 50, unitCost: 15 },
    { name: "Window Cleaning (Interior)", description: "Interior glass, sills, and tracks.", unitPrice: 90, unitCost: 25 },
    { name: "Office Cleaning", description: "Commercial space cleaning — trash, floors, restrooms, common areas.", unitPrice: 160, unitCost: 65 },
    { name: "Post-Construction Cleanup", description: "Dust removal, debris, and detail clean after construction work.", unitPrice: 400, unitCost: 160 },
  ],
  HVAC: [
    { name: "Diagnostic / Service Call", description: "On-site system diagnosis. Fee applied toward repair if approved.", unitPrice: 95, unitCost: 30 },
    { name: "AC Tune-Up", description: "Seasonal inspection, coil cleaning, refrigerant check, and filter change.", unitPrice: 129, unitCost: 40 },
    { name: "Furnace Tune-Up", description: "Heating inspection, burner cleaning, and safety check.", unitPrice: 129, unitCost: 40 },
    { name: "Capacitor Replacement", description: "Replace failed run/start capacitor, test amperage draw.", unitPrice: 240, unitCost: 45 },
    { name: "Refrigerant Recharge (per lb)", description: "Leak check plus refrigerant top-off.", unitPrice: 90, unitCost: 35 },
    { name: "Blower Motor Replacement", description: "Replace failed blower motor and verify airflow.", unitPrice: 550, unitCost: 220 },
    { name: "Ductwork Repair", description: "Seal or replace damaged duct sections.", unitPrice: 350, unitCost: 120 },
    { name: "Thermostat Installation", description: "Install and configure customer-supplied or standard thermostat.", unitPrice: 180, unitCost: 60 },
    { name: "Full System Replacement (3-ton)", description: "Remove old equipment and install new condenser, coil, and furnace.", unitPrice: 7500, unitCost: 4200 },
  ],
  Plumbing: [
    { name: "Diagnostic / Service Call", description: "On-site diagnosis. Fee applied toward repair if approved.", unitPrice: 89, unitCost: 28 },
    { name: "Drain Clearing (Main Line)", description: "Cable machine clearing of main sewer line, up to 100 ft.", unitPrice: 280, unitCost: 70 },
    { name: "Drain Clearing (Sink/Tub)", description: "Clear slow or clogged fixture drain.", unitPrice: 150, unitCost: 40 },
    { name: "Faucet Replacement", description: "Remove old faucet and install new, includes supply lines.", unitPrice: 220, unitCost: 80 },
    { name: "Toilet Replacement", description: "Haul away old toilet and install new with wax ring and supply line.", unitPrice: 350, unitCost: 160 },
    { name: "Garbage Disposal Replacement", description: "Replace disposal unit, standard 1/2 HP.", unitPrice: 280, unitCost: 120 },
    { name: "Water Heater Replacement (40-gal)", description: "Remove old tank and install new 40-gallon water heater to code.", unitPrice: 1450, unitCost: 750 },
    { name: "Leak Repair", description: "Locate and repair supply or drain line leak.", unitPrice: 300, unitCost: 80 },
    { name: "Hose Bib Replacement", description: "Replace exterior faucet/spigot.", unitPrice: 165, unitCost: 45 },
  ],
  Electrical: [
    { name: "Diagnostic / Service Call", description: "On-site troubleshooting. Fee applied toward repair if approved.", unitPrice: 95, unitCost: 30 },
    { name: "Outlet / Switch Replacement", description: "Replace standard receptacle or switch.", unitPrice: 110, unitCost: 20 },
    { name: "GFCI Outlet Installation", description: "Install GFCI protection in kitchen, bath, or exterior location.", unitPrice: 150, unitCost: 35 },
    { name: "Ceiling Fan Installation", description: "Install customer-supplied fan on existing fan-rated box.", unitPrice: 180, unitCost: 45 },
    { name: "Light Fixture Installation", description: "Replace or install interior light fixture.", unitPrice: 140, unitCost: 35 },
    { name: "Breaker Replacement", description: "Replace failed breaker in panel.", unitPrice: 175, unitCost: 50 },
    { name: "EV Charger Installation (Level 2)", description: "Install 240V circuit and customer-supplied charger.", unitPrice: 750, unitCost: 280 },
    { name: "Panel Upgrade (200A)", description: "Replace existing panel with 200A service, permit included.", unitPrice: 2800, unitCost: 1300 },
    { name: "Whole-Home Surge Protector", description: "Install panel-mounted surge protection device.", unitPrice: 350, unitCost: 140 },
  ],
  Handyman: [
    { name: "Handyman Hourly Rate", description: "General repairs and installations, one-hour minimum.", unitPrice: 75, unitCost: 25 },
    { name: "Half-Day Rate (4 hrs)", description: "Discounted block for project lists.", unitPrice: 260, unitCost: 95 },
    { name: "TV Mounting", description: "Mount TV on drywall or brick, conceal cords where possible.", unitPrice: 130, unitCost: 35 },
    { name: "Drywall Patch & Repair", description: "Patch holes, tape, float, and texture to match.", unitPrice: 180, unitCost: 50 },
    { name: "Door Repair / Adjustment", description: "Fix sticking, sagging, or misaligned doors and hardware.", unitPrice: 120, unitCost: 30 },
    { name: "Furniture Assembly", description: "Assembly of flat-pack furniture, per item.", unitPrice: 90, unitCost: 25 },
    { name: "Caulking & Sealing", description: "Re-caulk tubs, showers, windows, or trim.", unitPrice: 110, unitCost: 25 },
    { name: "Fixture Swap", description: "Replace faucets, fans, lights, or hardware (customer-supplied).", unitPrice: 100, unitCost: 25 },
  ],
  Painting: [
    { name: "Interior Painting (per room)", description: "Walls, two coats, standard 12x12 room. Paint included.", unitPrice: 450, unitCost: 180 },
    { name: "Ceiling Painting (per room)", description: "Two coats on ceiling, standard room.", unitPrice: 200, unitCost: 75 },
    { name: "Trim & Baseboard Painting (per room)", description: "Sand, caulk, and paint trim package.", unitPrice: 180, unitCost: 60 },
    { name: "Cabinet Painting (Kitchen)", description: "Degrease, sand, prime, and spray kitchen cabinets.", unitPrice: 2800, unitCost: 950 },
    { name: "Exterior House Painting", description: "Pressure wash, scrape, prime, and two finish coats.", unitPrice: 4500, unitCost: 1800 },
    { name: "Fence / Deck Staining", description: "Clean and apply stain or sealer.", unitPrice: 750, unitCost: 280 },
    { name: "Accent Wall", description: "Single wall, two coats, color of choice.", unitPrice: 180, unitCost: 60 },
    { name: "Drywall Texture & Paint Repair", description: "Patch, texture-match, and repaint damaged areas.", unitPrice: 250, unitCost: 80 },
  ],
  "Pest Control": [
    { name: "Initial Pest Treatment", description: "Full interior and exterior treatment with web sweep.", unitPrice: 150, unitCost: 40 },
    { name: "Quarterly Pest Service", description: "Recurring exterior barrier treatment, interior on request.", unitPrice: 110, unitCost: 30 },
    { name: "Ant Treatment", description: "Targeted gel and barrier treatment for ant activity.", unitPrice: 135, unitCost: 35 },
    { name: "Wasp / Hornet Nest Removal", description: "Treat and remove nests up to two stories.", unitPrice: 125, unitCost: 30 },
    { name: "Rodent Control Setup", description: "Inspection, exclusion recommendations, and bait/trap placement.", unitPrice: 225, unitCost: 65 },
    { name: "Termite Inspection", description: "Full-structure termite inspection with written report.", unitPrice: 95, unitCost: 25 },
    { name: "Mosquito Treatment (Monthly)", description: "Yard fogging and larvicide treatment.", unitPrice: 85, unitCost: 25 },
    { name: "Flea Treatment (Interior)", description: "Interior treatment, follow-up included.", unitPrice: 195, unitCost: 55 },
  ],
  "Roofing & Gutters": [
    { name: "Roof Inspection", description: "Full roof and attic inspection with photo report.", unitPrice: 150, unitCost: 45 },
    { name: "Roof Leak Repair", description: "Locate and repair active leak, minor flashing and shingle work.", unitPrice: 450, unitCost: 140 },
    { name: "Shingle Replacement (per square)", description: "Remove and replace damaged shingles, matched to existing.", unitPrice: 350, unitCost: 150 },
    { name: "Full Roof Replacement (per square)", description: "Tear-off, deck inspection, underlayment, and new architectural shingles.", unitPrice: 475, unitCost: 260 },
    { name: "Gutter Cleaning", description: "Clear gutters and downspouts, bag and haul debris.", unitPrice: 140, unitCost: 35 },
    { name: "Gutter Installation (per ft)", description: "5-inch seamless aluminum gutter, color matched.", unitPrice: 12, unitCost: 5 },
    { name: "Gutter Guard Installation (per ft)", description: "Mesh guard installed on existing gutters.", unitPrice: 9, unitCost: 4 },
    { name: "Storm Damage Assessment", description: "Document hail/wind damage for insurance claim support.", unitPrice: 0, unitCost: 0 },
  ],
  "Pool & Spa Service": [
    { name: "Weekly Pool Service", description: "Test and balance chemicals, skim, brush, empty baskets.", unitPrice: 50, unitCost: 16 },
    { name: "One-Time Pool Cleaning", description: "Full clean: vacuum, brush, skim, chemical balance.", unitPrice: 150, unitCost: 45 },
    { name: "Green-to-Clean Recovery", description: "Multi-visit algae recovery treatment.", unitPrice: 400, unitCost: 130 },
    { name: "Filter Cleaning", description: "Disassemble and clean cartridge or DE filter.", unitPrice: 110, unitCost: 25 },
    { name: "Pool Opening", description: "Remove cover, reinstall equipment, start up and balance.", unitPrice: 300, unitCost: 90 },
    { name: "Pool Closing / Winterization", description: "Blow lines, add winter chemicals, install cover.", unitPrice: 325, unitCost: 95 },
    { name: "Pump Replacement", description: "Replace pool pump, standard single-speed to variable-speed.", unitPrice: 950, unitCost: 550 },
    { name: "Salt Cell Cleaning", description: "Inspect and acid-wash salt chlorinator cell.", unitPrice: 85, unitCost: 20 },
  ],
  "Junk Removal": [
    { name: "Minimum Load (1/8 truck)", description: "Single-item or small pickup, loading included.", unitPrice: 95, unitCost: 30 },
    { name: "Quarter Truck Load", description: "Loading, hauling, and disposal fees included.", unitPrice: 180, unitCost: 60 },
    { name: "Half Truck Load", description: "Loading, hauling, and disposal fees included.", unitPrice: 320, unitCost: 110 },
    { name: "Full Truck Load", description: "Loading, hauling, and disposal fees included.", unitPrice: 550, unitCost: 190 },
    { name: "Appliance Removal", description: "Single large appliance, any floor.", unitPrice: 110, unitCost: 35 },
    { name: "Furniture Removal (per item)", description: "Couches, mattresses, dressers — hauled and disposed.", unitPrice: 90, unitCost: 30 },
    { name: "Garage Cleanout", description: "Full garage cleanout with sweep-up.", unitPrice: 400, unitCost: 140 },
    { name: "Construction Debris (per load)", description: "Renovation and demo debris hauling.", unitPrice: 450, unitCost: 160 },
  ],
  "Window Cleaning": [
    { name: "Exterior Window Cleaning (per pane)", description: "Squeegee clean of exterior glass.", unitPrice: 6, unitCost: 1.5 },
    { name: "Interior + Exterior (per pane)", description: "Both sides cleaned, sills wiped.", unitPrice: 10, unitCost: 2.5 },
    { name: "Single-Story Home Package", description: "All exterior windows on single-story home.", unitPrice: 160, unitCost: 50 },
    { name: "Two-Story Home Package", description: "All exterior windows on two-story home.", unitPrice: 260, unitCost: 85 },
    { name: "Screen Cleaning (per screen)", description: "Remove, wash, and reinstall screens.", unitPrice: 4, unitCost: 1 },
    { name: "Track & Sill Detail (per window)", description: "Vacuum and wipe tracks and sills.", unitPrice: 5, unitCost: 1 },
    { name: "Hard Water Stain Removal (per pane)", description: "Mineral deposit removal with restoration polish.", unitPrice: 15, unitCost: 4 },
    { name: "Storefront Cleaning (Monthly)", description: "Recurring commercial storefront glass service.", unitPrice: 75, unitCost: 22 },
  ],
  "Appliance Repair": [
    { name: "Diagnostic / Service Call", description: "In-home appliance diagnosis. Fee applied toward repair if approved.", unitPrice: 95, unitCost: 30 },
    { name: "Refrigerator Repair", description: "Common repairs: compressor start kit, fans, defrost components. Parts billed separately.", unitPrice: 220, unitCost: 70 },
    { name: "Washer Repair", description: "Common repairs: pumps, belts, lid switches. Parts billed separately.", unitPrice: 190, unitCost: 60 },
    { name: "Dryer Repair", description: "Common repairs: heating elements, thermal fuses, belts. Parts billed separately.", unitPrice: 180, unitCost: 55 },
    { name: "Dishwasher Repair", description: "Common repairs: pumps, valves, latches. Parts billed separately.", unitPrice: 185, unitCost: 60 },
    { name: "Oven / Range Repair", description: "Common repairs: igniters, elements, controls. Parts billed separately.", unitPrice: 200, unitCost: 65 },
    { name: "Dryer Vent Cleaning", description: "Full vent line cleaning to exterior.", unitPrice: 130, unitCost: 30 },
    { name: "Appliance Installation", description: "Install and test customer-supplied appliance.", unitPrice: 150, unitCost: 45 },
  ],
  "Garage Door Services": [
    { name: "Diagnostic / Service Call", description: "On-site inspection and tune-up assessment.", unitPrice: 75, unitCost: 25 },
    { name: "Spring Replacement (pair)", description: "Replace both torsion springs, balance and tune door.", unitPrice: 320, unitCost: 110 },
    { name: "Opener Installation", description: "Install new belt-drive opener with two remotes.", unitPrice: 550, unitCost: 280 },
    { name: "Opener Repair", description: "Repair drive gear, logic board, or safety sensors.", unitPrice: 180, unitCost: 55 },
    { name: "Roller Replacement (set)", description: "Replace all rollers with nylon ball-bearing rollers.", unitPrice: 160, unitCost: 45 },
    { name: "Cable Replacement (pair)", description: "Replace frayed or snapped lift cables.", unitPrice: 170, unitCost: 45 },
    { name: "Track Alignment / Repair", description: "Realign or replace bent track sections.", unitPrice: 150, unitCost: 40 },
    { name: "Full Door Replacement (16x7)", description: "Remove old door and install new insulated steel door.", unitPrice: 1900, unitCost: 1050 },
    { name: "Annual Tune-Up", description: "Lubricate, tighten hardware, balance, and safety test.", unitPrice: 95, unitCost: 20 },
  ],
  "PC Building & Repair": [
    { name: "Custom PC Build (Labor)", description: "Full assembly, cable management, BIOS setup, OS install, and stress test. Parts billed separately.", unitPrice: 150, unitCost: 25 },
    { name: "PC Diagnostic", description: "Full hardware and software diagnosis with written findings. Applied toward repair if approved.", unitPrice: 65, unitCost: 10 },
    { name: "Hardware Installation (per component)", description: "Install and test GPU, RAM, storage, PSU, or cooler.", unitPrice: 55, unitCost: 8 },
    { name: "OS Install / Refresh", description: "Clean Windows install, drivers, updates, and data migration.", unitPrice: 95, unitCost: 15 },
    { name: "Virus / Malware Removal", description: "Deep scan, removal, and security hardening.", unitPrice: 110, unitCost: 15 },
    { name: "Thermal Service & Cleaning", description: "Full dust-out, new thermal paste, fan curve tuning.", unitPrice: 85, unitCost: 15 },
    { name: "Laptop Screen Replacement (Labor)", description: "Replace damaged laptop display. Panel billed separately.", unitPrice: 95, unitCost: 15 },
    { name: "Data Recovery (Basic)", description: "Recover files from functional but corrupted drives.", unitPrice: 150, unitCost: 25 },
    { name: "In-Home Setup & Networking", description: "On-site PC setup, peripherals, and network configuration.", unitPrice: 120, unitCost: 30 },
  ],
  // "Other" starts with an empty price book — built by the company in Settings.
  Other: [],
};

export function pricebookForIndustry(industry: string | null | undefined): StarterWorkItem[] {
  if (!industry) return [];
  return INDUSTRY_PRICEBOOKS[industry as Industry] ?? [];
}
