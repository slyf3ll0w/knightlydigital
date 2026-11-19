"use client";

import { useEffect, useRef } from "react";

/**
 * The hero app leans back a few degrees, like a screen on a desk, and
 * settles flat as it scrolls up into view. Transform only (no re-render);
 * flat under reduced motion.
 */
export default function WBTilt({ children, max = 9, className = "" }: { children: React.ReactNode; max?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const vh = window.innerHeight;
      const top = el.getBoundingClientRect().top;
      // 0 when the top sits at the bottom of the screen, 1 once it is 40% up.
      const p = Math.min(1, Math.max(0, (vh - top) / (vh * 0.6)));
      const deg = max * (1 - p);
      el.style.transform = `perspective(2000px) rotateX(${deg.toFixed(2)}deg)`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [max]);

  return (
    <div ref={ref} className={className} style={{ transformOrigin: "50% 100%", willChange: "transform" }}>
      {children}
    </div>
  );
}
