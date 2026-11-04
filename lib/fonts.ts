import localFont from "next/font/local";

/**
 * The app's three typefaces, served from our own origin (app/fonts/*.woff2:
 * the latin variable files from Google Fonts, OFL licensed). Self-hosting
 * drops the fonts.googleapis.com stylesheet round trip plus the
 * fonts.gstatic.com fetch on every cold open. On a phone that was two extra
 * connections before the first paint (mobile perf 2026-09-14, done
 * 2026-11-04). The CSS keeps the literal family names as fallbacks so a
 * company's Google Font override (Company.brandFont, AppShell) and the
 * email/embed templates still work unchanged.
 */
export const lexend = localFont({
  src: "../app/fonts/lexend-latin.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-lexend",
  preload: true,
});

export const inter = localFont({
  src: "../app/fonts/inter-latin.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-inter",
  preload: true,
});

// Nunito only sets the pricing page's plan names: no preload.
export const nunito = localFont({
  src: "../app/fonts/nunito-latin.woff2",
  weight: "200 1000",
  style: "normal",
  display: "swap",
  variable: "--font-nunito",
  preload: false,
});

export const fontVariables = `${lexend.variable} ${inter.variable} ${nunito.variable}`;
