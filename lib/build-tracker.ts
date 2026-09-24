/**
 * Which estimate-tool build this browser is following (client only). The
 * builder (BuildPanel) records a build here the moment the server accepts
 * it; the app-wide progress bar (components/BuildProgressBar.tsx) reads it
 * and keeps polling the build wherever the person goes, so leaving the
 * Estimates page never means losing sight of the build. One entry at a
 * time — a newer build replaces the last. Cleared when the build lands,
 * fails, is cancelled or is dismissed.
 */

export type TrackedBuild = {
  /** EstimatorBuild row id */
  id: string;
  /** Set = a change to this tool; null = a new tool */
  estimatorId: string | null;
  /** What the bar calls it: the tool's name, or the first words of the request */
  label: string;
  /** The page that shows the build itself — the bar stays out of the way there */
  home: string;
  startedAt: number;
};

const KEY = "wb.estimateBuild";
export const BUILD_EVENT = "wb:estimate-build";

export function readTrackedBuild(): TrackedBuild | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<TrackedBuild>;
    if (typeof v.id !== "string" || typeof v.home !== "string") return null;
    return { id: v.id, estimatorId: typeof v.estimatorId === "string" ? v.estimatorId : null, label: typeof v.label === "string" ? v.label : "Estimate tool", home: v.home, startedAt: typeof v.startedAt === "number" ? v.startedAt : Date.now() };
  } catch {
    return null;
  }
}

function announce() {
  try {
    window.dispatchEvent(new CustomEvent(BUILD_EVENT));
  } catch {
    /* ignore */
  }
}

export function trackBuild(b: TrackedBuild): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(b));
  } catch {
    /* storage blocked — the bar just won't follow this build */
  }
  announce();
}

/** Forget the tracked build (only that one when `id` is given). */
export function untrackBuild(id?: string): void {
  try {
    if (id) {
      const cur = readTrackedBuild();
      if (cur && cur.id !== id) return;
    }
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  announce();
}
