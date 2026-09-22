/**
 * Library portability tests (lib/estimator-portable.ts). Pure — no DB.
 * Run: npx tsx scripts/test-estimator-portable.ts
 */
import assert from "node:assert";
import { runEstimator, specFromJson, type PriceBookEntry } from "../lib/estimator";
import { imageIdsIn, inlinePriceRefs, listingFacts, remapImages, toPortableSpec } from "../lib/estimator-portable";

const book: PriceBookEntry[] = [
  { id: "wi_drive", name: "Driveway Cleaning", unitPrice: 0.3, unitCost: 0.1 },
  { id: "wi_seal", name: "Sealant", unitPrice: 0.45, unitCost: null },
  { id: "wi_trip", name: "Trip Fee", unitPrice: 49, unitCost: 12 },
];

const raw = {
  version: 1,
  inputs: [
    { id: "sqft", label: "Area", type: "number", unit: "sq ft", min: 50, max: 5000, default: 500, image: "/api/estimate-images/img_question_1" },
    { id: "seal", label: "Add sealant?", type: "toggle" },
    { id: "stories", label: "Stories", type: "select", options: [{ value: "1", label: "One", image: "/api/estimate-images/img_option_1" }, { value: "2", label: "Two" }], default: "1", showWhen: "sqft > 49" },
  ],
  variables: [{ id: "rate", expr: "price(\"Driveway Cleaning\") + cost('Sealant')" }],
  lines: [
    { name: "Driveway cleaning", description: "{sqft} sq ft at {rate|money}", quantity: "sqft", unitPrice: "rate", workItemName: "Driveway Cleaning", group: "Cleaning" },
    { name: "Sealant", description: "Optional", when: "seal", quantity: "sqft", workItemName: "Sealant", group: "Add-ons" },
    { name: "Trip fee", description: "Flat", quantity: "1", unitPrice: "price('Trip Fee') * 1", group: "Add-ons" },
  ],
  minimumTotal: 150,
  samples: [{ label: "Typical job", inputs: { sqft: 500, seal: true, stories: "1" } }],
};

// 1. inlinePriceRefs swaps quoted names for literals, both quote styles, leaves unknown names alone
const byName = new Map(book.map((b) => [b.name.toLowerCase(), b]));
assert.equal(inlinePriceRefs("price(\"Driveway Cleaning\") + cost('Sealant')", byName), "0.3 + 0");
assert.equal(inlinePriceRefs("price( 'Trip Fee' ) * 2", byName), "49 * 2");
assert.equal(inlinePriceRefs("price('Nope')", byName), "price('Nope')");

// 2. the portable spec compiles with NO price book and prices the same
const original = runEstimator(raw, { sqft: 500, seal: true, stories: "1" }, book);
assert.ok(original.ok, "original runs");
const portable = toPortableSpec(specFromJson(raw)!, book);
assert.ok(portable.ok, `portable: ${!portable.ok ? portable.errors.join("; ") : ""}`);
if (!portable.ok) throw new Error("unreachable");
assert.ok(portable.spec.lines.every((l) => !l.workItemName), "no price-book links remain");
assert.equal(portable.spec.lines[1].unitPrice, "0.45", "linked line without its own price gets the literal");
assert.equal(portable.spec.lines[2].unitPrice, "49 * 1");
assert.equal(portable.spec.inputs[2].showWhen, "sqft > 49", "showWhen untouched");
const copy = runEstimator(portable.spec, { sqft: 500, seal: true, stories: "1" }, []);
assert.ok(copy.ok, "portable runs against an empty book");
assert.equal(copy.subtotal, original.subtotal, "same subtotal");
assert.equal(portable.spec.placeholders?.length, 4, "one rate to confirm per line + the minimum");
assert.ok(portable.spec.placeholders?.[1].startsWith("Sealant: $0.45"), portable.spec.placeholders?.[1]);
assert.ok(portable.spec.placeholders?.[3].startsWith("Minimum job charge: $150"));
assert.equal(portable.spec.samples?.length, 1, "samples kept");

// 3. a linked line whose item is unknown to the sharer is refused with its name
const bad = toPortableSpec(specFromJson({ ...raw, lines: [{ name: "Mystery", quantity: "1", workItemName: "Ghost Item" }] })!, book);
assert.ok(!bad.ok && bad.errors[0].includes("Ghost Item"));

// 4. facts + images
assert.deepEqual(listingFacts(portable.spec), ["3 questions", "3 pricing lines"]);
assert.deepEqual(imageIdsIn(portable.spec).sort(), ["img_option_1", "img_question_1"]);
const remapped = remapImages(portable.spec, new Map([["img_question_1", "new_question_1"]]));
assert.equal(remapped.inputs[0].image, "/api/estimate-images/new_question_1");
const stories = remapped.inputs[2];
assert.ok(stories.type === "select" && stories.options[0].image === "/api/estimate-images/img_option_1", "unmapped ids keep their URL");

console.log("estimator-portable: all tests passed");
