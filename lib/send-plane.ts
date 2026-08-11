/**
 * Paper-plane send animation: a small plane darts up and out of the button
 * that emailed a quote/invoice. Plays on EVERY successful send — this is
 * action feedback, unlike the per-user one-shot confetti in
 * components/Celebration.tsx which marks a win. Pair with
 * hapticImpact("LIGHT") at the call site (send = LIGHT per lib/haptics.ts).
 *
 * Capture the launch point at click time — the button often unmounts before
 * the send request resolves (menus close, status buttons swap).
 */

export type LaunchPoint = { x: number; y: number };

export function launchPointFrom(el: HTMLElement | null): LaunchPoint | null {
  if (!el?.getBoundingClientRect) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export function launchSendPlane(from: LaunchPoint | null) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const start = from ?? { x: window.innerWidth / 2, y: window.innerHeight * 0.75 };

  const wrap = document.createElement("div");
  wrap.style.cssText = `position:fixed;left:${start.x}px;top:${start.y}px;pointer-events:none;z-index:9999;will-change:transform,opacity;opacity:0`;
  wrap.setAttribute("aria-hidden", "true");
  // lucide "send" glyph, matching button iconography
  wrap.innerHTML =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#22C55E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:-13px 0 0 -13px"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>';
  document.body.appendChild(wrap);

  // Fly up and to the right, exiting past the viewport edge. The floors
  // matter: desktop action rows sit at the top-right, where "distance to the
  // edge" is nearly zero — without them the flight collapsed into an
  // invisible 60px hop there (why the animation read as mobile-only).
  const dx = Math.min(Math.max(160, window.innerWidth - start.x + 60), 480);
  const dy = -Math.min(Math.max(180, start.y + 60), 420);

  const anim = wrap.animate(
    [
      { transform: "translate(0,0) rotate(0deg) scale(0.6)", opacity: 0 },
      // brief wind-up dip before launch
      { transform: "translate(-6px,4px) rotate(-12deg) scale(1)", opacity: 1, offset: 0.18 },
      {
        transform: `translate(${dx * 0.45}px,${dy * 0.7}px) rotate(8deg) scale(0.85)`,
        opacity: 1,
        offset: 0.6,
      },
      // recede into the distance and fade
      { transform: `translate(${dx}px,${dy}px) rotate(14deg) scale(0.45)`, opacity: 0 },
    ],
    { duration: 800, easing: "cubic-bezier(0.25, 0.6, 0.3, 1)" }
  );
  anim.onfinish = () => wrap.remove();
  anim.oncancel = () => wrap.remove();
}
