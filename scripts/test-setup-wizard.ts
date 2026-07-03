/**
 * Setup-wizard tests. Run: npx tsx scripts/test-setup-wizard.ts
 * With GEMINI_API_KEY set, also runs a live generation and prints the draft
 * (manual eyeball check for prompt quality — not asserted).
 */
import assert from "node:assert";
import {
  fallbackDraft,
  sanitizeAIDraft,
  sanitizeIntake,
  generateSetupDraft,
  type ExistingServiceInput,
} from "../lib/setup-wizard";

const intake = sanitizeIntake({
  industry: "Pressure Washing",
  city: "Allen",
  state: "TX",
  radius: "15mi",
  teamSize: "2-3",
  description: "Residential exterior cleaning",
});

// 1. sanitizeIntake clamps garbage
{
  const bad = sanitizeIntake({ industry: 42, radius: "nonsense", city: "x".repeat(500) });
  assert.equal(bad.industry, "");
  assert.equal(bad.radius, "15mi");
  assert.equal(bad.city.length, 80);
  console.log("ok 1: sanitizeIntake clamps garbage");
}

// 2. fallback with an empty book pulls the canned vertical price book with duration guesses
{
  const d = fallbackDraft(intake, []);
  assert.equal(d.source, "fallback");
  assert.ok(d.newServices.length >= 5, "canned pressure-washing services expected");
  const house = d.newServices.find((s) => s.name === "House Washing");
  assert.ok(house && house.durationMinutes === 120, "House Washing ($250) guesses 120m");
  const flat = d.newServices.find((s) => s.name.startsWith("Commercial Flatwork"));
  assert.ok(flat && flat.durationMinutes === null, "per-sqft item not slot-bookable");
  console.log("ok 2: fallback canned price book + duration guesses");
}

// 3. fallback with existing items proposes durations but keeps set ones
{
  const existing: ExistingServiceInput[] = [
    { id: "a", name: "Driveway Cleaning", price: 120, durationMinutes: null },
    { id: "b", name: "Roof Soft Wash", price: 350, durationMinutes: 90 },
  ];
  const d = fallbackDraft(intake, existing);
  assert.equal(d.newServices.length, 0, "no new services when a book exists");
  assert.equal(d.existingServices[0].durationMinutes, 60);
  assert.equal(d.existingServices[1].durationMinutes, 90, "already-set duration untouched");
  console.log("ok 3: fallback respects existing durations");
}

// 4. sanitizeAIDraft: valid AI payload maps index→workItemId, clamps, dedupes
{
  const existing: ExistingServiceInput[] = [
    { id: "wi1", name: "House Washing", price: 250, durationMinutes: null },
    { id: "wi2", name: "Gutter Cleaning", price: 120, durationMinutes: 45 },
  ];
  const fb = fallbackDraft(intake, existing);
  const d = sanitizeAIDraft(
    {
      timezone: "America/Chicago",
      businessHours: { mon: [{ start: "08:00", end: "17:00" }], sat: [{ start: "09:00", end: "13:00" }] },
      arrivalWindowMinutes: 120,
      serviceZips: ["75002", "75013", "75002", "nope", "750130"],
      existingDurations: [
        { index: 0, durationMinutes: 150 },
        { index: 1, durationMinutes: 60 }, // ignored — wi2 already has 45
        { index: 9, durationMinutes: 60 }, // out of range — dropped
      ],
      newServices: [
        { name: "Fence Cleaning", description: "Both sides.", price: 130, cost: 35, durationMinutes: 90 },
        { name: "house washing", description: "dupe of existing", price: 999, cost: 1, durationMinutes: 60 },
        { name: "", description: "no name", price: 10, cost: 1, durationMinutes: 30 },
      ],
      contract: { name: "Pressure Washing Agreement", body: "x".repeat(400) },
      intakeQuestions: [
        { label: "How many stories?", type: "select", options: ["One", "Two", "Three+"] },
        { label: "Bad select", type: "select", options: ["only-one"] },
      ],
      clientFields: [{ label: "Gate code", type: "text", options: [] }],
      recurringPlanIdeas: ["Monthly storefront route — about $75/visit", 42],
    },
    existing,
    fb
  );
  assert.equal(d.source, "ai");
  assert.equal(d.timezone, "America/Chicago");
  assert.equal(d.existingServices[0].durationMinutes, 150);
  assert.equal(d.existingServices[1].durationMinutes, 45, "AI can't override a set duration");
  assert.deepEqual(d.serviceZips, ["75002", "75013"]);
  assert.equal(d.newServices.length, 1, "dupe-of-existing and nameless dropped");
  assert.equal(d.newServices[0].name, "Fence Cleaning");
  assert.equal(d.intakeQuestions.length, 1, "select with <2 options dropped");
  assert.equal(d.businessHours.sat.length, 1, "Saturday hours kept");
  assert.equal(d.recurringPlanIdeas.length, 1);
  console.log("ok 4: sanitizeAIDraft maps, clamps, dedupes");
}

// 5. sanitizeAIDraft: hostile payload degrades to safe values, never throws
{
  const fb = fallbackDraft(intake, []);
  const d = sanitizeAIDraft(
    {
      timezone: "Not/AZone",
      businessHours: "garbage",
      arrivalWindowMinutes: 999,
      serviceZips: { evil: true },
      existingDurations: "nope",
      newServices: [{ name: "X", price: 99999999, cost: -5, durationMinutes: 7 }],
      contract: { name: "Short", body: "too short" },
      intakeQuestions: null,
      clientFields: [{ label: "y".repeat(500), type: "text" }],
      recurringPlanIdeas: null,
    },
    [],
    fb
  );
  assert.equal(d.timezone, null, "bad timezone → leave current alone");
  assert.equal(d.arrivalWindowMinutes, 120);
  assert.deepEqual(d.serviceZips, []);
  assert.equal(d.newServices[0].price, 0, "absurd price zeroed for review");
  assert.equal(d.newServices[0].durationMinutes, null, "7min fails sanitizeDuration");
  assert.equal(d.contract.body, fb.contract.body, "short contract → fallback body");
  assert.equal(d.clientFields[0].label.length, 80);
  console.log("ok 5: hostile AI payload degrades safely");
}

// 6. generateSetupDraft without a key returns the fallback (no throw)
{
  delete process.env.GEMINI_API_KEY;
  generateSetupDraft("Test Co", intake, []).then(async (d) => {
    assert.equal(d.source, "fallback");
    console.log("ok 6: no API key → fallback draft");

    // Optional live call — set LIVE_GEMINI_KEY to eyeball real output
    const liveKey = process.env.LIVE_GEMINI_KEY;
    if (liveKey) {
      process.env.GEMINI_API_KEY = liveKey;
      const live = await generateSetupDraft("Cedar & Sun Lawn Care", sanitizeIntake({
        industry: "Lawn Care & Landscaping",
        city: "Allen",
        state: "TX",
        radius: "15mi",
        teamSize: "2-3",
        description: "Residential lawn care and landscaping in Collin County",
      }), []);
      console.log(`live: source=${live.source} tz=${live.timezone} zips=${live.serviceZips.length} newServices=${live.newServices.length} questions=${live.intakeQuestions.length} plans=${live.recurringPlanIdeas.length}`);
      console.log(JSON.stringify(live, null, 2));
    }
    console.log("\nAll setup-wizard tests passed.");
  });
}
