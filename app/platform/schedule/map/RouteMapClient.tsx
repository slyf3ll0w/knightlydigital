"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Map as LeafletMap, Marker, LayerGroup } from "leaflet";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  CornerDownRight,
  GripVertical,
  Inbox,
  Link2,
  Loader2,
  MapPin,
  Navigation,
  Printer,
  Route as RouteIcon,
  Send,
  Wand2,
  X,
} from "lucide-react";
import PageTitle from "@/components/PageTitle";
import { FilterChip } from "@/components/FilterChips";
import { hapticImpact } from "@/lib/haptics";
import { SECTION_HUES } from "@/lib/section-colors";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { localInputToISO } from "@/lib/statuses";
import { isApplePlatform } from "@/lib/messaging";
import "leaflet/dist/leaflet.css";

/**
 * Routes — the schedule Day view on a map. Numbered pins in visit order,
 * one route per tech drawn along real roads (Mapbox Directions; dashed
 * straight lines when that's unavailable), with the same control grammar as
 * the calendar page so the two read as siblings.
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
}) {
  const router = useRouter();
  const hue = SECTION_HUES.schedule;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const liveLayerRef = useRef<LayerGroup | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const fittedKeyRef = useRef("");

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

  const measured = data?.drive?.measured !== false;
  const tilde = measured ? "" : "~";

  // ── Map lifecycle ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function setup() {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, {
        center: [39.5, -98.35],
        zoom: 4,
        zoomControl: true,
      });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      mapRef.current = map;
    }
    setup();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      liveLayerRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function draw() {
      const L = (await import("leaflet")).default;
      const map = mapRef.current;
      if (!map || cancelled || !data) return;
      map.invalidateSize();

      layerRef.current?.remove();
      markersRef.current.clear();
      const layer = L.layerGroup().addTo(map);
      layerRef.current = layer;
      const points: [number, number][] = [];

      const startPin = (team && data.memberStarts && data.memberStarts[team]) || data.start;
      if (startPin) {
        const icon = L.divIcon({
          html: `<div class="route-pin route-pin-start"><span>HQ</span></div>`,
          className: "",
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        L.marker([startPin.lat, startPin.lng], { icon })
          .addTo(layer)
          .bindPopup(`<strong>${startPin.label}</strong><br/>Start of the day`);
        points.push([startPin.lat, startPin.lng]);
      }

      for (const g of groups) {
        const gStart = (data.memberStarts && data.memberStarts[g.userId]) || data.start;
        const path: [number, number][] = gStart ? [[gStart.lat, gStart.lng]] : [];
        g.stops.forEach((s, i) => {
          if (s.lat == null || s.lng == null) return;
          points.push([s.lat, s.lng]);
          path.push([s.lat, s.lng]);
          const icon = L.divIcon({
            html:
              s.kind === "block"
                ? `<div class="route-pin route-pin-block" style="border-color:${g.color}"><span>${i + 1}</span></div>`
                : `<div class="route-pin" style="background:${g.color}"><span>${i + 1}</span></div>`,
            className: "",
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });
          const when = s.scheduledAnytime ? "Anytime" : fmtTime(s.scheduledAt);
          const link =
            s.kind === "job"
              ? `<br/><a href="/app/jobs/${s.id}">Open job →</a>`
              : s.kind === "appointment"
                ? `<br/><a href="/app/appointments/${s.id}">Open appointment →</a>`
                : `<br/><span style="color:#6B7280">Blocked off — routed around</span>`;
          const nav = navigateHref(s, apple);
          const navLink = nav ? ` · <a href="${nav}" target="_blank" rel="noopener">Navigate →</a>` : "";
          const marker = L.marker([s.lat, s.lng], { icon })
            .addTo(layer)
            .bindPopup(
              `<strong>${i + 1}. ${s.title}</strong><br/>${when} · ${s.contactName}${link}${navLink}`
            );
          markersRef.current.set(`${g.userId}:${s.id}`, marker);
        });
        if (g.userId !== "") {
          // Real roads when Directions gave us a line; dashed as-the-crow-flies otherwise
          const road = data.geometry?.[g.userId];
          if (road && road.length > 1) {
            L.polyline(road, { color: "#fff", weight: 6, opacity: 0.7 }).addTo(layer);
            L.polyline(road, { color: g.color, weight: 3.5, opacity: 0.85 }).addTo(layer);
          } else if (path.length > 1) {
            L.polyline(path, { color: g.color, weight: 2.5, opacity: 0.5, dashArray: "5 7" }).addTo(layer);
          }
        }
      }

      const fitKey = `${date}:${team}`;
      if (points.length > 0 && fittedKeyRef.current !== fitKey) {
        fittedKeyRef.current = fitKey;
        map.fitBounds(L.latLngBounds(points).pad(0.25), { maxZoom: 14 });
      }
    }
    draw();
    return () => {
      cancelled = true;
    };
  }, [data, groups, date, team, apple]);

  // Live tech markers — separate layer so the minute refresh doesn't redraw pins
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
        L.marker([t.lat, t.lng], { icon, zIndexOffset: 1000 })
          .addTo(layer)
          .bindPopup(
            `<strong>${t.name}</strong><br/>${t.jobTitle ? `At ${t.jobTitle} since ${fmtTime(t.startedAt)}` : "Clocked in"}${
              late ? `<br/><span style="color:#DC2626;font-weight:600">Running past the planned end</span>` : ""
            }${ago !== null ? `<br/><span style="color:#6B7280">seen ${ago === 0 ? "just now" : `${ago} min ago`}</span>` : ""}`
          );
      }
    }
    drawLive();
    return () => {
      cancelled = true;
    };
  }, [team_, roster, team, data]);

  const focusStop = useCallback((groupUserId: string, stop: RouteStop) => {
    if (stop.lat == null || stop.lng == null) return;
    const map = mapRef.current;
    const marker = markersRef.current.get(`${groupUserId}:${stop.id}`);
    if (map) map.setView([stop.lat, stop.lng], Math.max(map.getZoom(), 14), { animate: true });
    marker?.openPopup();
  }, []);

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
  return (
    <div className="route-page px-4 py-5 lg:px-8">
      <style>{`
        .route-pin {
          width: 28px; height: 28px; border-radius: 9999px;
          border: 2px solid #fff; box-shadow: 0 1px 4px rgba(10, 20, 40, 0.4);
          display: flex; align-items: center; justify-content: center;
        }
        .route-pin span {
          font-family: "Oxanium", ui-sans-serif, sans-serif;
          color: #fff; font-size: 12px; font-weight: 700;
          font-variant-numeric: lining-nums tabular-nums;
        }
        .route-pin-start { background: ${INK}; border-radius: 9px; }
        .route-pin-block { background: #fff; border-width: 3px; border-style: dashed; }
        .route-pin-block span { color: #374151; }
        .route-pin-start span { font-size: 10px; letter-spacing: 0.03em; }
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
        .route-map .leaflet-tile { filter: saturate(0.55) contrast(1.03); }
        .route-map .leaflet-bar {
          border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
        }
        .route-map .leaflet-bar a { color: #374151; }
        .route-map .leaflet-popup-content-wrapper {
          border-radius: 12px; border: 1px solid #e5e7eb;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);
          font-family: inherit;
        }
        .route-map .leaflet-popup-content { margin: 10px 12px; font-size: 12.5px; line-height: 1.45; }
        .route-map .leaflet-popup-content a { color: #15803d; font-weight: 600; }
        .route-map .leaflet-container { font-family: inherit; }
        .route-map .leaflet-control-attribution { font-size: 9px; opacity: 0.75; }
        @media print {
          .route-page .route-map, .route-page .route-controls, .route-page .route-tray, .route-page .no-print { display: none !important; }
          .route-page .route-list { max-height: none !important; overflow: visible !important; width: 100% !important; }
          .route-page .card-ledger { break-inside: avoid; box-shadow: none; border: 1px solid #ddd; }
        }
      `}</style>

      <div className="mb-4 flex items-center justify-between gap-2">
        <PageTitle section="schedule" icon={RouteIcon}>
          Routes
        </PageTitle>
        <p className="hidden text-sm font-semibold text-gray-700 print:block">{fmtDateLabel(date)}</p>
      </div>

      {/* Controls — same grammar as the calendar page */}
      <div className="route-controls mb-4 flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => go({ date: shiftDate(date, -1) })}
            className="rounded-full p-2 transition-colors hover:bg-gray-100 active:bg-gray-100"
            aria-label="Previous day"
          >
            <ChevronLeft size={18} className="text-gray-600" />
          </button>
          <button
            onClick={() => go({ date: shiftDate(date, 1) })}
            className="rounded-full p-2 transition-colors hover:bg-gray-100 active:bg-gray-100"
            aria-label="Next day"
          >
            <ChevronRight size={18} className="text-gray-600" />
          </button>
          {date !== today && (
            <button
              onClick={() => go({ date: today })}
              className="rounded-[10px] btn-tool-line bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Today
            </button>
          )}
        </div>

        <label className="relative cursor-pointer">
          <h2 className="text-base font-bold text-gray-900 lg:text-lg">{fmtDateLabel(date)}</h2>
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && go({ date: e.target.value })}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Pick a date"
          />
        </label>
        {loading && <Loader2 size={15} className="animate-spin text-gray-400" />}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="hidden items-center gap-1.5 rounded-[10px] btn-tool-line bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 lg:flex"
            title="Print the day sheet"
          >
            <Printer size={14} />
            Print
          </button>
          <FilterChip
            hue={hue}
            active={false}
            href={`/app/schedule?view=day&date=${date}${team ? `&team=${team}` : ""}`}
          >
            <CalendarDays size={14} />
            Calendar
          </FilterChip>
          {canDispatch && users.length > 1 && (
            <select
              value={team}
              onChange={(e) => go({ team: e.target.value })}
              className="min-w-0 rounded-[10px] border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">All team members</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {data && !data.enabled && (
        <div className="no-print mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <MapPin size={15} className="mt-0.5 shrink-0" />
          <span>
            Map pins and drive times need a Mapbox token — add{" "}
            <code className="font-mono text-xs">MAPBOX_TOKEN</code> to the server environment.
            Stops still list below.
          </span>
        </div>
      )}
      {data?.enabled && !measured && groups.length > 0 && (
        <div className="no-print mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Drive times shown are straight-line estimates right now (road times weren&apos;t available). Figures are marked with ~.
        </div>
      )}
      {error && (
        <div role="alert" className="form-error no-print mb-3 flex items-center justify-between">
          {error}
          <button onClick={() => setError("")} className="p-0.5 text-red-400 hover:text-red-600">
            <X size={14} />
          </button>
        </div>
      )}
      {applied && (
        <div className="msg-enter no-print mb-3 flex items-center justify-between gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          <div className="flex min-w-0 items-center gap-3">
            <svg width="56" height="22" viewBox="0 0 64 24" fill="none" aria-hidden className="shrink-0">
              <path className="route-trace" d="M4 18C16 4 24 22 34 10S52 16 60 6" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" />
              <circle className="route-pin-pop" cx="4" cy="18" r="3" fill="#16A34A" />
              <circle className="route-pin-pop pin-2" cx="34" cy="10" r="3" fill="#16A34A" />
              <circle className="route-pin-pop pin-3" cx="60" cy="6" r="3.5" fill="#16A34A" />
            </svg>
            <span>{applied}</span>
          </div>
          <button onClick={() => setApplied("")} className="p-0.5 text-green-500 hover:text-green-700">
            <X size={14} />
          </button>
        </div>
      )}
      {unlocated.length > 0 && (
        <div className="no-print mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          No map pin yet (check the address): {unlocated.join(", ")}
        </div>
      )}

      {/* Map + routes */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="route-map card-ledger relative isolate h-[44dvh] w-full overflow-hidden lg:h-[calc(100dvh-15.5rem)] lg:flex-1">
          <div ref={containerRef} className="absolute inset-0" />
          {loading && !data && (
            <div className="absolute inset-0 z-[500] flex items-center justify-center bg-white/60">
              <Loader2 size={22} className="animate-spin text-gray-400" />
            </div>
          )}
          {canSeeTeam && date === today && team_.length > 0 && (
            <div className="pointer-events-none absolute bottom-2 left-2 z-[500] rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-gray-700 shadow">
              {team_.length} on the clock · live
            </div>
          )}
        </div>

        <div className="route-list w-full space-y-3 lg:w-[380px] lg:max-h-[calc(100dvh-15.5rem)] lg:overflow-y-auto lg:pr-0.5">
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
                    const leg = data?.drive?.legs[g.userId]?.[s.id];
                    const legMi = miles(data?.drive?.km?.[g.userId]?.[s.id]);
                    const nav = navigateHref(s, apple);
                    const dragging = listDrag?.active && listDrag.stopId === s.id;
                    const insertBefore = listDrag?.active && listDrag.over?.group === g.userId && listDrag.over.index === i && listDrag.fromGroup === g.userId;
                    const canGrip = g.userId ? mayOptimize(g.userId) || canDispatch : canDispatch;
                    return (
                      <li key={s.id} data-stop-row data-group={g.userId} data-index={i} className={insertBefore ? "border-t-2 border-t-green-500" : ""}>
                        {leg != null && leg > 0 && (
                          <p className="numeral-ledger flex items-center gap-1.5 px-4 pt-2 text-[10.5px] text-gray-400">
                            <CornerDownRight size={11} className="shrink-0" />
                            {tilde}{leg} min drive{legMi ? ` · ${tilde}${legMi}` : ""}{i === 0 ? " from HQ" : ""}
                          </p>
                        )}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => focusStop(g.userId, s)}
                          onKeyDown={(e) => e.key === "Enter" && focusStop(g.userId, s)}
                          className={`flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-gray-50 active:bg-gray-50 ${
                            dragging ? "opacity-40" : ""
                          } ${reassigning === s.id ? "opacity-50" : ""}`}
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
      </div>

      {/* Optimize preview — nothing is written until Apply */}
      {preview && (
        <div
          className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/40 p-0 lg:items-center lg:p-6"
          onClick={(e) => e.target === e.currentTarget && setPreview(null)}
        >
          <div className="flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl lg:rounded-2xl">
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
        </div>
      )}
    </div>
  );
}
