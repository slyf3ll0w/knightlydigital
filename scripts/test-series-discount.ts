/**
 * Discounts on a recurring series (lib/series-discount.ts).
 *   npx tsx scripts/test-series-discount.ts
 */
import {
  NO_SERIES_DISCOUNT,
  hasSeriesDiscount,
  parseSeriesDiscountInput,
  readSeriesDiscount,
  seriesDiscountAfterUse,
  seriesDiscountLabel,
  seriesDiscountedPrice,
  seriesInvoiceMoney,
} from "../lib/series-discount";

let failed = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g !== w) {
    failed++;
    console.error(`FAIL ${name}\n  got  ${g}\n  want ${w}`);
  } else {
    console.log(`ok   ${name}`);
  }
}

// ── reading the row ──────────────────────────────────────────────────────────
eq("no row = no discount", readSeriesDiscount(null), NO_SERIES_DISCOUNT);
eq("NONE with a stale value = no discount", readSeriesDiscount({ discountType: "NONE", discountValue: 25 }), NO_SERIES_DISCOUNT);
eq("zero value = no discount", hasSeriesDiscount({ discountType: "FIXED", discountValue: 0 }), false);
eq("count used up = no discount", hasSeriesDiscount({ discountType: "FIXED", discountValue: 25, discountInvoicesLeft: 0 }), false);
eq("a Decimal-like value reads as a number", readSeriesDiscount({ discountType: "FIXED", discountValue: "25.00", discountInvoicesLeft: null }), {
  discountType: "FIXED",
  discountValue: 25,
  discountInvoicesLeft: null,
});

// ── the invoice's money ──────────────────────────────────────────────────────
// The WorkBench Voice plan: $35 a month with $25 off = $10.
eq("$25 off $35", seriesInvoiceMoney({ discountType: "FIXED", discountValue: 25 }, 35, null), {
  discountType: "FIXED",
  discountValue: 25,
  discount: 25,
  tax: null,
  total: 10,
  used: true,
});
eq("no discount leaves the invoice alone", seriesInvoiceMoney(null, 35, null), {
  discountType: "NONE",
  discountValue: null,
  discount: null,
  tax: null,
  total: 35,
  used: false,
});
eq("10% off $89 = $8.90 off", seriesInvoiceMoney({ discountType: "PERCENT", discountValue: 10 }, 89, null).discount, 8.9);
eq("tax is on the discounted amount", seriesInvoiceMoney({ discountType: "FIXED", discountValue: 20 }, 100, 0.0825), {
  discountType: "FIXED",
  discountValue: 20,
  discount: 20,
  tax: 6.6,
  total: 86.6,
  used: true,
});
eq("dollars off never go below zero", seriesInvoiceMoney({ discountType: "FIXED", discountValue: 50 }, 35, 0.0825), {
  discountType: "FIXED",
  discountValue: 50,
  discount: 35,
  tax: 0,
  total: 0,
  used: true,
});
eq("100% off = a free invoice", seriesInvoiceMoney({ discountType: "PERCENT", discountValue: 100 }, 35, null).total, 0);
eq("percent rounds to cents", seriesInvoiceMoney({ discountType: "PERCENT", discountValue: 15 }, 33.33, null).discount, 5);
eq("a used-up count takes nothing off", seriesInvoiceMoney({ discountType: "FIXED", discountValue: 25, discountInvoicesLeft: 0 }, 35, null).total, 35);
// A consolidated invoice (4 visits at $85): dollars off come off the invoice once.
eq("dollars off a multi-visit invoice once", seriesInvoiceMoney({ discountType: "FIXED", discountValue: 25 }, 340, null).total, 315);

// ── counting down ────────────────────────────────────────────────────────────
eq("every invoice never counts down", seriesDiscountAfterUse({ discountType: "FIXED", discountValue: 25, discountInvoicesLeft: null }), {
  discountType: "FIXED",
  discountValue: 25,
  discountInvoicesLeft: null,
});
eq("3 left → 2 left", seriesDiscountAfterUse({ discountType: "PERCENT", discountValue: 10, discountInvoicesLeft: 3 }), {
  discountType: "PERCENT",
  discountValue: 10,
  discountInvoicesLeft: 2,
});
eq("the last one clears the discount", seriesDiscountAfterUse({ discountType: "FIXED", discountValue: 25, discountInvoicesLeft: 1 }), NO_SERIES_DISCOUNT);
{
  // Three invoices of a "first 2 invoices" discount: $10, $10, then $35.
  let row = readSeriesDiscount({ discountType: "FIXED", discountValue: 25, discountInvoicesLeft: 2 });
  const totals: number[] = [];
  for (let i = 0; i < 3; i++) {
    const m = seriesInvoiceMoney(row, 35, null);
    totals.push(m.total);
    if (m.used) row = seriesDiscountAfterUse(row);
  }
  eq("first 2 invoices discounted, the third full price", totals, [10, 10, 35]);
}

// ── request bodies ───────────────────────────────────────────────────────────
eq("a body that says nothing", parseSeriesDiscountInput({ unitPrice: 35 }), undefined);
eq("NONE removes it", parseSeriesDiscountInput({ discountType: "NONE" }), { discount: NO_SERIES_DISCOUNT });
eq("dollars off every invoice", parseSeriesDiscountInput({ discountType: "FIXED", discountValue: 25, discountInvoices: null }), {
  discount: { discountType: "FIXED", discountValue: 25, discountInvoicesLeft: null },
});
eq('"all" = every invoice', parseSeriesDiscountInput({ discountType: "PERCENT", discountValue: "10", discountInvoices: "all" }), {
  discount: { discountType: "PERCENT", discountValue: 10, discountInvoicesLeft: null },
});
eq("the next 3 invoices", parseSeriesDiscountInput({ discountType: "FIXED", discountValue: 25, discountInvoices: 3 }), {
  discount: { discountType: "FIXED", discountValue: 25, discountInvoicesLeft: 3 },
});
const bad = (b: Record<string, unknown>) => {
  const r = parseSeriesDiscountInput(b);
  return Boolean(r && "error" in r);
};
eq("no amount is refused", bad({ discountType: "FIXED" }), true);
eq("a negative amount is refused", bad({ discountType: "FIXED", discountValue: -5 }), true);
eq("over 100% is refused", bad({ discountType: "PERCENT", discountValue: 120 }), true);
eq("zero invoices is refused", bad({ discountType: "FIXED", discountValue: 5, discountInvoices: 0 }), true);
eq("half an invoice is refused", bad({ discountType: "FIXED", discountValue: 5, discountInvoices: 1.5 }), true);
eq("an unknown kind is refused", bad({ discountType: "BOGO", discountValue: 5 }), true);

// ── words ────────────────────────────────────────────────────────────────────
eq("label: every invoice", seriesDiscountLabel({ discountType: "FIXED", discountValue: 25 }), "$25 off every invoice");
eq("label: cents", seriesDiscountLabel({ discountType: "FIXED", discountValue: 12.5 }), "$12.50 off every invoice");
eq("label: the next invoice", seriesDiscountLabel({ discountType: "PERCENT", discountValue: 10, discountInvoicesLeft: 1 }), "10% off the next invoice");
eq("label: the next 3", seriesDiscountLabel({ discountType: "PERCENT", discountValue: 10, discountInvoicesLeft: 3 }), "10% off the next 3 invoices");
eq("label: none", seriesDiscountLabel({ discountType: "NONE" }), "");
eq("row price after the discount", seriesDiscountedPrice({ discountType: "FIXED", discountValue: 25 }, 35), 10);
eq("row price with no discount", seriesDiscountedPrice(null, 35), 35);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nseries discount: all passed");
