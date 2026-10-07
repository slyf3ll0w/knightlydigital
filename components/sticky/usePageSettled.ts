"use client";

import { useEffect, useState, type RefObject } from "react";

// The page entrances in app/globals.css run 0.28–0.32 s; notes land just after
const AFTER_ENTRANCE_MS = 380;
// Never hold notes back longer than this, whatever the page is doing
const MAX_WAIT_MS = 5000;
// Route loading skeletons (loading.tsx / ListPageSkeleton) pulse at the top
// of the template wrapper, or one level in (the message thread)
const SKELETON = ":scope > div:not([data-notes-skip]) > .animate-pulse, :scope > div:not([data-notes-skip]) > div > .animate-pulse";

/**
 * False from each navigation until the new page has actually drawn: its
 * loading skeleton is gone and its entrance animation has played. Sticky
 * notes live in the shell, so without this they'd show up on top of the
 * skeleton before the page they belong to (David 2026-10-07).
 */
export function usePageSettled(mainRef: RefObject<HTMLElement | null>, page: string, active: boolean): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    setSettled(false);
    const main = mainRef.current;
    if (!main || !active) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      obs.disconnect();
      setSettled(true);
    };
    const check = () => {
      if (main.querySelector(SKELETON)) {
        if (timer) clearTimeout(timer);
        timer = null;
      } else if (!timer) {
        timer = setTimeout(finish, AFTER_ENTRANCE_MS);
      }
    };
    const obs = new MutationObserver(check);
    obs.observe(main, { childList: true, subtree: true });
    check();
    const cap = setTimeout(finish, MAX_WAIT_MS);
    return () => {
      done = true;
      obs.disconnect();
      if (timer) clearTimeout(timer);
      clearTimeout(cap);
    };
  }, [mainRef, page, active]);
  return settled;
}
