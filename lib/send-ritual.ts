/**
 * The send ritual — plane sweeps across a glass overlay, then the green
 * check draws itself over "Emailed to …". Deliberately NOT a React
 * component: a successful send refreshes the page and swaps the action
 * buttons, which unmounts the actions component — any overlay held in its
 * state dies before it paints (the original paper plane lived on
 * document.body for the same reason). This appends straight to the body and
 * removes itself, so nothing React does can kill it.
 *
 * Animation classes (charge-overlay / send-fly / charge-pop / charge-draw)
 * live in globals.css next to the charge ritual's. prefers-reduced-motion
 * skips the flight but always shows the confirmation — never nothing.
 */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// lucide "send" glyph, matching the button iconography
const PLANE = `<svg class="send-fly" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="position:absolute;left:50%;top:50%;margin:-17px 0 0 -17px"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`;

export function showSendRitual(to: string) {
  if (typeof document === "undefined") return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const wrap = document.createElement("div");
  wrap.className = "charge-overlay";
  wrap.style.cssText =
    "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;" +
    "background:rgba(255,255,255,0.8);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);padding:0 24px;";
  wrap.setAttribute("aria-live", "polite");

  const inner = document.createElement("div");
  inner.style.cssText = "width:100%;max-width:320px;text-align:center;";
  wrap.appendChild(inner);

  const flight =
    `<div style="position:relative;width:96px;height:96px;margin:0 auto;">${PLANE}</div>` +
    `<p style="margin-top:20px;font-size:14px;color:#6B7280;">Sending…</p>`;
  const sent =
    `<div class="charge-pop" style="width:96px;height:96px;border-radius:9999px;background:#16A34A;display:flex;align-items:center;justify-content:center;margin:0 auto;">` +
    `<svg viewBox="0 0 48 48" style="width:48px;height:48px"><path class="charge-draw" d="M12 25 L21 34 L37 16" fill="none" stroke="white" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>` +
    `</div>` +
    `<p style="margin-top:20px;font-size:18px;font-weight:700;color:#111827;">On its way</p>` +
    `<p style="margin-top:4px;font-size:14px;color:#4B5563;word-break:break-all;">Emailed to ${esc(to)}</p>`;

  if (reduced) {
    inner.innerHTML = sent;
  } else {
    inner.innerHTML = flight;
    setTimeout(() => {
      inner.innerHTML = sent;
    }, 850);
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), reduced ? 1400 : 2300);
}
