// App wallpaper options (Company.wallpaper) — the subtle backdrop behind
// every app page. "logo" is the oversized tilted brand mark (needs an
// uploaded logo); the pattern keys map to the .wp-* classes in globals.css.
export const WALLPAPER_PATTERNS = ["grid", "dots", "blueprint", "topo", "pinstripe"] as const;
export type WallpaperPattern = (typeof WALLPAPER_PATTERNS)[number];

export const WALLPAPERS = ["none", "logo", ...WALLPAPER_PATTERNS] as const;
export type Wallpaper = (typeof WALLPAPERS)[number];

export function isWallpaper(v: unknown): v is Wallpaper {
  return typeof v === "string" && (WALLPAPERS as readonly string[]).includes(v);
}

// Tenants from before the picker only have the legacy logoWallpaper boolean;
// a null/unknown wallpaper defers to it.
export function resolveWallpaper(
  wallpaper: string | null | undefined,
  logoWallpaper: boolean
): Wallpaper {
  if (isWallpaper(wallpaper)) return wallpaper;
  return logoWallpaper ? "logo" : "none";
}
