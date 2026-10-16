/**
 * What a Payment's `processorRef` says about it. Only the processor charge
 * paths ever write one (pay page, staff charge, autopay, booking checkout —
 * all through recordPayment), so a reference means the money moved online
 * and the row is refunded, never edited or deleted while it holds money.
 * Finix transfer ids start with `TR`; Square payment ids have no prefix.
 * Client-safe: no imports.
 */
export function isOnlinePayment(processorRef: string | null | undefined): boolean {
  return Boolean(processorRef);
}

export function isFinixPayment(processorRef: string | null | undefined): boolean {
  return Boolean(processorRef?.startsWith("TR"));
}
