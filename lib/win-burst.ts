/**
 * The win burst — a quick spark of confetti bits from a single point,
 * for winning a lead. Deliberately a fraction of the full-screen paid
 * confetti (components/Celebration.tsx): wins spark, money rains — the
 * hierarchy is the point. Same reason as the send ritual for living on
 * document.body: the board refreshes right after, and a body-attached
 * burst survives anything React does.
 *
 * Keyframes (spark-fly) live in globals.css with the ritual family; each
 * spark's throw vector is passed via --dx/--dy custom properties.
 */

const COLORS = ["#22C55E", "#16A34A", "#4ADE80", "#FBBF24"];

export function showWinBurst(x?: number, y?: number) {
  if (typeof document === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // Default origin sits where the toast lands (bottom, toward the right)
  const cx = x ?? window.innerWidth - 120;
  const cy = y ?? window.innerHeight - 120;

  const wrap = document.createElement("div");
  wrap.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;z-index:9999;pointer-events:none;`;
  wrap.setAttribute("aria-hidden", "true");

  const COUNT = 12;
  for (let i = 0; i < COUNT; i++) {
    // Full circle, jittered so the ring never reads as mechanical
    const angle = (i / COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
    const dist = 44 + Math.random() * 40;
    const s = document.createElement("span");
    const size = 5 + Math.random() * 3;
    s.className = "spark-fly";
    s.style.cssText =
      `position:absolute;left:${-size / 2}px;top:${-size / 2}px;` +
      `width:${size}px;height:${size}px;border-radius:2px;` +
      `background:${COLORS[i % COLORS.length]};` +
      `--dx:${Math.cos(angle) * dist}px;--dy:${Math.sin(angle) * dist - 14}px;` +
      `animation-delay:${Math.random() * 0.08}s;`;
    wrap.appendChild(s);
  }

  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 800);
}
