"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, useRef, useState } from "react";
import { ArrowRight, Check } from "lucide-react";

/**
 * The "one system" panel on the home page: four tabs for the arc of a job
 * (win it, run it, get paid, keep the client), each showing a real desktop
 * screen in a browser frame beside three short points. All four panels
 * render so the images are ready before the tab is clicked.
 */

const tabs = [
  {
    key: "win",
    label: "Win the work",
    title: "Requests come in booked, and quotes get signed from a phone.",
    body: "A booking page on your website fills the calendar. Every request lands in a pipeline, and quotes go out with line items, optional add-ons, and a signature link.",
    points: [
      "Online booking with your real availability",
      "Lead pipeline so nothing waits in voicemail",
      "Quotes with e-signature and deposits",
    ],
    href: "/features/quotes-and-invoicing",
    linkLabel: "Quotes and invoicing",
    src: "/screens/desktop-quotes.jpg",
    alt: "A WorkBench quote with line items, awaiting client approval",
  },
  {
    key: "run",
    label: "Run the day",
    title: "Drag jobs onto the calendar and the whole team sees it.",
    body: "Month, week, and day views with drag-to-schedule, recurring visits, time blocks, and a dispatch board per tech. Techs clock in from the job and chat with the office.",
    points: [
      "Scheduling and dispatch with drive time",
      "Time tracking and timesheets for payroll",
      "Team chat without a second app",
    ],
    href: "/features/scheduling-dispatch",
    linkLabel: "Scheduling and dispatch",
    src: "/screens/desktop-schedule.jpg",
    alt: "The WorkBench schedule with drag-to-schedule calendar views",
  },
  {
    key: "paid",
    label: "Get paid",
    title: "One click turns the finished job into an invoice with a Pay button.",
    body: "Card and ACH are built in at one flat rate. Deposits, partial payments, autopay for recurring plans, and reminders that go out on their own.",
    points: [
      "Invoices from the driveway, paid from a link",
      "2.9% + 30¢ per card, 0.75% per ACH transfer",
      "Recurring billing and one-click refunds",
    ],
    href: "/features/payments",
    linkLabel: "Payments",
    src: "/screens/desktop-invoices.jpg",
    alt: "WorkBench invoices with card and ACH payment status",
  },
  {
    key: "clients",
    label: "Keep clients",
    title: "Every client gets a portal, and the morning tells you who needs you.",
    body: "Clients see visits, sign agreements, message your team, and pay from a link with no password. Your dashboard opens on what needs a decision today.",
    points: [
      "Client portal with no login to forget",
      "Review requests after the job closes",
      "Recurring plans and full client history",
    ],
    href: "/features/client-portal",
    linkLabel: "Client portal",
    src: "/screens/desktop-dashboard.jpg",
    alt: "The WorkBench dashboard with revenue, the Needs-you list, and today's schedule",
  },
];

export default function WBSystemTabs() {
  const [index, setIndex] = useState(0);
  const id = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    setIndex(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label="What WorkBench does" className="flex flex-wrap justify-center gap-2">
        {tabs.map((t, i) => {
          const active = i === index;
          return (
            <button
              key={t.key}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              role="tab"
              id={`${id}-tab-${t.key}`}
              aria-selected={active}
              aria-controls={`${id}-panel-${t.key}`}
              tabIndex={active ? 0 : -1}
              type="button"
              onClick={() => setIndex(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`rounded-full px-5 py-2.5 text-[14px] font-bold transition-colors ${
                active
                  ? "bg-[#0A1428] text-white"
                  : "bg-white text-gray-700 ring-1 ring-inset ring-gray-200 hover:text-gray-900"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tabs.map((t, i) => (
        <div
          key={t.key}
          role="tabpanel"
          id={`${id}-panel-${t.key}`}
          aria-labelledby={`${id}-tab-${t.key}`}
          hidden={i !== index}
          className="mt-8 rounded-[1.75rem] bg-[#F6F8FB] p-4 sm:p-6 lg:p-8"
        >
          <div className="grid items-center gap-8 lg:grid-cols-[1.35fr_1fr] lg:gap-12">
            <div className="wb-frame overflow-hidden rounded-xl bg-white">
              <div className="flex items-center gap-2 border-b border-gray-200 bg-white px-3.5 py-2">
                <span className="h-2 w-2 rounded-full bg-gray-300" aria-hidden />
                <span className="h-2 w-2 rounded-full bg-gray-300" aria-hidden />
                <span className="h-2 w-2 rounded-full bg-gray-300" aria-hidden />
              </div>
              <div className="relative aspect-[1512/791]">
                <Image
                  src={t.src}
                  alt={t.alt}
                  fill
                  sizes="(min-width: 1024px) 640px, 100vw"
                  className="object-cover object-top"
                  priority={i === 0}
                />
              </div>
            </div>
            <div className="px-1 pb-2 lg:px-0 lg:pb-0">
              <h3 className="text-[22px] font-extrabold leading-snug text-gray-900 sm:text-[24px]">{t.title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-gray-600">{t.body}</p>
              <ul className="mt-5 space-y-2.5">
                {t.points.map((p) => (
                  <li key={p} className="flex items-start gap-2.5 text-[14.5px] font-semibold text-gray-800">
                    <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-blue-50">
                      <Check className="h-3 w-3 text-[#0B57D8]" strokeWidth={3} />
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
              <Link
                href={t.href}
                className="mt-6 inline-flex items-center gap-1.5 text-[14.5px] font-bold text-[#0B57D8] hover:underline"
              >
                {t.linkLabel}
                <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
              </Link>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
