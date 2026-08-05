"use client";

import { useEffect } from "react";
import { hapticNotify } from "@/lib/haptics";

/**
 * One-shot confetti + success haptic for a win moment (invoice paid online,
 * quote approved by the client). The server page decides eligibility per user
 * (see lib/celebrations.ts `shouldCelebrate`); this fires the moment, then
 * POSTs `endpoint` to stamp the CelebrationSeen row so this user never sees
 * it twice. Same visibility-delay beacon shape as components/ViewBeacon.tsx.
 */

const COLORS = ["#22C55E", "#16A34A", "#4ADE80", "#FBBF24", "#0C0F0C"];

export default function Celebration({
  endpoint,
  celebrate,
}: {
  endpoint: string;
  celebrate: boolean;
}) {
  useEffect(() => {
    if (!celebrate) return;
    let fired = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopConfetti: (() => void) | null = null;

    const fire = () => {
      if (fired) return;
      fired = true;
      hapticNotify("SUCCESS");
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        stopConfetti = runConfetti();
      }
      fetch(endpoint, {
        method: "POST",
        keepalive: true,
      }).catch(() => {});
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (timer) clearTimeout(timer);
        timer = setTimeout(fire, 450);
      } else if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer) clearTimeout(timer);
      stopConfetti?.();
    };
  }, [celebrate, endpoint]);

  return null;
}

/** Gentle full-width confetti fall — ~2.8s, then the canvas removes itself. */
function runConfetti(): () => void {
  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return () => {};
  }
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const particles = Array.from({ length: 90 }, () => ({
    x: Math.random() * w,
    y: -20 - Math.random() * h * 0.3, // staggered entry from above the viewport
    vy: 140 + Math.random() * 160,
    sway: 25 + Math.random() * 35,
    phase: Math.random() * Math.PI * 2,
    spin: 2 + Math.random() * 4,
    size: 5 + Math.random() * 4,
    rot: Math.random() * Math.PI,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  }));

  const DURATION = 2800;
  const FADE = 600;
  let raf = 0;
  let last = performance.now();
  const start = last;

  const frame = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const t = now - start;
    ctx.clearRect(0, 0, w, h);
    const alpha = t > DURATION - FADE ? Math.max(0, (DURATION - t) / FADE) : 1;

    let alive = false;
    for (const p of particles) {
      p.vy = Math.min(p.vy + 220 * dt, 340);
      p.y += p.vy * dt;
      p.phase += p.spin * dt;
      p.x += Math.cos(p.phase) * p.sway * dt;
      if (p.y > h + 20) continue;
      alive = true;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot + Math.sin(p.phase) * 0.6);
      // squash one axis as the piece "tumbles" so flat rectangles read as 3D
      ctx.scale(1, 0.35 + Math.abs(Math.sin(p.phase)) * 0.65);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }

    if (t < DURATION && alive) raf = requestAnimationFrame(frame);
    else canvas.remove();
  };
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    canvas.remove();
  };
}
