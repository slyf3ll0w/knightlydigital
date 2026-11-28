"use client";

import WBAppIcon from "@/components/wb/WBAppIcon";
import { useEffect, useRef, useState } from "react";
import {
  Briefcase,
  CalendarClock,
  ChevronRight,
  FileText,
  HandCoins,
  Inbox,
  ListChecks,
  MessageSquare,
  Mic,
  PhoneCall,
  Plus,
  Receipt,
  Search,
  SquareKanban,
  Users,
} from "lucide-react";
import PhoneTabBarMock, { type MockTab } from "@/components/wb/PhoneTabBarMock";
import { appVars, BRAND, useFitZoom } from "@/components/wb/demos/WBAppFrame";
import "./wb-live.css";

/**
 * "The office in your pocket": three phones drawn from the app as it is now
 * (2026-11-25, the iPhone kit — Apple's type at Apple's sizes, the gray
 * grouped page with white rounded cards, statuses as a dot and a gray word,
 * the floating glass tab bar): Home on the branded band with Up next, the
 * Invoices list, and the Create sheet. Push notifications drop down inside
 * the middle phone one after another, the way they really arrive, and the
 * side phones drift a little as the page scrolls. Still under reduced
 * motion. Brightwire Electric and made-up clients only.
 */

// The app's own push wording (lib/booking-checkout.ts "New booking",
// lib/payments.ts "Invoice #N paid", lib/quote-approval.ts, lib/portal-messages.ts).
const PUSHES = [
  { title: "New booking", body: "Grace Kim — Ceiling fan install, Thu, Oct 29, 9:00 AM" },
  { title: "Invoice #2481 paid", body: "$1,240.00 · card" },
  { title: "Maria Hernandez approved Quote #1042", body: "$4,850.00" },
  { title: "Message from Olivia Park", body: "Gate's open, come on in!" },
];

const GOOD = "#1F8A4C";
const WARN = "#B45309";
const BAD = "#C62828";
const SENT = "#0B57D8";

/** A phone screen drawn at 390 × 844 and zoomed to the phone's width. */
function Screen({ className = "", children, light = false }: { className?: string; children: React.ReactNode; light?: boolean }) {
  const fit = useFitZoom(390);
  return (
    <div
      ref={fit.ref}
      className={`relative overflow-hidden rounded-[2.4rem] bg-[#F2F2F7] shadow-[0_0_0_1px_rgba(10,20,40,0.1),0_30px_60px_-28px_rgba(10,20,40,0.55)] ${className}`}
      style={{ aspectRatio: "390 / 844" }}
      aria-hidden
    >
      <div className="ds" style={{ ...appVars(), zoom: fit.z ?? 0.6, opacity: fit.z === null ? 0 : 1 } as React.CSSProperties}>
        <div className="wbp">
          <div className="wbp-island" />
          <div className={`wbp-status ${light ? "is-light" : ""}`}>
            <span>9:41</span>
            <span className="flex items-center gap-1.5">
              <i
                className="block h-[11px] w-[17px] bg-current"
                style={{ clipPath: "polygon(0 100%,22% 100%,22% 66%,44% 66%,44% 38%,66% 38%,66% 10%,88% 10%,88% 100%)" }}
              />
              <i className="block h-[12px] w-[25px] rounded-[3.5px] border-[1.5px] border-current p-[1.5px]">
                <i className="block h-full w-[80%] rounded-[1.5px] bg-current" />
              </i>
            </span>
          </div>
          {children}
          <div className="wbp-home" />
        </div>
      </div>
    </div>
  );
}

/** The app's docked bottom bar (components/wb/PhoneTabBarMock.tsx), clear of the home indicator. */
function TabBar({ on }: { on: MockTab | null }) {
  return <PhoneTabBarMock on={on} safeArea={30} zIndex={15} />;
}

function Dot({ c, children }: { c: string; children: React.ReactNode }) {
  return (
    <span className="wbp-dot" style={{ ["--c" as string]: c } as React.CSSProperties}>
      {children}
    </span>
  );
}

/** Home on a phone: the band, Up next, Needs you. */
function HomeScreen() {
  const needs: [string, string, string, string][] = [
    ["Past-due invoice", "Derek Olsen · $1,240", BAD, "Overdue"],
    ["New requests", "Grace Kim, Leo Brandt", WARN, "2 new"],
    ["Approved quote", "Maria Hernandez · $4,850", GOOD, "Ready"],
  ];
  return (
    <>
      <div className="wbp-band">
        <div className="wbp-co">
          <i>{BRAND.name.charAt(0)}</i>
          {BRAND.name}
        </div>
        <div className="wbp-date">Tuesday, October 6</div>
        <h3>
          Good morning, <span>Mike</span>
        </h3>
        <div className="wbp-bnote">5 jobs today, the first at 9:00</div>
        <div className="wbp-bbtns">
          <span className="pri">New job</span>
          <span className="gh">Schedule</span>
        </div>
      </div>
      <div className="wbp-next">
        <div className="k">Up next · job 2 of 5</div>
        <div className="tm wbp-num">10:00</div>
        <div className="tt">Ceiling fan install x3</div>
        <div className="sb">Olivia Park · 418 Cedar Ln</div>
        <div className="acts">
          <span className="pri">Navigate</span>
          <span>On my way</span>
        </div>
      </div>
      <h4 className="wbp-h2">
        Needs you <span>4</span>
      </h4>
      <div className="wbp-card">
        {needs.map(([t, s, c, d]) => (
          <div key={t} className="wbp-cell">
            <div className="wbp-t">
              <div className="wbp-t1">{t}</div>
              <div className="wbp-t2">{s}</div>
            </div>
            <Dot c={c}>{d}</Dot>
            <ChevronRight size={17} strokeWidth={2.4} className="wbp-chev" />
          </div>
        ))}
      </div>
      <TabBar on="Home" />
    </>
  );
}

/** Invoices: the large title, search, the segmented filter, one grouped list. */
function InvoicesScreen() {
  const rows: [string, string, string, string, string, string][] = [
    ["DO", "Derek Olsen", "#2479 · due Sep 30", "$1,240.00", BAD, "6 days late"],
    ["MH", "Maria Hernandez", "#2481 · due Oct 14", "$450.00", WARN, "Due in 8 days"],
    ["OP", "Olivia Park", "#2483 · sent today", "$520.00", SENT, "Sent"],
    ["JW", "James Whitfield", "#2476 · paid Oct 2", "$1,980.00", GOOD, "Paid"],
    ["TB", "Tom Becker", "#2472 · paid Sep 28", "$860.00", GOOD, "Paid"],
    ["GK", "Grace Kim", "#2470 · paid Sep 26", "$310.00", GOOD, "Paid"],
  ];
  return (
    <>
      <div className="wbp-nav">
        <span>‹ Home</span>
        <Plus size={22} strokeWidth={2.2} />
      </div>
      <h3 className="wbp-lt">Invoices</h3>
      <p className="wbp-note">$2,619.65 owed · Derek is the oldest</p>
      <div className="wbp-search">
        <Search size={16} strokeWidth={2.4} />
        Search
      </div>
      <div className="wbp-seg">
        <span className="on">All</span>
        <span>Unpaid</span>
        <span>Late</span>
        <span>Paid</span>
      </div>
      <h4 className="wbp-h2" style={{ paddingTop: 14 }}>
        October
      </h4>
      <div className="wbp-card">
        {rows.map(([m, n, s, a, c, d]) => (
          <div key={n} className="wbp-cell" style={{ ["--sep" as string]: "68px" } as React.CSSProperties}>
            <span className="wbp-mono">{m}</span>
            <div className="wbp-t">
              <div className="wbp-t1">{n}</div>
              <div className="wbp-t2">{s}</div>
            </div>
            <div className="wbp-r">
              <div className="wbp-amt wbp-num">{a}</div>
              <Dot c={c}>{d}</Dot>
            </div>
          </div>
        ))}
      </div>
      <TabBar on={null} />
    </>
  );
}

/** The Create sheet, risen over the Schedule. */
function CreateScreen() {
  const quick: [string, typeof Briefcase, string][] = [
    ["Job", Briefcase, "work"],
    ["Quote", FileText, "sell"],
    ["Invoice", Receipt, "money"],
    ["Client", Users, "people"],
  ];
  const rest: [string, typeof Briefcase, string, string][] = [
    ["Lead", SquareKanban, "people", "Might hire you"],
    ["Request", Inbox, "people", "Asked for work"],
    ["Appointment", CalendarClock, "sell", "Visit or estimate"],
    ["Task", ListChecks, "work", "A to-do"],
    ["Call", PhoneCall, "reach", "From your line"],
    ["Message", MessageSquare, "reach", "Text or email"],
    ["Request payment", HandCoins, "money", "A quick pay link"],
  ];
  return (
    <>
      <div className="wbp-nav" />
      <h3 className="wbp-lt">Schedule</h3>
      <p className="wbp-note">Tuesday · 5 jobs</p>
      <div className="wbp-card" style={{ marginTop: 16 }}>
        {["9:00 · Maria Hernandez", "10:00 · Olivia Park", "12:00 · James Whitfield"].map((t) => (
          <div key={t} className="wbp-cell">
            <div className="wbp-t1">{t}</div>
          </div>
        ))}
      </div>
      <div className="wbp-dim" />
      <div className="wbp-sheet">
        <div className="wbp-grab" />
        <div className="wbp-sheet-t">Create</div>
        <div className="wbp-quick">
          {quick.map(([l, Icon, k]) => (
            <div key={l}>
              <span className={`wbp-ic lg ${k}`}>
                <Icon size={24} strokeWidth={2} />
              </span>
              {l}
            </div>
          ))}
        </div>
        <div className="wbp-card">
          <div className="wbp-cell">
            <span className="wbp-ic sell">
              <Mic size={17} strokeWidth={2.2} />
            </span>
            <div className="wbp-t">
              <div className="wbp-t1">Just say it</div>
              <div className="wbp-t2">“Quote the Hales for a spring cleanup”</div>
            </div>
            <ChevronRight size={17} strokeWidth={2.4} className="wbp-chev" />
          </div>
        </div>
        <div className="wbp-card">
          {rest.map(([l, Icon, k, d]) => (
            <div key={l} className="wbp-cell">
              <span className={`wbp-ic ${k}`}>
                <Icon size={17} strokeWidth={2.2} />
              </span>
              <div className="wbp-t">
                <div className="wbp-t1">{l}</div>
              </div>
              <span className="wbp-detail">{d}</span>
              <ChevronRight size={17} strokeWidth={2.4} className="wbp-chev" />
            </div>
          ))}
        </div>
      </div>
    </>
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
    const io = new IntersectionObserver(
      ([e]) => {
        const was = run;
        run = e.isIntersecting;
        if (run && !was) timers.push(setTimeout(() => cycle(0), 700));
        if (!run) {
          timers.forEach(clearTimeout);
          timers = [];
          setShown(false);
        }
      },
      { threshold: 0.35 },
    );
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
        <Screen className="w-[240px] xl:w-[260px]">
          <InvoicesScreen />
        </Screen>
      </div>
      <Screen light className="relative z-10 w-[270px] sm:w-[300px] xl:w-[320px]">
        <HomeScreen />
        {/* a push notification dropping in, the way iOS shows one */}
        <div className="wbp-push" style={{ opacity: shown ? 1 : 0, transform: shown ? "none" : "translateY(-24px)" }}>
          <div className="flex items-start gap-2.5">
            <WBAppIcon className="h-10 w-10 rounded-[10px]" />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="flex items-center justify-between gap-2 text-[15px] font-semibold text-black">
                <span className="min-w-0 truncate">{p.title}</span>
                <span className="shrink-0 text-[13px] font-normal text-[rgba(60,60,67,0.6)]">now</span>
              </span>
              <span className="mt-0.5 block text-[15px] text-black">{p.body}</span>
            </span>
          </div>
        </div>
      </Screen>
      <div className="relative z-0 -ml-14 mt-20 max-lg:hidden" style={{ transform: `translateY(${drift * -28}px)` }}>
        <Screen className="w-[240px] xl:w-[260px]">
          <CreateScreen />
        </Screen>
      </div>
    </div>
  );
}
