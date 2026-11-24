"use client";

import { useEffect, useRef, useState } from "react";
import { Award, Briefcase, Trophy, Users, Zap, X } from "lucide-react";
import { hapticNotify } from "@/lib/haptics";

/**
 * A milestone moment on Home (lib/milestones.ts picks it on the server):
 * a quiet card whose badge lands with a small stamp, then a light sweeps
 * across the label once. Deliberately softer than the Paid stamp and the
 * payment confetti, which stay the loudest moments in the app.
 *
 * Seen once per person: after the card has been on screen for a beat (or
 * the moment it's closed) it POSTs /api/app/milestones/seen with its key.
 */

const GLYPHS = { money: Award, record: Trophy, jobs: Briefcase, clients: Users, fast: Zap } as const;

export default function MilestoneMoment({
  milestoneKey,
  kind,
  label,
  line,
}: {
  milestoneKey: string;
  kind: keyof typeof GLYPHS;
  label: string;
  line: string;
}) {
  const [open, setOpen] = useState(true);
  const stamped = useRef(false);
  const ref = useRef<HTMLDivElement>(null);

  const stamp = () => {
    if (stamped.current) return;
    stamped.current = true;
    fetch("/api/app/milestones/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: milestoneKey }),
      keepalive: true,
    }).catch(() => {});
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Counts as seen once it has been visible for 1.5 s (not merely rendered
    // below the fold or in a background tab).
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && document.visibilityState === "visible") {
          if (!timer) {
            timer = setTimeout(() => {
              hapticNotify("SUCCESS");
              stamp();
            }, 1500);
          }
        } else if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      },
      { threshold: 0.6 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!open) return null;
  const Glyph = GLYPHS[kind] ?? Trophy;
  return (
    <div ref={ref} className="hm-milestone" role="status">
      <span className="hm-milestone-badge" aria-hidden>
        <Glyph size={20} strokeWidth={2.2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="hm-milestone-label">
          <span className="hm-milestone-shine">{label}</span>
        </p>
        <p className="hm-milestone-line">{line}</p>
      </div>
      <button
        type="button"
        className="hm-milestone-close"
        aria-label="Close"
        onClick={() => {
          stamp();
          setOpen(false);
        }}
      >
        <X size={16} strokeWidth={2.2} />
      </button>
    </div>
  );
}
