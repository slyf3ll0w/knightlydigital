/**
 * Browser half of lead-source capture (rules: lib/lead-source.ts).
 *
 * A public form calls `getArrival()` when it submits and sends the result
 * as `arrival`. Two ways it is known:
 *
 *  - Inside an embed on the business's own website, public/embed.js read
 *    the visitor's first page there and posts it to the frame
 *    ("workbench:arrival"); `listenForArrival` (mounted by
 *    components/EmbedArrival.tsx) keeps the latest one.
 *  - On our hosted page (/book/<slug>…) opened directly, the page's own
 *    address and referrer are read once per tab and kept in sessionStorage,
 *    so a form two clicks into the menu still carries the tags.
 *
 * Client components only (touches window). Best effort throughout: blocked
 * storage or a missing message just means the lead keeps its door's name.
 */
import { ARRIVAL_PARAMS, sanitizeArrival, type Arrival } from "./lead-source";

const KEY = "wb_arrival";
let fromHost: Arrival | null = null;

function embedded(): boolean {
  try {
    return window.parent !== window;
  } catch {
    return true;
  }
}

/** Keep what the embedding page says about the visitor. Returns the un-listen function. */
export function listenForArrival(): () => void {
  if (typeof window === "undefined" || !embedded()) return () => undefined;
  const onMsg = (e: MessageEvent) => {
    // Only the page that embeds us may say (its origin can't be known up front, so the source window is the check)
    if (e.source !== window.parent) return;
    const d = e.data as { type?: string; arrival?: unknown } | null;
    if (!d || d.type !== "workbench:arrival") return;
    const a = sanitizeArrival(d.arrival);
    if (a) fromHost = { ...a, embedded: true };
  };
  window.addEventListener("message", onMsg);
  // embed.js answers a style request with the look AND the arrival; asking
  // covers a frame that hydrated after the loader's first post
  try {
    window.parent.postMessage({ type: "workbench:style-request" }, "*");
  } catch {
    /* ignore */
  }
  return () => window.removeEventListener("message", onMsg);
}

function readOwnPage(): Arrival | null {
  let saved: Arrival | null = null;
  try {
    saved = sanitizeArrival(JSON.parse(window.sessionStorage.getItem(KEY) || "null"));
  } catch {
    saved = null;
  }
  const fresh: Record<string, unknown> = { at: Date.now() };
  let tagged = false;
  try {
    const q = new URLSearchParams(window.location.search);
    for (const [param, field] of ARRIVAL_PARAMS) {
      const v = q.get(param)?.trim();
      if (v) {
        fresh[field] = v;
        tagged = true;
      }
    }
  } catch {
    /* ignore */
  }
  if (saved && !tagged) return saved;
  try {
    const ref = document.referrer ? new URL(document.referrer) : null;
    if (ref && /^https?:$/.test(ref.protocol) && ref.host !== window.location.host) fresh.referrer = ref.origin + ref.pathname;
  } catch {
    /* ignore */
  }
  fresh.landing = window.location.origin + window.location.pathname;
  const arrival = sanitizeArrival(fresh);
  try {
    if (arrival) window.sessionStorage.setItem(KEY, JSON.stringify(arrival));
  } catch {
    /* private mode */
  }
  return arrival;
}

/** How this visitor arrived, for the submit body. Undefined when nothing is known. */
export function getArrival(): Arrival | undefined {
  if (typeof window === "undefined") return undefined;
  if (embedded()) return fromHost ?? undefined;
  return readOwnPage() ?? undefined;
}
