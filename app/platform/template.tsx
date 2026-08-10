"use client";

import { usePathname } from "next/navigation";

/**
 * Re-mounts on every navigation (unlike layout), giving each page a quick
 * entrance. The variant is keyed to the section so navigation has texture —
 * lists sweep in from the right, the schedule settles into place, everything
 * else rises — while staying subtle enough to never slow anyone down.
 * Animations are from-only with no fill mode, so once they end there's no
 * lingering transform to break fixed/sticky descendants.
 */

// First path segment after /app → entrance flavor. Anything unlisted rises.
const SECTION_ANIM: Record<string, string> = {
  // Entity lists and their detail pages — sweep in from the right
  contacts: "page-enter-sweep",
  leads: "page-enter-sweep",
  requests: "page-enter-sweep",
  quotes: "page-enter-sweep",
  jobs: "page-enter-sweep",
  invoices: "page-enter-sweep",
  subscriptions: "page-enter-sweep",
  payments: "page-enter-sweep",
  contracts: "page-enter-sweep",
  expenses: "page-enter-sweep",
  // Big canvases — settle from a slight zoom
  schedule: "page-enter-settle",
  insights: "page-enter-settle",
  chat: "page-enter-settle",
};

// Mobile gets iOS stack semantics on top of the section flavors: going
// deeper in a section slides in from the right (push), coming back slides
// in from the left (pop). Tab-style jumps between sections keep the section
// entrance. The classes only exist under lg (globals.css), so desktop is
// untouched. Module-level so it survives template re-mounts; the memo of the
// last decision absorbs dev double-renders.
let prevPath: string | null = null;
let lastStack = "";

function stackDirection(pathname: string): string {
  if (prevPath === pathname) return lastStack;
  const prev = prevPath;
  prevPath = pathname;
  const depth = pathname.split("/").length; // "/app/jobs" = 3, "/app/jobs/id" = 4
  lastStack = "";
  if (prev) {
    if (prev.startsWith(pathname + "/")) lastStack = "page-pop"; // up to an ancestor
    else if (pathname.startsWith(prev + "/")) lastStack = "page-push"; // down into it
    else if (depth > 3) lastStack = "page-push"; // cross-section into a detail page
    else if (prev.split("/").length > 3) lastStack = "page-pop"; // detail out to a list
  }
  return lastStack;
}

export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const section = pathname.split("/")[2] ?? "";
  const stack = stackDirection(pathname);
  // Chat scrolls its message pane internally (iMessage-style) instead of the
  // page — its h-full chain needs this wrapper to pass <main>'s height down.
  const fill = section === "chat" ? " h-full" : "";
  return (
    <div className={`${SECTION_ANIM[section] ?? "page-enter-rise"} ${stack}${fill}`.trim()}>
      {children}
    </div>
  );
}
