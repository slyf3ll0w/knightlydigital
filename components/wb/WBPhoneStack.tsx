"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

/**
 * "The office in your pocket" (home direction preview, David 2026-11-19:
 * "could use a little more pizzaz"). Three real app screens; push
 * notifications drop down inside the middle phone's screen one after
 * another, the way they really arrive, and the side phones drift a little
 * as the page scrolls. Still under reduced motion. Demo company names only.
 */

const PUSHES = [
  { title: "New booking", body: "Grace Kim booked Thu 9:00a · Ceiling fan install" },
  { title: "Payment received", body: "Derek Olsen paid $1,240.00 by card" },
  { title: "Quote approved", body: "Maria Hernandez approved quote #1042" },
  { title: "New message", body: "Olivia Park: “Gate's open, come on in!”" },
];

/** Round 3 ("the screenshots are still pretty unclear"): shown much larger —
 *  the middle phone near the screenshot's own size, the side phones tucked
 *  behind it — so the text in the real screens can be read. */
function Screen({ src, alt, className = "", children }: { src: string; alt: string; className?: string; children?: React.ReactNode }) {
  return (
    <div
      className={`relative overflow-hidden rounded-[2.4rem] bg-white shadow-[0_0_0_1px_rgba(10,20,40,0.1),0_30px_60px_-28px_rgba(10,20,40,0.55)] ${className}`}
      style={{ aspectRatio: "640 / 1385" }}
    >
      <Image src={src} alt={alt} fill unoptimized sizes="230px" className="object-cover" />
      {children}
    </div>
  );
}

export default function WBPhoneStack() {
  const ref = useRef<HTMLDivElement>(null);
  const [n, setN] = useState(0);
  const [shown, setShown] = useState(false);
  const [drift, setDrift] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let run = false;
    let timers: ReturnType<typeof setTimeout>[] = [];
    const cycle = (k: number) => {
      if (!run) return;
      setN(k);
      setShown(true);
      timers.push(setTimeout(() => setShown(false), 2800));
      timers.push(setTimeout(() => cycle((k + 1) % PUSHES.length), 3600));
    };
    const io = new IntersectionObserver(([e]) => {
      const was = run;
      run = e.isIntersecting;
      if (run && !was) timers.push(setTimeout(() => cycle(0), 700));
      if (!run) {
        timers.forEach(clearTimeout);
        timers = [];
        setShown(false);
      }
    }, { threshold: 0.35 });
    if (ref.current) io.observe(ref.current);

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = ref.current?.getBoundingClientRect();
        if (r) setDrift(Math.max(-1, Math.min(1, (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight)));
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  const p = PUSHES[n];
  return (
    <div ref={ref} className="relative flex items-start justify-center">
      <div className="relative z-0 -mr-14 mt-20 max-sm:hidden" style={{ transform: `translateY(${drift * 28}px)` }}>
        <Screen src="/screens/mobile-03.png" alt="Invoices in the WorkBench app" className="w-[240px] xl:w-[260px]" />
      </div>
      <Screen src="/screens/mobile-01.png" alt="The week's schedule in the WorkBench app" className="relative z-10 w-[270px] sm:w-[300px] xl:w-[320px]">
        {/* a push notification dropping in, the way iOS shows one */}
        <div
          aria-hidden
          className={`absolute inset-x-3 top-12 rounded-2xl bg-white/90 p-2.5 shadow-[0_10px_24px_-8px_rgba(10,20,40,0.45)] ring-1 ring-black/5 backdrop-blur-md transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
            shown ? "translate-y-0 opacity-100" : "-translate-y-6 opacity-0"
          }`}
        >
          <div className="flex items-start gap-2">
            <Image src="/apple-icon.png" alt="" width={28} height={28} unoptimized className="h-8 w-8 flex-none rounded-lg" />
            <span className="min-w-0 leading-tight">
              <span className="flex items-center justify-between gap-2 text-[13px] font-extrabold text-[#0A1428]">
                {p.title}
                <span className="font-semibold text-gray-400">now</span>
              </span>
              <span className="mt-0.5 block text-[12px] text-gray-700">{p.body}</span>
            </span>
          </div>
        </div>
      </Screen>
      <div className="relative z-0 -ml-14 mt-20 max-lg:hidden" style={{ transform: `translateY(${drift * -28}px)` }}>
        <Screen src="/screens/mobile-02.png" alt="Jobs in the WorkBench app" className="w-[240px] xl:w-[260px]" />
      </div>
    </div>
  );
}
