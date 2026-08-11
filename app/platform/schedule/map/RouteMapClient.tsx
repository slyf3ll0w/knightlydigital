"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Map as LeafletMap, Marker, LayerGroup } from "leaflet";
import {
  AlertTriangle,
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
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import "leaflet/dist/leaflet.css";

/**
 * Route Manager map view — one day of field work as numbered, color-per-tech
 * pins with the visit order drawn between them (Jobber's schedule map, spec
 * §6, previously parked). Data comes from /api/app/route-plan; "Optimize"
 * previews a drive-time-ordered day via /api/app/route-plan/optimize and
 * only writes when the user applies it.
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

const TECH_COLORS = [
  "#16A34A", "#2563EB", "#EA580C", "#9333EA", "#0D9488",
  "#DC2626", "#CA8A04", "#DB2777", "#4F46E5", "#059669",
];
const UNASSIGNED_COLOR = "#6B7280";

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
      setError("You appear to be offline — the route map needs a connection.");
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

      layerRef.current?.remove();
      markersRef.current.clear();
      const layer = L.layerGroup().addTo(map);
      layerRef.current = layer;
      const points: [number, number][] = [];

      if (data.start) {
        const icon = L.divIcon({
          html: `<div class="route-pin route-pin-start"><span>▲</span></div>`,
          className: "",
          iconSize: [30, 30],
          iconAnchor: [15, 15],
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
            iconSize: [30, 30],
            iconAnchor: [15, 15],
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
            weight: 3,
            opacity: 0.45,
            dashArray: "6 8",
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
    setApplied(`${preview.userName}'s route updated — the calendar now follows the optimized order.`);
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
      <style>{`
        .route-pin {
          width: 30px; height: 30px; border-radius: 9999px;
          border: 2.5px solid #fff; box-shadow: 0 1px 6px rgba(0,0,0,0.35);
          display: flex; align-items: center; justify-content: center;
        }
        .route-pin span { color: #fff; font-size: 12px; font-weight: 700; }
        .route-pin-start { background: #111827; border-radius: 8px; }
      `}</style>

      <div className="mb-4">
        <PageTitle section="schedule" icon={RouteIcon}>
          Route map
        </PageTitle>
        <p className="mt-1 text-sm text-gray-500">
          The day&apos;s stops in driving order — optimize a route to cut windshield time.
        </p>
      </div>

      {/* Controls */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
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
        </div>
        <label className="relative">
          <span className="flex items-center gap-1.5 rounded-[10px] btn-tool-line bg-white px-3 py-1.5 text-sm font-semibold text-gray-800">
            <CalendarDays size={15} className="text-gray-500" />
            {fmtDateLabel(date)}
          </span>
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
          <Link
            href={`/app/schedule?view=day&date=${date}${team ? `&team=${team}` : ""}`}
            className="rounded-[10px] btn-tool-line bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Calendar
          </Link>
        </div>
      </div>

      {data && !data.enabled && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <MapPin size={15} className="mt-0.5 shrink-0" />
          <span>
            Map pins and drive times need a Mapbox token. Add <code className="font-mono text-xs">MAPBOX_TOKEN</code> to
            the server environment (free tier covers ~100k lookups/month) — stops still list below.
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
          No map pin (check the address): {unlocated.join(", ")}
        </div>
      )}

      {/* Map + routes */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div
          ref={containerRef}
          className="h-[46dvh] w-full overflow-hidden rounded-2xl border border-gray-200 lg:h-[calc(100dvh-16rem)] lg:flex-1"
        />

        <div className="w-full space-y-4 lg:w-96 lg:max-h-[calc(100dvh-16rem)] lg:overflow-y-auto">
          {!loading && groups.length === 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
              Nothing scheduled this day.
              <div className="mt-2">
                <Link href={`/app/schedule?view=day&date=${date}`} className="font-semibold text-green-700 hover:underline">
                  Open the calendar →
                </Link>
              </div>
            </div>
          )}

          {groups.map((g) => (
            <div key={g.userId || "unassigned"} className="rounded-2xl border border-gray-200 bg-white">
              <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: g.color }} />
                  <span className="truncate text-sm font-bold text-gray-900">{g.name}</span>
                  <span className="shrink-0 text-xs text-gray-400">
                    {g.stops.length} stop{g.stops.length === 1 ? "" : "s"}
                  </span>
                </div>
                {mayOptimize(g.userId) && g.stops.filter((s) => s.kind === "job" && s.lat != null).length >= 2 && (
                  <button
                    onClick={() => runOptimize(g.userId)}
                    disabled={previewBusy}
                    className="flex shrink-0 items-center gap-1.5 rounded-[10px] btn-tool-line bg-white px-2.5 py-1 text-xs font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-50"
                  >
                    {previewBusy ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                    Optimize
                  </button>
                )}
              </div>
              <ul className="divide-y divide-gray-50">
                {g.stops.map((s, i) => (
                  <li key={s.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => focusStop(g.userId, s)}
                      onKeyDown={(e) => e.key === "Enter" && focusStop(g.userId, s)}
                      className="flex w-full cursor-pointer items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-gray-50"
                    >
                      <span
                        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                        style={{ background: s.lat == null ? "#D1D5DB" : g.color }}
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-gray-900">
                          {s.title}
                          {s.kind === "appointment" && (
                            <span className="ml-1.5 rounded bg-purple-50 px-1 py-0.5 text-[10px] font-semibold text-purple-700 align-middle">
                              APPT
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-gray-500">
                          {s.scheduledAnytime ? "Anytime" : `${fmtTime(s.scheduledAt)}${s.scheduledEnd ? `–${fmtTime(s.scheduledEnd)}` : ""}`}
                          {" · "}
                          {s.contactName}
                        </span>
                        {s.address && (
                          <span className="block truncate text-xs text-gray-400">{s.address}</span>
                        )}
                        {s.lat == null && (
                          <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-amber-600">
                            <AlertTriangle size={11} /> No map pin
                          </span>
                        )}
                      </span>
                      {s.kind === "job" && (
                        <Link
                          href={`/app/jobs/${s.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-0.5 shrink-0 text-xs font-semibold text-green-700 hover:underline"
                        >
                          Open
                        </Link>
                      )}
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
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
              <div>
                <h2 className="flex items-center gap-2 font-display text-base font-bold text-gray-900">
                  <RouteIcon size={16} className="text-green-600" />
                  {preview.userName}&apos;s optimized route
                </h2>
                <p className="text-xs text-gray-500">
                  Drive time {preview.currentDriveMinutes} min → {preview.totalDriveMinutes} min
                  {preview.savedMinutes > 0 && (
                    <span className="font-semibold text-green-700"> · saves ~{preview.savedMinutes} min</span>
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
                  <li key={s.id} className="flex items-center gap-2.5 rounded-xl border border-gray-100 px-3 py-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-gray-900">{s.title}</span>
                      <span className="block text-xs text-gray-500">
                        {s.scheduledAnytime ? "Anytime" : fmtTime(s.currentStart)} → {" "}
                        <span className="font-semibold text-gray-800">
                          {fmtTime(s.proposedStart)}–{fmtTime(s.proposedEnd)}
                        </span>
                        {s.driveMinutesFromPrev != null && (
                          <span className="text-gray-400"> · {s.driveMinutesFromPrev} min drive</span>
                        )}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col">
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
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-gray-400">
                Times are rewritten on the calendar when you apply — durations are kept, drive-time gaps
                are added between stops, and appointments never move.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3.5">
              <button
                onClick={() => setPreview(null)}
                className="rounded-[10px] px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={applyPreview}
                disabled={previewBusy}
                className="flex items-center gap-1.5 rounded-[10px] bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
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
