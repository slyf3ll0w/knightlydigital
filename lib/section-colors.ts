/**
 * Entity hues — the app's standardized color language. One hue per section,
 * used everywhere that section shows its face: nav icon tiles (AppShell),
 * the More/Create sheets, page-title tiles, active filter pills, KPI rules,
 * and empty-state art. Brand colors (Company.brandColor/Secondary) stay the
 * voice of buttons, links, and hero surfaces; these hues are the wayfinding.
 */
export const SECTION_HUES = {
  schedule: "#8B5CF6", // violet — appointments live here
  clients: "#3B82F6", // blue
  requests: "#F59E0B", // amber
  leads: "#84CC16", // lime — between request amber and quote green
  quotes: "#22C55E", // green
  jobs: "#F97316", // orange
  invoices: "#0EA5E9", // sky
  payments: "#14B8A6", // teal
  subscriptions: "#14B8A6", // teal, money family
  business: "#6366F1", // indigo
  services: "#EC4899", // pink
  contracts: "#A855F7", // purple
  chat: "#F43F5E", // rose
  forms: "#06B6D4", // cyan
  team: "#10B981", // emerald
} as const;

export type SectionKey = keyof typeof SECTION_HUES;
