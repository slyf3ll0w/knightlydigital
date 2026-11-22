import { redirect } from "next/navigation";
import { requirePageActor, isManager } from "@/lib/permissions";
import { normalizeSettingsSection, SETTINGS_PARAM } from "@/lib/settings-nav";

/**
 * Settings is a pop-up now (components/SettingsPopup.tsx, 2026-11-21): it
 * opens over whatever page you're on with `?settings=<group>`. In-app links
 * to /app/settings are caught on click and open it in place; this route is
 * for everything else that still points here — emails, Help, Atlas cards,
 * bookmarks, ⌘K, the Square connect callback — and lands on Home with the
 * pop-up open on the right group (old `?s=` keys mapped by
 * normalizeSettingsSection). Every other param (e.g. `square=<outcome>`,
 * read by the Online payments card) rides along.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageActor((a) => isManager(a.role));
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const key = normalizeSettingsSection(one(sp.s)) ?? (one(sp.square) ? "money" : "open");
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "s" || v === undefined) continue;
    for (const val of Array.isArray(v) ? v : [v]) params.append(k, val);
  }
  params.set(SETTINGS_PARAM, key);
  redirect(`/app/dashboard?${params.toString()}`);
}
