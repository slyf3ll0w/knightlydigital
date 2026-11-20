"use client";

import { useEffect, useRef, useState } from "react";
import { Check, FileSpreadsheet } from "lucide-react";

/**
 * "Switch in an afternoon": a coded copy of a client-list import running —
 * the spreadsheet you export from the old software, rows landing one by
 * one with their name, address, phone and email, a bar filling, then
 * Imported. Sample people only (never a real client). Shown finished
 * without JS or under reduced motion.
 */

const ROWS = [
  { name: "Maria Delgado", detail: "1418 Cedar Ridge Dr · (555) 201-4471" },
  { name: "Tom Whitfield", detail: "88 Harbor Ln · tom.w@example.com" },
  { name: "Priya Raman", detail: "302 Elm Ct · (555) 340-9902" },
  { name: "Greg Okafor", detail: "5120 Pine Valley Rd · greg@example.com" },
  { name: "Dana Lee", detail: "77 Maple St · (555) 818-2290" },
];
const TOTAL = 248;

export default function WBVsImport({ from }: { from: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(ROWS.length + 1);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setStep(0);
    let timers: ReturnType<typeof setTimeout>[] = [];
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        timers = Array.from({ length: ROWS.length + 1 }, (_, k) => setTimeout(() => setStep(k + 1), 400 + k * 420));
      },
      { threshold: 0.35 },
    );
    if (ref.current) io.observe(ref.current);
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
    };
  }, []);

  const done = step > ROWS.length;
  const count = done ? TOTAL : Math.round((Math.min(step, ROWS.length) / (ROWS.length + 1)) * TOTAL);

  return (
    <div
      ref={ref}
      className="overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_18px_34px_-22px_rgba(10,20,40,0.35)]"
    >
      <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-4">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-[#0A1428]">
          <FileSpreadsheet className="h-5 w-5 text-[#FF8B33]" strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-black text-[#0A1428]">client-list.csv</p>
          <p className="truncate text-[13px] text-gray-500">Exported from {from}</p>
        </div>
        <p className="ml-auto flex-none text-[14px] font-black tabular-nums text-[#0A1428]">
          {count} <span className="font-semibold text-gray-500">of {TOTAL}</span>
        </p>
      </div>
      <div className="h-1.5 bg-[#EDF0F5]">
        <div
          className="h-full bg-[#0B57D8] transition-[width] duration-500 ease-out"
          style={{ width: `${(count / TOTAL) * 100}%` }}
        />
      </div>
      <ul className="divide-y divide-gray-100 px-5">
        {ROWS.map((r, k) => (
          <li key={r.name} className={`flex items-center gap-3 py-3 ${step > k ? "wb-row-in" : "opacity-0"}`}>
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#E8F0FE]">
              <Check className="h-3.5 w-3.5 text-[#0B57D8]" strokeWidth={3} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[14.5px] font-bold text-[#0A1428]">{r.name}</p>
              <p className="truncate text-[12.5px] text-gray-500">{r.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-3 border-t border-gray-200 bg-[#F5F7FA] px-5 py-3.5">
        <p className="text-[13px] font-semibold text-gray-500">Names, addresses, phones, emails</p>
        <span className={`rounded-md bg-[#0A1428] px-2.5 py-1 text-[12.5px] font-black text-white ${done ? "wb-pop-in" : "opacity-0"}`}>Imported</span>
      </div>
    </div>
  );
}
