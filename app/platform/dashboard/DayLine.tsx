"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Monogram from "@/components/Monogram";

/**
 * Home's "today line" (heavy pilot round 6): the work day as a ruler, each
 * job and appointment pinned at its time as the client's circle, a live
 * "now" needle, and the part of the day that's gone shaded. Anytime stops
 * wait in a pocket at the left. Everything is placed on the server's clock
 * first and then follows the real clock once a minute, so the needle moves
 * while the page sits open.
 *
 * Styles: .hm-day* in app/ds-home.css.
 */

export type DayPin = {
  id: string;
  href: string;
  name: string;
  title: string;
  time: string;
  /** ms since epoch; null = anytime */
  at: number | null;
  appt: boolean;
  next: boolean;
};

export type DayTick = { at: number; label: string; major: boolean };

// pins closer than this (share of the day) step up a lane; a phone ruler is
// about a third as wide, so its pins need three times the room
const LANE_GAP = 0.055;
const LANE_GAP_PHONE = 0.15;
const MAX_LANES = 3;

export default function DayLine({
  pins,
  ticks,
  start,
  end,
  serverNow,
  phone = false,
}: {
  pins: DayPin[];
  ticks: DayTick[];
  start: number;
  end: number;
  serverNow: number;
  phone?: boolean;
}) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const span = Math.max(1, end - start);
  const pos = (ms: number) => Math.min(1, Math.max(0, (ms - start) / span));

  // Lanes: walk left to right, drop each pin in the lowest lane whose last
  // pin is far enough away. Deterministic, so server and client agree.
  const timed = pins.filter((p) => p.at != null).sort((a, b) => a.at! - b.at!);
  const laneEnds: number[] = [];
  const placed = timed.map((p) => {
    const x = pos(p.at!);
    let lane = laneEnds.findIndex((e) => x - e >= (phone ? LANE_GAP_PHONE : LANE_GAP));
    if (lane === -1) lane = laneEnds.length < MAX_LANES ? laneEnds.length : laneEnds.indexOf(Math.min(...laneEnds));
    laneEnds[lane] = x;
    return { p, x, lane };
  });
  const lanes = Math.max(1, laneEnds.length);
  const anytime = pins.filter((p) => p.at == null);
  const nowX = pos(now);
  const showNeedle = now >= start && now <= end;

  return (
    <div className="hm-day" style={{ "--lanes": lanes } as React.CSSProperties}>
      {anytime.length > 0 && (
        <div className="hm-day-anytime">
          <span className="hm-day-anytime-label">Anytime</span>
          <span className="hm-day-anytime-pins">
            {anytime.map((p) => (
              <Pin key={p.id} p={p} past={false} />
            ))}
          </span>
        </div>
      )}
      <div className="hm-day-field">
        <div className="hm-day-pins">
          {placed.map(({ p, x, lane }) => (
            <span
              key={p.id}
              className="hm-day-slot"
              style={{ left: `${x * 100}%`, "--lane": lane } as React.CSSProperties}
            >
              <Pin p={p} past={!p.next && p.at! + 45 * 60_000 < now} stem />
            </span>
          ))}
        </div>
        <div className="hm-day-ruler" aria-hidden>
          <span className="hm-day-gone" style={{ width: `${nowX * 100}%` }} />
          {ticks.map((t) => (
            <span
              key={t.at}
              className={`hm-day-tick ${t.major ? "is-major" : ""}`}
              style={{ left: `${pos(t.at) * 100}%` }}
            >
              <span className="hm-day-tick-label">{t.label}</span>
            </span>
          ))}
          {showNeedle && (
            <span className="hm-day-now" style={{ left: `${nowX * 100}%` }}>
              <span className="hm-day-now-label">Now</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Pin({ p, past, stem = false }: { p: DayPin; past: boolean; stem?: boolean }) {
  return (
    <Link
      prefetch={false}
      href={p.href}
      className={`hm-pin ${past ? "is-past" : ""} ${p.next ? "is-next" : ""} ${p.appt ? "is-appt" : ""}`}
      aria-label={`${p.time}: ${p.name}, ${p.title}`}
    >
      <span className="hm-pin-face">
        <Monogram name={p.name} size={30} />
      </span>
      {stem && <span className="hm-pin-stem" />}
      <span className="hm-pin-tip" role="tooltip">
        <b>{p.time}</b> {p.name}
        <span>{p.title}</span>
      </span>
    </Link>
  );
}
