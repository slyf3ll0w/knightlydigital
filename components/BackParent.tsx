"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

/**
 * A page's own answer to "where is up?" when the route alone can't say —
 * a lead and a client share /app/contacts/[id], but a lead's list is the
 * Leads board (David 2026-10-06: Back on a lead landed on Clients).
 *
 * The page renders <BackParent to="/app/leads" />; AppShell's phone back
 * pill reads it through useBackParent() whenever it has no real page to go
 * back to (a notification tap, a deep link, a reload). Desktop pages pass
 * the same target to their BackLink.
 */
let current: { path: string; to: string } | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export default function BackParent({ to }: { to: string }) {
  const path = usePathname();
  useEffect(() => {
    const mine = { path, to };
    current = mine;
    emit();
    return () => {
      if (current === mine) {
        current = null;
        emit();
      }
    };
  }, [path, to]);
  return null;
}

/** The parent the page on `pathname` declared, or null. */
export function useBackParent(pathname: string): string | null {
  const v = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null
  );
  return v && v.path === pathname ? v.to : null;
}
