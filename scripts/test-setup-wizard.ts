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
        { index: 0, durationMinutes: 150 }, // snaps to the 120 review choice
        { index: 1, durationMinutes: 60 }, // ignored — wi2 already has 45
        { index: 9, durationMinutes: 60 }, // out of range — dropped
      ],
      newServices: [
        { name: "Fence Cleaning", description: "Both sides.", price: 130, cost: 35, durationMinutes: 75 },
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
  assert.equal(d.existingServices[0].durationMinutes, 120, "150 snaps to the 120 choice");
  assert.equal(d.existingServices[1].durationMinutes, 45, "AI can't override a set duration");
  assert.deepEqual(d.serviceZips, ["75002", "75013"]);
  assert.equal(d.newServices.length, 1, "dupe-of-existing and nameless dropped");
  assert.equal(d.newServices[0].name, "Fence Cleaning");
  assert.equal(d.newServices[0].durationMinutes, 60, "75 snaps to a review choice");
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

// 7. website URL guards: SSRF-y and garbage inputs rejected, real sites normalized
{
  const { normalizeWebsiteUrl, isSafePublicUrl } = require("../lib/website-info") as typeof import("../lib/website-info");
  assert.equal(normalizeWebsiteUrl("acme-washing.com"), "https://acme-washing.com/");
  assert.equal(normalizeWebsiteUrl("http://www.acme.com/services"), "http://www.acme.com/services");
  assert.equal(normalizeWebsiteUrl("javascript:alert(1)"), null);
  assert.equal(normalizeWebsiteUrl("ftp://acme.com"), null);
  assert.equal(normalizeWebsiteUrl("http://localhost:3000"), null);
  assert.equal(normalizeWebsiteUrl("http://192.168.1.1/admin"), null);
  assert.equal(normalizeWebsiteUrl("http://railway.internal"), null);
  assert.equal(normalizeWebsiteUrl(42), null);
  assert.equal(isSafePublicUrl("https://10.0.0.5/x"), false);
  assert.equal(isSafePublicUrl("https://[::1]/x"), false);
  console.log("ok 7: website URL guards");
}

// 8. parseWebsiteHtml pulls title/description/logo/theme-color/text
{
  const { parseWebsiteHtml } = require("../lib/website-info") as typeof import("../lib/website-info");
  const html = `<!doctype html><html><head>
    <title>Acme Pressure Washing &amp; More</title>
    <meta name="description" content="Soft washing in Allen, TX">
    <meta name="theme-color" content="#1a73e8">
    <meta property="og:image" content="/img/logo.png">
    <link rel="icon" sizes="192x192" href="/icon-192.png">
    <style>body{color:red}</style>
    <script>evil("<h1>injected</h1>")</script>
  </head><body>
    <h1>Acme Pressure Washing</h1>
    <p>House washing from $250. We never use high pressure on siding.</p>
    <svg><path d="M0 0"/></svg>
  </body></html>`;
  const info = parseWebsiteHtml(html, "https://acme.com/");
  assert.equal(info.title, "Acme Pressure Washing & More");
  assert.equal(info.description, "Soft washing in Allen, TX");
  assert.equal(info.themeColor, "#1A73E8");
  assert.equal(info.logoUrl, "https://acme.com/img/logo.png", "og:image wins");
  assert.ok(info.text.includes("House washing from $250"));
  assert.ok(!info.text.includes("evil"), "script content stripped");
  assert.ok(!info.text.includes("color:red"), "style content stripped");
  // no og:image → sized icon wins; tiny/unsized icons don't
  const html2 = `<link rel="icon" sizes="192x192" href="/icon-192.png"><link rel="icon" href="/favicon.ico">`;
  assert.equal(parseWebsiteHtml(html2, "https://acme.com/").logoUrl, "https://acme.com/icon-192.png");
  assert.equal(parseWebsiteHtml(`<link rel="icon" href="/favicon.ico">`, "https://acme.com/").logoUrl, null);
  // an <img> that self-identifies as the logo beats og:image (usually a banner)
  const html3 = `<meta property="og:image" content="/banner.jpg">
    <img src="/assets/header-logo.png" alt="Acme logo" class="site-logo">
    <img src="/assets/photo.jpg" alt="crew at work">`;
  assert.equal(parseWebsiteHtml(html3, "https://acme.com/").logoUrl, "https://acme.com/assets/header-logo.png");
  // svg/data logos skipped (upload route can't store them) → og:image wins
  const html4 = `<meta property="og:image" content="/banner.jpg"><img src="/logo.svg" alt="logo">`;
  assert.equal(parseWebsiteHtml(html4, "https://acme.com/").logoUrl, "https://acme.com/banner.jpg");
  console.log("ok 8: parseWebsiteHtml extraction");
}

// 8b. isNeutralHex: chrome colors rejected, brand colors kept
{
  const { isNeutralHex } = require("../lib/business-lookup") as typeof import("../lib/business-lookup");
  assert.equal(isNeutralHex("#FFFFFF"), true);
  assert.equal(isNeutralHex("#000000"), true);
  assert.equal(isNeutralHex("#F5F5F5"), true);
  assert.equal(isNeutralHex("#808080"), true);
  assert.equal(isNeutralHex("#A52A2A"), false, "brick red is a brand color");
  assert.equal(isNeutralHex("#1A73E8"), false, "blue is a brand color");
  assert.equal(isNeutralHex("#16A34A"), false, "green is a brand color");
  console.log("ok 8b: isNeutralHex");
}

// 9. sanitizeLookup: hostile lookup payload degrades safely
{
  const { sanitizeLookup } = require("../lib/business-lookup") as typeof import("../lib/business-lookup");
  const d = sanitizeLookup({
    found: true,
    name: "Acme <b>Washing</b>".repeat(20),
    website: "javascript:alert(1)",
    phone: "972-555-0100",
    streetAddress: "123 Main St",
    city: "Allen",
    state: "TX",
    zip: "75002-1234",
    mapsUrl: "https://evil.com/phish",
    rating: 47,
    reviewCount: -3,
    summary: 42,
  });
  assert.ok(d && d.found);
  assert.equal(d!.name.length, 120);
  assert.equal(d!.website, null, "javascript: URL rejected");
  assert.equal(d!.zip, "75002");
  assert.equal(d!.mapsUrl, null, "non-Google maps URL rejected");
  assert.equal(d!.rating, null, "out-of-range rating dropped");
  assert.equal(d!.reviewCount, null);
  assert.equal(d!.summary, "");
  const good = sanitizeLookup({
    found: true, name: "Acme", website: "acme.com", mapsUrl: "https://maps.app.goo.gl/abc123",
    rating: 4.83, reviewCount: 127, phone: "", streetAddress: "", city: "", state: "", zip: "", summary: "s",
  });
  assert.equal(good!.website, "https://acme.com/");
  assert.equal(good!.mapsUrl, "https://maps.app.goo.gl/abc123");
  assert.equal(good!.rating, 4.8);
  assert.equal(good!.reviewCount, 127);
  const zeroed = sanitizeLookup({ found: true, name: "X", rating: 0, reviewCount: 0 });
  assert.equal(zeroed!.rating, null, "0 rating = model didn't find one");
  assert.equal(zeroed!.reviewCount, null);
  assert.equal(sanitizeLookup(null), null);
  console.log("ok 9: sanitizeLookup clamps hostile payloads");
}

// 10. "anywhere" radius: accepted by sanitizeIntake, forces empty ZIPs on the draft
{
  const anywhere = sanitizeIntake({ industry: "Pressure Washing", city: "Allen", state: "TX", radius: "anywhere", website: "acme.com" });
  assert.equal(anywhere.radius, "anywhere");
  assert.equal(anywhere.website, "https://acme.com/");
  delete process.env.GEMINI_API_KEY;
  generateSetupDraft("Test Co", anywhere, []).then((d) => {
    assert.deepEqual(d.serviceZips, [], "anywhere → no ZIP restriction");
    console.log("ok 10: anywhere radius → empty serviceZips");
  });
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
