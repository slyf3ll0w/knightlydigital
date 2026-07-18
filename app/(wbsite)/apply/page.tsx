import type { Metadata } from "next";
import { AnimateIn } from "@/components/AnimateIn";
import {
  ClipboardList,
  HardHat,
  Mail,
  MessagesSquare,
  Rocket,
  ShieldCheck,
  Users,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Apply for access — WorkBench",
  description:
    "WorkBench is invite-only. Tell us about your home-service business and we'll onboard you personally — most companies are up and running the same week.",
};

const steps = [
  {
    icon: ClipboardList,
    title: "Apply",
    body: "Tell us what your business does, how big the team is, and what you run the day on now. Takes five minutes.",
  },
  {
    icon: MessagesSquare,
    title: "We talk",
    body: "A real person reads every application. If it looks like a fit we reach out — usually within a couple of days.",
  },
  {
    icon: Rocket,
    title: "We set you up",
    body: "We onboard you ourselves: clients imported, booking configured, payments connected. Most companies are quoting the same week.",
  },
];

const lookFor = [
  {
    icon: HardHat,
    title: "A real service business",
    body: "Plumbing, HVAC, electrical, cleaning, lawn care, handywork — if your work happens at the client's place, that's us.",
  },
  {
    icon: Users,
    title: "Teams from one to fifteen",
    body: "Solo operators and small crews are exactly who WorkBench is built for. Every seat is free either way.",
  },
  {
    icon: ShieldCheck,
    title: "Ready to run on it",
    body: "Payments fund the software, so we vet every company like a payments provider would — real businesses, real work, real payouts.",
  },
];

export default function WBApplyPage() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="wb-grid-paper pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-5 pt-16 sm:px-8 sm:pt-24">
          <AnimateIn>
            <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.08] sm:text-5xl">
              WorkBench is <span className="text-[#0B57D8]">invite-only</span>.
              Here&apos;s why.
            </h1>
            <div className="mt-6 max-w-2xl space-y-4 text-[16.5px] leading-relaxed text-gray-600">
              <p>
                Anyone can open a signup form. We&apos;d rather onboard every
                company personally — import your clients, configure your
                booking page, connect payments, and make sure your first week
                on WorkBench actually feels easier than your last week off
                it.
              </p>
              <p>
                Vetting keeps the quality of that promise high. It keeps spam
                and abuse out of a payments platform, and it means when you
                message support, you reach people who know your business by
                name.
              </p>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <AnimateIn>
          <h2 className="text-2xl font-extrabold sm:text-3xl">How it works</h2>
        </AnimateIn>
        <div className="mt-8 grid gap-8 md:grid-cols-3">
          {steps.map(({ icon: Icon, title, body }, i) => (
            <AnimateIn key={title} delay={i * 110}>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                  <Icon className="h-[18px] w-[18px] text-[#0B57D8]" strokeWidth={2} />
                </div>
                <span className="text-[12px] font-bold text-gray-400">0{i + 1}</span>
              </div>
              <h3 className="mt-4 text-[16px] font-bold text-gray-900">{title}</h3>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-gray-600">{body}</p>
            </AnimateIn>
          ))}
        </div>
      </section>

      {/* ── What we look for ── */}
      <section className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <AnimateIn>
            <h2 className="text-2xl font-extrabold sm:text-3xl">What we look for</h2>
          </AnimateIn>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {lookFor.map(({ icon: Icon, title, body }, i) => (
              <AnimateIn key={title} delay={i * 110}>
                <div className="card-lift h-full rounded-2xl border border-gray-200 bg-[#FAFBFD] p-7">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${i === 1 ? "bg-orange-50" : "bg-blue-50"}`}>
                    <Icon className={`h-[18px] w-[18px] ${i === 1 ? "text-[#F86A0A]" : "text-[#0B57D8]"}`} strokeWidth={2} />
                  </div>
                  <h3 className="mt-5 text-[16px] font-bold text-gray-900">{title}</h3>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-gray-600">{body}</p>
                </div>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── Application form placeholder ── */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <AnimateIn>
          <div className="rounded-3xl border-2 border-dashed border-gray-300 bg-white px-6 py-14 text-center sm:px-12">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50">
              <Mail className="h-5 w-5 text-[#0B57D8]" strokeWidth={2} />
            </div>
            <h2 className="mx-auto mt-5 max-w-md text-2xl font-extrabold">
              The application form lands here soon.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-gray-600">
              Until then, applying is one email. Send us your business name,
              your trade, your team size, and what you run the day on today.
            </p>
            <a
              href="mailto:info@streamflaire.com?subject=WorkBench%20access%20application"
              className="wb-btn-tool mt-7 inline-flex items-center gap-2 rounded-lg bg-[#0B57D8] px-6 py-3 text-[15px] font-bold text-white"
            >
              Apply by email
            </a>
            <p className="mt-4 text-[13px] text-gray-400">
              info@streamflaire.com — a person reads every one.
            </p>
          </div>
        </AnimateIn>
      </section>
    </>
  );
}
