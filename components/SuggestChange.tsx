"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Check, ImagePlus, Loader2, MousePointerClick, RotateCcw, Wand2, X } from "lucide-react";
import { hapticImpact } from "@/lib/haptics";
import type { ChangeCapture, ChangeKind, ChangePage, ChangeTarget, DiagError, DiagRequest } from "@/lib/change-request";
import { KIND_LABEL, describeTarget, shortTicketId } from "@/lib/change-request";

/**
 * "Suggest a change" — mounted by the platform layout for test accounts
 * (Company.isTest). The More sheet / user menu fire SUGGEST_CHANGE_EVENT;
 * the page goes into pick mode (tap the thing you mean, or "Whole page"),
 * the screen is rendered to a picture with the pick boxed in red, and a
 * bottom sheet takes the one-line note. Everything else — the element's
 * HTML, the route, viewport, device, the pages visited before, console
 * errors and failed requests from the last few minutes — is gathered here
 * and posted to /api/app/feedback/change. Rendering the ticket text is
 * lib/change-request.ts; the console shows the picture; scripts/ticket.mts
 * pulls it all for Claude.
 *
 * Every node this component renders carries `data-wb-suggest`, which the
 * picker ignores and the screenshot filters out.
 */

export const SUGGEST_CHANGE_EVENT = "wb:suggest-change";
/** From a quick menu's "Suggest a change" row (components/QuickMenu.tsx): start on that element, no pick mode. */
export const SUGGEST_CHANGE_HERE_EVENT = "wb:suggest-change-here";
export type SuggestHereDetail = { target?: Element | null; x: number; y: number };

// ── The gesture (2026-10-24): press-and-hold on a phone, right-click at a desk ──
// Either one starts the flow on the thing under the finger / pointer, no
// menu first. Elements that own that gesture already (QuickMenu rows and nav
// items carry a quick menu) keep it — their menu gets a "Suggest a change"
// row instead — and typing fields keep the browser's own menu and selection.
const HOLD_MS = 450;
const HOLD_MOVE_PX = 10;
const OWNS_GESTURE = "[data-holds], [role=menu], [data-wb-suggest]";
const EDITABLE = "input, textarea, select, [contenteditable=''], [contenteditable=true]";

// ── Diagnostics ring — installed once per page load ──────────────────────────
const RING = 40;
const DIAG_WINDOW_MS = 5 * 60_000;
const SKIP_REQ = /^\/api\/app\/(presence|telemetry|nav-counts|notifications|softphone|offline)/;

type Stamped<T> = T & { t: number };
const errors: Stamped<DiagError>[] = [];
const requests: Stamped<DiagRequest>[] = [];
const visited: string[] = [];
let installed = false;

function push<T>(list: T[], item: T, max = RING) {
  list.push(item);
  if (list.length > max) list.shift();
}
function clock(): string {
  return new Date().toISOString().slice(11, 19);
}
function fmt(v: unknown): string {
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

function installDiagnostics() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (e) => {
    const where = e.filename ? ` (${e.filename.split("/").pop()}:${e.lineno})` : "";
    push(errors, { t: Date.now(), at: clock(), kind: "error", message: `${e.message}${where}`.slice(0, 600) });
  });
  window.addEventListener("unhandledrejection", (e) => {
    push(errors, { t: Date.now(), at: clock(), kind: "rejection", message: fmt(e.reason).slice(0, 600) });
  });
  const originalError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    push(errors, { t: Date.now(), at: clock(), kind: "console", message: args.map(fmt).join(" ").slice(0, 600) });
    originalError(...args);
  };

  // Failed same-origin requests. Chains with whatever already wrapped fetch
  // (AppShell's nav recount hook) — each wrapper calls the one before it.
  const originalFetch = window.fetch;
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    const started = performance.now();
    const pending = originalFetch.call(window, input, init);
    try {
      const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(raw, window.location.href);
      if (url.origin === window.location.origin && !SKIP_REQ.test(url.pathname)) {
        const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        const path = `${url.pathname}${url.search}`.slice(0, 300);
        const ms = () => Math.round(performance.now() - started);
        pending.then(
          (r) => {
            if (r.status >= 400) push(requests, { t: Date.now(), at: clock(), method, url: path, status: r.status, ms: ms() });
          },
          (err) => push(requests, { t: Date.now(), at: clock(), method, url: path, status: fmt(err).slice(0, 60) || "failed", ms: ms() })
        );
      }
    } catch {
      // never let the watcher break a request
    }
    return pending;
  } as typeof window.fetch;
}

function recent<T extends { t: number }>(list: T[]): Omit<T, "t">[] {
  const since = Date.now() - DIAG_WINDOW_MS;
  return list.filter((e) => e.t >= since).map(({ t: _t, ...rest }) => rest);
}

// ── What we know about the page and the element ──────────────────────────────
function pageInfo(): ChangePage {
  const nav = navigator as Navigator & { standalone?: boolean; userAgentData?: { platform?: string } };
  const osDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const htmlClass = document.documentElement.className.trim();
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true || /WorkBench|Capacitor/i.test(navigator.userAgent);
  return {
    url: location.href,
    title: document.title,
    history: visited.slice(0, -1).slice(-8),
    viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 },
    theme: `${osDark ? "dark" : "light"}${htmlClass ? ` (html.${htmlClass.split(/\s+/).join(".")})` : ""}`,
    ua: navigator.userAgent,
    platform: nav.userAgentData?.platform || navigator.platform || "",
    standalone,
    lang: navigator.language,
    online: navigator.onLine,
  };
}

const ATTRS = ["id", "role", "aria-label", "title", "placeholder", "name", "href", "type", "alt", "for", "data-testid"];
const INTERACTIVE = "button, a, [role=button], input, select, textarea, label, summary, [role=tab], [role=menuitem], [role=option]";

function describeEl(el: Element): string {
  const cls = (el.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean).slice(0, 3).join(".");
  return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${cls ? `.${cls}` : ""}`;
}

function stripHtml(html: string): string {
  return html
    .replace(/\sd="[^"]{40,}"/g, ' d="…"')
    .replace(/(src|href|srcset)="data:[^"]{20,}"/g, '$1="data:…"')
    .replace(/\s{2,}/g, " ")
    .replace(/>\s+</g, "><");
}

/** The element the user meant: an icon or label inside a control is the control. */
function pickTarget(raw: Element): Element {
  let el: Element = raw;
  // svg internals have no useful HTML of their own
  while (el.namespaceURI === "http://www.w3.org/2000/svg" && el.parentElement) el = el.parentElement;
  const control = el.closest(INTERACTIVE);
  if (control && control !== el) {
    const r = control.getBoundingClientRect();
    if (r.width * r.height < window.innerWidth * window.innerHeight * 0.25) el = control;
  }
  return el;
}

function targetInfo(el: Element): ChangeTarget {
  const r = el.getBoundingClientRect();
  const attrs: Record<string, string> = {};
  for (const name of ATTRS) {
    const v = el.getAttribute(name);
    if (v) attrs[name] = v.slice(0, 300);
  }
  for (const a of Array.from(el.attributes)) {
    if (a.name.startsWith("data-") && !(a.name in attrs) && Object.keys(attrs).length < 20) attrs[a.name] = a.value.slice(0, 120);
  }
  const chain: string[] = [];
  let p: Element | null = el;
  for (let depth = 0; p && p !== document.body && depth < 8; depth++) {
    chain.unshift(describeEl(p));
    p = p.parentElement;
  }
  let html = stripHtml(el.outerHTML);
  if (html.length > 3800) html = `${html.slice(0, 3800)}…`;
  const text = ((el as HTMLElement).innerText ?? el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 200);
  return {
    tag: el.tagName.toLowerCase(),
    text,
    classes: (el.getAttribute("class") || "").slice(0, 600),
    attrs,
    path: chain.join(" > "),
    html,
    rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
  };
}

// ── The picture ──────────────────────────────────────────────────────────────
/**
 * html-to-image clones the DOM and copies computed styles, but a clone's
 * scroll position is always 0 — an inner scroll pane (the app's <main>) would
 * render from its top. For the capture, every scrolled pane is set to 0 and
 * its children translated up by the same amount, which looks identical on
 * screen and renders right in the clone. Undone the moment the picture is
 * taken. The window's own scroll is handled with a transform on the root.
 */
function freezeScroll(): () => void {
  const undo: (() => void)[] = [];
  const root = document.documentElement;
  for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
    if (el === root || el === document.body || el.hasAttribute("data-wb-suggest")) continue;
    const top = el.scrollTop;
    const left = el.scrollLeft;
    if (!top && !left) continue;
    const kids = Array.from(el.children).filter((k): k is HTMLElement => k instanceof HTMLElement);
    const prevTransforms = kids.map((k) => k.style.transform);
    const prevBehavior = el.style.scrollBehavior;
    el.style.scrollBehavior = "auto";
    kids.forEach((k, i) => {
      k.style.transform = `translate(${-left}px, ${-top}px)${prevTransforms[i] ? ` ${prevTransforms[i]}` : ""}`;
    });
    el.scrollTop = 0;
    el.scrollLeft = 0;
    undo.push(() => {
      kids.forEach((k, i) => {
        k.style.transform = prevTransforms[i];
      });
      el.scrollTop = top;
      el.scrollLeft = left;
      el.style.scrollBehavior = prevBehavior;
    });
  }
  return () => {
    for (const fn of undo.reverse()) fn();
  };
}

const MAX_DATA_URL = 3_500_000; // ~2.6 MB of PNG; past that the picture goes out as JPEG

/**
 * The keyboard goes away before the picture is taken. A flow started while
 * a field had focus (the chat composer) would otherwise shoot a viewport
 * squashed to the space above the keyboard (ticket #56msow: 402×539 on an
 * iPhone) and then keep the keyboard bouncing through the sheet. Blur the
 * field, then wait for the shell's kb-open flag to drop and the viewport
 * height to hold still — at most ~700 ms, usually far less.
 */
async function settleKeyboard(): Promise<void> {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.matches(EDITABLE) && !active.closest("[data-wb-suggest]")) active.blur();
  const height = () => Math.round(window.visualViewport?.height ?? window.innerHeight);
  const deadline = Date.now() + 700;
  let last = height();
  let still = 0;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
    const now = height();
    const open = document.documentElement.classList.contains("kb-open");
    still = now === last && !open ? still + 1 : 0;
    last = now;
    if (still >= 2) return;
  }
}

async function renderPage(target: Element | null): Promise<string> {
  const { toCanvas } = await import("html-to-image");
  const pr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  const restore = freezeScroll();
  let canvas: HTMLCanvasElement;
  try {
    canvas = await toCanvas(document.documentElement, {
      width: w,
      height: h,
      pixelRatio: pr,
      style: { transform: `translate(${-window.scrollX}px, ${-window.scrollY}px)`, transformOrigin: "top left" },
      filter: (n: Node) => !(n instanceof Element && n.hasAttribute("data-wb-suggest")),
      backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
      cacheBust: false,
      // A picture the library can't fetch (an expired chat photo, a host
      // without CORS) is left blank — without this handler one such <img>
      // rejected the whole render (ticket #56msow).
      onImageErrorHandler: () => undefined,
    });
  } finally {
    restore();
  }
  if (target) {
    const r = target.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 3 * pr;
      ctx.strokeRect((r.left - 4) * pr, (r.top - 4) * pr, (r.width + 8) * pr, (r.height + 8) * pr);
    }
  }
  const png = canvas.toDataURL("image/png");
  return png.length > MAX_DATA_URL ? canvas.toDataURL("image/jpeg", 0.85) : png;
}

/** A screenshot the user took themselves: downscaled so it posts quickly. */
function readOwnPicture(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      const ctx = c.getContext("2d");
      if (!ctx) return reject(new Error("canvas"));
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const png = c.toDataURL("image/png");
      resolve(png.length > MAX_DATA_URL ? c.toDataURL("image/jpeg", 0.85) : png);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file isn't a picture we can read."));
    };
    img.src = url;
  });
}

// ── Component ────────────────────────────────────────────────────────────────
type Phase = "idle" | "pick" | "shoot" | "compose" | "sending" | "sent";
type Rect = { x: number; y: number; w: number; h: number };

export default function SuggestChange() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");
  const [hover, setHover] = useState<Rect | null>(null);
  const [target, setTarget] = useState<ChangeTarget | null>(null);
  const targetEl = useRef<Element | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [shotKind, setShotKind] = useState<ChangeCapture["shot"]>("none");
  const [shotError, setShotError] = useState("");
  const [kind, setKind] = useState<ChangeKind>("looks");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [sentId, setSentId] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  // A hold that started the flow must not also fire the row's tap when the
  // finger lifts (phones rarely send that click, but when they do it opens
  // whatever was under the finger). Refs: the gesture effect below is torn
  // down the moment the phase changes, these outlive it.
  const heldRef = useRef(false);
  const swallowUntil = useRef(0);

  useEffect(installDiagnostics, []);
  // Tells the CSS (globals.css: no text selection / iOS callout under a
  // hold) and QuickMenu (adds its row) that the feature is on for this account.
  useEffect(() => {
    document.documentElement.dataset.suggestChanges = "1";
    return () => {
      delete document.documentElement.dataset.suggestChanges;
    };
  }, []);
  useEffect(() => {
    if (pathname && visited[visited.length - 1] !== pathname) push(visited, pathname, 12);
  }, [pathname]);

  const reset = useCallback(() => {
    setPhase("idle");
    setHover(null);
    setTarget(null);
    targetEl.current = null;
    setShot(null);
    setShotKind("none");
    setShotError("");
    setNote("");
    setError("");
    setSentId("");
  }, []);

  // The More sheet / user menu say "go"
  useEffect(() => {
    const start = () => {
      reset();
      // Pick mode over a page with the keyboard up is cramped; close it first
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.matches(EDITABLE)) active.blur();
      setPhase("pick");
    };
    window.addEventListener(SUGGEST_CHANGE_EVENT, start);
    return () => window.removeEventListener(SUGGEST_CHANGE_EVENT, start);
  }, [reset]);

  const choose = useCallback(async (el: Element | null) => {
    hapticImpact("MEDIUM");
    targetEl.current = el;
    setTarget(el ? targetInfo(el) : null);
    setHover(null);
    setPhase("shoot");
    setShotError("");
    try {
      // The keyboard goes down, then React drops the pick overlay, then the clone is taken
      await settleKeyboard();
      await new Promise((r) => setTimeout(r, 30));
      setShot(await renderPage(el));
      setShotKind("auto");
    } catch (err) {
      // console.error lands in the diagnostics ring too, so the ticket says why
      console.error("[suggest-change] picture failed", err);
      setShot(null);
      setShotKind("none");
      setShotError(err instanceof Error ? `${err.name}: ${err.message}` : String(err ?? "unknown"));
    }
    setPhase("compose");
  }, []);

  // A quick menu's "Suggest a change" row: the menu closes (300 ms sheet
  // exit), then the row it was opened on is the pick.
  useEffect(() => {
    const onHere = (e: Event) => {
      const d = (e as CustomEvent<SuggestHereDetail>).detail;
      reset();
      setPhase("shoot");
      window.setTimeout(() => {
        const fromPoint = document.elementFromPoint(d.x, d.y);
        const el =
          d.target && d.target.isConnected
            ? d.target
            : fromPoint && !fromPoint.closest("[data-wb-suggest], [role=dialog]")
              ? fromPoint
              : null;
        void choose(el ? pickTarget(el) : null);
      }, 380);
    };
    window.addEventListener(SUGGEST_CHANGE_HERE_EVENT, onHere);
    return () => window.removeEventListener(SUGGEST_CHANGE_HERE_EVENT, onHere);
  }, [reset, choose]);

  // The echo guard for a hold (see heldRef) — always on
  useEffect(() => {
    const onTouchEnd = () => {
      if (heldRef.current) {
        heldRef.current = false;
        swallowUntil.current = Date.now() + 600;
      }
    };
    const onClick = (e: MouseEvent) => {
      if (!swallowUntil.current) return;
      const fresh = Date.now() < swallowUntil.current;
      swallowUntil.current = 0;
      if (!fresh) return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener("touchend", onTouchEnd, true);
    document.addEventListener("touchcancel", onTouchEnd, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("touchend", onTouchEnd, true);
      document.removeEventListener("touchcancel", onTouchEnd, true);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  // The gesture: right-click, or hold still for HOLD_MS. Only while idle.
  useEffect(() => {
    if (phase !== "idle") return;
    let timer: number | null = null;
    let start: { x: number; y: number; target: Element } | null = null;
    let lastTouchAt = 0;
    const clear = () => {
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
    };
    const skip = (t: EventTarget | null) => !(t instanceof Element) || !!t.closest(OWNS_GESTURE) || !!t.closest(EDITABLE);

    const onContextMenu = (e: MouseEvent) => {
      // A quick menu claimed it (RowActions calls preventDefault first) —
      // its menu carries the "Suggest a change" row.
      if (e.defaultPrevented) return;
      // Android fires contextmenu for a long press too: the hold timer owns
      // that one, this just keeps the browser's own menu from opening.
      if (Date.now() - lastTouchAt < 1000) {
        e.preventDefault();
        return;
      }
      // Shift + right-click keeps the browser's menu (inspect, copy link)
      if (e.shiftKey || skip(e.target)) return;
      e.preventDefault();
      void choose(pickTarget(e.target as Element));
    };
    const onTouchStart = (e: TouchEvent) => {
      lastTouchAt = Date.now();
      clear();
      const t = e.touches[0];
      if (!t || e.touches.length > 1 || skip(e.target)) return;
      start = { x: t.clientX, y: t.clientY, target: e.target as Element };
      timer = window.setTimeout(() => {
        timer = null;
        if (!start) return;
        heldRef.current = true;
        hapticImpact("MEDIUM");
        const el = document.elementFromPoint(start.x, start.y) ?? start.target;
        void choose(pickTarget(el));
      }, HOLD_MS);
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!timer || !start || !t) return;
      if (e.touches.length > 1 || Math.hypot(t.clientX - start.x, t.clientY - start.y) > HOLD_MOVE_PX) clear();
    };
    const onTouchEnd = () => {
      clear();
      start = null;
    };
    // bubble phase on window: React's own contextmenu handlers (QuickMenu) run first
    window.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true, capture: true });
    document.addEventListener("touchend", onTouchEnd, true);
    document.addEventListener("touchcancel", onTouchEnd, true);
    return () => {
      clear();
      window.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("touchstart", onTouchStart, { capture: true });
      document.removeEventListener("touchmove", onTouchMove, { capture: true });
      document.removeEventListener("touchend", onTouchEnd, true);
      document.removeEventListener("touchcancel", onTouchEnd, true);
    };
  }, [phase, choose]);

  // Pick mode: the page is frozen — every press is a pick, nothing fires
  useEffect(() => {
    if (phase !== "pick") return;
    const ours = (t: EventTarget | null) => t instanceof Element && !!t.closest("[data-wb-suggest]");
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || ours(el)) return setHover(null);
      const r = pickTarget(el).getBoundingClientRect();
      setHover({ x: r.left, y: r.top, w: r.width, h: r.height });
    };
    const block = (e: Event) => {
      if (ours(e.target)) return;
      e.stopPropagation();
      if (e.type === "mousedown" || e.type === "contextmenu") e.preventDefault();
    };
    const onClick = (e: MouseEvent) => {
      if (ours(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (el && !ours(el)) void choose(pickTarget(el));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        reset();
      }
    };
    const blocked = ["pointerdown", "mousedown", "pointerup", "mouseup", "touchstart", "touchend", "contextmenu"] as const;
    document.addEventListener("pointermove", onMove, true);
    for (const t of blocked) document.addEventListener(t, block, { capture: true, passive: t.startsWith("touch") });
    document.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointermove", onMove, true);
      for (const t of blocked) document.removeEventListener(t, block, { capture: true });
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [phase, choose, reset]);

  async function onOwnPicture(file: File | undefined) {
    if (!file) return;
    try {
      setShot(await readOwnPicture(file));
      setShotKind("own");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that picture.");
    }
  }

  async function send() {
    const text = note.trim();
    if (!text) return;
    setPhase("sending");
    setError("");
    const capture: ChangeCapture = {
      kind,
      target,
      page: pageInfo(),
      diag: { errors: recent(errors), requests: recent(requests) },
      shot: shot ? shotKind : "none",
      ...(shotError ? { shotError: shotError.slice(0, 300) } : {}),
      capturedAt: new Date().toISOString(),
    };
    try {
      const res = await fetch("/api/app/feedback/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: text, capture, screenshot: shot }),
      });
      const data = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res.ok || !data?.id) {
        setError(data?.error ?? "Couldn't send that — try again.");
        setPhase("compose");
        return;
      }
      hapticImpact("MEDIUM");
      setSentId(data.id);
      setPhase("sent");
    } catch {
      setError("No connection — try again in a moment.");
      setPhase("compose");
    }
  }

  if (phase === "idle") return null;

  const coarse = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

  if (phase === "pick") {
    return (
      <div data-wb-suggest="" className="pointer-events-none fixed inset-0 z-[10000]" aria-live="polite">
        {hover && (
          <div
            className="absolute rounded-md border-2 border-red-500 bg-red-500/10 transition-all duration-75"
            style={{ left: hover.x - 3, top: hover.y - 3, width: hover.w + 6, height: hover.h + 6 }}
          />
        )}
        <div className="absolute inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] flex justify-center px-3">
          <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-gray-200 bg-white/95 py-1.5 pl-3 pr-1.5 text-[13px] font-semibold text-gray-900 shadow-xl backdrop-blur">
            <MousePointerClick size={15} className="shrink-0 text-red-500" />
            <span className="truncate">{coarse ? "Tap what you want changed" : "Click what you want changed"}</span>
            <button
              type="button"
              onClick={() => void choose(null)}
              className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-[12px] font-semibold text-gray-700 hover:bg-gray-200"
            >
              Whole page
            </button>
            <button
              type="button"
              onClick={reset}
              aria-label="Cancel"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "shoot") {
    return (
      <div data-wb-suggest="" className="pointer-events-none fixed inset-0 z-[10000] flex items-start justify-center pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white/95 px-3 py-1.5 text-[13px] font-semibold text-gray-900 shadow-xl">
          <Loader2 size={15} className="animate-spin text-gray-500" />
          Taking a picture…
        </div>
      </div>
    );
  }

  // compose / sending / sent — the sheet
  const sending = phase === "sending";
  return (
    <div data-wb-suggest="" className="fixed inset-0 z-[10000] flex flex-col justify-end sm:items-center sm:justify-center" role="dialog" aria-label="Suggest a change">
      <div className="absolute inset-0 bg-black/30" onClick={phase === "sent" ? reset : undefined} />
      <div className="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border-t border-gray-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl sm:max-w-md sm:rounded-2xl sm:border">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-[15px] font-bold text-gray-900">Suggest a change</p>
            <p className="mt-0.5 text-[12px] leading-snug text-gray-500">
              A picture of this screen, the thing you picked and the page details go with your note — nothing to explain.
              {coarse ? " Next time: press and hold anything." : " Next time: right-click anything."}
            </p>
          </div>
          <button
            type="button"
            onClick={reset}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
          >
            <X size={16} />
          </button>
        </div>

        {phase === "sent" ? (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-green-50 px-3 py-3 text-[13px] font-semibold text-green-800">
            <Check size={16} />
            Sent — thanks. Ticket #{shortTicketId(sentId)}.
          </div>
        ) : (
          <>
            {/* What was picked */}
            <div className="mt-3 flex items-center gap-2 text-[12.5px] text-gray-700">
              <MousePointerClick size={14} className="shrink-0 text-red-500" />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-semibold">{target ? "Picked:" : "Whole page"}</span> {target ? describeTarget(target) : ""}
              </span>
              <button
                type="button"
                onClick={() => {
                  setPhase("pick");
                  setShot(null);
                  setShotKind("none");
                }}
                disabled={sending}
                className="flex shrink-0 items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-[12px] font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-40"
              >
                <RotateCcw size={12} />
                Pick again
              </button>
            </div>

            {/* The picture */}
            {shot ? (
              <div className="mt-3">
                <img src={shot} alt="This screen" className="max-h-44 w-full rounded-xl border border-gray-200 bg-gray-50 object-contain" />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={sending} className="mt-1.5 text-[12px] font-semibold text-gray-500 hover:text-gray-900 disabled:opacity-40">
                  {shotKind === "own" ? "Use a different screenshot" : "Use my own screenshot instead"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={sending}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 px-3 py-3 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >
                <ImagePlus size={16} />
                No picture came out — add a screenshot
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void onOwnPicture(e.target.files?.[0]);
                e.target.value = "";
              }}
            />

            {/* Looks / works */}
            <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-gray-100 p-1" role="radiogroup" aria-label="What kind of change">
              {(Object.keys(KIND_LABEL) as ChangeKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => setKind(k)}
                  disabled={sending}
                  className={`rounded-lg px-2 py-1.5 text-[12.5px] font-semibold transition-colors ${kind === k ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
                >
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>

            <textarea
              // A desk gets the cursor; a phone would get the keyboard shoving
              // the sheet around before the picture is even seen — tap to type.
              autoFocus={!coarse}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={2000}
              disabled={sending}
              placeholder={target ? "What should change? e.g. “bigger”, “move it under the price”, “this should open the job”" : "What should change on this page?"}
              className="mt-3 w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-[14px] text-gray-900 outline-none focus:border-gray-400 disabled:opacity-60"
            />
            {error && <p className="mt-1 text-[12px] text-red-600">{error}</p>}
            <button
              type="button"
              onClick={() => void send()}
              disabled={!note.trim() || sending}
              className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-full text-[14px] font-semibold disabled:opacity-40"
              style={{ background: "var(--wb-accent, #0b57d8)", color: "var(--wb-on-accent, #ffffff)" }}
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={15} />}
              {sending ? "Sending…" : "Send"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
