"use client";

import { useCallback, useEffect, useState } from "react";
import { Navigation } from "lucide-react";
import { isApplePlatform } from "@/lib/messaging";
import { getCapacitor, nativePlatform } from "@/components/NativeShell";
import {
  NAV_APP_LABELS,
  isNavApp,
  navAppHref,
  navAppsFor,
  navHref,
  orderNavApps,
  type NavApp,
  type NavDestination,
} from "@/lib/nav-apps";

/**
 * "Directions" tap → pick Apple Maps, Google Maps or Waze → the app opens
 * with a route from the current location to the stop.
 *
 * Imperative like confirmSheet(): call `openDirections({ address })` from any
 * click handler; the host (mounted once in AppShell) presents an iOS-style
 * action sheet on phones and a small centered dialog on desktop. The options
 * are real anchors. On the web they carry each app's https directions link;
 * inside the native shell they carry the app's own URL scheme (lib/nav-apps.ts
 * navAppHref), which the OS hands straight to the installed app — no web
 * page or redirect in between (David 2026-10-19). If the app isn't there the
 * scheme does nothing, so after a moment with the shell still in front, the
 * https link opens in the system browser instead. The last pick is
 * remembered (localStorage) and listed first.
 *
 * Without a host (portal pages, marketing routes) it opens Google Maps
 * directions in a new tab, so call sites never care where they run.
 */

const LAST_APP_KEY = "wb-nav-app";

type Presenter = (dest: NavDestination) => void;
let presenter: Presenter | null = null;

export function openDirections(dest: NavDestination): void {
  if (typeof window === "undefined") return;
  if (presenter) {
    presenter(dest);
    return;
  }
  const href = navHref("google", dest);
  if (href) window.open(href, "_blank", "noopener,noreferrer");
}

function readLastApp(): NavApp | null {
  try {
    const v = window.localStorage.getItem(LAST_APP_KEY);
    return isNavApp(v) ? v : null;
  } catch {
    return null;
  }
}

function rememberApp(app: NavApp): void {
  try {
    window.localStorage.setItem(LAST_APP_KEY, app);
  } catch {
    /* private mode — forget it */
  }
}

export default function NavChooserHost() {
  const [dest, setDest] = useState<NavDestination | null>(null);
  const [open, setOpen] = useState(false); // drives the slide/fade transition
  const [apps, setApps] = useState<NavApp[]>([]);

  useEffect(() => {
    presenter = (d) => {
      setApps(orderNavApps(navAppsFor(isApplePlatform()), readLastApp()));
      setDest(d);
      setOpen(false);
      // Two frames so the closed position paints before the transition starts
      requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
    };
    return () => {
      presenter = null;
    };
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    window.setTimeout(() => setDest(null), 300);
  }, []);

  useEffect(() => {
    if (!dest) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dest, close]);

  if (!dest) return null;

  const where = (dest.address ?? "").trim();
  const accent = "var(--mobile-accent, #0B57D8)";
  const platform = nativePlatform() ?? "web";
  const options = apps
    .map((app) => ({ app, href: navAppHref(app, dest, platform) ?? navHref(app, dest), web: navHref(app, dest) }))
    .filter((o): o is { app: NavApp; href: string; web: string } => Boolean(o.href && o.web));

  const pick = (app: NavApp, e: React.MouseEvent<HTMLAnchorElement>) => {
    rememberApp(app);
    const opt = options.find((o) => o.app === app);
    if (platform !== "web" && opt && opt.href !== opt.web) {
      // The shell: hand the scheme to the OS ourselves (an anchor with
      // target=_blank would ask the webview for a new window instead)
      e.preventDefault();
      window.location.href = opt.href;
      // Apple Maps is always there. For the others, if the shell is still in
      // front after a moment the app isn't installed — use the web link. The
      // moment the shell loses focus or is hidden, the app took over and the
      // fallback is cancelled (an early timer here was itself a way to end up
      // on the website).
      if (app !== "apple") {
        let left = false;
        const gone = () => {
          left = true;
          cleanup();
        };
        const cleanup = () => {
          window.removeEventListener("blur", gone);
          window.removeEventListener("pagehide", gone);
          document.removeEventListener("visibilitychange", onVis);
        };
        const onVis = () => {
          if (document.visibilityState === "hidden") gone();
        };
        window.addEventListener("blur", gone);
        window.addEventListener("pagehide", gone);
        document.addEventListener("visibilitychange", onVis);
        window.setTimeout(() => {
          cleanup();
          if (left || document.visibilityState !== "visible") return;
          const Browser = getCapacitor()?.Plugins?.Browser;
          if (Browser?.open) Browser.open({ url: opt.web }).catch(() => window.open(opt.web, "_blank"));
          else window.open(opt.web, "_blank");
        }, 2500);
      }
    }
    // Let the anchor's own navigation happen (web), then dismiss
    window.setTimeout(close, 50);
  };

  return (
    // Same layer as ConfirmSheet (above the phone bottom sheets at z-70)
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Open directions in">
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
        style={{ touchAction: "none" }}
        onClick={close}
      />

      {/* Phone: iOS action sheet */}
      <div
        className={`absolute inset-x-0 bottom-0 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] transition-transform duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] lg:hidden ${
          /* open = NO transform so iOS renders the cards' backdrop blur */
          open ? "" : "translate-y-full"
        }`}
      >
        <div className="sheet-material overflow-hidden rounded-[14px]">
          <div className="px-4 pb-3.5 pt-4 text-center">
            <p className="text-[13px] font-semibold text-gray-500">Directions from where you are</p>
            {where && <p className="mx-auto mt-0.5 max-w-[34ch] truncate text-[13px] leading-snug text-gray-500">{where}</p>}
          </div>
          {options.map(({ app, href }) => (
            <a
              key={app}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => pick(app, e)}
              className="block w-full border-t sheet-hairline px-4 py-[15px] text-center text-[17px] active:bg-black/5"
              style={{ color: accent }}
            >
              {NAV_APP_LABELS[app]}
            </a>
          ))}
        </div>
        <div className="sheet-material mt-2 overflow-hidden rounded-[14px]">
          <button
            type="button"
            onClick={close}
            className="block w-full px-4 py-[15px] text-center text-[17px] font-semibold active:bg-black/5"
            style={{ color: accent }}
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Desktop: small centered dialog */}
      <div className="hidden lg:flex absolute inset-0 items-center justify-center p-4 pointer-events-none">
        <div
          className={`pointer-events-auto w-full max-w-xs rounded-2xl bg-white p-5 shadow-xl transition-all duration-200 ${
            open ? "scale-100 opacity-100" : "scale-95 opacity-0"
          }`}
        >
          <div className="flex items-center gap-2">
            <Navigation size={16} className="text-gray-500" />
            <p className="text-sm font-semibold text-gray-900">Get directions in</p>
          </div>
          {where && <p className="mt-1 truncate text-xs text-gray-500">{where}</p>}
          <div className="mt-4 space-y-2">
            {options.map(({ app, href }) => (
              <a
                key={app}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => pick(app, e)}
                className="block w-full rounded-[10px] border border-gray-200 px-3 py-2 text-center text-sm font-medium text-gray-900 hover:bg-gray-50"
              >
                {NAV_APP_LABELS[app]}
              </a>
            ))}
          </div>
          <button
            type="button"
            onClick={close}
            className="mt-3 block w-full rounded-[10px] px-3 py-2 text-center text-sm text-gray-500 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
