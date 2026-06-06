import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { AnimateIn } from '@/components/AnimateIn';
import { SketchUnderline } from '@/components/SketchUnderline';

export const metadata: Metadata = {
  title: 'About Us',
  description:
    'Streamflaire is a faith-based digital agency headquartered in Allen, TX — built on streamlined processes, genuine talent, and a commitment to excellence for the glory of God.',
};

function CheckIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

const values = [
  {
    heading: 'Keep the client roster focused.',
    body: 'We deliberately cap the number of clients we take on. Every business we work with gets real attention — not a queue number.',
  },
  {
    heading: 'Measure what matters, not what looks good.',
    body: 'Vanity metrics are easy to inflate. We track the numbers that directly tie to your revenue and report them honestly.',
  },
  {
    heading: 'Build for your goals, not a template.',
    body: 'Every website, ad campaign, and content strategy is custom-built. If it doesn\'t fit your business, we don\'t use it.',
  },
  {
    heading: 'Communicate like humans, not account managers.',
    body: 'You talk to the people doing the work — not a middleman reading from a project management tool.',
  },
];

export default function AboutPage() {
  return (
    <>
      {/* ── HERO ── */}
      <section
        className="pt-[148px] pb-24 bg-dot-pattern"
        style={{ backgroundColor: '#0C0F0C' }}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <p
            className="anim-fade-up text-xs font-bold uppercase tracking-widest mb-5"
            style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
          >
            About Streamflaire
          </p>
          <h1
            className="anim-fade-up anim-delay-1 text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight max-w-3xl mb-6"
            style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
          >
            We&apos;re Not Your <SketchUnderline color="#22C55E">Average</SketchUnderline> Agency
          </h1>
          <p
            className="anim-fade-up anim-delay-2 text-lg max-w-2xl leading-relaxed"
            style={{ color: 'rgba(255,255,255,0.6)' }}
          >
            Headquartered in Allen, TX. Built to serve DFW businesses that are tired of being treated like line items on someone else&apos;s spreadsheet.
          </p>
        </div>
      </section>

      {/* ── OUR STORY ── */}
      <section className="py-24 bg-paper">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-start">

            <AnimateIn>
              <p
                className="text-xs font-bold uppercase tracking-widest mb-4"
                style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Our Story
              </p>
              <h2
                className="text-3xl lg:text-4xl font-bold mb-6"
                style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Built on a Simple Observation
              </h2>
              <p className="text-base leading-relaxed mb-5" style={{ color: '#6B7280' }}>
                Streamflaire was built on a simple observation: most small businesses in the DFW Metroplex are getting underserved by agencies that treat their accounts like line items. The same template websites. The same boosted posts. The same monthly reports full of vanity metrics that don&apos;t mean anything.
              </p>
              <p className="text-base leading-relaxed mb-5" style={{ color: '#6B7280' }}>
                We do it differently. Every client gets a dedicated account manager, a custom strategy, and direct access to the team doing the work — not a revolving door of junior contractors or offshore freelancers reading from a playbook.
              </p>
              <p className="text-base leading-relaxed mb-10" style={{ color: '#6B7280' }}>
                We keep our client roster intentionally small. That&apos;s not a limitation — it&apos;s a commitment. When you work with Streamflaire, your growth is our focus. Not a checkbox on an afternoon to-do list.
              </p>

              <div
                className="p-6"
                style={{ backgroundColor: '#F4F3EF', borderLeft: '4px solid #22C55E' }}
              >
                <p
                  className="text-lg font-bold"
                  style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  &ldquo;Real Strategy. Real Skills. Real Results.&rdquo;
                </p>
                <p className="text-sm mt-2" style={{ color: '#6B7280' }}>
                  That&apos;s not a tagline — it&apos;s how we evaluate every decision we make for your business.
                </p>
              </div>
            </AnimateIn>

            <AnimateIn delay={150} className="lg:pt-4">
              <div className="relative overflow-hidden" style={{ height: '380px' }}>
                <Image
                  src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=700&q=85"
                  alt="Team collaborating"
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
                <div
                  className="absolute inset-0"
                  style={{ background: 'linear-gradient(to bottom, transparent 50%, rgba(12,15,12,0.7) 100%)' }}
                />
              </div>

              <div
                className="grid grid-cols-2 gap-0 mt-0"
                style={{ backgroundColor: '#0C0F0C', border: '1px solid rgba(255,255,255,0.07)', borderTop: 'none' }}
              >
                {[
                  { value: 'Allen, TX', label: 'Headquarters' },
                  { value: '100%', label: 'Custom-Built' },
                  { value: 'One Team', label: 'Software, Ads & Social' },
                  { value: 'Fixed', label: 'Transparent Pricing' },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="px-6 py-5 text-center"
                    style={{ borderRight: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <p
                      className="text-lg font-bold mb-1"
                      style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                    >
                      {stat.value}
                    </p>
                    <p
                      className="text-xs uppercase tracking-widest"
                      style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                    >
                      {stat.label}
                    </p>
                  </div>
                ))}
              </div>
            </AnimateIn>
          </div>
        </div>
      </section>

      {/* ── THE NAME ── */}
      <section className="py-24 bg-dot-pattern" style={{ backgroundColor: '#0C0F0C' }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8">

          <AnimateIn className="mb-16 text-center">
            <p
              className="text-xs font-bold uppercase tracking-widest mb-4"
              style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              The Name
            </p>
            <h2
              className="text-3xl lg:text-4xl font-bold text-white mb-4"
              style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Why <SketchUnderline color="#22C55E">Streamflaire</SketchUnderline>?
            </h2>
            <p className="text-base max-w-xl mx-auto leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Every part of the name means something. It&apos;s not a made-up word — it&apos;s a statement about how we operate and what we bring to every client.
            </p>
          </AnimateIn>

          <div className="grid md:grid-cols-2 gap-px" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>

            <AnimateIn>
              <div className="p-10 h-full" style={{ backgroundColor: '#0C0F0C' }}>
                <p
                  className="text-5xl lg:text-7xl font-bold mb-6 tracking-tight"
                  style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif', lineHeight: 1 }}
                >
                  STREAM
                </p>
                <h3
                  className="text-lg font-bold text-white mb-4"
                  style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  Streamlined. Efficient. Built to Save You Money.
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  Our processes are built lean from the ground up. We use modern technology, AI-assisted development, and refined workflows that eliminate the overhead most agencies pass on to you. Streamlined operations mean faster turnaround times, fewer errors, and lower costs — all without cutting corners on quality.
                </p>
                <p className="text-sm leading-relaxed mt-4" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  When we say your software ships in 4–8 weeks or your campaign is live faster than you expected, that&apos;s not luck. That&apos;s the stream — the current we&apos;ve built that keeps everything moving forward.
                </p>
              </div>
            </AnimateIn>

            <AnimateIn delay={120}>
              <div className="p-10 h-full" style={{ backgroundColor: '#111511' }}>
                <p
                  className="text-5xl lg:text-7xl font-bold mb-6 tracking-tight"
                  style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif', lineHeight: 1 }}
                >
                  FLAIRE
                </p>
                <h3
                  className="text-lg font-bold text-white mb-4"
                  style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  Talented. Precise. We Know What We&apos;re Doing.
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  Flair isn&apos;t decoration — it&apos;s mastery. It&apos;s the kind of instinct that comes from doing the work until you&apos;re genuinely good at it. We don&apos;t hand your project off to junior contractors or run the same playbook we used for the last client. Every strategy, every line of code, every campaign is the product of real expertise.
                </p>
                <p className="text-sm leading-relaxed mt-4" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  The &ldquo;e&rdquo; at the end isn&apos;t a typo — it&apos;s intentional. It&apos;s there to remind us that what we do is more than functional. It&apos;s done with care, with craft, and with a standard most agencies simply don&apos;t hold themselves to.
                </p>
              </div>
            </AnimateIn>

          </div>
        </div>
      </section>

      {/* ── VALUES ── */}
      <section className="py-24 bg-paper-warm">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <p
              className="text-xs font-bold uppercase tracking-widest mb-4"
              style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              How We Operate
            </p>
            <h2
              className="text-3xl lg:text-4xl font-bold mb-12"
              style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              The Principles That Drive Every Decision
            </h2>
            <div className="flex flex-col gap-8">
              {values.map((v, i) => (
                <div
                  key={v.heading}
                  className="flex items-start gap-5 pb-8"
                  style={{ borderBottom: i < values.length - 1 ? '1px solid #E5E7EB' : 'none' }}
                >
                  <div
                    className="w-8 h-8 flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)' }}
                  >
                    <CheckIcon />
                  </div>
                  <div>
                    <h3
                      className="text-base font-bold mb-2"
                      style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                    >
                      {v.heading}
                    </h3>
                    <p className="text-sm leading-relaxed" style={{ color: '#6B7280' }}>
                      {v.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FAITH & FOUNDATION ── */}
      <section className="py-24 bg-paper">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-start">

            <AnimateIn>
              <p
                className="text-xs font-bold uppercase tracking-widest mb-4"
                style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Our Foundation
              </p>
              <h2
                className="text-3xl lg:text-4xl font-bold mb-6 leading-tight"
                style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Faith-Based. <SketchUnderline>Purpose-Driven.</SketchUnderline>
              </h2>
              <p className="text-base leading-relaxed mb-5" style={{ color: '#6B7280' }}>
                Streamflaire is a faith-based company. That&apos;s not a tagline or a section we added for optics — it&apos;s the reason the company exists and the standard we hold every decision to.
              </p>
              <p className="text-base leading-relaxed mb-5" style={{ color: '#6B7280' }}>
                We believe that how you do your work matters as much as what you deliver. Our faith shapes the way we treat clients, the integrity we bring to every project, and the commitment we have to genuinely serving the businesses that trust us.
              </p>
              <p className="text-base leading-relaxed" style={{ color: '#6B7280' }}>
                We don&apos;t do excellent work because it looks good on a portfolio. We do it because we answer to a higher standard than a client review — we do everything for the glory of God, because He is our ultimate fulfillment. That conviction shows in every line of code, every ad campaign, and every interaction we have.
              </p>
            </AnimateIn>

            <AnimateIn delay={150}>
              <div
                className="p-10"
                style={{ backgroundColor: '#0C0F0C', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <p
                  className="text-xs font-bold uppercase tracking-widest mb-6"
                  style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  Our Verse
                </p>
                <blockquote className="mb-6">
                  <p
                    className="text-xl lg:text-2xl font-bold text-white leading-relaxed mb-4"
                    style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
                  >
                    &ldquo;Whatever you do, work heartily, as for the Lord and not for men, knowing that from the Lord you will receive the inheritance as your reward. You are serving the Lord Christ.&rdquo;
                  </p>
                  <cite
                    className="text-sm font-bold not-italic"
                    style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                  >
                    — Colossians 3:23–24 (ESV)
                  </cite>
                </blockquote>
                <div
                  className="pt-6"
                  style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    This verse is on the wall. It&apos;s the lens through which we evaluate our work — not just whether the client is satisfied, but whether we gave everything we had and held ourselves to a standard worth being proud of.
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
          <h2
            className="text-3xl lg:text-4xl font-bold text-white mb-4"
            style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
          >
            Ready to Work With an Agency That <SketchUnderline color="#ffffff">Actually Delivers?</SketchUnderline>
          </h2>
          <p className="text-base mb-10 max-w-xl mx-auto" style={{ color: 'rgba(255,255,255,0.85)' }}>
            Get a free consultation and see what Streamflaire can do for your DFW business.
          </p>
          <Link
            href="/contact"
            className="inline-block bg-white font-bold text-sm uppercase tracking-wider px-10 py-4 transition-colors hover:bg-gray-50"
            style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
          >
            Schedule a Consultation →
          </Link>
        </div>
      </section>
    </>
  );
}
