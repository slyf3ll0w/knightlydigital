"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type * as Leaflet from "leaflet";
import type { Map as LeafletMap, Marker, LayerGroup, Polyline, CircleMarker } from "leaflet";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CornerDownRight,
  Crosshair,
  GripVertical,
  Inbox,
  Link2,
  Loader2,
  MapPin,
  Maximize2,
  Minus,
  Navigation,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Printer,
  Route as RouteIcon,
  Send,
  Wand2,
  X,
} from "lucide-react";
import Modal from "@/components/Modal";
import { hapticImpact } from "@/lib/haptics";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { localInputToISO } from "@/lib/statuses";
import { isApplePlatform } from "@/lib/messaging";
import { addBasemap, initialView, reducedMotion, rememberView } from "@/lib/basemap";
import { useMainFill } from "@/lib/use-main-fill";
import "leaflet/dist/leaflet.css";

/**
 * Routes — the schedule Day view on a map. Numbered pins in visit order,
 * one route per tech drawn along real roads (Mapbox Directions; dashed
 * straight lines when that's unavailable).
 *
 * The map IS the page (docs/plans/route-manager-facelift-2026-09-19.md):
 * quiet brand-tinted tiles from lib/basemap.ts, our own control cluster
 * instead of Leaflet's chrome, no speech bubbles — tapping a pin selects a
 * stop in the list and the list's own Open / Navigate buttons do the rest.
 * On desktop the stop list floats over the left edge of the map with a
 * collapse handle; on a phone it lives in a bottom sheet with peek / half /
 * full snap points. First paint is already framed on the company's day.
 *
 *  - Drag a stop's grip to reorder it inside a route (opens the Optimize
 *    preview with that order — nothing is written until Apply) or drop it on
 *    another tech's card to hand it over.
 *  - "Optimize" solves the order by drive time; the preview supports a
 *    "Day starts at" anchor, round trip back to base, and texting every
 *    client whose time changed on Apply.
 *  - Per stop: Navigate (Google Maps, Apple Maps on Apple devices). Per
 *    route: send the whole day to a phone as one multi-stop directions link,
 *    copy that link, or print the day sheet.
 *  - Managers see who's clocked in and where, refreshed every minute.
 */

/** Quick "Day starts at" presets for the Optimize preview. */
const ANCHOR_PRESETS: { value: string; label: string }[] = [
  { value: "07:00", label: "7 AM" },
  { value: "07:30", label: "7:30" },
  { value: "08:00", label: "8 AM" },
  { value: "08:30", label: "8:30" },
  { value: "09:00", label: "9 AM" },
  { value: "10:00", label: "10 AM" },
];

type RouteStop = {
  id: string;
  kind: "job" | "appointment" | "block";
  jobNumber: number | null;
  title: string;
  status: string;
  contactName: string;
  address: string | null;
  scheduledAt: string | null;
  scheduledEnd: string | null;
  scheduledAnytime: boolean;
  tentative: boolean;
  assigneeIds: string[];
  lat: number | null;
  lng: number | null;
};

type UnscheduledJob = {
  id: string;
  jobNumber: number;
  title: string;
  contactName: string;
  address: string | null;
  assigneeIds: string[];
  outsourced?: boolean; // subcontractor job — may go on the day with no crew
};

type Pin = { lat: number; lng: number; label: string };

type RouteDay = {
  enabled: boolean;
  start: Pin | null;
  memberStarts?: Record<string, Pin>;
  stops: RouteStop[];
  drive?: {
    legs: Record<string, Record<string, number>>;
    totals: Record<string, number>;
    km?: Record<string, Record<string, number>>;
    kmTotals?: Record<string, number>;
    measured?: boolean;
  };
  unscheduled?: UnscheduledJob[];
  /** Road polyline per tech, [lat, lng] pairs. */
  geometry?: Record<string, [number, number][]>;
};

type OptimizeStop = {
  id: string;
  kind: "job" | "appointment";
  jobNumber: number | null;
  title: string;
  contactName: string;
  address: string | null;
  currentStart: string | null;
  scheduledAnytime: boolean;
  proposedStart: string;
  proposedEnd: string;
  driveMinutesFromPrev: number | null;
};

type OptimizeResult = {
  userName: string;
  stops: OptimizeStop[];
  anchorTime: string;
  roundTrip: boolean;
  measured: boolean;
  totalDistanceMiles: number;
  returnMinutes: number | null;
  currentDriveMinutes: number;
  totalDriveMinutes: number;
  savedMinutes: number;
  skipped: string[];
  /** Stops kept at their current time (already started, in progress, or running into tomorrow). */
  pinned?: string[];
  warnings: string[];
  applied: boolean;
  notified: number;
};

type TeamPosition = {
  userId: string;
  name: string;
  jobId: string | null;
  jobTitle: string | null;
  startedAt: string;
  lat: number | null;
  lng: number | null;
  positionAt: string | null;
};

// Same family as the section palette — distinct at pin size, no two neighbors
// alike. Tech identity color is positional (roster order), stable per day.
const TECH_COLORS = [
  "#16A34A", "#2563EB", "#EA580C", "#9333EA", "#0D9488",
  "#DC2626", "#CA8A04", "#DB2777", "#4F46E5", "#059669",
];
const UNASSIGNED_COLOR = "#6B7280";
const INK = "#0A1428"; // --tool-line navy, the app's hard-chrome color

/** Phone sheet snap points (px for peek, fractions of the stage otherwise). */
const SHEET_PEEK_PX = 112;
const SHEET_HALF = 0.55;
const SHEET_FULL_INSET_PX = 56;
/** Desktop floating stop panel width + the gutter it sits in. */
const PANEL_W = 380;

type SheetSnap = "peek" | "half" | "full";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function fmtDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

/** "8:00 AM – 3:30 PM" from a route's first start to its last end. */
function spanLabel(stops: RouteStop[]): string {
  const timed = stops.filter((s) => !s.scheduledAnytime && s.scheduledAt);
  if (!timed.length) return "Anytime";
  const first = timed[0];
  const last = timed[timed.length - 1];
  const end = last.scheduledEnd ?? last.scheduledAt;
  return `${fmtTime(first.scheduledAt)} – ${fmtTime(end)}`;
}

function miles(km: number | undefined): string | null {
  if (km === undefined || km <= 0) return null;
  const mi = km * 0.621371;
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
}

/** One stop → the phone's maps app. */
function navigateHref(stop: { lat: number | null; lng: number | null; address: string | null }, apple: boolean): string | null {
  const dest = stop.lat != null && stop.lng != null ? `${stop.lat},${stop.lng}` : stop.address ? stop.address : null;
  if (!dest) return null;
  if (apple) return `https://maps.apple.com/?daddr=${encodeURIComponent(dest)}&dirflg=d`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`;
}

/**
 * The whole route as one Google Maps directions link (origin → waypoints →
 * destination). Google caps waypoints at 9 in the URL API, so a longer day
 * sends the first ten stops — the tech re-opens for the rest.
 */
function routeHref(start: Pin | null, stops: RouteStop[]): string | null {
  const pts = stops
    .filter((s) => s.lat != null && s.lng != null)
    .map((s) => `${s.lat},${s.lng}`);
  if (pts.length === 0) return null;
  const origin = start ? `${start.lat},${start.lng}` : pts.shift()!;
  if (pts.length === 0) return null;
  const chain = pts.slice(0, 10);
  const destination = chain.pop()!;
  const params = new URLSearchParams({ api: "1", origin, destination, travelmode: "driving" });
  if (chain.length) params.set("waypoints", chain.join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Stroke-dash reveal of a freshly drawn road line (≈600 ms, staggered per crew). */
function revealPath(el: Element | undefined, delayMs: number, dashed: boolean) {
  if (!(el instanceof SVGPathElement)) return;
  if (dashed) {
    // Dashed fallback lines already use stroke-dasharray — fade them in instead
    el.style.transition = "none";
    el.style.opacity = "0";
    requestAnimationFrame(() => {
      el.style.transition = `opacity 400ms ease ${delayMs}ms`;
      el.style.opacity = "";
    });
    window.setTimeout(() => {
      el.style.transition = "";
    }, 450 + delayMs);
    return;
  }
  let len = 0;
  try {
    len = el.getTotalLength();
  } catch {
    return;
  }
  if (!Number.isFinite(len) || len <= 0) return;
  el.style.transition = "none";
  el.style.strokeDasharray = `${len}`;
  el.style.strokeDashoffset = `${len}`;
  requestAnimationFrame(() => {
    el.style.transition = `stroke-dashoffset 600ms cubic-bezier(0.45, 0, 0.2, 1) ${delayMs}ms`;
    el.style.strokeDashoffset = "0";
  });
  window.setTimeout(() => {
    el.style.strokeDasharray = "";
    el.style.strokeDashoffset = "";
    el.style.transition = "";
  }, 700 + delayMs);
}

type ListDrag = {
  pointerId: number;
  fromGroup: string;
  stopId: string;
  y: number;
  /** Where it would land: same group index, or another group's card. */
  over: { group: string; index: number } | null;
  active: boolean;
  startY: number;
};

export default function RouteMapClient({
  date,
  today,
  team,
  users,
  meId,
  meName,
  canDispatch,
  canOptimize,
  canSeeTeam,
  home = null,
}: {
  date: string;
  /** Today on the company's clock (YYYY-MM-DD). */
  today: string;
  team: string;
  users: { id: string; name: string }[];
  meId: string;
  meName: string;
  canDispatch: boolean;
  canOptimize: boolean;
  canSeeTeam: boolean;
  /** The business's geocoded address — where the map opens before the day's data lands. */
  home?: { lat: number; lng: number } | null;
}) {
  const router = useRouter();
  const pageRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // the map is the page: size the root from the shell's <main>, not a percentage
  useMainFill(pageRef, () => mapRef.current?.invalidateSize());
  const LRef = useRef<typeof Leaflet | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const liveLayerRef = useRef<LayerGroup | null>(null);
  const meDotRef = useRef<CircleMarker | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  /** stop key → the crew it belongs to, for dimming the other crews. */
  const markerGroupRef = useRef<Map<string, string>>(new Map());
  const linesRef = useRef<Map<string, Polyline[]>>(new Map());
  const pointsRef = useRef<[number, number][]>([]);
  const fittedKeyRef = useRef("");
  const homeRef = useRef(home);

  const [data, setData] = useState<RouteDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<(OptimizeResult & { userId: string; manualOrder?: boolean }) | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [notifyOnApply, setNotifyOnApply] = useState(true);
  const [applied, setApplied] = useState("");
  const [trayOpen, setTrayOpen] = useState(false);
  const [addingId, setAddingId] = useState("");
  const [team_, setTeamPositions] = useState<TeamPosition[]>([]);
  const [apple, setApple] = useState(false);
  const [copied, setCopied] = useState("");
  const [listDrag, setListDrag] = useState<ListDrag | null>(null);
  const listDragRef = useRef<ListDrag | null>(null);
  const [reassigning, setReassigning] = useState("");

  // Selection replaces popups: a pin tap or a row tap picks a stop
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const hoveredRef = useRef<string | null>(null);
  selectedRef.current = selected;
  hoveredRef.current = hovered;
  /** Where the last selection came from — a pin tap scrolls the row into view, a row tap doesn't. */
  const selectSourceRef = useRef<"pin" | "row">("row");

  // Layout: desktop floating panel open/closed; phone sheet snap
  const [panelOpen, setPanelOpen] = useState(true);
  const panelOpenRef = useRef(true);
  panelOpenRef.current = panelOpen;
  const [sheet, setSheet] = useState<SheetSnap>("peek");
  const sheetRef = useRef<SheetSnap>("peek");
  sheetRef.current = sheet;
  const [stageH, setStageH] = useState(0);
  const [sheetDragH, setSheetDragH] = useState<number | null>(null);
  const sheetDrag = useRef<{ pointerId: number; startY: number; startH: number; moved: boolean } | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => setApple(isApplePlatform()), []);

  const go = useCallback(
    (next: { date?: string; team?: string }) => {
      const d = next.date ?? date;
      const t = next.team ?? team;
      router.push(`/app/schedule/map?date=${d}${t ? `&team=${t}` : ""}`);
    },
    [router, date, team]
  );

  // ── Data ──────────────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/app/route-plan?date=${date}&geometry=1`);
      if (!res.ok) {
        setError(GENERIC_ERROR);
        return;
      }
      setData((await res.json()) as RouteDay);
      setError("");
    } catch {
      setError("You appear to be offline — routes need a connection.");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live positions (managers), only for today — yesterday's map has no "now"
  useEffect(() => {
    if (!canSeeTeam || date !== today) {
      setTeamPositions([]);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/app/team-map");
        if (!res.ok) return;
        const d = (await res.json()) as { team: TeamPosition[] };
        if (!cancelled) setTeamPositions(d.team ?? []);
      } catch {
        /* quiet */
      }
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [canSeeTeam, date, today]);

  // ── Groups: one route per tech, ordered by time ───────────────────────────
  const roster = useMemo(
    () => (canDispatch ? users : [{ id: meId, name: meName }]),
    [canDispatch, users, meId, meName]
  );

  const groups = useMemo(() => {
    if (!data) return [];
    const sorted = [...data.stops].sort(
      (a, b) => new Date(a.scheduledAt ?? 0).getTime() - new Date(b.scheduledAt ?? 0).getTime()
    );
    const visible = team ? roster.filter((u) => u.id === team) : roster;
    const out: { userId: string; name: string; color: string; stops: RouteStop[]; start: Pin | null }[] = [];
    for (const u of visible) {
      const stops = sorted.filter((s) => s.assigneeIds.includes(u.id));
      if (stops.length) {
        out.push({
          userId: u.id,
          name: u.name,
          color: TECH_COLORS[Math.max(0, roster.findIndex((r) => r.id === u.id)) % TECH_COLORS.length],
          stops,
          start: (data.memberStarts && data.memberStarts[u.id]) || data.start,
        });
      }
    }
    if (canDispatch && !team) {
      const unassigned = sorted.filter((s) => s.assigneeIds.length === 0);
      if (unassigned.length) {
        out.push({ userId: "", name: "Unassigned", color: UNASSIGNED_COLOR, stops: unassigned, start: null });
      }
    }
    return out;
  }, [data, roster, team, canDispatch]);

  // Phone/video appointments ride along pin-less by design (they hold the
  // tech's time but have no address) — the "check the address" nudge is only
  // for stops that SHOULD have mapped.
  const unlocated = useMemo(
    () =>
      groups.flatMap((g) =>
        g.stops
          .filter((s) => s.lat == null && !(s.kind === "appointment" && !s.address))
          .map((s) => s.title)
      ),
    [groups]
  );

  const stopCount = useMemo(() => groups.reduce((n, g) => n + g.stops.length, 0), [groups]);
  const measured = data?.drive?.measured !== false;
  const tilde = measured ? "" : "~";

  // A selected stop that left the day (reassigned away, filtered out) is no longer selected
  useEffect(() => {
    if (selected && !groups.some((g) => g.stops.some((s) => `${g.userId}:${s.id}` === selected))) setSelected(null);
  }, [groups, selected]);

  // ── Stage size (the sheet's snap points + fit padding follow it) ──────────
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStageH(el.clientHeight);
    measure();
    const ro = new ResizeObserver(() => {
      measure();
      mapRef.current?.invalidateSize();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sheetHeightFor = useCallback(
    (snap: SheetSnap, h: number) => (snap === "peek" ? SHEET_PEEK_PX : snap === "half" ? Math.round(h * SHEET_HALF) : Math.max(SHEET_PEEK_PX, h - SHEET_FULL_INSET_PX)),
    []
  );

  /** fitBounds padding that keeps the route clear of the floating panel / sheet / header pill. */
  const fitPadding = useCallback((): Leaflet.FitBoundsOptions => {
    const desktop = typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
    if (desktop) {
      return { paddingTopLeft: [panelOpenRef.current ? PANEL_W + 40 : 24, 88], paddingBottomRight: [72, 32] };
    }
    const h = stageRef.current?.clientHeight ?? 0;
    const covered = Math.min(sheetHeightFor(sheetRef.current, h), Math.round(h * SHEET_HALF));
    return { paddingTopLeft: [16, 84], paddingBottomRight: [16, covered + 16] };
  }, [sheetHeightFor]);

  // ── Map lifecycle ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function setup() {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      LRef.current = L;
      // Framed on the company before the first tile request — no US-at-z4 flash
      const view = initialView({ home: homeRef.current, homeZoom: 11 });
      const map = L.map(containerRef.current, {
        center: view.center,
        zoom: view.zoom,
        zoomControl: false,
        attributionControl: true,
        zoomAnimation: !reducedMotion(),
        fadeAnimation: !reducedMotion(),
      });
      addBasemap(L, map, "streets");
      map.on("moveend", () => rememberView(map));
      map.on("click", () => setSelected(null));
      mapRef.current = map;
    }
    setup();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      liveLayerRef.current = null;
      meDotRef.current = null;
      markersRef.current.clear();
      markerGroupRef.current.clear();
      linesRef.current.clear();
    };
  }, []);

  /** Selected / hovered stop → its pin grows, its crew's line stays, every other crew dims. */
  const applyFocus = useCallback(() => {
    const sel = selectedRef.current;
    const focus = hoveredRef.current ?? sel;
    const focusGroup = focus ? markerGroupRef.current.get(focus) ?? null : null;
    for (const [key, m] of markersRef.current) {
      const el = m.getElement();
      if (!el) continue;
      const mine = markerGroupRef.current.get(key);
      el.classList.toggle("is-selected", key === sel);
      el.classList.toggle("is-hot", key === focus);
      el.classList.toggle("is-dim", focusGroup !== null && mine !== focusGroup);
      m.setZIndexOffset(key === focus ? 900 : key === sel ? 800 : 0);
    }
    for (const [uid, lines] of linesRef.current) {
      for (const pl of lines) pl.getElement()?.classList.toggle("is-dim", focusGroup !== null && uid !== focusGroup);
    }
  }, []);

  useEffect(() => {
    applyFocus();
  }, [selected, hovered, applyFocus]);

  useEffect(() => {
    let cancelled = false;
    async function draw() {
      const L = (await import("leaflet")).default;
      const map = mapRef.current;
      if (!map || cancelled || !data) return;
      map.invalidateSize();
      const reduce = reducedMotion();

      layerRef.current?.remove();
      markersRef.current.clear();
      markerGroupRef.current.clear();
      linesRef.current.clear();
      const layer = L.layerGroup().addTo(map);
      layerRef.current = layer;
      const points: [number, number][] = [];

      const startPin = (team && data.memberStarts && data.memberStarts[team]) || data.start;
      if (startPin) {
        const icon = L.divIcon({
          html: `<div class="route-pin route-pin-start" title="${startPin.label.replace(/"/g, "&quot;")} — start of the day"><span>HQ</span></div>`,
          className: "",
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        L.marker([startPin.lat, startPin.lng], { icon, keyboard: false }).addTo(layer);
        points.push([startPin.lat, startPin.lng]);
      }

      groups.forEach((g, gi) => {
        const gStart = (data.memberStarts && data.memberStarts[g.userId]) || data.start;
        const path: [number, number][] = gStart ? [[gStart.lat, gStart.lng]] : [];
        g.stops.forEach((s, i) => {
          if (s.lat == null || s.lng == null) return;
          points.push([s.lat, s.lng]);
          path.push([s.lat, s.lng]);
          const delay = reduce ? 0 : Math.min(i, 12) * 30 + gi * 60;
          const icon = L.divIcon({
            html:
              s.kind === "block"
                ? `<div class="route-pin route-pin-block" style="border-color:${g.color};animation-delay:${delay}ms"><span>${i + 1}</span></div>`
                : `<div class="route-pin" style="background:${g.color};animation-delay:${delay}ms"><span>${i + 1}</span></div>`,
            className: "",
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });
          const key = `${g.userId}:${s.id}`;
          const marker = L.marker([s.lat, s.lng], { icon, title: `${i + 1}. ${s.title}`, keyboard: false }).addTo(layer);
          marker.on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            selectSourceRef.current = "pin";
            setSelected((cur) => (cur === key ? null : key));
            hapticImpact("LIGHT");
          });
          markersRef.current.set(key, marker);
          markerGroupRef.current.set(key, g.userId);
        });
        if (g.userId !== "") {
          // Real roads when Directions gave us a line; dashed as-the-crow-flies otherwise
          const road = data.geometry?.[g.userId];
          const lines: Polyline[] = [];
          if (road && road.length > 1) {
            lines.push(L.polyline(road, { color: "#fff", weight: 6, opacity: 0.75, className: "route-line", interactive: false }).addTo(layer));
            lines.push(L.polyline(road, { color: g.color, weight: 3.5, opacity: 0.9, className: "route-line", interactive: false }).addTo(layer));
            if (!reduce) lines.forEach((pl) => revealPath(pl.getElement(), gi * 120, false));
          } else if (path.length > 1) {
            lines.push(L.polyline(path, { color: g.color, weight: 2.5, opacity: 0.55, dashArray: "5 7", className: "route-line", interactive: false }).addTo(layer));
            if (!reduce) revealPath(lines[0].getElement(), gi * 120, true);
          }
          linesRef.current.set(g.userId, lines);
        }
      });
      pointsRef.current = points;

      const fitKey = `${date}:${team}`;
      if (points.length > 0 && fittedKeyRef.current !== fitKey) {
        fittedKeyRef.current = fitKey;
        map.fitBounds(L.latLngBounds(points).pad(0.05), { ...fitPadding(), maxZoom: 14, animate: false });
      }
      applyFocus();
    }
    draw();
    return () => {
      cancelled = true;
    };
  }, [data, groups, date, team, applyFocus, fitPadding]);

  // Live tech markers — separate layer so the minute refresh doesn't redraw pins.
  // These keep a popup (restyled as a small ledger card): there's no list row for a person.
  useEffect(() => {
    let cancelled = false;
    async function drawLive() {
      const L = (await import("leaflet")).default;
      const map = mapRef.current;
      if (!map || cancelled) return;
      liveLayerRef.current?.remove();
      const layer = L.layerGroup().addTo(map);
      liveLayerRef.current = layer;
      const now = Date.now();
      for (const t of team_) {
        if (t.lat == null || t.lng == null) continue;
        if (team && t.userId !== team) continue;
        const idx = roster.findIndex((r) => r.id === t.userId);
        const color = TECH_COLORS[Math.max(0, idx) % TECH_COLORS.length];
        // Behind plan: clocked into something whose slot already ended
        const stop = data?.stops.find((s) => s.id === t.jobId);
        const late = stop?.scheduledEnd ? new Date(stop.scheduledEnd).getTime() < now : false;
        const ago = t.positionAt ? Math.max(0, Math.round((now - new Date(t.positionAt).getTime()) / 60000)) : null;
        const icon = L.divIcon({
          html: `<div class="route-live${late ? " route-live-late" : ""}" style="--tech:${color}"><span>${initials(t.name)}</span></div>`,
          className: "",
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });
        L.marker([t.lat, t.lng], { icon, zIndexOffset: 1000, keyboard: false })
          .addTo(layer)
          .bindPopup(
            `<p class="route-live-name">${t.name}</p><p class="route-live-line">${t.jobTitle ? `At ${t.jobTitle} since ${fmtTime(t.startedAt)}` : "Clocked in"}</p>${
              late ? `<p class="route-live-late-note">Running past the planned end</p>` : ""
            }${ago !== null ? `<p class="route-live-seen">seen ${ago === 0 ? "just now" : `${ago} min ago`}</p>` : ""}`,
            { className: "route-live-pop", closeButton: false, offset: [0, -14], maxWidth: 240 }
          );
      }
    }
    drawLive();
    return () => {
      cancelled = true;
    };
  }, [team_, roster, team, data]);

  /** Row tap: fly to the pin and select it. */
  const focusStop = useCallback((groupUserId: string, stop: RouteStop) => {
    const key = `${groupUserId}:${stop.id}`;
    selectSourceRef.current = "row";
    setSelected(key);
    if (stop.lat == null || stop.lng == null) return;
    const map = mapRef.current;
    if (map) map.setView([stop.lat, stop.lng], Math.max(map.getZoom(), 14), { animate: !reducedMotion() });
    // On a phone the full sheet hides the map — drop it to half so the pin shows
    if (sheetRef.current === "full") setSheet("half");
  }, []);

  // A pin tap brings its row into view (and lifts a peeking sheet so there's a row to see)
  useEffect(() => {
    if (!selected || selectSourceRef.current !== "pin") return;
    if (sheetRef.current === "peek") setSheet("half");
    const raf = requestAnimationFrame(() => {
      const root = listRef.current;
      const row = root?.querySelector<HTMLElement>(`[data-stop-key="${CSS.escape(selected)}"]`);
      row?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
    });
    return () => cancelAnimationFrame(raf);
  }, [selected]);

  // ── Own map controls ──────────────────────────────────────────────────────
  const fitRoute = useCallback(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map || pointsRef.current.length === 0) return;
    map.fitBounds(L.latLngBounds(pointsRef.current).pad(0.05), { ...fitPadding(), maxZoom: 14, animate: !reducedMotion() });
  }, [fitPadding]);

  const locate = useCallback(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map || !navigator.geolocation) {
      setError("Location isn't available on this device.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        const ll: [number, number] = [p.coords.latitude, p.coords.longitude];
        meDotRef.current?.remove();
        meDotRef.current = L.circleMarker(ll, { radius: 7, color: "#fff", weight: 2.5, fillColor: "#2563EB", fillOpacity: 1, className: "route-me", interactive: false }).addTo(map);
        map.setView(ll, Math.max(map.getZoom(), 14), { animate: !reducedMotion() });
        hapticImpact("LIGHT");
      },
      () => {
        setLocating(false);
        setError("We couldn't get your location — check the app's location permission.");
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }, []);

  // ── Phone sheet: drag the grip between snap points, or tap it to toggle ──
  const snapTo = useCallback((next: SheetSnap) => {
    setSheet(next);
    hapticImpact("LIGHT");
  }, []);

  const beginSheetDrag = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    sheetDrag.current = { pointerId: e.pointerId, startY: e.clientY, startH: sheetHeightFor(sheetRef.current, stageRef.current?.clientHeight ?? stageH), moved: false };
  };
  const moveSheetDrag = (e: React.PointerEvent) => {
    const d = sheetDrag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dy = d.startY - e.clientY;
    if (!d.moved && Math.abs(dy) < 4) return;
    d.moved = true;
    const h = stageRef.current?.clientHeight ?? stageH;
    setSheetDragH(Math.max(SHEET_PEEK_PX, Math.min(h - SHEET_FULL_INSET_PX, d.startH + dy)));
  };
  const endSheetDrag = (e: React.PointerEvent) => {
    const d = sheetDrag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    sheetDrag.current = null;
    setSheetDragH(null);
    const h = stageRef.current?.clientHeight ?? stageH;
    if (!d.moved) {
      snapTo(sheetRef.current === "peek" ? "half" : sheetRef.current === "half" ? "full" : "peek");
      return;
    }
    const target = Math.max(SHEET_PEEK_PX, Math.min(h - SHEET_FULL_INSET_PX, d.startH + (d.startY - e.clientY)));
    const snaps: SheetSnap[] = ["peek", "half", "full"];
    const nearest = snaps.reduce((best, s) => (Math.abs(sheetHeightFor(s, h) - target) < Math.abs(sheetHeightFor(best, h) - target) ? s : best), "peek" as SheetSnap);
    snapTo(nearest);
  };

  // ── Optimize flow ─────────────────────────────────────────────────────────
  const runOptimize = useCallback(
    async (userId: string, order?: string[], anchorTime?: string, roundTrip?: boolean, manualOrder = Boolean(order)) => {
      setPreviewBusy(true);
      const { ok, data: result } = await postJson<OptimizeResult>("/api/app/route-plan/optimize", {
        date,
        userId,
        ...(order ? { order } : {}),
        ...(anchorTime ? { anchorTime } : {}),
        ...(roundTrip !== undefined ? { roundTrip } : {}),
      });
      setPreviewBusy(false);
      if (!ok || !result || result.stops == null) {
        setError(result?.error ?? GENERIC_ERROR);
        return;
      }
      setError("");
      // manualOrder: the stops were hand-ordered (drag in the preview or a
      // reorder on the map), so later re-runs must keep that order instead
      // of re-solving it.
      setPreview({ ...result, userId, manualOrder });
    },
    [date]
  );

  const applyPreview = useCallback(async () => {
    if (!preview) return;
    setPreviewBusy(true);
    const { ok, data: result } = await postJson<OptimizeResult>("/api/app/route-plan/optimize", {
      date,
      userId: preview.userId,
      order: preview.stops.map((s) => s.id),
      anchorTime: preview.anchorTime,
      roundTrip: preview.roundTrip,
      notify: notifyOnApply,
      apply: true,
    });
    setPreviewBusy(false);
    if (!ok || !result?.applied) {
      setError(result?.error ?? GENERIC_ERROR);
      return;
    }
    hapticImpact("LIGHT");
    setApplied(
      `${preview.userName}'s route updated — the calendar now follows this order.${
        notifyOnApply ? ` ${result.notified} client${result.notified === 1 ? "" : "s"} told about the new time.` : ""
      }`
    );
    setPreview(null);
    refresh();
    router.refresh();
  }, [preview, date, refresh, router, notifyOnApply]);

  const movePreviewStop = useCallback(
    (index: number, dir: -1 | 1) => {
      if (!preview) return;
      const ids = preview.stops.map((s) => s.id);
      const j = index + dir;
      if (j < 0 || j >= ids.length) return;
      [ids[index], ids[j]] = [ids[j], ids[index]];
      runOptimize(preview.userId, ids, preview.anchorTime, preview.roundTrip);
    },
    [preview, runOptimize]
  );

  const mayOptimize = useCallback(
    (userId: string) => canOptimize && userId !== "" && (canDispatch || userId === meId),
    [canOptimize, canDispatch, meId]
  );

  // ── Hand a stop to another tech ───────────────────────────────────────────
  const reassign = useCallback(
    async (stop: RouteStop, fromUserId: string, toUserId: string) => {
      setReassigning(stop.id);
      const body: Record<string, unknown> =
        stop.kind === "job"
          ? { assigneeIds: [...stop.assigneeIds.filter((id) => id !== fromUserId && id !== toUserId), ...(toUserId ? [toUserId] : [])] }
          : { assignedToId: toUserId || null };
      const { ok, data: res } = await postJson<{ error?: string; conflicts?: string[] }>(
        stop.kind === "job" ? `/api/app/jobs/${stop.id}` : `/api/app/appointments/${stop.id}`,
        body,
        "PATCH"
      );
      setReassigning("");
      if (!ok) {
        setError(res?.error ?? GENERIC_ERROR);
        return;
      }
      hapticImpact("LIGHT");
      const toName = users.find((u) => u.id === toUserId)?.name ?? "Unassigned";
      setApplied(
        `${stop.title} handed to ${toName}.${res?.conflicts?.length ? ` Heads up — it overlaps: ${res.conflicts.join("; ")}` : ""}`
      );
      refresh();
      router.refresh();
    },
    [users, refresh, router]
  );

  // ── Drag-to-reorder (grip handle, pointer events; works with a finger) ────
  const beginListDrag = (e: React.PointerEvent, group: string, stopId: string) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const d: ListDrag = { pointerId: e.pointerId, fromGroup: group, stopId, y: e.clientY, startY: e.clientY, over: null, active: false };
    listDragRef.current = d;
    setListDrag(d);
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = listDragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      if (!d.active && Math.abs(e.clientY - d.startY) < 4) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const row = el?.closest<HTMLElement>("[data-stop-row]");
      const card = el?.closest<HTMLElement>("[data-route-group]");
      let over: ListDrag["over"] = null;
      if (row) {
        const rect = row.getBoundingClientRect();
        const idx = Number(row.dataset.index);
        over = { group: row.dataset.group ?? "", index: e.clientY > rect.top + rect.height / 2 ? idx + 1 : idx };
      } else if (card) {
        over = { group: card.dataset.routeGroup ?? "", index: -1 };
      }
      const next = { ...d, y: e.clientY, over, active: true };
      listDragRef.current = next;
      setListDrag(next);
      if (next.active) e.preventDefault();
    };
    const onUp = (e: PointerEvent) => {
      const d = listDragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      listDragRef.current = null;
      setListDrag(null);
      if (!d.active || !d.over) return;
      const from = groups.find((g) => g.userId === d.fromGroup);
      const stop = from?.stops.find((s) => s.id === d.stopId);
      if (!from || !stop) return;
      if (d.over.group !== d.fromGroup) {
        if (!canDispatch) return;
        reassign(stop, d.fromGroup, d.over.group);
        return;
      }
      if (d.over.index < 0) return;
      const ids = from.stops.map((s) => s.id);
      const fromIdx = ids.indexOf(d.stopId);
      let to = d.over.index;
      if (to > fromIdx) to -= 1;
      if (to === fromIdx) return;
      ids.splice(fromIdx, 1);
      ids.splice(to, 0, d.stopId);
      if (!mayOptimize(from.userId)) return;
      // The reorder lands as an Optimize preview with this exact order —
      // Apply gives every stop its new time, nothing moves until then
      const routable = from.stops.filter((s) => s.lat != null && (s.kind === "job" || !s.tentative)).map((s) => s.id);
      runOptimize(from.userId, ids.filter((id) => routable.includes(id)));
    };
    document.addEventListener("pointermove", onMove, { passive: false });
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
  }, [groups, canDispatch, mayOptimize, reassign, runOptimize]);

  // Preview list reorder (same grip, local until Apply)
  const previewDrag = useRef<{ pointerId: number; id: string; startY: number; active: boolean; over: number | null } | null>(null);
  const [previewOver, setPreviewOver] = useState<{ id: string; over: number | null } | null>(null);
  const beginPreviewDrag = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    previewDrag.current = { pointerId: e.pointerId, id, startY: e.clientY, active: false, over: null };
  };
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = previewDrag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      if (!d.active && Math.abs(e.clientY - d.startY) < 4) return;
      d.active = true;
      const row = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-preview-row]");
      if (row) {
        const rect = row.getBoundingClientRect();
        const idx = Number(row.dataset.index);
        d.over = e.clientY > rect.top + rect.height / 2 ? idx + 1 : idx;
      }
      setPreviewOver({ id: d.id, over: d.over });
      e.preventDefault();
    };
    const onUp = (e: PointerEvent) => {
      const d = previewDrag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      previewDrag.current = null;
      setPreviewOver(null);
      if (!d.active || d.over === null || !preview) return;
      const ids = preview.stops.map((s) => s.id);
      const fromIdx = ids.indexOf(d.id);
      let to = d.over;
      if (to > fromIdx) to -= 1;
      if (to === fromIdx) return;
      ids.splice(fromIdx, 1);
      ids.splice(to, 0, d.id);
      runOptimize(preview.userId, ids, preview.anchorTime, preview.roundTrip);
    };
    document.addEventListener("pointermove", onMove, { passive: false });
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
  }, [preview, runOptimize]);

  // ── Day-first: pull an unscheduled job onto this day ──────────────────────
  const addToDay = useCallback(
    async (job: UnscheduledJob) => {
      setAddingId(job.id);
      // Optimize works per tech, so an unassigned job would land on the
      // "Unassigned" card with nothing to press. Hand it to the tech the page
      // is filtered to (or to me when I'm the whole team); otherwise say so.
      const assignTo = job.assigneeIds.length ? "" : team || (users.length <= 1 ? meId : "");
      const assigned = job.assigneeIds.length > 0 || assignTo !== "";
      // A scheduled job needs someone on it (the API refuses otherwise) —
      // say what to do instead of bouncing off the server
      if (!assigned && !job.outsourced) {
        setAddingId("");
        setError("Filter the map to a tech first — a job can't go on the schedule with nobody on it.");
        return;
      }
      const { ok, data: res } = await postJson<{ error?: string }>(
        `/api/app/jobs/${job.id}`,
        {
          scheduledAt: localInputToISO(`${date}T12:00`),
          scheduledEnd: null,
          scheduledAnytime: true,
          ...(assignTo ? { assigneeIds: [...job.assigneeIds, assignTo] } : {}),
        },
        "PATCH"
      );
      setAddingId("");
      if (!ok) {
        setError(res?.error ?? GENERIC_ERROR);
        return;
      }
      hapticImpact("LIGHT");
      setApplied(
        assigned
          ? `Job #${job.jobNumber} added to ${fmtDateLabel(date)} — hit Optimize to slot it.`
          : `Job #${job.jobNumber} added to ${fmtDateLabel(date)} — assign it to a tech, then Optimize slots it.`
      );
      refresh();
      router.refresh();
    },
    [date, team, users, meId, refresh, router]
  );

  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPreview(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

  const copyRoute = async (href: string, key: string) => {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(key);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      window.open(href, "_blank", "noopener");
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const sheetPx = sheetDragH ?? sheetHeightFor(sheet, stageH);
  const crewCount = groups.filter((g) => g.userId !== "").length;
  const summary = data
    ? `${stopCount} stop${stopCount === 1 ? "" : "s"}${crewCount > 0 ? ` · ${crewCount} ${crewCount === 1 ? "crew" : "crews"}` : ""}`
    : "Loading the day…";

  const ctl = "wb-map-ctl";

  /** The stop list — one element, styled as a floating panel on desktop and a bottom sheet on phones. */
  const list = (
    <div ref={listRef} className="route-list min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 pt-2 lg:p-2.5">
      <div className="hidden print:block">
        <h1 className="text-xl font-bold text-gray-900">Routes</h1>
        <p className="text-sm font-semibold text-gray-700">{fmtDateLabel(date)}</p>
      </div>

      {data && !data.enabled && (
        <div className="no-print flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <MapPin size={15} className="mt-0.5 shrink-0" />
          <span>
            Map pins and drive times need a Mapbox token — add{" "}
            <code className="font-mono text-xs">MAPBOX_TOKEN</code> to the server environment.
            Stops still list here.
          </span>
        </div>
      )}
      {data?.enabled && !measured && groups.length > 0 && (
        <div className="no-print rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Drive times shown are straight-line estimates right now (road times weren&apos;t available). Figures are marked with ~.
        </div>
      )}
      {unlocated.length > 0 && (
        <div className="no-print rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          No map pin yet (check the address): {unlocated.join(", ")}
        </div>
      )}

      {canDispatch && (data?.unscheduled?.length ?? 0) > 0 && (
        <div className="route-tray card-ledger overflow-hidden">
          <button
            type="button"
            onClick={() => setTrayOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-gray-50"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                <Inbox size={14} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-gray-900">Unscheduled jobs</span>
                <span className="numeral-ledger block text-[11px] text-gray-500">
                  {data!.unscheduled!.length} waiting — add them to this day
                </span>
              </span>
            </span>
            <ChevronRight
              size={16}
              className={`shrink-0 text-gray-400 transition-transform ${trayOpen || groups.length === 0 ? "rotate-90" : ""}`}
            />
          </button>
          {(trayOpen || groups.length === 0) && (
            <ul className="max-h-64 divide-y divide-gray-100 overflow-y-auto border-t border-gray-100">
              {data!.unscheduled!.map((j) => (
                <li key={j.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      <Link prefetch={false} href={`/app/jobs/${j.id}`} className="hover:underline">
                        {j.title}
                      </Link>
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {j.contactName}
                      {j.address ? ` · ${j.address}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => addToDay(j)}
                    disabled={addingId === j.id}
                    className="flex shrink-0 items-center gap-1.5 rounded-[10px] btn-tool-line bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-50"
                  >
                    {addingId === j.id ? <Loader2 size={13} className="animate-spin" /> : <CalendarPlus size={13} />}
                    Add to day
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {loading && !data && (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="wb-map-skeleton h-14 rounded-[8px]" />
          ))}
        </div>
      )}

      {!loading && groups.length === 0 && (
        <div className="card-ledger px-4 py-10 text-center">
          <RouteIcon size={22} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm font-semibold text-gray-900">Nothing scheduled this day</p>
          <p className="mt-1 text-xs text-gray-500">
            {canDispatch && (data?.unscheduled?.length ?? 0) > 0
              ? "Build the day: add jobs from the unscheduled list above and hand each to a tech — Optimize then orders the route and hands out times."
              : "Jobs with a scheduled date show up here as a route."}
          </p>
          <Link
            href={`/app/schedule?view=day&date=${date}`}
            className="mt-3 inline-flex items-center gap-1.5 rounded-[10px] btn-tool-line bg-white px-3 py-1.5 text-sm font-medium text-gray-700"
          >
            <CalendarDays size={14} />
            Open the calendar
          </Link>
        </div>
      )}

      {groups.map((g) => {
        const href = routeHref(g.start, g.stops);
        const dropHere = listDrag?.active && listDrag.over?.group === g.userId && listDrag.fromGroup !== g.userId;
        const mi = miles(data?.drive?.kmTotals?.[g.userId]);
        // Optimize needs two stops it can place on the map for this tech
        const pinned = g.stops.filter((s) => s.lat != null && (s.kind === "job" || !s.tentative)).length;
        const optimizeBlocker =
          g.stops.length < 2
            ? "Optimize needs two or more stops."
            : pinned < 2
              ? "Optimize needs a map pin on at least two stops — give the “No pin” stops a street address."
              : null;
        return (
          <div
            key={g.userId || "unassigned"}
            data-route-group={g.userId}
            className={`card-ledger overflow-hidden transition-shadow ${dropHere ? "ring-2 ring-green-400" : ""}`}
          >
            <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                  style={{ background: g.color }}
                >
                  {g.userId ? initials(g.name) : "—"}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-gray-900">{g.name}</p>
                  <p className="numeral-ledger text-[11px] text-gray-500">
                    {g.stops.length} stop{g.stops.length === 1 ? "" : "s"} · {spanLabel(g.stops)}
                    {(data?.drive?.totals[g.userId] ?? 0) > 0 && ` · ${tilde}${Math.round(data!.drive!.totals[g.userId])} min drive`}
                    {mi && ` · ${tilde}${mi}`}
                  </p>
                  {mayOptimize(g.userId) && g.stops.filter((s) => s.scheduledAnytime).length > 0 && (
                    <p className="text-[11px] font-medium text-amber-700">
                      {g.stops.filter((s) => s.scheduledAnytime).length} waiting for a time — Optimize slots them
                    </p>
                  )}
                  {g.userId === "" && canDispatch && !dropHere && (
                    <p className="text-[11px] font-medium text-amber-700">
                      Optimize works per tech — assign these stops to order them.
                    </p>
                  )}
                  {g.userId !== "" && mayOptimize(g.userId) && g.stops.length >= 2 && pinned < 2 && (
                    <p className="text-[11px] font-medium text-amber-700">{optimizeBlocker}</p>
                  )}
                  {dropHere && <p className="text-[11px] font-semibold text-green-700">Drop to hand it to {g.name}</p>}
                </div>
              </div>
              <div className="no-print flex shrink-0 items-center gap-1">
                {href && (
                  <>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener"
                      title="Open the whole route in Google Maps"
                      className="flex h-8 w-8 items-center justify-center rounded-[10px] btn-tool-line bg-white text-gray-700 hover:bg-gray-50"
                      aria-label="Send route to phone"
                    >
                      <Send size={13} />
                    </a>
                    <button
                      onClick={() => copyRoute(href, g.userId)}
                      title="Copy the route link"
                      className="flex h-8 w-8 items-center justify-center rounded-[10px] btn-tool-line bg-white text-gray-700 hover:bg-gray-50"
                      aria-label="Copy route link"
                    >
                      {copied === g.userId ? <span className="text-[10px] font-bold text-green-700">✓</span> : <Link2 size={13} />}
                    </button>
                  </>
                )}
                {mayOptimize(g.userId) && g.stops.length >= 1 && (
                  <button
                    onClick={() => runOptimize(g.userId)}
                    disabled={previewBusy || pinned < 2}
                    title={optimizeBlocker ?? "Order this route by drive time"}
                    className="flex items-center gap-1.5 rounded-[10px] btn-tool-line bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-50"
                  >
                    {previewBusy ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                    Optimize
                  </button>
                )}
              </div>
            </div>
            <ul className="divide-y divide-gray-100">
              {g.stops.map((s, i) => {
                const key = `${g.userId}:${s.id}`;
                const leg = data?.drive?.legs[g.userId]?.[s.id];
                const legMi = miles(data?.drive?.km?.[g.userId]?.[s.id]);
                const nav = navigateHref(s, apple);
                const dragging = listDrag?.active && listDrag.stopId === s.id;
                const insertBefore = listDrag?.active && listDrag.over?.group === g.userId && listDrag.over.index === i && listDrag.fromGroup === g.userId;
                const canGrip = g.userId ? mayOptimize(g.userId) || canDispatch : canDispatch;
                const isSelected = selected === key;
                return (
                  <li key={s.id} data-stop-row data-stop-key={key} data-group={g.userId} data-index={i} className={insertBefore ? "border-t-2 border-t-green-500" : ""}>
                    {leg != null && leg > 0 && (
                      <p className="numeral-ledger flex items-center gap-1.5 px-4 pt-2 text-[10.5px] text-gray-400">
                        <CornerDownRight size={11} className="shrink-0" />
                        {tilde}{leg} min drive{legMi ? ` · ${tilde}${legMi}` : ""}{i === 0 ? " from HQ" : ""}
                      </p>
                    )}
                    <div
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      onClick={() => focusStop(g.userId, s)}
                      onKeyDown={(e) => e.key === "Enter" && focusStop(g.userId, s)}
                      onMouseEnter={() => setHovered(key)}
                      onMouseLeave={() => setHovered((h) => (h === key ? null : h))}
                      className={`route-row flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-gray-50 active:bg-gray-50 ${
                        isSelected ? "route-row-selected" : ""
                      } ${dragging ? "opacity-40" : ""} ${reassigning === s.id ? "opacity-50" : ""}`}
                    >
                      {canGrip ? (
                        <button
                          type="button"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            beginListDrag(e, g.userId, s.id);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Drag to reorder or hand to another tech"
                          className="no-print -ml-1 shrink-0 cursor-grab touch-none rounded p-1 text-gray-300 hover:text-gray-500 active:cursor-grabbing"
                        >
                          <GripVertical size={14} />
                        </button>
                      ) : (
                        <span className="w-1" />
                      )}
                      <span
                        className="numeral-ledger flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                        style={{ background: s.lat == null ? "#D1D5DB" : g.color }}
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-gray-900">
                          <span className="truncate">{s.title}</span>
                          {s.kind === "appointment" && <span className="stamp shrink-0 text-purple-700">Appt</span>}
                          {s.kind === "block" && <span className="stamp shrink-0 text-gray-600">Busy</span>}
                          {s.lat == null && <span className="stamp shrink-0 text-amber-700">No pin</span>}
                        </p>
                        <p className="truncate text-xs text-gray-500">
                          {s.kind === "block" ? "Blocked off" : s.contactName}
                          {s.address ? ` · ${s.address}` : ""}
                        </p>
                      </div>
                      {g.userId === "" && canDispatch && s.kind !== "block" && users.length > 0 && (
                        <select
                          value=""
                          disabled={reassigning === s.id}
                          aria-label="Assign to"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation();
                            if (e.target.value) reassign(s, "", e.target.value);
                          }}
                          className="no-print max-w-[112px] shrink-0 rounded-[8px] border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                        >
                          <option value="">Assign to…</option>
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.id === meId ? `${u.name} (me)` : u.name}
                            </option>
                          ))}
                        </select>
                      )}
                      <div className="shrink-0 text-right">
                        {s.scheduledAnytime ? (
                          <span className="stamp text-amber-700">Anytime</span>
                        ) : (
                          <p className="numeral-ledger text-xs font-semibold text-gray-900">{fmtTime(s.scheduledAt)}</p>
                        )}
                        <span className="no-print flex items-center justify-end gap-2">
                          {nav && (
                            <a
                              href={nav}
                              target="_blank"
                              rel="noopener"
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-0.5 text-[11px] font-semibold text-blue-700 hover:underline"
                            >
                              <Navigation size={10} />
                              Go
                            </a>
                          )}
                          {s.kind !== "block" && (
                            <Link
                              href={s.kind === "job" ? `/app/jobs/${s.id}` : `/app/appointments/${s.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-[11px] font-semibold text-green-700 hover:underline"
                            >
                              Open
                            </Link>
                          )}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
              {listDrag?.active && listDrag.over?.group === g.userId && listDrag.fromGroup === g.userId && listDrag.over.index >= g.stops.length && (
                <li className="h-0 border-t-2 border-t-green-500" />
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );

  return (
    <div ref={pageRef} className="route-page relative h-full min-h-0">
      <style>{`
        .route-pin {
          width: 28px; height: 28px; border-radius: 9999px;
          border: 2px solid #fff; box-shadow: 0 1px 4px rgba(10, 20, 40, 0.4);
          display: flex; align-items: center; justify-content: center;
          transition: transform 0.16s cubic-bezier(0.34, 1.4, 0.64, 1), box-shadow 0.16s ease;
          animation: route-pin-in 0.12s ease-out both;
        }
        @keyframes route-pin-in { from { transform: scale(0.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .route-pin span {
          font-family: "Oxanium", ui-sans-serif, sans-serif;
          color: #fff; font-size: 12px; font-weight: 700;
          font-variant-numeric: lining-nums tabular-nums;
        }
        .route-pin-start { background: ${INK}; border-radius: 9px; }
        .route-pin-block { background: #fff; border-width: 3px; border-style: dashed; }
        .route-pin-block span { color: #374151; }
        .route-pin-start span { font-size: 10px; letter-spacing: 0.03em; }
        .leaflet-marker-icon { transition: opacity 0.2s ease; }
        .leaflet-marker-icon.is-dim { opacity: 0.4; }
        .leaflet-marker-icon.is-hot .route-pin { transform: scale(1.15); box-shadow: 0 3px 10px rgba(10, 20, 40, 0.45); }
        .leaflet-marker-icon.is-selected .route-pin {
          transform: scale(1.15);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--wb-accent, #0B57D8) 35%, transparent), 0 3px 10px rgba(10, 20, 40, 0.45);
        }
        .route-map .route-line { transition: opacity 0.2s ease; }
        .route-map .route-line.is-dim { opacity: 0.35; }
        .route-me { animation: route-me-pulse 2s ease-in-out infinite; }
        @keyframes route-me-pulse { 0%, 100% { stroke-width: 2.5; } 50% { stroke-width: 6; stroke-opacity: 0.6; } }
        .route-live {
          width: 34px; height: 34px; border-radius: 9999px; background: #fff;
          border: 3px solid var(--tech); box-shadow: 0 0 0 4px color-mix(in srgb, var(--tech) 25%, transparent), 0 2px 6px rgba(10,20,40,.35);
          display: flex; align-items: center; justify-content: center;
          animation: route-live-pulse 2.4s ease-in-out infinite;
        }
        .route-live span { font-size: 11px; font-weight: 800; color: var(--tech); font-family: "Oxanium", ui-sans-serif, sans-serif; }
        .route-live-late { border-color: #DC2626; }
        .route-live-late span { color: #DC2626; }
        @keyframes route-live-pulse {
          0%, 100% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--tech) 25%, transparent), 0 2px 6px rgba(10,20,40,.35); }
          50% { box-shadow: 0 0 0 9px color-mix(in srgb, var(--tech) 10%, transparent), 0 2px 6px rgba(10,20,40,.35); }
        }
        .route-row-selected {
          box-shadow: inset 3px 0 0 var(--wb-accent, #0B57D8);
          background: color-mix(in srgb, var(--wb-accent, #0B57D8) 6%, #fff);
        }
        /* The one popup left: the live tech marker, as a small ledger card */
        .route-map .route-live-pop .leaflet-popup-content-wrapper {
          border-radius: 10px; padding: 0;
          border: 1px solid color-mix(in srgb, var(--wb-primary, #0A1428) 16%, #e5e7eb);
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);
          font-family: inherit;
        }
        .route-map .route-live-pop .leaflet-popup-content { margin: 9px 12px; font-size: 12px; line-height: 1.4; }
        .route-map .route-live-pop .leaflet-popup-content p { margin: 0; }
        .route-map .route-live-pop .route-live-name { font-weight: 700; color: #111827; font-size: 13px; }
        .route-map .route-live-pop .route-live-line { color: #374151; }
        .route-map .route-live-pop .route-live-late-note { color: #DC2626; font-weight: 600; }
        .route-map .route-live-pop .route-live-seen { color: #6B7280; font-size: 11px; }
        .route-map .route-live-pop .leaflet-popup-tip { box-shadow: none; border: 1px solid #e5e7eb; border-top: 0; border-left: 0; }
        .route-map .leaflet-container { font-family: inherit; background: #eef0f3; }
        .route-map .leaflet-control-attribution {
          font-size: 9px; opacity: 0.8; background: rgba(255,255,255,0.7);
          padding: 1px 6px; border-radius: 6px 0 0 0;
        }
        /* Phone sheet + desktop floating panel are ONE element */
        .route-dock { transition: height 0.3s cubic-bezier(0.32, 0.72, 0, 1); }
        @media (max-width: 1023.98px) { .route-dock { height: var(--dock-h, 112px); } }
        .route-dock.is-dragging { transition: none; }
        @media (prefers-reduced-motion: reduce) {
          .route-pin { animation: none; transition: none; }
          .route-dock, .leaflet-marker-icon, .route-map .route-line { transition: none; }
          .route-live, .route-me { animation: none; }
        }
        @media print {
          .route-page { height: auto !important; }
          .route-page .route-stage { position: static !important; height: auto !important; overflow: visible !important; }
          .route-page .route-map, .route-page .route-controls, .route-page .route-cluster, .route-page .route-tray,
          .route-page .route-dock-head, .route-page .no-print { display: none !important; }
          .route-page .route-dock {
            position: static !important; height: auto !important; width: 100% !important; max-width: none !important;
            transform: none !important; background: #fff !important; backdrop-filter: none !important;
            border: 0 !important; box-shadow: none !important; border-radius: 0 !important;
          }
          .route-page .route-list { max-height: none !important; height: auto !important; overflow: visible !important; width: 100% !important; padding: 0 !important; }
          .route-page .card-ledger { break-inside: avoid; box-shadow: none; border: 1px solid #ddd; }
        }
      `}</style>

      {/* ── The stage: the map is the page ─────────────────────────────────── */}
      <div ref={stageRef} className="route-stage relative isolate h-full min-h-0 overflow-hidden">
        <div ref={containerRef} className="route-map absolute inset-0" />

        {/* Loading: shimmer over the tiles + a thin progress bar, no scrim */}
        {loading && !data && <div className="wb-map-skeleton pointer-events-none absolute inset-0 z-[450]" aria-hidden />}
        {loading && <div className="wb-map-progress absolute inset-x-0 top-0 z-[1010]" role="progressbar" aria-label="Loading routes" />}

        {/* Header pill — title, day, crew filter — floating top-left */}
        <div className="route-controls no-print absolute left-3 top-3 z-[1000] flex max-w-[calc(100%-4.25rem)] flex-wrap items-center gap-1.5">
          <div className="wb-map-glass flex items-center gap-0.5 rounded-[12px] px-1.5 py-1">
            <h1 className="numeral-ledger mr-1.5 hidden pl-1.5 text-[15px] font-bold text-gray-900 sm:block">Routes</h1>
            <button
              onClick={() => go({ date: shiftDate(date, -1) })}
              className="rounded-full p-1.5 transition-colors hover:bg-gray-100 active:bg-gray-100"
              aria-label="Previous day"
            >
              <ChevronLeft size={17} className="text-gray-600" />
            </button>
            <label className="relative cursor-pointer px-1">
              <span className="block whitespace-nowrap text-[15px] font-bold text-gray-900">{fmtDateLabel(date)}</span>
              <input
                type="date"
                value={date}
                onChange={(e) => e.target.value && go({ date: e.target.value })}
                className="absolute inset-0 cursor-pointer opacity-0"
                aria-label="Pick a date"
              />
            </label>
            <button
              onClick={() => go({ date: shiftDate(date, 1) })}
              className="rounded-full p-1.5 transition-colors hover:bg-gray-100 active:bg-gray-100"
              aria-label="Next day"
            >
              <ChevronRight size={17} className="text-gray-600" />
            </button>
            {date !== today && (
              <button
                onClick={() => go({ date: today })}
                className="ml-0.5 rounded-[9px] btn-tool-line bg-white px-2.5 py-1 text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Today
              </button>
            )}
          </div>
          {canDispatch && users.length > 1 && (
            <div className="wb-map-glass hidden rounded-[12px] px-1 py-1 lg:block">
              <select
                value={team}
                onChange={(e) => go({ team: e.target.value })}
                aria-label="Crew"
                className="max-w-[12rem] rounded-[9px] border-0 bg-transparent px-2 py-1 text-[13px] font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">All team members</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Control cluster — top-right: zoom, fit, locate, calendar, print; the live badge rides underneath */}
        <div className="route-cluster no-print absolute right-3 top-3 z-[1000] flex flex-col items-end gap-2">
          <div className="wb-map-glass flex flex-col overflow-hidden rounded-[12px]">
            <button type="button" onClick={() => mapRef.current?.zoomIn()} className={ctl} aria-label="Zoom in" title="Zoom in">
              <Plus size={16} />
            </button>
            <span className="mx-2 h-px bg-gray-200" aria-hidden />
            <button type="button" onClick={() => mapRef.current?.zoomOut()} className={ctl} aria-label="Zoom out" title="Zoom out">
              <Minus size={16} />
            </button>
          </div>
          <div className="wb-map-glass flex flex-col overflow-hidden rounded-[12px]">
            <button type="button" onClick={fitRoute} disabled={!data || pointsRef.current.length === 0} className={ctl} aria-label="Fit the route" title="Fit the route">
              <Maximize2 size={15} />
            </button>
            <span className="mx-2 h-px bg-gray-200 lg:hidden" aria-hidden />
            <button type="button" onClick={locate} disabled={locating} className={`${ctl} lg:hidden`} aria-label="My location" title="My location">
              {locating ? <Loader2 size={15} className="animate-spin" /> : <Crosshair size={15} />}
            </button>
            <span className="mx-2 h-px bg-gray-200" aria-hidden />
            <Link href={`/app/schedule?view=day&date=${date}${team ? `&team=${team}` : ""}`} className={ctl} aria-label="Open the calendar" title="Calendar">
              <CalendarDays size={15} />
            </Link>
            <span className="mx-2 hidden h-px bg-gray-200 lg:block" aria-hidden />
            <button type="button" onClick={() => window.print()} className={`${ctl} hidden lg:flex`} aria-label="Print the day sheet" title="Print the day sheet">
              <Printer size={15} />
            </button>
          </div>
          {canSeeTeam && date === today && team_.length > 0 && (
            <div className="wb-map-glass pointer-events-none rounded-full px-2.5 py-1 text-[11px] font-semibold text-gray-700">
              {team_.length} on the clock · live
            </div>
          )}
        </div>

        {/* Transient notices float under the header */}
        {(error || applied) && (
          <div className="no-print pointer-events-none absolute left-1/2 top-16 z-[1005] w-[min(92%,30rem)] -translate-x-1/2 space-y-2">
            {error && (
              <div role="alert" className="form-error pointer-events-auto flex items-center justify-between shadow-lg">
                {error}
                <button onClick={() => setError("")} className="p-0.5 text-red-400 hover:text-red-600" aria-label="Dismiss">
                  <X size={14} />
                </button>
              </div>
            )}
            {applied && (
              <div className="msg-enter pointer-events-auto flex items-center justify-between gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 shadow-lg">
                <div className="flex min-w-0 items-center gap-3">
                  <svg width="56" height="22" viewBox="0 0 64 24" fill="none" aria-hidden className="shrink-0">
                    <path className="route-trace" d="M4 18C16 4 24 22 34 10S52 16 60 6" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" />
                    <circle className="route-pin-pop" cx="4" cy="18" r="3" fill="#16A34A" />
                    <circle className="route-pin-pop pin-2" cx="34" cy="10" r="3" fill="#16A34A" />
                    <circle className="route-pin-pop pin-3" cx="60" cy="6" r="3.5" fill="#16A34A" />
                  </svg>
                  <span>{applied}</span>
                </div>
                <button onClick={() => setApplied("")} className="p-0.5 text-green-500 hover:text-green-700" aria-label="Dismiss">
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Desktop: the collapsed panel's reopen tab */}
        {!panelOpen && (
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="wb-map-glass no-print absolute left-3 top-[4.25rem] z-[1000] hidden items-center gap-2 rounded-[12px] px-3 py-2 text-[13px] font-semibold text-gray-800 lg:flex"
            aria-label="Show the stop list"
          >
            <PanelLeftOpen size={15} className="text-gray-500" />
            {summary}
          </button>
        )}

        {/* The stop list: a floating panel on desktop, a bottom sheet on phones */}
        <div
          className={`route-dock wb-map-glass absolute inset-x-0 bottom-0 z-[1000] flex flex-col rounded-t-2xl lg:inset-x-auto lg:bottom-4 lg:left-3 lg:top-[4.25rem] lg:w-[380px] lg:rounded-[12px] ${
            sheetDragH !== null ? "is-dragging" : ""
          } ${panelOpen ? "" : "lg:hidden"}`}
          style={{ ["--dock-h" as string]: `${sheetPx}px` }}
        >
          {/* Phone grip: drag between peek / half / full, tap to step */}
          <div
            className="route-dock-head shrink-0 select-none lg:hidden"
            onPointerDown={beginSheetDrag}
            onPointerMove={moveSheetDrag}
            onPointerUp={endSheetDrag}
            onPointerCancel={endSheetDrag}
            style={{ touchAction: "none" }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                snapTo(sheet === "peek" ? "half" : sheet === "half" ? "full" : "peek");
              }
            }}
            aria-label={sheet === "full" ? "Collapse the stop list" : "Expand the stop list"}
          >
            <div className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-gray-300/90" />
            <div className="flex items-center justify-between gap-2 px-4 pb-1.5 pt-2">
              <p className="numeral-ledger min-w-0 truncate text-sm font-bold text-gray-900">{summary}</p>
              <div className="flex shrink-0 items-center gap-1.5">
                {canDispatch && users.length > 1 && (
                  <select
                    value={team}
                    onChange={(e) => go({ team: e.target.value })}
                    onPointerDown={(e) => e.stopPropagation()}
                    aria-label="Crew"
                    className="max-w-[9rem] rounded-[8px] border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">All team</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                )}
                <ChevronUp size={16} className={`text-gray-400 transition-transform ${sheet === "full" ? "rotate-180" : ""}`} />
              </div>
            </div>
          </div>
          {/* Desktop head: summary + collapse */}
          <div className="route-dock-head hidden shrink-0 items-center justify-between gap-2 border-b border-gray-200/80 px-3 py-2 lg:flex">
            <p className="numeral-ledger min-w-0 truncate text-[13px] font-semibold text-gray-800">{summary}</p>
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              className="rounded-[8px] p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
              aria-label="Hide the stop list"
              title="Hide the stop list"
            >
              <PanelLeftClose size={15} />
            </button>
          </div>
          {list}
        </div>
      </div>

      {/* Optimize preview — nothing is written until Apply */}
      <Modal open={Boolean(preview)} onClose={() => setPreview(null)} size="lg" flush portal>
        {preview && (
          <div className="flex max-h-[88dvh] flex-col">
            <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h2 className="font-display text-base font-bold text-gray-900">{preview.userName}&apos;s route, optimized</h2>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                  <span className="numeral-ledger">
                    Drive time {preview.currentDriveMinutes} min → {preview.totalDriveMinutes} min
                    {preview.totalDistanceMiles > 0 && ` · ${preview.measured ? "" : "~"}${preview.totalDistanceMiles} mi`}
                  </span>
                  {preview.savedMinutes > 0 && <span className="stamp charge-pop text-green-700">saves ~{preview.savedMinutes} min</span>}
                </p>
              </div>
              <button
                onClick={() => setPreview(null)}
                className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              <div className="mb-3 space-y-1.5">
                <label className="flex items-center gap-2 text-xs text-gray-600">
                  Day starts at
                  <input
                    type="time"
                    value={preview.anchorTime}
                    disabled={previewBusy}
                    onChange={(e) =>
                      e.target.value && runOptimize(preview.userId, preview.stops.map((s) => s.id), e.target.value, preview.roundTrip)
                    }
                    className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <span className="text-gray-400">first stop begins then</span>
                </label>
                <div className="flex flex-wrap gap-1">
                  {ANCHOR_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      disabled={previewBusy}
                      onClick={() => runOptimize(preview.userId, preview.stops.map((s) => s.id), p.value, preview.roundTrip)}
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                        preview.anchorTime === p.value
                          ? "border-green-500 bg-green-50 text-green-700"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-2 pt-1 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={preview.roundTrip}
                    disabled={previewBusy}
                    onChange={(e) =>
                      // Hand-ordered previews keep their order; a solved one
                      // is re-solved so the last stop lands near home.
                      runOptimize(
                        preview.userId,
                        preview.manualOrder ? preview.stops.map((s) => s.id) : undefined,
                        preview.anchorTime,
                        e.target.checked,
                        Boolean(preview.manualOrder)
                      )
                    }
                    className="rounded text-green-600 focus:ring-green-500"
                  />
                  End the day back at the start
                  {preview.roundTrip && preview.returnMinutes != null && (
                    <span className="numeral-ledger text-gray-400">(+{preview.returnMinutes} min home)</span>
                  )}
                </label>
              </div>
              {preview.warnings.length > 0 && (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {preview.warnings.map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                </div>
              )}
              {preview.skipped.length > 0 && (
                <p className="mb-3 text-xs text-gray-500">Left in place (no map pin): {preview.skipped.join(", ")}</p>
              )}
              {(preview.pinned?.length ?? 0) > 0 && (
                <p className="mb-3 text-xs text-gray-500">Kept at their current time: {preview.pinned!.join(", ")}</p>
              )}
              <ol className="space-y-1.5">
                {preview.stops.map((s, i) => (
                  <li
                    key={s.id}
                    data-preview-row
                    data-index={i}
                    className={`flex items-center gap-2 rounded-[12px] border border-gray-200 px-2 py-2 ${
                      previewOver?.id === s.id ? "opacity-40" : ""
                    } ${previewOver && previewOver.over === i ? "border-t-2 border-t-green-500" : ""}`}
                  >
                    <button
                      type="button"
                      onPointerDown={(e) => beginPreviewDrag(e, s.id)}
                      aria-label="Drag to reorder"
                      className="shrink-0 cursor-grab touch-none rounded p-0.5 text-gray-300 hover:text-gray-500 active:cursor-grabbing"
                    >
                      <GripVertical size={14} />
                    </button>
                    <span
                      className="numeral-ledger flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ background: INK }}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-gray-900">
                        <span className="truncate">{s.title}</span>
                        {s.kind === "appointment" && <span className="stamp shrink-0 text-purple-700">Appt</span>}
                      </p>
                      <p className="numeral-ledger text-xs text-gray-500">
                        {!s.scheduledAnytime && s.currentStart && (
                          <span className="mr-1.5 text-gray-400 line-through">{fmtTime(s.currentStart)}</span>
                        )}
                        <span className="font-semibold text-gray-800">
                          {fmtTime(s.proposedStart)} – {fmtTime(s.proposedEnd)}
                        </span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {s.driveMinutesFromPrev != null && (
                        <span className="numeral-ledger text-[11px] text-gray-400">+{s.driveMinutesFromPrev}m</span>
                      )}
                      <span className="flex flex-col">
                        <button
                          onClick={() => movePreviewStop(i, -1)}
                          disabled={previewBusy || i === 0}
                          className="rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                          aria-label="Move earlier"
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          onClick={() => movePreviewStop(i, 1)}
                          disabled={previewBusy || i === preview.stops.length - 1}
                          className="rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                          aria-label="Move later"
                        >
                          <ArrowDown size={14} />
                        </button>
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
              <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={notifyOnApply}
                  onChange={(e) => setNotifyOnApply(e.target.checked)}
                  className="rounded text-green-600 focus:ring-green-500"
                />
                Text or email each client whose time changes
              </label>
              <p className="mt-2 text-xs text-gray-500">
                Applying rewrites the calendar times — durations are kept, drive time spaces the stops, and moved visits re-send their
                reminders at the new times. Unconfirmed bookings, calls, and blocked time never move.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
              <button onClick={() => setPreview(null)} className="rounded-[10px] px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100">
                Cancel
              </button>
              <button
                onClick={applyPreview}
                disabled={previewBusy || preview.warnings.some((w) => w.startsWith("Doesn't fit"))}
                className="btn-primary"
              >
                {previewBusy && <Loader2 size={14} className="animate-spin" />}
                Apply new order
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
