"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Compass, Mic, ShieldCheck } from "lucide-react";
import { ASSISTANT_NAME } from "@/lib/wb-assistant";

/**
 * The assistant section's live demo (home direction preview, David
 * 2026-11-19: "make the chat box change for each message, a lot of
 * different messages showing what he does; slow the animation down").
 * Each scene: what the owner says, the assistant's answer, and the card the
 * app shows for it. Scenes rotate slowly while on screen; the capability
 * chips beside it light up with the scene's area. Everything here is
 * something the assistant really does (lib/assistant tools); anything that
 * sends or charges is shown waiting for the owner's OK, as in the app.
 * Demo company (Brightwire Electric) names only. Name: lib/wb-assistant.ts.
 */

type Row = [string, string];
type Scene = {
  area: Area;
  say: string;
  reply: string;
  card: { title: string; rows?: Row[]; ok?: string; done?: boolean };
};

export const AREAS = ["Money", "Schedule", "Quotes", "Clients", "Leads", "Expenses", "Time"] as const;
type Area = (typeof AREAS)[number];

const SCENES: Scene[] = [
  {
    area: "Money",
    say: "Who still owes me money?",
    reply: "Three clients owe you $2,140.",
    card: { title: "Unpaid invoices", rows: [["Derek Olsen · 12 days late", "$1,240"], ["Priya Natarajan · due today", "$663"], ["Alicia Gomez · due Fri", "$237"]], ok: "Send all three a reminder" },
  },
  {
    area: "Schedule",
    say: "Move Tuesday's jobs to Friday.",
    reply: "Done. Three jobs moved to Friday.",
    card: { title: "Moved to Fri, Oct 30", rows: [["Maria Hernandez · AC disconnect", "9:00a"], ["Olivia Park · Ceiling fans", "10:00a"], ["James Whitfield · EV charger", "12:00p"]], ok: "Text the clients their new times", done: true },
  },
  {
    area: "Quotes",
    say: "Send the Hendersons their quote.",
    reply: "Here it is. Say yes and it goes out.",
    card: { title: "Email quote #1042", rows: [["To", "Hendersons"], ["Main panel upgrade", "$4,850"]], ok: "Send it" },
  },
  {
    area: "Schedule",
    say: "What's my day look like tomorrow?",
    reply: "Five jobs. First one is at 8:00 in Plano.",
    card: { title: "Tomorrow", rows: [["8:00a · Smoke detectors", "Plano"], ["10:30a · Outlet repair", "Allen"], ["1:00p · Panel inspection", "Frisco"]] },
  },
  {
    area: "Quotes",
    say: "Quote Maria a 200 amp panel upgrade.",
    reply: "Drafted from your price book.",
    card: { title: "Draft quote · Maria Hernandez", rows: [["200A panel + breakers", "$1,450"], ["Labor · 6 hrs", "$690"], ["Total with tax", "$2,316"]], done: true },
  },
  {
    area: "Expenses",
    say: "Log eighty-six dollars at Home Depot for the Park job.",
    reply: "Logged against the Park job.",
    card: { title: "Expense added", rows: [["Home Depot · Materials", "$86.00"], ["Job", "Olivia Park · Ceiling fans"]], done: true },
  },
  {
    area: "Clients",
    say: "Book Grace Kim for Thursday morning.",
    reply: "Sam is free at 9:00. Want me to book it?",
    card: { title: "Thu, Oct 29 · 9:00a", rows: [["Grace Kim", "Ceiling fan install"], ["Tech", "Sam Ortiz"]], ok: "Book it and confirm with Grace" },
  },
  {
    area: "Leads",
    say: "Which lead source made me the most money?",
    reply: "Google Ads, by a long way this quarter.",
    card: { title: "Collected by lead source", rows: [["Google Ads · 6 jobs", "$8,900"], ["Referrals · 4 jobs", "$5,120"], ["Website form · 5 jobs", "$3,480"]] },
  },
  {
    area: "Time",
    say: "Clock me in on the Olsen job.",
    reply: "You're on the clock.",
    card: { title: "Clocked in · 8:02a", rows: [["Job", "Derek Olsen · Sub-panel"], ["Location", "Stamped at the job"]], done: true },
  },
  {
    area: "Money",
    say: "How did last month go?",
    reply: "Your best month yet.",
    card: { title: "October", rows: [["Collected", "$18,420"], ["Jobs done", "34"], ["Unpaid", "$2,140"]] },
  },
  {
    area: "Clients",
    say: "Add a note to the Bells: gate code is 4412.",
    reply: "Saved on their client page.",
    card: { title: "Note added · Marcus Bell", rows: [["Gate code", "4412"]], done: true },
  },
  {
    area: "Leads",
    say: "Any new leads today?",
    reply: "Two came in. One booked online.",
    card: { title: "New leads", rows: [["Hannah Brooks · Smoke detectors", "Website"], ["Tom Becker · Panel walkthrough", "Booked online"]] },
  },
];

const HOLD_MS = 7000;

export default function WBAtlasDemo({ onArea }: { onArea?: (a: Area) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const [run, setRun] = useState(false);
  const [stage, setStage] = useState(3); // 0 = blank, 1 = said, 2 = reply, 3 = card
  const reduce = useRef(false);

  useEffect(() => {
    reduce.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce.current) return;
    const io = new IntersectionObserver(([e]) => setRun(e.isIntersecting), { threshold: 0.3 });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  // Each scene builds in (what was said → the answer → the card), holds, then
  // the next one starts. Slow on purpose.
  useEffect(() => {
    if (!run) return;
    setStage(0);
    const t = [
      setTimeout(() => setStage(1), 350),
      setTimeout(() => setStage(2), 1500),
      setTimeout(() => setStage(3), 2500),
      setTimeout(() => setI((n) => (n + 1) % SCENES.length), HOLD_MS),
    ];
    return () => t.forEach(clearTimeout);
  }, [i, run]);

  const s = SCENES[i];
  useEffect(() => onArea?.(s.area), [s.area, onArea]);

  const show = (n: number) => `transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${stage >= n ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`;

  return (
    <div ref={ref} className="mx-auto w-full max-w-[440px] overflow-hidden rounded-2xl bg-white text-[#0A1428] shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_30px_60px_-28px_rgba(10,20,40,0.6)]">
      <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-3.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0B57D8] text-white">
          <Compass className="h-5 w-5" strokeWidth={2.2} />
        </span>
        <span className="flex-1">
          <span className="block text-[15px] font-extrabold">{ASSISTANT_NAME}</span>
          <span className="block text-[12px] text-gray-500">Listening</span>
        </span>
        <span className="wb-wave flex h-5 items-center gap-[3px] text-[#0B57D8]" aria-hidden>
          <span />
          <span />
          <span />
          <span />
          <span />
        </span>
      </div>

      <div className="min-h-[330px] space-y-3 bg-[#F7F8FB] px-5 py-5" aria-live="polite">
        {/* what the owner said */}
        <div className={`flex justify-end ${show(1)}`}>
          <p className="flex max-w-[85%] items-start gap-2 rounded-2xl rounded-br-md bg-[#0B57D8] px-4 py-2.5 text-[15px] font-semibold text-white">
            <Mic className="mt-0.5 h-4 w-4 flex-none opacity-80" />
            {s.say}
          </p>
        </div>
        {/* the answer */}
        <div className={show(2)}>
          <p className="max-w-[85%] rounded-2xl rounded-bl-md bg-white px-4 py-2.5 text-[15px] font-semibold shadow-[0_0_0_1px_rgba(10,20,40,0.06)]">{s.reply}</p>
        </div>
        {/* the card the app shows */}
        <div className={`overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_8px_18px_-12px_rgba(10,20,40,0.3)] ${show(3)}`}>
          <p className={`flex items-center gap-2 px-4 py-2.5 text-[14px] font-extrabold ${s.card.done ? "bg-[#ECFDF3] text-[#15803D]" : "bg-[#EEF3FD] text-[#0B57D8]"}`}>
            {s.card.done ? <Check className="h-4 w-4" strokeWidth={3} /> : <Compass className="h-4 w-4" />}
            {s.card.title}
          </p>
          {s.card.rows && (
            <ul className="divide-y divide-gray-100 px-4">
              {s.card.rows.map(([a, b]) => (
                <li key={a} className="flex items-center justify-between gap-3 py-2 text-[13.5px]">
                  <span className="text-gray-600">{a}</span>
                  <span className="font-bold tabular-nums">{b}</span>
                </li>
              ))}
            </ul>
          )}
          {s.card.ok && (
            <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-4 py-2.5">
              <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-[#B45309]">
                <ShieldCheck className="h-4 w-4" /> Needs your OK
              </span>
              <span className="rounded-lg bg-[#0B57D8] px-3 py-1.5 text-[12.5px] font-bold text-white">{s.card.ok}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
