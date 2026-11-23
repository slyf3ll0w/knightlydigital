"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import Modal from "@/components/Modal";
import { SETTINGS_PARAM, normalizeSettingsSection, settingsPopupHref } from "@/lib/settings-nav";
import type { SettingsView } from "@/lib/settings-view";

// The settings screen is big; load it only when the pop-up first opens, so
// it doesn't ride in every page's shell bundle.
const SettingsClient = dynamic(() => import("@/app/platform/settings/SettingsClient"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[240px] items-center justify-center">
      <Loader2 size={22} className="animate-spin text-[color:var(--ds-muted)]" aria-label="Loading settings" />
    </div>
  ),
});

/**
 * Settings as a POP-UP over whatever page you're on (David, 2026-11-21).
 *
 * Open state is the URL: `?settings=<group>` on any /app page (`open` = the
 * index on phones / Business on desktop). So Back closes it, a reload keeps
 * it, and a link can point at a group.
 *
 * Every in-app click on a link to /app/settings (sidebar, top bar gear, the
 * phone More sheet, Help and Atlas links rendered in the app) is caught here
 * and opens the pop-up over the current page instead of navigating. Anything
 * that still lands on the /app/settings route (an email, a typed URL)
 * redirects to Home with the pop-up open — app/platform/settings/page.tsx.
 *
 * Desktop: a large centered card. Phones: a full-height bottom sheet.
 * Managers only (the API answers 403 otherwise, and the pop-up stays shut).
 */
export default function SettingsPopup({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.get(SETTINGS_PARAM);
  const open = enabled && raw != null;

  const [view, setView] = useState<SettingsView | null>(null);
  // Opened by a click here (a history entry was pushed): closing steps Back,
  // so the browser's Back after closing doesn't land on the same page again.
  const pushedRef = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) pushedRef.current = false;
  }, [open]);

  // Load the settings when the pop-up opens; refetch on every open so a
  // change made elsewhere (Atlas, another tab) shows.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setError("");
    fetch("/api/app/settings/view", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 403 ? "Only owners and admins can change settings." : "Couldn't load settings.");
        return (await res.json()) as SettingsView;
      })
      .then((v) => alive && setView(v))
      .catch((e: Error) => alive && setError(e.message || "Couldn't load settings."));
    return () => {
      alive = false;
    };
  }, [open]);

  const close = useCallback(() => {
    if (pushedRef.current) {
      pushedRef.current = false;
      router.back();
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete(SETTINGS_PARAM);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  // Catch in-app links to /app/settings (exactly — /app/settings/<page>
  // sub-pages still navigate) and open the pop-up in place. Capture phase on
  // the document, so this runs before React's handlers.
  useEffect(() => {
    if (!enabled) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin || url.pathname.replace(/\/$/, "") !== "/app/settings") return;
      // Cancel the navigation but let the click carry on: Next <Link> skips
      // navigating when defaultPrevented, and a link's own onClick (the phone
      // More sheet closing itself) still runs.
      e.preventDefault();
      const key = normalizeSettingsSection(url.searchParams.get("s")) ?? "open";
      const alreadyOpen = new URLSearchParams(window.location.search).has(SETTINGS_PARAM);
      const href = settingsPopupHref(window.location.pathname, window.location.search, key);
      if (alreadyOpen) {
        router.replace(href, { scroll: false });
      } else {
        pushedRef.current = true;
        router.push(href, { scroll: false });
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [enabled, router]);

  return (
    <Modal open={open} onClose={close} cardClassName="modal-card-panel ds-settings-pop card-ledger w-full p-0">
      {view ? (
        <SettingsClient
          key={view.company.id}
          company={view.company}
          isOwner={view.isOwner}
          line={view.line}
          lastNumbers={view.lastNumbers}
          signInMethods={view.signInMethods}
          initialSection={raw === "open" ? undefined : (raw ?? undefined)}
          onClose={close}
        />
      ) : (
        <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 p-8 text-center">
          {error ? (
            <>
              <p className="text-[15px] font-semibold text-[color:var(--ds-ink)]">{error}</p>
              <button type="button" onClick={close} className="ds-btn ds-btn-outline ds-btn-sm">
                Close
              </button>
            </>
          ) : (
            <Loader2 size={22} className="animate-spin text-[color:var(--ds-muted)]" aria-label="Loading settings" />
          )}
        </div>
      )}
    </Modal>
  );
}
