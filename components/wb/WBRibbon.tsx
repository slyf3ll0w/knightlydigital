/**
 * The brand ribbon (Stripe-style, David 2026-11-18): layered silky bands
 * of WorkBench blue through violet to orange sweeping in from the top
 * right of a hero. Pure SVG. The bands drift on their own clocks and the
 * colors breathe (globals.css .wb-flow-*, .wb-ribbon-svg; still under
 * reduced motion). `id` must be unique per page when two ribbons show.
 * Decorative only.
 */
export default function WBRibbon({ className = "", id = "wbr" }: { className?: string; id?: string }) {
  const u = (k: string) => `url(#${id}-${k})`;
  return (
    <svg
      viewBox="0 0 800 640"
      preserveAspectRatio="xMaxYMin slice"
      className={`wb-ribbon-svg pointer-events-none absolute ${className}`}
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-a`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#0B57D8" />
          <stop offset="0.45" stopColor="#5B5BEA" />
          <stop offset="1" stopColor="#A35CE6" />
        </linearGradient>
        <linearGradient id={`${id}-b`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#7A5CF0" />
          <stop offset="0.5" stopColor="#E2557F" />
          <stop offset="1" stopColor="#F86A0A" />
        </linearGradient>
        <linearGradient id={`${id}-c`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#F86A0A" />
          <stop offset="0.6" stopColor="#FF9A4D" />
          <stop offset="1" stopColor="#FFD2A8" />
        </linearGradient>
        <linearGradient id={`${id}-d`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2E6FF2" />
          <stop offset="1" stopColor="#8FB3F5" />
        </linearGradient>
        <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.35" stopColor="#fff" stopOpacity="1" />
        </linearGradient>
        <mask id={`${id}-mask`}>
          <rect width="800" height="640" fill={u("fade")} />
        </mask>
        <pattern id={`${id}-sheen`} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(58)">
          <line x1="0" y1="0" x2="0" y2="9" stroke="#fff" strokeOpacity="0.22" strokeWidth="1.2" />
        </pattern>
        <filter id={`${id}-soft`} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
        <filter id={`${id}-silk`} x="-5%" y="-5%" width="110%" height="110%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
      </defs>
      <g mask={u("mask")} filter={u("silk")}>
        {/* back: a wide blue band, blurred */}
        <path d="M250 -40 C 420 120, 520 260, 820 300 L 820 -40 Z" fill={u("d")} opacity="0.55" filter={u("soft")} />
        {/* the main sweep */}
        <path className="wb-flow-a" d="M330 -40 C 430 140, 560 300, 820 380 L 820 160 C 640 110, 560 40, 520 -40 Z" fill={u("a")} />
        <g className="wb-flow-b">
          <path d="M440 -40 C 520 130, 640 260, 820 320 L 820 60 C 720 30, 660 -10, 640 -40 Z" fill={u("b")} opacity="0.92" />
          <path d="M470 -40 C 540 120, 650 250, 820 300 L 820 60 C 720 30, 660 -10, 640 -40 Z" fill={u("sheen")} />
        </g>
        <path className="wb-flow-c" d="M600 -40 C 640 60, 720 140, 820 170 L 820 -40 Z" fill={u("c")} />
        {/* a thin trailing ribbon */}
        <path className="wb-flow-c" d="M290 -40 C 410 200, 590 410, 820 440 L 820 400 C 610 370, 450 190, 345 -40 Z" fill={u("a")} opacity="0.5" />
      </g>
    </svg>
  );
}
