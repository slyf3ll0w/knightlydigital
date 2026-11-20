"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
  ChevronDown,
  Info,
  KeyRound,
  Plus,
  UserPlus,
} from "lucide-react";
import Avatar from "@/components/Avatar";
import PresenceDot from "@/components/console/PresenceDot";
import { inputCls } from "@/components/Input";
import {
  AppCanvas,
  AppWindow,
  BW,
  InfoDot,
} from "@/components/wb/WBAppJourney";

/**
 * Home "Bring the whole crew": a copy of the REAL Settings → Team page
 * (app/platform/settings/team/TeamClient.tsx) in the real AppShell, at the
 * app's desktop size and scaled to fit (2026-11-20 fidelity pass). Title
 * "Team" with its (i), `Add team member`, the "New team member" card (Full
 * name, Email, Phone, Role + its description, Starting password, `Add
 * member` / Cancel), member rows ($/hr, Bookable online, working hours, the
 * role select, the key, Deactivate) and Lead routing & permissions. The
 * owner adds Jess Moreno as a Tech; then the (i) bubble opens with the seats
 * sentence the page's (i) really carries (passed in from lib/help/plan-copy
 * SEATS_SENTENCE, so prices are never typed here). Loops while on screen;
 * drawn finished under reduced motion.
 */

type Member = {
  name: string;
  email: string;
  phone: string;
  role: string;
  rate: string;
  bookable: boolean;
  seen: "online" | "never";
  you?: boolean;
};

const TEAM: Member[] = [
  {
    name: BW.owner,
    email: "mike@brightwire.co",
    phone: "(469) 555-0142",
    role: "Owner",
    rate: "",
    bookable: true,
    seen: "online",
    you: true,
  },
  {
    name: "Sam Rivera",
    email: "sam@brightwire.co",
    phone: "(469) 555-0187",
    role: "Tech",
    rate: "32",
    bookable: true,
    seen: "online",
  },
];
const NEW: Member = {
  name: "Jess Moreno",
  email: "jess@brightwire.co",
  phone: "(469) 555-0119",
  role: "Tech",
  rate: "",
  bookable: false,
  seen: "never",
};
const PASSWORD = "brightwire-jess-26";

// beats: 0 list · 1 button pressed, form opens · 2 typing · 3 typed · 4 Add member pressed · 5 saved row · 6 the (i) opens
const BEATS = [1500, 900, 1300, 1000, 600, 1500, 4200];
const LAST = BEATS.length - 1;

/** Type `text` out over the beat. */
function useTyped(text: string, on: boolean, done: boolean) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (done) {
      setN(text.length);
      return;
    }
    if (!on) {
      setN(0);
      return;
    }
    const t = setInterval(() => setN((k) => Math.min(text.length, k + 1)), 45);
    return () => clearInterval(t);
  }, [on, done, text]);
  return text.slice(0, n);
}

function Field({
  label,
  value,
  placeholder,
}: {
  label: string;
  value: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-gray-500">{label}</label>
      <span className={`${inputCls} block truncate`} style={{ minHeight: 42 }}>
        {value || <span className="text-gray-400">{placeholder}</span>}
      </span>
    </div>
  );
}

function Row({ m, fresh }: { m: Member; fresh?: boolean }) {
  return (
    <div
      className="px-4 py-3"
      style={
        fresh
          ? { animation: "listIn 0.42s cubic-bezier(0.2, 0.8, 0.2, 1) both" }
          : undefined
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar name={m.name} size={32} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-900">
              {m.name}
              {m.you && <span className="text-xs text-gray-500"> (you)</span>}
            </p>
            <p className="truncate text-xs text-gray-500">
              {m.email} · {m.phone}
            </p>
            <p
              className={`mt-0.5 flex items-center gap-1.5 text-xs ${m.seen === "online" ? "font-medium text-[color:var(--ds-good)]" : "text-gray-500"}`}
            >
              <PresenceDot state={m.seen === "online" ? "online" : "never"} />
              {m.seen === "online" ? "Online now" : "Never signed in"}
            </p>
          </div>
        </div>
        <label className="flex items-center gap-1 text-xs text-gray-600">
          <span className="text-gray-400">$</span>
          <span className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-xs">
            {m.rate || <span className="text-gray-400">0</span>}
          </span>
          <span className="text-gray-400">/hr</span>
          <InfoDot />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={m.bookable}
            readOnly
            className="accent-[color:var(--ds-primary)]"
          />
          Bookable online
          <InfoDot />
        </label>
        <span className="flex items-center gap-0.5">
          <span className="rounded-full p-1.5 text-gray-400">
            <CalendarClock size={14} />
          </span>
          <InfoDot />
        </span>
        {m.you ? (
          <span className="ds-chip ds-chip-neutral">{m.role}</span>
        ) : (
          <>
            <span className="flex items-center gap-3 rounded-lg border border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-700">
              {m.role}
              <ChevronDown size={12} className="text-gray-500" />
            </span>
            <span className="rounded-full p-1.5 text-gray-400">
              <KeyRound size={14} />
            </span>
            <span className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-[color:var(--ds-bad)]">
              Deactivate
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export default function WBTeamDemo({
  seatsSentence,
}: {
  seatsSentence: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(false);
  const [b, setB] = useState(LAST);
  const [still, setStill] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStill(true);
      return;
    }
    setB(0);
    const io = new IntersectionObserver(([e]) => setRun(e.isIntersecting), {
      threshold: 0.35,
    });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!run) return;
    const t = setTimeout(() => setB((n) => (n + 1) % BEATS.length), BEATS[b]);
    return () => clearTimeout(t);
  }, [b, run]);

  const form = b >= 1 && b <= 4;
  const typing = b >= 2;
  const typed = b >= 3;
  const saved = b >= 5;
  const name = useTyped(NEW.name, typing, typed || still);
  const email = useTyped(
    NEW.email,
    typing && name === NEW.name,
    typed || still,
  );
  const phone = useTyped(
    NEW.phone,
    typing && email === NEW.email,
    typed || still,
  );
  const password = useTyped(
    PASSWORD,
    typing && phone === NEW.phone,
    typed || still,
  );

  return (
    <div ref={ref}>
      <AppCanvas height={780}>
        {(w) => (
          <div style={{ width: w, height: 780 }}>
            <AppWindow nav="Team & roles">
              <div className="mx-auto max-w-4xl p-8">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-y-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-1.5 block text-gray-400">
                      <ArrowLeft size={18} />
                    </span>
                    <div className="relative min-w-0">
                      <h1
                        className="ds-title flex items-center gap-2"
                        style={{ fontSize: 30 }}
                      >
                        <span>Team</span>
                        <span className="relative inline-flex align-middle">
                          <span className="ds-info" aria-expanded={b === LAST}>
                            <Info size={15} strokeWidth={2.2} />
                          </span>
                          {b === LAST && (
                            <span
                              className="ds-pop ds-glass"
                              style={{
                                position: "absolute",
                                left: 0,
                                top: 30,
                                zIndex: 50,
                                animation: "toastIn 0.28s ease-out both",
                              }}
                            >
                              {seatsSentence}
                            </span>
                          )}
                        </span>
                      </h1>
                    </div>
                  </div>
                  <span
                    className="btn-primary"
                    style={b === 1 ? { transform: "scale(0.97)" } : undefined}
                  >
                    <Plus size={15} />
                    Add team member
                  </span>
                </div>

                {form && (
                  <div className="ds-card mb-6 p-5">
                    <h2 className="mb-4 flex items-center gap-1.5 text-[14.5px] font-semibold text-[color:var(--ds-ink)]">
                      <UserPlus size={13} />
                      New team member
                    </h2>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Full name *" value={name} />
                      <Field label="Email *" value={email} />
                      <Field
                        label="Phone"
                        value={phone}
                        placeholder="Enables the call button in Team Chat"
                      />
                      <div>
                        <label className="mb-1 block text-xs text-gray-500">
                          Role *
                        </label>
                        <span
                          className={`${inputCls} flex items-center justify-between`}
                          style={{ minHeight: 42 }}
                        >
                          Tech
                          <ChevronDown size={14} className="text-gray-600" />
                        </span>
                        <p className="mt-1 text-xs text-gray-500">
                          Their assigned jobs and schedule — no pricing
                        </p>
                      </div>
                      <div className="col-span-2">
                        <Field
                          label="Starting password *"
                          value={password}
                          placeholder="At least 8 characters — share it with them; they can change it later"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          Only for people new to WorkBench. If this email
                          already has a WorkBench login, they join your team
                          under it and keep their own password — we&apos;ll
                          email them a heads-up.
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <span
                        className="btn-primary"
                        style={
                          b === 4 ? { transform: "scale(0.97)" } : undefined
                        }
                      >
                        Add member
                      </span>
                      <span className="rounded-full px-4 py-2 text-sm font-medium text-gray-600">
                        Cancel
                      </span>
                    </div>
                  </div>
                )}

                <div className="ds-card ds-divide mb-6">
                  {TEAM.map((m) => (
                    <Row key={m.name} m={m} />
                  ))}
                  {saved && <Row m={NEW} fresh={!still} />}
                </div>

                <div className="ds-card space-y-5 p-5">
                  <h2 className="flex items-center gap-1.5 text-[14.5px] font-semibold text-[color:var(--ds-ink)]">
                    Lead routing &amp; permissions
                  </h2>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="flex items-center gap-1 text-sm font-medium text-gray-900">
                      Website leads go to
                      <InfoDot />
                    </p>
                    <span className="flex items-center gap-3 rounded-lg border border-gray-300 px-3 py-2 text-sm">
                      Company owner (default)
                      <ChevronDown size={14} className="text-gray-600" />
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
                    <p className="flex items-center gap-1 text-sm font-medium text-gray-900">
                      Sales can see invoices &amp; payments
                      <InfoDot />
                    </p>
                    <span className="relative inline-flex h-6 w-11 items-center rounded-full bg-[color:var(--ds-primary)]">
                      <span className="inline-block h-4 w-4 translate-x-6 transform rounded-full bg-white" />
                    </span>
                  </div>
                </div>
              </div>
            </AppWindow>
          </div>
        )}
      </AppCanvas>
    </div>
  );
}
