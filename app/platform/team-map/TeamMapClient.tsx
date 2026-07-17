"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Map as LeafletMap, Marker } from "leaflet";
import { MapPin, Timer } from "lucide-react";
import { formatDuration } from "@/lib/time-entries";
import "leaflet/dist/leaflet.css";

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

export default function TeamMapClient() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const fittedRef = useRef(false);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // One map instance for the component's lifetime
  useEffect(() => {
    let cancelled = false;

    async function setup() {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, {
        center: [39.5, -98.35], // continental US until we have positions
        zoom: 4,
        zoomControl: true,
      });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
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
        const html = `<div class="team-map-pin"><span>${initials(m.name)}</span></div>`;
        const icon = L.divIcon({ html, className: "", iconSize: [34, 34], iconAnchor: [17, 17] });
        const popup = `<strong>${m.name}</strong><br/>${
          m.jobTitle ? `${m.jobTitle}<br/>` : ""
        }On the clock ${formatDuration(Date.now() - new Date(m.startedAt).getTime())} · ${ageLabel(
          m.positionAt,
          Date.now()
        )}`;
        const existing = markersRef.current.get(m.userId);
        if (existing) {
          existing.setLatLng([m.lat, m.lng]);
          existing.setPopupContent(popup);
        } else {
          const marker = L.marker([m.lat, m.lng], { icon }).addTo(map).bindPopup(popup);
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
      // First load with positions: frame the team
      if (!fittedRef.current && points.length > 0) {
        fittedRef.current = true;
        map.fitBounds(L.latLngBounds(points).pad(0.3), { maxZoom: 14 });
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
    <div className="flex h-[calc(100dvh-4rem)] flex-col lg:h-dvh">
      {/* Pin styling for the divIcon markers */}
      <style>{`
        .team-map-pin {
          width: 34px; height: 34px; border-radius: 9999px;
          background: #16A34A; border: 2.5px solid #fff;
          box-shadow: 0 1px 6px rgba(0,0,0,0.35);
          display: flex; align-items: center; justify-content: center;
        }
        .team-map-pin span { color: #fff; font-size: 12px; font-weight: 700; letter-spacing: 0.02em; }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 lg:px-8 border-b border-gray-200 bg-white">
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
        <div className="flex items-center gap-2 px-4 py-2.5 lg:px-8 bg-gray-50 border-b border-gray-200 text-sm text-gray-500">
          <MapPin size={14} className="text-gray-400" />
          Nobody is on the clock right now. Techs appear here while clocked in.
        </div>
      )}
      {unlocated.length > 0 && (
        <div className="px-4 py-2 lg:px-8 bg-amber-50 border-b border-amber-100 text-xs text-amber-800">
          On the clock without a location:{" "}
          {unlocated.map((m) => m.name).join(", ")} (location off or not yet reported)
        </div>
      )}

      <div ref={containerRef} className="flex-1 min-h-0" />

      {located.length > 0 && (
        <div className="border-t border-gray-200 bg-white px-4 py-2 lg:px-8 flex flex-wrap gap-x-6 gap-y-1">
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
