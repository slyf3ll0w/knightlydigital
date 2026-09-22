"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type * as Leaflet from "leaflet";
import type { Map as LeafletMap, Marker } from "leaflet";
import { MapPin, Maximize2, Minus, Plus, Timer } from "lucide-react";
import { formatDuration } from "@/lib/time-entries";
import { addBasemap, initialView, reducedMotion, rememberView } from "@/lib/basemap";
import "leaflet/dist/leaflet.css";

/**
 * Live team map (owners/admins): everyone currently clocked in, at their
 * freshest known position. Same basemap and control cluster as the Routes
 * page (lib/basemap.ts + .wb-map-* in globals.css) so the two read as one
 * family. Opens where a Workbench map last looked — never the US at zoom 4 —
 * then frames the team the first time positions arrive.
 */

type TeamMember = {
  userId: string;
  name: string;
  jobId: string | null;
  jobTitle: string | null;
  jobAddress: string | null;
  startedAt: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  positionAt: string | null;
};

const REFRESH_MS = 60_000;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function ageLabel(iso: string | null, now: number): string {
  if (!iso) return "no location";
  const mins = Math.round((now - new Date(iso).getTime()) / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return `${Math.round(mins / 60)}h ago`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export default function TeamMapClient() {
  const containerRef = useRef<HTMLDivElement>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const pointsRef = useRef<[number, number][]>([]);
  const fittedRef = useRef(false);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const fitTeam = useCallback((animate: boolean) => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map || pointsRef.current.length === 0) return;
    map.fitBounds(L.latLngBounds(pointsRef.current).pad(0.3), { maxZoom: 14, paddingTopLeft: [24, 24], paddingBottomRight: [72, 24], animate: animate && !reducedMotion() });
  }, []);

  // One map instance for the component's lifetime
  useEffect(() => {
    let cancelled = false;

    async function setup() {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      LRef.current = L;
      const view = initialView({ maxZoom: 14 });
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
      mapRef.current = map;
      refresh();
    }

    async function refresh() {
      try {
        const res = await fetch("/api/app/team-map");
        if (!res.ok) return;
        const data = (await res.json()) as { team: TeamMember[] };
        if (cancelled) return;
        setTeam(data.team);
        setLoaded(true);
        setNow(Date.now());
        drawMarkers(data.team);
      } catch {
        // offline / transient — keep the last markers
      }
    }

    async function drawMarkers(members: TeamMember[]) {
      const L = (await import("leaflet")).default;
      const map = mapRef.current;
      if (!map || cancelled) return;
      const seen = new Set<string>();
      const points: [number, number][] = [];

      for (const m of members) {
        if (m.lat == null || m.lng == null) continue;
        seen.add(m.userId);
        points.push([m.lat, m.lng]);
        const html = `<div class="team-map-pin"><span>${esc(initials(m.name))}</span></div>`;
        const icon = L.divIcon({ html, className: "", iconSize: [34, 34], iconAnchor: [17, 17] });
        const popup = `<p class="team-pop-name">${esc(m.name)}</p>${m.jobTitle ? `<p class="team-pop-line">${esc(m.jobTitle)}</p>` : ""}<p class="team-pop-seen">On the clock ${formatDuration(
          Date.now() - new Date(m.startedAt).getTime()
        )} · ${ageLabel(m.positionAt, Date.now())}</p>`;
        const existing = markersRef.current.get(m.userId);
        if (existing) {
          existing.setLatLng([m.lat, m.lng]);
          existing.setPopupContent(popup);
        } else {
          const marker = L.marker([m.lat, m.lng], { icon, keyboard: false })
            .addTo(map)
            .bindPopup(popup, { className: "team-pop", closeButton: false, offset: [0, -14], maxWidth: 240 });
          markersRef.current.set(m.userId, marker);
        }
      }
      // Drop markers for anyone who clocked out
      for (const [userId, marker] of markersRef.current) {
        if (!seen.has(userId)) {
          marker.remove();
          markersRef.current.delete(userId);
        }
      }
      pointsRef.current = points;
      // First load with positions: frame the team (no animation — it's the first paint)
      if (!fittedRef.current && points.length > 0) {
        fittedRef.current = true;
        fitTeam(false);
      }
    }

    setup();
    const id = setInterval(refresh, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const located = team.filter((m) => m.lat != null);
  const unlocated = team.filter((m) => m.lat == null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Pin + popup styling for the divIcon markers */}
      <style>{`
        .team-map-pin {
          width: 34px; height: 34px; border-radius: 9999px;
          background: #16A34A; border: 2.5px solid #fff;
          box-shadow: 0 1px 6px rgba(0,0,0,0.35);
          display: flex; align-items: center; justify-content: center;
          animation: team-pin-in 0.12s ease-out both;
        }
        @keyframes team-pin-in { from { transform: scale(0.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .team-map-pin span { color: #fff; font-size: 12px; font-weight: 700; letter-spacing: 0.02em; }
        .team-map .leaflet-container { font-family: inherit; background: #eef0f3; }
        .team-map .leaflet-control-attribution {
          font-size: 9px; opacity: 0.8; background: rgba(255,255,255,0.7);
          padding: 1px 6px; border-radius: 6px 0 0 0;
        }
        .team-map .team-pop .leaflet-popup-content-wrapper {
          border-radius: 10px; padding: 0;
          border: 1px solid color-mix(in srgb, var(--wb-primary, #0A1428) 16%, #e5e7eb);
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);
          font-family: inherit;
        }
        .team-map .team-pop .leaflet-popup-content { margin: 9px 12px; font-size: 12px; line-height: 1.4; }
        .team-map .team-pop .leaflet-popup-content p { margin: 0; }
        .team-map .team-pop .team-pop-name { font-weight: 700; color: #111827; font-size: 13px; }
        .team-map .team-pop .team-pop-line { color: #374151; }
        .team-map .team-pop .team-pop-seen { color: #6B7280; font-size: 11px; }
        .team-map .team-pop .leaflet-popup-tip { box-shadow: none; border: 1px solid #e5e7eb; border-top: 0; border-left: 0; }
        @media (prefers-reduced-motion: reduce) { .team-map-pin { animation: none; } }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-white px-4 py-3 lg:px-8">
        <div>
          <h1 className="font-display text-lg font-bold text-gray-900">Team map</h1>
          <p className="text-xs text-gray-500">
            Positions update every few minutes while someone is clocked in with the app open —
            never off the clock.
          </p>
        </div>
        <Link
          href="/app/timesheets"
          className="flex items-center gap-1.5 text-xs font-semibold text-green-700 hover:underline"
        >
          <Timer size={12} />
          Timesheets
        </Link>
      </div>

      {loaded && team.length === 0 && (
        <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-500 lg:px-8">
          <MapPin size={14} className="text-gray-400" />
          Nobody is on the clock right now. Techs appear here while clocked in.
        </div>
      )}
      {unlocated.length > 0 && (
        <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800 lg:px-8">
          On the clock without a location:{" "}
          {unlocated.map((m) => m.name).join(", ")} (location off or not yet reported)
        </div>
      )}

      <div className="team-map relative isolate min-h-0 flex-1">
        <div ref={containerRef} className="absolute inset-0" />
        {!loaded && <div className="wb-map-progress absolute inset-x-0 top-0 z-[1010]" role="progressbar" aria-label="Loading the team" />}
        <div className="absolute right-3 top-3 z-[1000] flex flex-col items-end gap-2">
          <div className="wb-map-glass flex flex-col overflow-hidden rounded-[12px]">
            <button type="button" onClick={() => mapRef.current?.zoomIn()} className="wb-map-ctl" aria-label="Zoom in" title="Zoom in">
              <Plus size={16} />
            </button>
            <span className="mx-2 h-px bg-gray-200" aria-hidden />
            <button type="button" onClick={() => mapRef.current?.zoomOut()} className="wb-map-ctl" aria-label="Zoom out" title="Zoom out">
              <Minus size={16} />
            </button>
          </div>
          <div className="wb-map-glass flex flex-col overflow-hidden rounded-[12px]">
            <button type="button" onClick={() => fitTeam(true)} disabled={located.length === 0} className="wb-map-ctl" aria-label="Fit the team" title="Fit the team">
              <Maximize2 size={15} />
            </button>
          </div>
          {located.length > 0 && (
            <div className="wb-map-glass pointer-events-none rounded-full px-2.5 py-1 text-[11px] font-semibold text-gray-700">
              {located.length} on the clock · live
            </div>
          )}
        </div>
      </div>

      {located.length > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-gray-200 bg-white px-4 py-2 lg:px-8">
          {located.map((m) => (
            <span key={m.userId} className="flex items-center gap-1.5 text-xs text-gray-700">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              <strong>{m.name}</strong>
              {m.jobTitle && <span className="text-gray-500">· {m.jobTitle}</span>}
              <span className="text-gray-400">· {ageLabel(m.positionAt, now)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
