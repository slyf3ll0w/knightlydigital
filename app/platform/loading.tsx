import { PagePlaceholder } from "@/components/ListSkeleton";

/**
 * The fallback skeleton for every /app page without its own loading.tsx
 * (settings, estimates, automations, business, chat, help…). Neutral on
 * purpose — it used to be dashboard-shaped (KPI tiles + a chart block) in
 * raw gray utilities, which looked wrong on every page but one and glowed
 * in dark mode.
 */
export default function PlatformLoading() {
  return <PagePlaceholder />;
}
