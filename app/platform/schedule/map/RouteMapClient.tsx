"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Map as LeafletMap, Marker, LayerGroup } from "leaflet";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  Route as RouteIcon,
  Wand2,
  X,
} from "lucide-react";
import PageTitle from "@/components/PageTitle";
import { FilterChip } from "@/components/FilterChips";
import { SECTION_HUES } from "@/lib/section-colors";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import "leaflet/dist/leaflet.css";

/**
 * Routes — the schedule Day view on a map (Jobber's map view, spec §6,
 * previously parked). Numbered pins in visit order, one route per tech, with
 * the same control grammar as the calendar page so the two read as siblings.
 * "Optimize" previews a drive-time order via /api/app/route-plan/optimize
 * and writes nothing until Apply.
 */

type RouteStop = {
  id: string;
  kind: "job" | "appointment";
  jobNumber: number | null;
  title: string;
  status: string;
  contactName: string;
  address: string | null;
  scheduledAt: string | null;
  scheduledEnd: string | null;
  scheduledAnytime: boolean;
  assigneeIds: string[];
  lat: number | null;
  lng: number | null;
};

type RouteDay = {
  enabled: boolean;
  start: { lat: number; lng: number; label: string } | null;
  stops: RouteStop[];
};

type OptimizeStop = {
  id: string;
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
  currentDriveMinutes: number;
  totalDriveMinutes: number;
  savedMinutes: number;
  skipped: string[];
  warnings: string[];
  applied: boolean;
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

function todayStr(): string {
  const t = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
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

export default function RouteMapClient({
  date,
  team,
  users,
  meId,
  meName,
  canDispatch,
  canOptimize,
}: {
  date: string;
  team: string;
  users: { id: string; name: string }[];
  meId: string;
  meName: string;
  canDispatch: boolean;
  canOptimize: boolean;
}) {
  const router = useRouter();
  const hue = SECTION_HUES.schedule;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const fittedKeyRef = useRef("");

  const [data, setData] = useState<RouteDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<(OptimizeResult & { userId: string }) | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [applied, setApplied] = useState("");

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
      const res = await fetch(`/api/app/route-plan?date=${date}`);
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
    const out: { userId: string; name: string; color: string; stops: RouteStop[] }[] = [];
    for (const u of visible) {
      const stops = sorted.filter((s) => s.assigneeIds.includes(u.id));
      if (stops.length) {
        out.push({
          userId: u.id,
          name: u.name,
          color: TECH_COLORS[Math.max(0, roster.findIndex((r) => r.id === u.id)) % TECH_COLORS.length],
          stops,
        });
      }
    }
    if (canDispatch && !team) {
      const unassigned = sorted.filter((s) => s.assigneeIds.length === 0);
      if (unassigned.length) {
        out.push({ userId: "", name: "Unassigned", color: UNASSIGNED_COLOR, stops: unassigned });
      }
    }
    return out;
  }, [data, roster, team, canDispatch]);

  const unlocated = useMemo(
    () => groups.flatMap((g) => g.stops.filter((s) => s.lat == null).map((s) => s.title)),
    [groups]
  );

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

      if (data.start) {
        const icon = L.divIcon({
          html: `<div class="route-pin route-pin-start"><span>HQ</span></div>`,
          className: "",
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        L.marker([data.start.lat, data.start.lng], { icon })
          .addTo(layer)
          .bindPopup(`<strong>${data.start.label}</strong><br/>Start of the day`);
        points.push([data.start.lat, data.start.lng]);
      }

      for (const g of groups) {
        const path: [number, number][] = data.start ? [[data.start.lat, data.start.lng]] : [];
        g.stops.forEach((s, i) => {
          if (s.lat == null || s.lng == null) return;
          points.push([s.lat, s.lng]);
          path.push([s.lat, s.lng]);
          const icon = L.divIcon({
            html: `<div class="route-pin" style="background:${g.color}"><span>${i + 1}</span></div>`,
            className: "",
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });
          const when = s.scheduledAnytime ? "Anytime" : fmtTime(s.scheduledAt);
          const link =
            s.kind === "job" ? `<br/><a href="/app/jobs/${s.id}">Open job →</a>` : "";
          const marker = L.marker([s.lat, s.lng], { icon })
            .addTo(layer)
            .bindPopup(
              `<strong>${i + 1}. ${s.title}</strong><br/>${when} · ${s.contactName}${link}`
            );
          markersRef.current.set(`${g.userId}:${s.id}`, marker);
        });
        if (path.length > 1 && g.userId !== "") {
          L.polyline(path, {
            color: g.color,
            weight: 2.5,
            opacity: 0.5,
            dashArray: "5 7",
          }).addTo(layer);
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
  }, [data, groups, date, team]);

  const focusStop = useCallback((groupUserId: string, stop: RouteStop) => {
    if (stop.lat == null || stop.lng == null) return;
    const map = mapRef.current;
    const marker = markersRef.current.get(`${groupUserId}:${stop.id}`);
    if (map) map.setView([stop.lat, stop.lng], Math.max(map.getZoom(), 14), { animate: true });
    marker?.openPopup();
  }, []);

  // ── Optimize flow ─────────────────────────────────────────────────────────
  const runOptimize = useCallback(
    async (userId: string, order?: string[]) => {
      setPreviewBusy(true);
      const { ok, data: result } = await postJson<OptimizeResult>("/api/app/route-plan/optimize", {
        date,
        userId,
        ...(order ? { order } : {}),
      });
      setPreviewBusy(false);
      if (!ok || !result || result.stops == null) {
        setError(result?.error ?? GENERIC_ERROR);
        return;
      }
      setError("");
      setPreview({ ...result, userId });
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
      apply: true,
    });
    setPreviewBusy(false);
    if (!ok || !result?.applied) {
      setError(result?.error ?? GENERIC_ERROR);
      return;
    }
    setApplied(`${preview.userName}'s route updated — the calendar now follows this order.`);
    setPreview(null);
    refresh();
    router.refresh();
  }, [preview, date, refresh, router]);

  const movePreviewStop = useCallback(
    (index: number, dir: -1 | 1) => {
      if (!preview) return;
      const ids = preview.stops.map((s) => s.id);
      const j = index + dir;
      if (j < 0 || j >= ids.length) return;
      [ids[index], ids[j]] = [ids[j], ids[index]];
      runOptimize(preview.userId, ids);
    },
    [preview, runOptimize]
  );

  const mayOptimize = useCallback(
    (userId: string) => canOptimize && userId !== "" && (canDispatch || userId === meId),
    [canOptimize, canDispatch, meId]
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="px-4 py-5 lg:px-8">
      {/* Map chrome tuned to the app: pin numerals in Oxanium, muted tiles so
          the basemap sits behind the brand colors, ledger-card popups, and
          zoom buttons on the same hairline-border language as every control. */}
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
        .route-pin-start span { font-size: 10px; letter-spacing: 0.03em; }
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
      `}</style>

      <div className="mb-4">
        <PageTitle section="schedule" icon={RouteIcon}>
          Routes
        </PageTitle>
      </div>

      {/* Controls — same grammar as the calendar page */}
      <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-2">
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
          {date !== todayStr() && (
            <button
              onClick={() => go({ date: todayStr() })}
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
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <MapPin size={15} className="mt-0.5 shrink-0" />
          <span>
            Map pins and drive times need a Mapbox token — add{" "}
            <code className="font-mono text-xs">MAPBOX_TOKEN</code> to the server environment.
            Stops still list below.
          </span>
        </div>
      )}
      {error && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <button onClick={() => setError("")} className="p-0.5 text-red-400 hover:text-red-600">
            <X size={14} />
          </button>
        </div>
      )}
      {applied && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {applied}
          <button onClick={() => setApplied("")} className="p-0.5 text-green-500 hover:text-green-700">
            <X size={14} />
          </button>
        </div>
      )}
      {unlocated.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          No map pin yet (check the address): {unlocated.join(", ")}
        </div>
      )}

      {/* Map + routes */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="route-map card-ledger relative h-[44dvh] w-full overflow-hidden lg:h-[calc(100dvh-15.5rem)] lg:flex-1">
          <div ref={containerRef} className="absolute inset-0" />
          {loading && !data && (
            <div className="absolute inset-0 z-[500] flex items-center justify-center bg-white/60">
              <Loader2 size={22} className="animate-spin text-gray-400" />
            </div>
          )}
        </div>

        <div className="w-full space-y-3 lg:w-[380px] lg:max-h-[calc(100dvh-15.5rem)] lg:overflow-y-auto lg:pr-0.5">
          {!loading && groups.length === 0 && (
            <div className="card-ledger px-4 py-10 text-center">
              <RouteIcon size={22} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm font-semibold text-gray-900">Nothing scheduled this day</p>
              <p className="mt-1 text-xs text-gray-500">
                Jobs with a scheduled date show up here as a route.
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

          {groups.map((g) => (
            <div key={g.userId || "unassigned"} className="card-ledger overflow-hidden">
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
                    </p>
                  </div>
                </div>
                {mayOptimize(g.userId) &&
                  g.stops.filter((s) => s.kind === "job" && s.lat != null).length >= 2 && (
                    <button
                      onClick={() => runOptimize(g.userId)}
                      disabled={previewBusy}
                      className="flex shrink-0 items-center gap-1.5 rounded-[10px] btn-tool-line bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-50"
                    >
                      {previewBusy ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                      Optimize
                    </button>
                  )}
              </div>
              <ul className="divide-y divide-gray-100">
                {g.stops.map((s, i) => (
                  <li key={s.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => focusStop(g.userId, s)}
                      onKeyDown={(e) => e.key === "Enter" && focusStop(g.userId, s)}
                      className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-gray-50 active:bg-gray-50"
                    >
                      <span
                        className="numeral-ledger flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                        style={{ background: s.lat == null ? "#D1D5DB" : g.color }}
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-gray-900">
                          <span className="truncate">{s.title}</span>
                          {s.kind === "appointment" && (
                            <span className="stamp shrink-0 text-purple-700">Appt</span>
                          )}
                          {s.lat == null && (
                            <span className="stamp shrink-0 text-amber-700">No pin</span>
                          )}
                        </p>
                        <p className="truncate text-xs text-gray-500">
                          {s.contactName}
                          {s.address ? ` · ${s.address}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="numeral-ledger text-xs font-semibold text-gray-900">
                          {s.scheduledAnytime ? "Anytime" : fmtTime(s.scheduledAt)}
                        </p>
                        {s.kind === "job" ? (
                          <Link
                            href={`/app/jobs/${s.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-[11px] font-semibold text-green-700 hover:underline"
                          >
                            Open
                          </Link>
                        ) : (
                          !s.scheduledAnytime &&
                          s.scheduledEnd && (
                            <p className="numeral-ledger text-[10px] text-gray-400">
                              – {fmtTime(s.scheduledEnd)}
                            </p>
                          )
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Optimize preview — nothing is written until Apply */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6">
          <div className="flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
            <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h2 className="font-display text-base font-bold text-gray-900">
                  {preview.userName}&apos;s route, optimized
                </h2>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="numeral-ledger">
                    Drive time {preview.currentDriveMinutes} min → {preview.totalDriveMinutes} min
                  </span>
                  {preview.savedMinutes > 0 && (
                    <span className="stamp text-green-700">saves ~{preview.savedMinutes} min</span>
                  )}
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
              {preview.warnings.length > 0 && (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {preview.warnings.map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                </div>
              )}
              {preview.skipped.length > 0 && (
                <p className="mb-3 text-xs text-gray-500">
                  Left in place (no map pin): {preview.skipped.join(", ")}
                </p>
              )}
              <ol className="space-y-1.5">
                {preview.stops.map((s, i) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-3 rounded-[12px] border border-gray-200 px-3 py-2"
                  >
                    <span
                      className="numeral-ledger flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ background: INK }}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-900">{s.title}</p>
                      <p className="numeral-ledger text-xs text-gray-500">
                        {!s.scheduledAnytime && s.currentStart && (
                          <span className="mr-1.5 text-gray-400 line-through">
                            {fmtTime(s.currentStart)}
                          </span>
                        )}
                        <span className="font-semibold text-gray-800">
                          {fmtTime(s.proposedStart)} – {fmtTime(s.proposedEnd)}
                        </span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {s.driveMinutesFromPrev != null && (
                        <span className="numeral-ledger text-[11px] text-gray-400">
                          +{s.driveMinutesFromPrev}m
                        </span>
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
              <p className="mt-3 text-xs text-gray-400">
                Applying rewrites the calendar times — durations are kept, drive time spaces the
                stops, and appointments never move.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
              <button
                onClick={() => setPreview(null)}
                className="rounded-[10px] px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={applyPreview}
                disabled={previewBusy}
                className="flex items-center gap-2 rounded-[10px] btn-tool bg-green-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-600 active:bg-green-700 disabled:opacity-50"
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
