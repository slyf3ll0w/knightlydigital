/**
 * The approve ritual — an APPROVED stamp slams onto a glass overlay and
 * settles crooked, the way a hand stamp actually lands. Fires when the
 * team marks a quote approved; the page refresh that follows mounts
 * <Celebration>, so the sequence reads slam → confetti. Body-attached
 * like the send ritual (lib/send-ritual.ts) and for the same reason:
 * router.refresh() swaps the action buttons and would kill any overlay
 * held in component state.
 *
 * Animation classes (charge-overlay / stamp-slam) live in globals.css
 * with the ritual family. prefers-reduced-motion skips the slam but
 * still shows the stamp briefly — never nothing.
 */

export function showApproveRitual(text = "Approved") {
  if (typeof document === "undefined") return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const wrap = document.createElement("div");
  wrap.className = "charge-overlay";
  // pointer-events:none — it's a flourish, never a blocker
  wrap.style.cssText =
    "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;" +
    "background:rgba(255,255,255,0.8);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);" +
    "pointer-events:none;";
  wrap.setAttribute("aria-live", "polite");

  const stamp = document.createElement("div");
  if (!reduced) stamp.className = "stamp-slam";
  else stamp.style.transform = "rotate(-8deg)";
  stamp.style.cssText +=
    "display:inline-block;padding:10px 26px;border:3px solid #16A34A;border-radius:10px;" +
    "color:#16A34A;font-family:Oxanium,sans-serif;font-weight:800;font-size:30px;" +
    "letter-spacing:0.14em;text-transform:uppercase;background:rgba(255,255,255,0.85);";
  stamp.textContent = text;
  wrap.appendChild(stamp);

  document.body.appendChild(wrap);
  // Quick in, gentle out — the confetti (if eligible) takes it from here
  setTimeout(() => {
    wrap.style.transition = "opacity 0.25s ease-out";
    wrap.style.opacity = "0";
  }, reduced ? 700 : 1050);
  setTimeout(() => wrap.remove(), reduced ? 1000 : 1350);
}
