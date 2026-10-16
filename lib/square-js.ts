/**
 * Client-side types + loader for Square's Web Payments SDK. Like finix.js it
 * is loaded from Square's CDN, never bundled (PCI scope: card fields render
 * in Square-hosted iframes; the page only ever sees a one-time token).
 *
 *   const payments = window.Square.payments(applicationId, locationId);
 *   const card = await payments.card({ style }); await card.attach(el);
 *   const { status, token } = await card.tokenize();   // "OK" → cnon:…
 *
 * ACH goes through `payments.ach()` — Plaid Link opens in a popup, the
 * result is a `bauth:…` token charged the same way. One script per
 * environment: sandbox tokens are refused by production and vice versa.
 */

export const SQUARE_JS_SRC: Record<"sandbox" | "production", string> = {
  sandbox: "https://sandbox.web.squarecdn.com/v1/square.js",
  production: "https://web.squarecdn.com/v1/square.js",
};

export type SquareTokenResult = {
  status: "OK" | "Cancel" | "Error" | "Invalid" | string;
  token?: string;
  errors?: { type?: string; message?: string; field?: string }[];
  details?: {
    card?: { brand?: string; last4?: string; expMonth?: number; expYear?: number };
    method?: string;
  };
};

export type SquareCardStyle = Record<string, Record<string, string | number> | string | number>;

export interface SquareCardInstance {
  attach: (target: string | HTMLElement) => Promise<void>;
  destroy: () => Promise<boolean>;
  tokenize: () => Promise<SquareTokenResult>;
  addEventListener: (event: string, cb: (e: { detail?: unknown }) => void) => void;
  removeEventListener: (event: string, cb: (e: { detail?: unknown }) => void) => void;
  configure?: (options: { style?: SquareCardStyle }) => Promise<void>;
}

export interface SquareAchInstance {
  tokenize: (options: {
    accountHolderName: string;
    intent: "CHARGE" | "STORE";
    /** Decimal string, e.g. "125.00" — the SDK rejects a number. */
    amount?: string;
    currency?: string;
  }) => Promise<SquareTokenResult>;
  destroy: () => Promise<boolean>;
  addEventListener: (event: string, cb: (e: { detail?: unknown }) => void) => void;
}

export interface SquarePaymentsInstance {
  card: (options?: { style?: SquareCardStyle; postalCode?: string }) => Promise<SquareCardInstance>;
  ach: (options?: { redirectURI?: string; transactionId?: string }) => Promise<SquareAchInstance>;
  setLocale?: (locale: string) => void;
}

declare global {
  interface Window {
    Square?: {
      payments: (applicationId: string, locationId: string) => SquarePaymentsInstance;
    };
  }
}

/** Resolve once the SDK is on the page (idempotent; many mounts share one
 *  script tag). Rejects if the CDN script fails to load. */
export function loadSquareJs(environment: "sandbox" | "production"): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Square) return Promise.resolve();
  const src = SQUARE_JS_SRC[environment];
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    const script = existing ?? document.createElement("script");
    const onLoad = () => resolve();
    const onError = () => reject(new Error("Square payment form failed to load"));
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    if (!existing) {
      script.src = src;
      script.async = true;
      document.head.appendChild(script);
    } else if (window.Square) {
      resolve();
    }
  });
}

/** Square's card iframe styling. `accent` = the company's primary; the
 *  shape mirrors the finix.js options the pages used so both read as one
 *  form. Only Square's whitelisted selectors/properties are accepted. */
export function squareCardStyle(opts: { dark?: boolean; accent?: string }): SquareCardStyle {
  const accent = opts.accent ?? "#22C55E";
  return {
    ".input-container": {
      borderColor: opts.dark ? "rgba(255,255,255,0.15)" : "#D1D5DB",
      borderRadius: "8px",
      borderWidth: "1px",
    },
    ".input-container.is-focus": { borderColor: accent },
    ".input-container.is-error": { borderColor: "#F87171" },
    ".message-text": { color: opts.dark ? "#D1D5DB" : "#6B7280" },
    ".message-icon": { color: opts.dark ? "#D1D5DB" : "#6B7280" },
    ".message-text.is-error": { color: "#F87171" },
    ".message-icon.is-error": { color: "#F87171" },
    // No fontFamily: Square only accepts its own list of families and
    // rejects the WHOLE style for an unknown one ("Invalid style value
    // 'Lexend, …' for property 'fontFamily'", staging 2026-10-16), which
    // took the card form down. Its default sans-serif is close enough.
    input: {
      backgroundColor: opts.dark ? "#111827" : "#FFFFFF",
      color: opts.dark ? "#FFFFFF" : "#111827",
      fontSize: "14px",
    },
    "input::placeholder": { color: opts.dark ? "#6B7280" : "#9CA3AF" },
    "input.is-error": { color: "#F87171" },
  };
}

/** The message to show when tokenize() doesn't come back OK. */
export function squareTokenError(result: SquareTokenResult | null | undefined): string {
  if (!result) return "The payment form isn't ready yet. Please try again in a moment.";
  if (result.status === "Cancel") return "Bank connection cancelled.";
  const detail = result.errors?.map((e) => e.message).filter(Boolean).join(" ");
  return detail || "Please check your payment details and try again.";
}
