import type { ScheduleAppearance } from "@/app/book/[slug]/schedule/shell";

/**
 * One class recipe for every public booking form (RequestForm,
 * BookingStepper, PublicEstimateForm): the heavy look (app/client-heavy.css)
 * on the light theme, the booking look's dark and transparent themes as they
 * were. Pure + client-safe.
 *
 * Light = solid white cards, 48 px fields, solid choice tiles, the 52 px
 * primary button. Dark keeps its dark cards (the heavy look is a light
 * look; a company that picked dark gets the same structure on dark).
 * Transparent (embeds only) stays borderless so it sits on the host page.
 */
export type FormStyle = {
  heavy: boolean;
  card: string;
  ink: string;
  muted: string;
  label: string;
  input: string;
  /** A radio / checkbox tile; pass whether it is picked. */
  choice: (on: boolean) => string;
  primaryBtn: string;
  heading: string;
  error: string;
};

export function clientFormStyle(appearance: Pick<ScheduleAppearance, "dark" | "transparent">): FormStyle {
  const { dark, transparent } = appearance;
  const heavy = !dark && !transparent;
  if (heavy) {
    return {
      heavy,
      card: "ch-card",
      ink: "text-gray-900",
      muted: "text-gray-500",
      label: "ch-label",
      input: "ch-input",
      choice: (on) => `ch-choice${on ? " is-on" : ""}`,
      primaryBtn: "ch-btn",
      heading: "ch-h2 text-gray-900",
      error: "ch-error",
    };
  }
  return {
    heavy,
    card: transparent ? "bg-transparent" : "bg-[#101410] border border-white/10 rounded-lg shadow-sm",
    ink: dark ? "text-white" : "text-gray-900",
    muted: dark ? "text-gray-400" : "text-gray-500",
    label: dark ? "block text-sm font-medium text-gray-300 mb-1" : "block text-sm font-medium text-gray-700 mb-1",
    input: dark
      ? "w-full px-3 py-2.5 bg-white/5 border border-white/15 rounded text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/30"
      : "w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500",
    choice: (on) =>
      `flex cursor-pointer items-start gap-3 rounded border px-4 py-3 transition-colors ${dark ? "bg-white/5" : ""} ${
        on ? "" : dark ? "border-white/15 hover:border-white/30" : "border-gray-300 hover:border-gray-400"
      }`,
    primaryBtn: "w-full py-3 font-semibold text-sm rounded transition-opacity hover:opacity-90 active:opacity-80 flex items-center justify-center gap-2 disabled:opacity-50",
    heading: `text-lg font-bold ${dark ? "text-white" : "text-gray-900"}`,
    error: "rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700",
  };
}
