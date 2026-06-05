import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { AnimateIn } from '@/components/AnimateIn';
import { SketchUnderline } from '@/components/SketchUnderline';

export const metadata: Metadata = {
  title: 'Custom Software Design',
  description:
    'Custom software built for your exact workflow or your idea — owned by you, built by Streamflare. Fast turnaround, competitive pricing, and a free no-obligation quote.',
};

function CheckIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

const processSteps = [
  {
    num: '01',
    title: 'Discovery',
    body: "We start by learning your business, your workflow, and what you're trying to build. The more we understand the problem, the better the software we build to solve it. This is where we ask the uncomfortable questions that save you money later.",
  },
  {
    num: '02',
    title: 'Design & Build',
    body: 'We design the system architecture and UI, then build it — using the same modern tech stack powering today\'s best software companies. You review and approve at every milestone. No surprises.',
  },
  {
    num: '03',
    title: 'Launch & Support',
    body: 'We deploy your software and hand over full ownership — code, data, and hosting are yours. We stay available for updates, additions, and support as your business grows.',
  },
];

export default function CustomSoftwarePage() {
  return (
    <>
      {/* ── HERO ── */}
      <section
        className="pt-[148px] pb-24 bg-dot-pattern"
        style={{ backgroundColor: '#0C0F0C' }}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <p
            className="text-xs font-bold uppercase tracking-widest mb-5"
            style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
          >
            Custom Software Design
          </p>
          <h1
            className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight max-w-4xl mb-6"
            style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
          >
            Your Software. Your Workflows.{' '}
            <SketchUnderline color="#22C55E">Built for You.</SketchUnderline>
          </h1>
          <p className="text-lg max-w-2xl leading-relaxed mb-10" style={{ color: 'rgba(255,255,255,0.6)' }}>
            Whether you need software that fits the exact way your business runs, or you have an idea for a product you want to take to market — we design and build it. Custom. Fast. And competitively priced.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link
              href="/contact"
              className="text-sm font-bold uppercase tracking-wider px-8 py-4 text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Get a Free Quote →
            </Link>
            <a
              href="#how-it-works"
              className="text-sm font-bold uppercase tracking-wider px-8 py-4 transition-all hover:bg-white hover:text-black"
              style={{
                border: '1.5px solid rgba(255,255,255,0.25)',
                color: 'rgba(255,255,255,0.8)',
                fontFamily: 'Oxanium, system-ui, sans-serif',
              }}
            >
              See How It Works
            </a>
          </div>
        </div>
      </section>

      {/* ── WHO IT'S FOR ── paper ── */}
      <section className="py-24 bg-paper">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">

          <AnimateIn className="mb-14">
            <p
              className="text-xs font-bold uppercase tracking-widest mb-4"
              style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Who It&apos;s For
            </p>
            <h2
              className="text-3xl lg:text-4xl font-bold"
              style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Two Different Goals. <SketchUnderline>One Build Team.</SketchUnderline>
            </h2>
          </AnimateIn>

          <div className="grid md:grid-cols-2 gap-6">

            <AnimateIn delay={0}>
              <div
                className="card-lift flex flex-col h-full bg-white"
                style={{ border: '1px solid #E5E7EB' }}
              >
                <div style={{ height: '5px', backgroundColor: '#22C55E' }} />
                <div className="p-8 flex flex-col flex-1">
                  <p
                    className="text-xs font-bold uppercase tracking-widest mb-4"
                    style={{ color: '#6B7280', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                  >
                    For Your Business
                  </p>
                  <h3
                    className="text-2xl font-bold mb-4 leading-snug"
                    style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                  >
                    Replace the manual work with a system built around how you actually operate.
                  </h3>
                  <p className="text-sm leading-relaxed mb-6 flex-1" style={{ color: '#6B7280' }}>
                    If your business runs on spreadsheets, disconnected tools, or repetitive manual steps that cost you time every day — that&apos;s a software problem. We design and build the exact system your workflow needs. Not a template. Not a SaaS tool with 80% of what you need. Something built specifically for the way you run your operation.
                  </p>
                  <div
                    className="pt-5 mb-6"
                    style={{ borderTop: '1px solid #E5E7EB' }}
                  >
                    <p
                      className="text-xs uppercase tracking-widest mb-3"
                      style={{ color: '#6B7280', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                    >
                      Common builds include
                    </p>
                    <ul className="flex flex-col gap-2">
                      {[
                        'Custom CRM with your exact workflows',
                        'Client portals and dashboards',
                        'Booking and scheduling systems',
                        'Inventory and operations tools',
                        'Internal automation and reporting',
                      ].map((item) => (
                        <li key={item} className="flex items-center gap-3 text-sm" style={{ color: '#374151' }}>
                          <CheckIcon />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Link
                    href="/contact"
                    className="text-sm font-bold uppercase tracking-wider transition-opacity hover:opacity-70 inline-flex items-center gap-2"
                    style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                  >
                    Get a Free Quote →
                  </Link>
                </div>
              </div>
            </AnimateIn>

            <AnimateIn delay={150}>
              <div
                className="card-lift flex flex-col h-full"
                style={{ border: '1px solid rgba(34,197,94,0.3)', backgroundColor: '#0C0F0C', borderLeft: '3px solid #22C55E' }}
              >
                <div className="p-8 flex flex-col flex-1">
                  <p
                    className="text-xs font-bold uppercase tracking-widest mb-4"
                    style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                  >
                    For Your Idea
                  </p>
                  <h3
                    className="text-2xl font-bold mb-4 leading-snug text-white"
                    style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
                  >
                    Turn your concept into a live software product you own and can sell.
                  </h3>
                  <p className="text-sm leading-relaxed mb-6 flex-1" style={{ color: 'rgba(255,255,255,0.55)' }}>
                    Have an idea for a software product you want to bring to market? We take it from a concept to a polished, live application — designed for real users, built to scale, and ready to sell. You don&apos;t need a technical co-founder. You need a build team that moves fast and builds right.
                  </p>
                  <div
                    className="pt-5 mb-6"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    <p
                      className="text-xs uppercase tracking-widest mb-3"
                      style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                    >
                      Common builds include
                    </p>
                    <ul className="flex flex-col gap-2">
                      {[
                        'SaaS tools and web platforms',
                        'Niche industry software',
                        'Marketplaces and directories',
                        'MVPs and product launches',
                        'Vertical-specific applications',
                      ].map((item) => (
                        <li key={item} className="flex items-center gap-3 text-sm text-white">
                          <CheckIcon />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Link
                    href="/contact"
                    className="text-sm font-bold uppercase tracking-wider transition-opacity hover:opacity-70 inline-flex items-center gap-2"
                    style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                  >
                    Start Your Project →
                  </Link>
                </div>
              </div>
            </AnimateIn>

          </div>
        </div>
      </section>

      {/* ── FULL-WIDTH IMAGE STRIP ── */}
      <section className="relative overflow-hidden" style={{ height: '380px' }}>
        <Image
          src="https://plus.unsplash.com/premium_photo-1682141007707-1f09c5a1d814?w=1400&q=85"
          alt="Software development team collaborating"
          fill
          className="object-cover object-center"
          sizes="100vw"
        />
        <div
          className="absolute inset-0 flex items-center"
          style={{ background: 'linear-gradient(to right, rgba(12,15,12,0.92) 0%, rgba(12,15,12,0.65) 50%, rgba(12,15,12,0.2) 100%)' }}
        >
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <p
              className="text-xs font-bold uppercase tracking-widest mb-4"
              style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Our Approach
            </p>
            <h2
              className="text-3xl lg:text-4xl font-bold text-white max-w-xl leading-tight"
              style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              We build with the tools modern software companies rely on — faster and for less than you&apos;d expect.
            </h2>
          </div>
        </div>
      </section>

      {/* ── WHY STREAMFLARE ── dark ── */}
      <section className="py-24 bg-dot-pattern" style={{ backgroundColor: '#0C0F0C' }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8">

          <AnimateIn className="mb-14">
            <div className="grid lg:grid-cols-2 gap-10 items-end">
              <div>
                <p
                  className="text-xs font-bold uppercase tracking-widest mb-5"
                  style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  Why Streamflare
                </p>
                <h2
                  className="text-4xl lg:text-5xl font-bold text-white leading-tight"
                  style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  Stop paying agency rates<br />for agency overhead.
                </h2>
              </div>
              <div className="lg:pb-2">
                <p className="text-base leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Most dev shops charge a premium for every hour of overhead, project management theater, and tooling they don&apos;t own. We work lean, we work fast, and we pass the savings directly to you.
                </p>
              </div>
            </div>
          </AnimateIn>

          <AnimateIn>
            <div
              className="grid grid-cols-1 md:grid-cols-3"
              style={{ border: '1px solid rgba(255,255,255,0.09)' }}
            >
              {[
                {
                  num: '01',
                  title: 'Modern Stack + AI Assistance',
                  desc: 'We build with Next.js, React, TypeScript, and the same open-source tools powering today\'s best software products — accelerated by AI tooling that cuts build time without cutting quality.',
                },
                {
                  num: '02',
                  title: 'Fast Turnaround',
                  desc: 'Most projects take 4–8 weeks from kickoff to launch. Modern frameworks let us skip what legacy agencies bill hours for. You get to market faster and start seeing results sooner.',
                },
                {
                  num: '03',
                  title: 'You Own Everything',
                  desc: 'Code, data, hosting — all yours from day one. No proprietary platforms, no lock-in, no recurring fees just to keep the lights on. It\'s your software. Full stop.',
                },
              ].map((item, i) => (
                <div
                  key={item.num}
                  className="p-8"
                  style={{
                    borderRight: i < 2 ? '1px solid rgba(255,255,255,0.09)' : 'none',
                    borderBottom: '1px solid rgba(255,255,255,0.09)',
                    backgroundColor: '#111511',
                  }}
                >
                  <p
                    className="font-bold mb-3"
                    style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif', fontSize: '2.8rem', lineHeight: 1 }}
                  >
                    {item.num}
                  </p>
                  <h3
                    className="text-base font-bold text-white mb-2"
                    style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
                  >
                    {item.title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </AnimateIn>

        </div>
      </section>

      {/* ── HOW IT WORKS ── paper-warm ── */}
      <section id="how-it-works" className="py-24 bg-paper-warm">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-start">

            <AnimateIn>
              <p
                className="text-xs font-bold uppercase tracking-widest mb-4"
                style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                How It Works
              </p>
              <h2
                className="text-3xl lg:text-4xl font-bold mb-6 leading-tight"
                style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                From First Conversation to Full Launch
              </h2>
              <p className="text-base leading-relaxed mb-8" style={{ color: '#6B7280' }}>
                Simple, transparent, and focused on building what you actually need. No confusing timelines, no surprise fees — just clear milestones from kickoff to launch and beyond.
              </p>
              <div className="relative overflow-hidden" style={{ height: '300px' }}>
                <Image
                  src="https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=700&q=85"
                  alt="Software development workspace"
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
                <div
                  className="absolute inset-0"
                  style={{ background: 'linear-gradient(135deg, rgba(12,15,12,0.2) 0%, transparent 60%)' }}
                />
              </div>
            </AnimateIn>

            <AnimateIn delay={150}>
              <div className="flex flex-col gap-8 pl-7" style={{ borderLeft: '2px solid #22C55E' }}>
                {processSteps.map((step) => (
                  <div key={step.num}>
                    <div className="flex items-center gap-3 mb-2">
                      <span
                        className="text-2xl font-bold"
                        style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                      >
                        {step.num}
                      </span>
                      <h3
                        className="text-lg font-bold"
                        style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                      >
                        {step.title}
                      </h3>
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: '#6B7280' }}>
                      {step.body}
                    </p>
                  </div>
                ))}
              </div>
            </AnimateIn>

          </div>
        </div>
      </section>

      {/* ── FREE QUOTE CTA ── paper ── */}
      <section className="py-24 bg-paper">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            <AnimateIn>
              <p
                className="text-xs font-bold uppercase tracking-widest mb-4"
                style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Free No-Obligation Quote
              </p>
              <h2
                className="text-3xl lg:text-4xl font-bold mb-6 leading-tight"
                style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                A Custom Build Might Cost Less{' '}
                <SketchUnderline>Than You Think.</SketchUnderline>
              </h2>
              <p className="text-base leading-relaxed mb-5" style={{ color: '#6B7280' }}>
                Most businesses assume custom software is out of reach. Then they get a quote and realize it&apos;s a fraction of what they expected — and a fraction of what they&apos;ve been losing to inefficiency every year.
              </p>
              <p className="text-base leading-relaxed mb-5" style={{ color: '#6B7280' }}>
                Because we use modern frameworks and AI-assisted development, our build times are shorter, our overhead is lower, and we&apos;re able to pass that directly to you. There&apos;s no agency markup on tools we don&apos;t own. You pay for the build. That&apos;s it.
              </p>
              <p className="text-base leading-relaxed mb-8" style={{ color: '#6B7280' }}>
                Get a free, no-obligation quote. Tell us what you&apos;re trying to build and we&apos;ll give you a real number — no vague estimates, no discovery fees just to learn what you&apos;re even asking for.
              </p>
              <Link
                href="/contact"
                className="inline-block text-sm font-bold uppercase tracking-wider px-8 py-4 text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Get a Free Quote →
              </Link>
            </AnimateIn>

            <AnimateIn delay={150}>
              <div
                className="p-8"
                style={{ backgroundColor: '#0C0F0C', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <p
                  className="text-xl font-bold mb-6 tracking-wide"
                  style={{ color: '#ffffff', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  WHAT&apos;S INCLUDED IN YOUR QUOTE:
                </p>
                <ul className="flex flex-col gap-4 mb-8">
                  {[
                    'Honest scope assessment — no upselling',
                    'Clear timeline from kickoff to launch',
                    'Fixed-price project delivery — no hourly billing surprises',
                    'Full ownership of your code and data from day one',
                    'No retainer required after launch',
                    'No obligation to move forward',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-white">
                      <CheckIcon />
                      {item}
                    </li>
                  ))}
                </ul>
                <div
                  className="p-5"
                  style={{ borderLeft: '4px solid #22C55E', backgroundColor: 'rgba(34,197,94,0.07)' }}
                >
                  <p className="text-sm leading-relaxed font-bold" style={{ color: 'rgba(255,255,255,0.85)', fontFamily: 'Oxanium, system-ui, sans-serif' }}>
                    &ldquo;We&apos;ve had clients get a quote expecting $50,000 and walk away with a build for a fraction of that. Just ask.&rdquo;
                  </p>
                </div>
              </div>
            </AnimateIn>

          </div>
        </div>
      </section>

      {/* ── CTA STRIP ── */}
      <section className="py-20" style={{ backgroundColor: '#22C55E' }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
          <AnimateIn>
            <h2
              className="text-3xl lg:text-4xl font-bold text-white mb-4"
              style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Ready to Build Something That{' '}
              <SketchUnderline color="#ffffff">Actually Works?</SketchUnderline>
            </h2>
            <p className="text-base mb-10 max-w-xl mx-auto" style={{ color: 'rgba(255,255,255,0.85)' }}>
              Get a free, no-obligation quote. Tell us what you need — we&apos;ll give you a real number and a real timeline.
            </p>
            <Link
              href="/contact"
              className="inline-block bg-white font-bold text-sm uppercase tracking-wider px-10 py-4 transition-all hover:shadow-lg hover:-translate-y-0.5"
              style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Get a Free Quote →
            </Link>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
