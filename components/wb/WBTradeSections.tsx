import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";
import WBScribble from "@/components/wb/WBScribble";
import type { FeatureItem } from "@/lib/wb-features";
import { FREE_PLAN_NAME, PLANS } from "@/lib/plans";

/**
 * The building blocks the trade and feature pages are assembled from
 * (2026-11-20): the same sections the home page is made of, so an inner
 * page reads like a part of the home page instead of a form letter.
 * Rules: docs/site-design.md.
 */

export const SECTION_BG = {
  navy: "linear-gradient(180deg, #10214A 0%, #12306E 55%, #1847AE 100%)",
  deep: "linear-gradient(180deg, #0A1428 0%, #0E1C3F 60%, #12306E 100%)",
  blue: "linear-gradient(135deg, #0A45B8 0%, #0B57D8 55%, #2563EB 100%)",
} as const;
export type Tone = keyof typeof SECTION_BG;

export const CARD = "rounded-xl bg-white shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_18px_34px_-22px_rgba(10,20,40,0.35)]";
export const H2 = "text-[2.3rem] font-black leading-[1.02] tracking-[-0.035em] sm:text-[3.4rem]";
export const GHOST = "wb-pill !border !border-white/25 !px-7 !py-4 !text-[16px] text-white hover:!border-white/60";
export const ACCENT_HEX = { orange: "#F86A0A", sky: "#0B57D8" } as const;
/** The accent on a navy / blue band. */
export const ACCENT_ON_DARK = { orange: "#FF8B33", sky: "#BFD6FF" } as const;

/** Title with its accent half: [plain, accent]. */
export function Title({ parts, accent, className = H2, as: As = "h2" }: { parts: [string, string]; accent: string; dark?: boolean; className?: string; as?: "h1" | "h2" }) {
  return (
    <As className={className}>
      {parts[0]} <span style={{ color: accent }}>{parts[1]}</span>
    </As>
  );
}

/** A hand-written note with the drooping arrow (desktop only). */
export function Note({ lines, className = "", chalk }: { lines: [string, string]; className?: string; chalk?: boolean }) {
  return (
    <div className={`pointer-events-none absolute z-20 hidden items-end gap-1 xl:flex ${className}`} aria-hidden>
      <p className={`pb-3 text-right text-[15px] font-extrabold leading-snug ${chalk ? "text-white" : "text-[#10244A]"}`}>
        {lines[0]}
        <br />
        {lines[1]}
      </p>
      <WBScribble variant="droop" tone={chalk ? "chalk" : undefined} delay={0.5} className="h-[78px] w-[60px] flex-none" />
    </div>
  );
}

export function HeroButtons({ secondary = { label: "Book a call", href: "/book-a-call" } }: { secondary?: { label: string; href: string } }) {
  return (
    <div className="mt-9 flex flex-wrap items-center gap-3">
      <Link href="/apply" className="wb-pill wb-pill-orange !px-7 !py-4 !text-[16px]">
        Get started free
        <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.5} />
      </Link>
      <Link href={secondary.href} className={GHOST}>
        {secondary.label}
      </Link>
    </div>
  );
}

/** "What's included": the title still on the left, a ruled spec list on the right. */
export function SpecList({ features, bg = "bg-white", accent = "#F86A0A" }: { features: FeatureItem[]; bg?: string; accent?: string }) {
  return (
    <section className={bg}>
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[340px_1fr] lg:gap-16">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <h2 className="text-[2.2rem] font-black leading-[1.05] tracking-[-0.03em] sm:text-[3.2rem]">
            What&apos;s <span style={{ color: accent }}>included.</span>
          </h2>
          <p className="mt-4 text-[17px] leading-relaxed text-gray-600">
            {features.some((f) => f.plan) ? `In ${FREE_PLAN_NAME}, the free plan, unless it says otherwise.` : `All of it is in ${FREE_PLAN_NAME}, the free plan.`}
          </p>
          <Link href="/apply" className="wb-pill wb-pill-orange mt-8 !px-6 !py-3.5">
            Get started free
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
          </Link>
        </div>
        <AnimateIn className="wb-stagger grid border-t-2 border-[#0A1428] sm:grid-cols-2 sm:gap-x-10">
          {features.map(({ icon: Icon, title: t, body, plan }) => (
            <div key={t} className="flex gap-4 border-b border-gray-200 py-6">
              <span className="mt-1 flex-none" style={{ color: accent }}>
                <Icon className="h-5 w-5" strokeWidth={2.2} />
              </span>
              <div>
                <h3 className="flex flex-wrap items-baseline gap-x-2 text-[17.5px] font-extrabold text-gray-900">
                  {t}
                  {plan && <span className="text-[13px] font-bold text-[#0B57D8]">with {PLANS[plan].name}</span>}
                </h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-gray-600">{body}</p>
              </div>
            </div>
          ))}
        </AnimateIn>
      </div>
    </section>
  );
}

export function Related({ links }: { links: { label: string; href: string }[] }) {
  if (!links.length) return null;
  return (
    <section className="border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <p className="text-[18px] font-black text-gray-900">Keep exploring</p>
        <ul className="mt-5 grid gap-x-10 border-t-2 border-[#0A1428] sm:grid-cols-2 lg:grid-cols-3">
          {links.map((r) => (
            <li key={r.href} className="border-b border-gray-200">
              <Link href={r.href} className="flex items-center justify-between py-3.5 text-[15.5px] font-bold text-gray-900 hover:text-[#0B57D8]">
                {r.label}
                <ArrowRight className="h-4 w-4 text-[#F86A0A]" strokeWidth={2.5} />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

type Step = { title: string; body: string };

/** Steps as solid white cards on a dark band, each led by a heavy rule (no numbers). */
export function StepsOnBand({ steps, title, tone = "deep", accent }: { steps: Step[]; title: [string, string]; tone?: Tone; accent: string }) {
  return (
    <section className="text-white" style={{ background: SECTION_BG[tone] }}>
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-28">
        <Title parts={title} accent={accent} dark />
        <AnimateIn className="wb-stagger mt-12 grid gap-4 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.title} className={`${CARD} p-7 text-[#0A1428]`}>
              <span className="block h-1.5 w-12 rounded-full bg-[#F86A0A]" />
              <h3 className="mt-5 text-[20px] font-extrabold">{s.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-gray-600">{s.body}</p>
            </div>
          ))}
        </AnimateIn>
      </div>
    </section>
  );
}

/** Steps as a ruled list beside a sticky title (light). */
export function StepsRuled({ steps, title, accent, bg = "bg-white" }: { steps: Step[]; title: [string, string]; accent: string; bg?: string }) {
  return (
    <section className={bg}>
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-24 sm:px-8 sm:py-28 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <Title parts={title} accent={accent} />
        </div>
        <AnimateIn className="wb-stagger border-t-2 border-[#0A1428]">
          {steps.map((s) => (
            <div key={s.title} className="border-b border-gray-200 py-8">
              <h3 className="text-[23px] font-black tracking-[-0.02em] text-gray-900">{s.title}</h3>
              <p className="mt-2 max-w-xl text-[16.5px] leading-relaxed text-gray-600">{s.body}</p>
            </div>
          ))}
        </AnimateIn>
      </div>
    </section>
  );
}

/** Steps along a rail with a dot per step (light gray). */
export function StepsRail({ steps, title, accent, bg = "bg-[#F5F7FA]" }: { steps: Step[]; title: [string, string]; accent: string; bg?: string }) {
  return (
    <section className={bg}>
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-28">
        <Title parts={title} accent={accent} />
        <AnimateIn className="relative mt-14">
          <div className="absolute left-[11px] top-3 bottom-3 w-[3px] rounded-full bg-[#0A1428] md:left-0 md:right-0 md:top-[11px] md:bottom-auto md:h-[3px] md:w-auto" aria-hidden />
          <div className="wb-stagger relative grid gap-10 md:grid-cols-3 md:gap-8">
            {steps.map((s) => (
              <div key={s.title} className="relative pl-12 md:pl-0">
                <span className="absolute left-0 h-6 w-6 rounded-full border-[5px] border-[#0A1428] bg-[#F86A0A] md:static md:block" aria-hidden />
                <h3 className="text-[21px] font-black tracking-[-0.02em] text-gray-900 md:mt-7">{s.title}</h3>
                <p className="mt-2 text-[15.5px] leading-relaxed text-gray-600">{s.body}</p>
              </div>
            ))}
          </div>
        </AnimateIn>
      </div>
    </section>
  );
}

/** A two-column section: copy on one side, a live demo on the other. */
export function DemoSection({
  title,
  accent,
  body,
  demo,
  bg = "bg-white",
  tone,
  flip,
  note,
  extra,
  wide,
}: {
  title: [string, string];
  accent: string;
  body: React.ReactNode;
  demo: React.ReactNode;
  /** Light background class (ignored when `tone` is set). */
  bg?: string;
  /** A dark band instead of a light section. */
  tone?: Tone;
  /** Demo on the left. */
  flip?: boolean;
  note?: [string, string];
  extra?: React.ReactNode;
  /** The demo gets the full width under the copy. */
  wide?: boolean;
}) {
  const dark = Boolean(tone);
  return (
    <section className={`relative overflow-x-clip ${dark ? "text-white" : bg}`} style={tone ? { background: SECTION_BG[tone] } : undefined}>
      <div className={`relative mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32 ${wide ? "" : `grid items-center gap-14 lg:grid-cols-[0.85fr_1.15fr] ${flip ? "lg:[&>*:first-child]:order-2" : ""}`}`}>
        <div className={wide ? "max-w-3xl" : ""}>
          <Title parts={title} accent={accent} dark={dark} />
          <div className={`mt-6 max-w-xl text-[18px] leading-relaxed ${dark ? "text-white/80" : "text-gray-600"}`}>{body}</div>
          {extra}
        </div>
        <AnimateIn className={`relative ${wide ? "mt-14" : ""}`}>
          {demo}
          {note && <Note lines={note} chalk={dark} className="-top-24 right-6" />}
        </AnimateIn>
      </div>
    </section>
  );
}

/** Hero: copy on the left, a live app screen on the right running off the
 *  edge of the screen and the bottom of the hero (the home hero's shape). */
export function DemoHero({ tone = "navy", eyebrow, title, accent, intro, demo, secondary, demoWidth = 1000 }: {
  tone?: Tone;
  eyebrow?: string;
  title: [string, string];
  accent: string;
  intro: string;
  demo: React.ReactNode;
  secondary?: { label: string; href: string };
  demoWidth?: number;
}) {
  return (
    <section data-wb-hero className="relative overflow-hidden text-white" style={{ background: SECTION_BG[tone] }}>
      <div className="mx-auto grid max-w-7xl gap-12 px-5 pt-32 sm:px-8 sm:pt-40 lg:grid-cols-[560px_1fr]">
        <div className="wb-stagger-load lg:pb-20">
          {eyebrow && <p className="text-[16px] font-bold text-white/70">{eyebrow}</p>}
          <Title as="h1" parts={title} accent={accent} className="mt-3 text-[2.8rem] font-black leading-[0.98] tracking-[-0.045em] sm:text-[3.9rem]" />
          <p className="mt-6 max-w-lg text-[18px] leading-relaxed text-white/75">{intro}</p>
          <HeroButtons secondary={secondary} />
        </div>
        <div className="relative h-[420px] sm:h-[520px] lg:h-auto">
          <div className="absolute left-0 top-0 origin-top-left overflow-hidden rounded-tl-xl bg-white text-[#0A1428] shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_40px_80px_-30px_rgba(0,0,0,0.7)] lg:top-6 lg:scale-[1.18]" style={{ width: demoWidth }}>
            {demo}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Hero: big centered type, the live app under it, half in the hero and
 *  half over the white section that follows. */
export function CenterHero({ tone = "navy", eyebrow, title, accent, intro, demo, secondary }: {
  tone?: Tone;
  eyebrow?: string;
  title: [string, string];
  accent: string;
  intro: string;
  demo: React.ReactNode;
  secondary?: { label: string; href: string };
}) {
  return (
    <section data-wb-hero className="relative overflow-hidden text-white" style={{ background: SECTION_BG[tone] }}>
      <div className="mx-auto max-w-5xl px-5 pt-32 text-center sm:px-8 sm:pt-40">
        <div className="wb-stagger-load">
          {eyebrow && <p className="text-[16px] font-bold text-white/70">{eyebrow}</p>}
          <Title as="h1" parts={title} accent={accent} className="mx-auto mt-3 max-w-4xl text-[2.8rem] font-black leading-[0.98] tracking-[-0.045em] sm:text-[4.2rem]" />
          <p className="mx-auto mt-6 max-w-2xl text-[18px] leading-relaxed text-white/75">{intro}</p>
          <div className="flex justify-center">
            <HeroButtons secondary={secondary} />
          </div>
        </div>
      </div>
      <div className="relative mx-auto mt-16 max-w-5xl px-5 sm:px-8">
        <div className="relative z-10 -mb-24 overflow-hidden rounded-xl bg-white text-left text-[#0A1428] shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_40px_80px_-30px_rgba(0,0,0,0.7)] sm:-mb-32">{demo}</div>
      </div>
      <div className="h-24 bg-white sm:h-32" aria-hidden />
    </section>
  );
}
