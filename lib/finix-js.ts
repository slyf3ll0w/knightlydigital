/**
 * Shared client-side types for finix.js (loaded from Finix's CDN — self-hosting
 * breaks PCI scope). One home for the Window.Finix declaration so the pay page
 * and the hub saved-card form don't fight over global augmentation.
 */

/** Server-provided Finix config — non-null only when this company can charge online. */
export type FinixConfig = { applicationId: string; environment: "sandbox" | "live" } | null;

export type FinixForm = {
  submit: (cb: (err: unknown, res: { data?: { id?: string } } | undefined) => void) => void;
};

declare global {
  interface Window {
    Finix?: {
      PaymentForm: (
        el: string | HTMLElement,
        environment: string,
        applicationId: string,
        options: Record<string, unknown>
      ) => FinixForm;
    };
  }
}

export const FINIX_JS_SRC = "https://js.finix.com/v/2/finix.js";
