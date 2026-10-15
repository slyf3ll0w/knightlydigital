/**
 * Turn-by-turn links into the phone's navigation apps.
 *
 * Every "Directions" button used to open a Google Maps SEARCH link
 * (`/maps/search/?query=`), which drops a pin on the address and stops —
 * the tech then had to tap Directions inside Google Maps and pick a start.
 * These builders use each app's DIRECTIONS URL with the origin left out,
 * which every app reads as "from where I am right now", so one tap starts
 * the route from the truck. Pure — unit-tested in scripts/test-nav-apps.ts.
 *
 * Apple Maps only exists on Apple devices; Google Maps and Waze fall back to
 * their web pages where the app isn't installed, so they're offered everywhere.
 */

export type NavApp = "apple" | "google" | "waze";

export type NavDestination = {
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export const NAV_APP_LABELS: Record<NavApp, string> = {
  apple: "Apple Maps",
  google: "Google Maps",
  waze: "Waze",
};

export const ALL_NAV_APPS: readonly NavApp[] = ["apple", "google", "waze"] as const;

export function isNavApp(v: unknown): v is NavApp {
  return typeof v === "string" && (ALL_NAV_APPS as readonly string[]).includes(v);
}

/** The apps worth offering on this device. `apple` = iPhone/iPad/Mac. */
export function navAppsFor(apple: boolean): NavApp[] {
  return apple ? ["apple", "google", "waze"] : ["google", "waze"];
}

function hasCoords(d: NavDestination): d is { lat: number; lng: number; address?: string | null } {
  return typeof d.lat === "number" && typeof d.lng === "number" && Number.isFinite(d.lat) && Number.isFinite(d.lng);
}

/** What the maps app should route to: coordinates when known (no geocoding guess), else the address. */
export function navTarget(d: NavDestination): string | null {
  if (hasCoords(d)) return `${d.lat},${d.lng}`;
  const a = (d.address ?? "").trim();
  return a || null;
}

/**
 * Directions from the device's current location to the destination, in the
 * given app. Null when there's nothing to route to.
 */
export function navHref(app: NavApp, d: NavDestination): string | null {
  const target = navTarget(d);
  if (!target) return null;
  const enc = encodeURIComponent(target);
  switch (app) {
    case "apple":
      // No saddr = start from the current location
      return `https://maps.apple.com/?daddr=${enc}&dirflg=d`;
    case "google":
      // No origin = "the user's current location (when available)" per the Maps URLs API
      return `https://www.google.com/maps/dir/?api=1&destination=${enc}&travelmode=driving`;
    case "waze":
      // Waze always starts from the current location; ll is exact, q is a search
      return hasCoords(d)
        ? `https://waze.com/ul?ll=${d.lat},${d.lng}&navigate=yes`
        : `https://waze.com/ul?q=${enc}&navigate=yes`;
  }
}

/**
 * The one link to use where there's no room to ask (a push notification
 * action, a plain server-rendered anchor): Google's directions URL works on
 * every platform and starts from the current location.
 */
export function directionsHref(d: NavDestination): string | null {
  return navHref("google", d);
}

/** Order the offered apps with the last-used one first. */
export function orderNavApps(apps: NavApp[], lastUsed: NavApp | null): NavApp[] {
  if (!lastUsed || !apps.includes(lastUsed)) return apps;
  return [lastUsed, ...apps.filter((a) => a !== lastUsed)];
}
