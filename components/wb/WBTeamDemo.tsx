"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Plus, UserPlus } from "lucide-react";

/**
 * Home "Bring the whole crew" (David 2026-11-20: a section on adding users,
 * with the included free ones). A coded copy of Settings → Team & roles at
 * Brightwire Electric: the owner presses Add member, the sheet fills in
 * (name, email, role Tech), Save drops the new row in, and the seat line
 * under the list counts the people against the free ones. Loops while on
 * screen; drawn finished under reduced motion. Prices come in as props from
 * the page (lib/plans.ts), never typed here.
 */

type Member = { name: string; email: string; role: string; online: boolean; initials: string; color: string };

const TEAM: Member[] = [
  { name: "Mike Delgado", email: "mike@brightwire.co", role: "Owner", online: true, initials: "MD", color: "#0A1428" },
  { name: "Sam Rivera", email: "sam@brightwire.co", role: "Tech", online: true, initials: "SR", color: "#0B57D8" },
];
const NEW: Member = { name: "Jess Moreno", email: "jess@brightwire.co", role: "Tech", online: false, initials: "JM", color: "#F86A0A" };
const ROLES = ["Admin", "Sales + Tech", "Sales", "Tech"];

// beat: 0 list · 1 sheet open · 2 name typed · 3 role picked · 4 saved (row in) · hold, then loop
const BEATS = [1600, 1300, 1300, 1200, 4200];

export default function WBTeamDemo({ included, extraSeat, proName }: { included: number; extraSeat: string; proName: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(false);
  const [b, setB] = useState(4);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setB(0);
    const io = new IntersectionObserver(([e]) => setRun(e.isIntersecting), { threshold: 0.35 });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!run) return;
    const t = setTimeout(() => setB((n) => (n + 1) % BEATS.length), BEATS[b]);
    return () => clearTimeout(t);
  }, [b, run]);

  const sheet = b >= 1 && b <= 3;
  const saved = b === 4;
  const people = saved ? TEAM.length + 1 : TEAM.length;
  const extra = Math.max(0, people - included);
  const typed = b >= 2;

  return (
    <div ref={ref} className="relative" style={{ fontFamily: "var(--font-lexend), Lexend, system-ui, sans-serif" }} aria-hidden>
      <div className="overflow-hidden rounded-xl bg-white text-[#0A1428] shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_30px_60px_-30px_rgba(10,20,40,0.5)]">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold text-gray-500">Settings</p>
            <p className="text-[18px] font-semibold">Team &amp; roles</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-lg bg-[#0A1428] px-3 py-2 text-[12px] font-semibold text-white transition-transform duration-200 ${b === 1 ? "scale-95" : ""}`}>
            <Plus className="h-3.5 w-3.5" strokeWidth={2.6} /> Add member
          </span>
        </div>

        <ul className="min-h-[201px] divide-y divide-gray-100">
          {[...TEAM, ...(saved ? [NEW] : [])].map((m, k) => (
            <li key={m.name} className={`flex items-center gap-3 px-5 py-3.5 ${k === TEAM.length ? "wb-row-in bg-[#FFF7F0]" : ""}`}>
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ background: m.color }}>
                {m.initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold">{m.name}</span>
                <span className="flex items-center gap-1.5 text-[11.5px] text-gray-500">
                  <span className={`h-1.5 w-1.5 rounded-full ${m.online ? "bg-[#17A34A]" : "border border-gray-400"}`} />
                  {m.online ? "Online now" : "Never signed in"}
                </span>
              </span>
              <span className="rounded-md bg-[#F2F4F7] px-2 py-1 text-[11.5px] font-semibold text-gray-700">{m.role}</span>
            </li>
          ))}
        </ul>

        {/* seats against the free ones */}
        <div className="border-t border-gray-100 bg-[#F8FAFC] px-5 py-4">
          <div className="flex items-baseline justify-between text-[12px]">
            <span className="font-semibold">
              {people} {people === 1 ? "person" : "people"}
            </span>
            <span className="text-gray-500">
              {included} included free{extra > 0 ? ` · ${extra} extra at ${extraSeat}` : ""}
            </span>
          </div>
          <div className="mt-2 flex gap-1.5">
            {Array.from({ length: Math.max(people, included) + 1 }).map((_, k) => (
              <span
                key={k}
                className={`h-2 flex-1 rounded-full transition-colors duration-500 ${
                  k < Math.min(people, included) ? "bg-[#17A34A]" : k < people ? "bg-[#F86A0A]" : "bg-gray-200"
                }`}
              />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-gray-500">Unlimited people with {proName}.</p>
        </div>
      </div>

      {/* the Add member sheet */}
      <div
        className={`absolute inset-x-4 bottom-4 rounded-xl bg-white p-5 text-[#0A1428] shadow-[0_0_0_1px_rgba(10,20,40,0.1),0_30px_60px_-20px_rgba(10,20,40,0.55)] transition-[opacity,transform] duration-300 sm:inset-x-10 ${
          sheet ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
        }`}
      >
        <p className="flex items-center gap-2 text-[14px] font-semibold">
          <UserPlus className="h-4 w-4 text-[#F86A0A]" strokeWidth={2.4} /> Add member
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
          <span className="rounded-lg border border-gray-200 px-3 py-2">{typed ? NEW.name : <span className="text-gray-400">Name</span>}</span>
          <span className="truncate rounded-lg border border-gray-200 px-3 py-2">{typed ? NEW.email : <span className="text-gray-400">Email</span>}</span>
        </div>
        <p className="mt-3 text-[11px] font-semibold text-gray-500">Role</p>
        <div className="mt-1.5 grid grid-cols-4 gap-1 rounded-lg bg-[#F2F4F7] p-1 text-center text-[11px] font-semibold">
          {ROLES.map((r) => (
            <span key={r} className={`rounded-md px-1 py-1.5 transition-colors duration-200 ${b >= 3 && r === NEW.role ? "bg-white text-[#0A1428] shadow-sm" : "text-gray-500"}`}>
              {r}
            </span>
          ))}
        </div>
        <p className={`mt-2 text-[11px] text-gray-500 transition-opacity duration-300 ${b >= 3 ? "opacity-100" : "opacity-0"}`}>
          Techs see their own jobs and schedule. Never your prices.
        </p>
        <div className="mt-3 flex justify-end">
          <span className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold text-white transition-colors ${b >= 3 ? "bg-[#F86A0A]" : "bg-gray-300"}`}>
            <Check className="h-3.5 w-3.5" strokeWidth={3} /> Save
          </span>
        </div>
      </div>
    </div>
  );
}
