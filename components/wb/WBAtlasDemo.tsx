"use client";

import { useEffect, useRef, useState } from "react";
import { Coins, Copy, Flag, Mic, RotateCcw, X } from "lucide-react";
import { ProposalCard, type CardProposal } from "@/components/AssistantCard";
import { ASSISTANT_NAME } from "@/lib/wb-assistant";
import { APP_VARS } from "@/components/wb/WBAppJourney";

/**
 * The assistant section's live demo: a copy of the REAL Atlas chat drawer
 * (components/AssistantDrawer.tsx — the floating report / new chat / close
 * controls, the owner's message in an accent bubble, Atlas answering in
 * plain text with Copy and the tokens line, the composer with the mic, the
 * "AI answers can be wrong" line), in Brightwire Electric's colors
 * (2026-11-20 fidelity pass). Anything that changes data comes back as the
 * app's own confirmation card (ProposalCard from components/AssistantCard,
 * the same component the drawer renders): "Needs your OK" with Cancel and
 * the commit button; for some scenes the owner confirms and the card turns
 * Applied with its DONE stamp, as in the app. Answers that only read data
 * are plain text, as Atlas gives them. Scenes rotate slowly while on screen;
 * the capability chips beside it light up with the scene's area. Demo
 * company names only. Name: lib/wb-assistant.ts.
 */

export const AREAS = [
  "Money",
  "Schedule",
  "Quotes",
  "Clients",
  "Leads",
  "Expenses",
  "Time",
] as const;
type Area = (typeof AREAS)[number];

type Scene = {
  area: Area;
  say: string;
  reply: string;
  tokens: number;
  card?: { kind: string; title: string; lines: string[]; confirm?: boolean };
};

const SCENES: Scene[] = [
  {
    area: "Money",
    say: "Who still owes me money?",
    reply:
      "Three clients owe you $2,140.00. Derek Olsen is 12 days late on $1,240.00, Priya Natarajan's $663.00 is due today and Alicia Gomez owes $237.00 by Friday. Want me to send them a reminder?",
    tokens: 1412,
    card: {
      kind: "send_payment_reminders",
      title: "Send 3 payment reminders",
      lines: [
        "Derek Olsen: $1,240.00",
        "Priya Natarajan: $663.00",
        "Alicia Gomez: $237.00",
      ],
    },
  },
  {
    area: "Schedule",
    say: "Move Tuesday's jobs to Friday.",
    reply: "Here's the move. Say yes and I'll make it.",
    tokens: 1180,
    card: {
      kind: "move_jobs",
      title: "Move 3 jobs to Fri, Oct 30",
      lines: [
        "Maria Hernandez: 9:00 AM",
        "Olivia Park: 10:00 AM",
        "James Whitfield: 12:00 PM",
      ],
      confirm: true,
    },
  },
  {
    area: "Quotes",
    say: "Send Marcus Bell his quote.",
    reply: "Here it is. Say yes and it goes out.",
    tokens: 964,
    card: {
      kind: "email_document",
      title: "Email Quote #1042 to Marcus Bell",
      lines: ["To: marcus.bell@gmail.com", "Pool pump circuit: $1,180.00"],
    },
  },
  {
    area: "Schedule",
    say: "What's my day look like tomorrow?",
    reply:
      "Five jobs tomorrow. The first is at 8:00 AM in Plano: Hannah Brooks's smoke detectors. Then Olivia Park's outlet repair in Allen at 10:30 AM and Derek Olsen's panel inspection in Frisco at 1:00 PM.",
    tokens: 1306,
  },
  {
    area: "Quotes",
    say: "Quote Maria a 200 amp panel upgrade.",
    reply: "Drafted from your price book.",
    tokens: 1688,
    card: {
      kind: "create_quote",
      title: "New quote for Maria Hernandez",
      lines: [
        "Panel Upgrade (200A): $2,800.00",
        "Whole-Home Surge Protector: $350.00",
        "Total: $3,150.00",
      ],
      confirm: true,
    },
  },
  {
    area: "Expenses",
    say: "Log eighty-six dollars at Home Depot for the Park job.",
    reply: "Ready to log it against the Park job.",
    tokens: 902,
    card: {
      kind: "log_expense",
      title: "Log a $86.00 expense",
      lines: [
        "Description: Home Depot",
        "Category: Materials",
        "Job: Olivia Park · Outlet repair",
      ],
      confirm: true,
    },
  },
  {
    area: "Clients",
    say: "Book Grace Kim for Thursday morning.",
    reply: "Sam is free at 9:00. Want me to book it?",
    tokens: 1544,
    card: {
      kind: "schedule_job",
      title: "Schedule Grace Kim · Thu, Oct 29, 9:00 AM",
      lines: ["Job: Ceiling fan install", "Crew: Sam Ortiz"],
    },
  },
  {
    area: "Leads",
    say: "Which lead source made me the most money?",
    reply:
      "Google Ads, by a long way this quarter: $8,900.00 from 6 jobs. Referrals are next with $5,120.00, then your website estimate form with $3,480.00.",
    tokens: 1220,
  },
  {
    area: "Time",
    say: "Clock me in on the Olsen job.",
    reply: "Clocking you in now.",
    tokens: 744,
    card: {
      kind: "clock_in",
      title: "Clock in on Derek Olsen · Sub-panel",
      lines: ["When: 8:02 AM"],
      confirm: true,
    },
  },
  {
    area: "Money",
    say: "How did last month go?",
    reply:
      "October was your best month yet: $18,420.00 collected from 34 jobs, with $2,140.00 still owed to you.",
    tokens: 1096,
  },
  {
    area: "Clients",
    say: "Add a note to the Bells: gate code is 4412.",
    reply: "I'll put it on Marcus Bell's client page.",
    tokens: 810,
    card: {
      kind: "add_client_note",
      title: "Add a note for Marcus Bell",
      lines: ["Note: Gate code is 4412"],
      confirm: true,
    },
  },
  {
    area: "Leads",
    say: "Any new leads today?",
    reply:
      "Two came in today. Hannah Brooks asked about smoke detectors through your website, and Tom Becker booked a panel walkthrough online.",
    tokens: 1018,
  },
];

const HOLD_MS = 7400;
const noop = () => {};

export default function WBAtlasDemo({
  onArea,
}: {
  onArea?: (a: Area) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const [run, setRun] = useState(false);
  const [stage, setStage] = useState(4); // 0 = blank, 1 = said, 2 = reply, 3 = card, 4 = confirmed

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(([e]) => setRun(e.isIntersecting), {
      threshold: 0.3,
    });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  // Each scene builds in (what was said → the answer → the card → the OK),
  // holds, then the next one starts. Slow on purpose.
  useEffect(() => {
    if (!run) return;
    setStage(0);
    const t = [
      setTimeout(() => setStage(1), 350),
      setTimeout(() => setStage(2), 1700),
      setTimeout(() => setStage(3), 2600),
      setTimeout(() => setStage(4), 4600),
      setTimeout(() => setI((n) => (n + 1) % SCENES.length), HOLD_MS),
    ];
    return () => t.forEach(clearTimeout);
  }, [i, run]);

  const s = SCENES[i];
  useEffect(() => onArea?.(s.area), [s.area, onArea]);

  const card: CardProposal | null = s.card
    ? {
        id: `demo-${i}`,
        kind: s.card.kind,
        title: s.card.title,
        lines: s.card.lines,
        endpoint: "",
        method: "POST",
        payload: {},
        state: s.card.confirm && stage >= 4 ? "done" : "pending",
        resultNote: undefined,
      }
    : null;

  const show = (n: number) =>
    `transition-opacity duration-500 ${stage >= n ? "opacity-100" : "opacity-0"}`;

  return (
    <div
      ref={ref}
      className="mx-auto w-full max-w-[400px] select-none text-left"
      aria-hidden
      inert
    >
      <div
        className="app-ui ds relative flex h-[560px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-paper-plain shadow-2xl"
        style={APP_VARS}
      >
        {/* floating controls */}
        <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
          {[
            { Icon: Flag, size: 15, cls: "text-gray-500" },
            { Icon: RotateCcw, size: 16, cls: "text-gray-500" },
            { Icon: X, size: 20, cls: "text-gray-600" },
          ].map(({ Icon, size, cls }, k) => (
            <span
              key={k}
              className={`flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm ${cls}`}
            >
              <Icon size={size} strokeWidth={k === 2 ? 2.2 : 2} />
            </span>
          ))}
        </div>

        {/* messages */}
        <div className="flex-1 space-y-3 overflow-hidden px-4 pb-4 pt-14">
          <div
            className={`ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-green-600 px-3.5 py-2 ${show(1)}`}
          >
            <p className="whitespace-pre-wrap text-sm font-medium">{s.say}</p>
          </div>
          <div className="mr-4 space-y-2">
            <div className={`px-0.5 py-1 ${show(2)}`}>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                {s.reply}
              </p>
              <div className="mt-1 flex items-center gap-3 text-[10px] text-gray-400">
                <span className="-my-1 -ml-1 flex items-center gap-1 rounded-md px-1 py-1 text-gray-400">
                  <Copy size={11} />
                  Copy
                </span>
                <span className="flex items-center gap-1">
                  <Coins size={10} />
                  {s.tokens.toLocaleString("en-US")} tokens
                </span>
              </div>
            </div>
            {card && (
              <div className={show(3)}>
                <ProposalCard
                  key={`${i}-${card.state}`}
                  proposal={card}
                  onConfirm={noop}
                  onCancel={noop}
                />
              </div>
            )}
          </div>
        </div>

        {/* composer */}
        <div className="shrink-0 border-t border-gray-200 p-3">
          <div className="flex items-end gap-2">
            <span className="flex min-h-[42px] flex-1 items-center rounded-2xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-400">
              Ask {ASSISTANT_NAME}, or tell it what to do...
            </span>
            <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-green-600">
              <Mic size={17} strokeWidth={2.2} />
            </span>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-gray-400">
            AI answers can be wrong — verify anything important on its page.
          </p>
        </div>
      </div>
    </div>
  );
}
