/**
 * The one place quote money math lives. Discount comes off the subtotal, tax
 * applies to the discounted subtotal and is rounded to cents — matching what
 * the client sees on the acceptance page — so the total stored at creation,
 * edit, and public approval is always identical (the deposit invoice is
 * minted from it).
 */
export function computeQuoteTotals(input: {
  subtotal: number;
  discountType: string | null;
  discountValue: number | null;
  taxRate: number | null;
}): { discount: number; tax: number | null; total: number } {
  const discountValue = input.discountValue == null ? 0 : Number(input.discountValue);
  const discount =
    input.discountType === "PERCENT"
      ? Math.round(input.subtotal * Math.min(Math.max(discountValue, 0), 100)) / 100
      : input.discountType === "FIXED"
        ? Math.min(Math.max(discountValue, 0), input.subtotal)
        : 0;
  const taxable = input.subtotal - discount;
  const tax = input.taxRate ? Math.round(taxable * input.taxRate * 100) / 100 : null;
  const total = taxable + (tax ?? 0);
  return { discount, tax, total };
}
