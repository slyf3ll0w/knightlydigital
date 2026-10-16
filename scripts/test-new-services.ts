/**
 * Unit tests for lib/new-services.ts — which typed line items become Services.
 *   npx tsx scripts/test-new-services.ts
 */
import assert from "node:assert/strict";
import { newServicesFrom, serviceKey } from "../lib/new-services";

assert.equal(serviceKey("  House   Wash "), "house wash");

const book = [{ name: "House Wash" }, { name: "Gutter Clean" }];

{
  // Typed + priced → saved; picked from the book (workItemId) → not; unpriced → not
  const out = newServicesFrom(
    [
      { name: "Driveway Wash", description: " Pressure wash the driveway ", unitPrice: "150", unitCost: "40" },
      { name: "House Wash", unitPrice: "300", workItemId: "wi_1" },
      { name: "Free estimate", unitPrice: "0" },
      { name: "Consult", unitPrice: "" },
      { name: "   ", unitPrice: "90" },
    ],
    book
  );
  assert.deepEqual(out, [
    { name: "Driveway Wash", description: "Pressure wash the driveway", unitPrice: 150, unitCost: 40 },
  ]);
}

{
  // Already in the book by name (any case/spacing) → not saved again
  const out = newServicesFrom([{ name: "house  wash", unitPrice: "275" }], book);
  assert.deepEqual(out, []);
}

{
  // The same new name twice on one form → once; numbers are rounded to cents
  const out = newServicesFrom(
    [
      { name: "Deck Stain", unitPrice: 199.999 },
      { name: "deck stain", unitPrice: "250" },
    ],
    book
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].unitPrice, 200);
  assert.equal(out[0].unitCost, null);
  assert.equal(out[0].description, null);
}

{
  // A typed line that merely matches a book name without the link still isn't duplicated,
  // and a blank or junk cost is null
  const out = newServicesFrom([{ name: "Window Clean", unitPrice: "80", unitCost: "abc" }], book);
  assert.deepEqual(out, [{ name: "Window Clean", description: null, unitPrice: 80, unitCost: null }]);
}

console.log("new-services: all tests passed");
