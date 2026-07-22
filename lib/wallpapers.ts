// App wallpaper options (Company.wallpaper) — the subtle backdrop behind
// every app page. The logo keys are the oversized brand mark (need an
// uploaded logo): "logo" is tilted 45°, "logo-straight" sits upright. The
// pattern keys map to the .wp-* classes in globals.css.
export const WALLPAPER_PATTERNS = ["grid", "dots"] as const;
export type WallpaperPattern = (typeof WALLPAPER_PATTERNS)[number];

export const WALLPAPERS = ["none", "logo", "logo-straight", ...WALLPAPER_PATTERNS] as const;
export type Wallpaper = (typeof WALLPAPERS)[number];

export function isWallpaper(v: unknown): v is Wallpaper {
  return typeof v === "string" && (WALLPAPERS as readonly string[]).includes(v);
}

// Tenants from before the picker only have the legacy logoWallpaper boolean;
// a null/unknown wallpaper (including the retired blueprint/topo/pinstripe
// patterns) defers to it.
export function resolveWallpaper(
  wallpaper: string | null | undefined,
  logoWallpaper: boolean
): Wallpaper {
  if (isWallpaper(wallpaper)) return wallpaper;
  return logoWallpaper ? "logo" : "none";
}
