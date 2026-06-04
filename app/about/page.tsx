import type { Metadata } from 'next';
import Link from 'next/link';
import { AnimateIn } from '@/components/AnimateIn';

export const metadata: Metadata = {
  title: 'About Us',
  description:
    'Streamflare Media Group is a full-service digital agency headquartered in Allen, TX. We\'re not your average DFW agency — dedicated strategies, real attention, and real results.',
};

const cities = [
  'Allen', 'Plano', 'Frisco', 'McKinney', 'Dallas', 'Fort Worth',
  'Arlington', 'Garland', 'Irving', 'Richardson', 'Mesquite', 'Carrollton',
  'Denton', 'Lewisville', 'Flower Mound', 'Southlake', 'Grapevine',
  'Colleyville', 'Rockwall', 'Grand Prairie', 'Bedford',
];

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
        className="pt-[140px] pb-24 bg-dot-pattern"
        style={{ backgroundColor: '#0C0F0C' }}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <p
            className="anim-fade-up text-xs font-bold uppercase tracking-widest mb-5"
            style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
          >
            About Streamflare
          </p>
          <h1
            className="anim-fade-up anim-delay-1 text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight max-w-3xl mb-6"
            style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
          >
            We&apos;re Not Your Average DFW Agency
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
      <section className="py-24 bg-grid-pattern" style={{ backgroundColor: '#ffffff' }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            {/* Left: story text */}
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
                Streamflare was built on a simple observation: most small businesses in the DFW Metroplex are getting underserved by agencies that treat their accounts like line items. The same template websites. The same boosted posts. The same monthly reports full of vanity metrics that don&apos;t mean anything.
              </p>
              <p className="text-base leading-relaxed mb-5" style={{ color: '#6B7280' }}>
                We do it differently. Every client gets a dedicated account manager, a custom strategy, and direct access to the team doing the work — not a revolving door of junior contractors or offshore freelancers reading from a playbook.
              </p>
              <p className="text-base leading-relaxed mb-10" style={{ color: '#6B7280' }}>
                We keep our client roster intentionally small. That&apos;s not a limitation — it&apos;s a commitment. When you work with Streamflare, your growth is our focus. Not a checkbox on an afternoon to-do list.
              </p>

              <div
                className="p-6"
                style={{ backgroundColor: '#F5F7F5', borderLeft: '4px solid #22C55E' }}
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

            {/* Right: stats card */}
            <AnimateIn delay={150} className="lg:pt-8">
              <div
                className="p-8"
                style={{ backgroundColor: '#0C0F0C', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <p
                  className="text-xs font-bold uppercase tracking-widest mb-6"
                  style={{ color: '#6B7280', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  By the Numbers
                </p>
                <div className="flex flex-col gap-1">
                  {[
                    { value: '21+', label: 'DFW Cities Served' },
                    { value: '3', label: 'Core Service Lines' },
                    { value: '100%', label: 'Custom Strategy — No Templates' },
                    { value: 'Allen, TX', label: 'Headquarters' },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="flex items-center justify-between py-4"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <span
                        className="text-2xl font-bold"
                        style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                      >
                        {stat.value}
                      </span>
                      <span
                        className="text-xs uppercase tracking-widest text-right max-w-[160px]"
                        style={{ color: '#6B7280', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                      >
                        {stat.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </AnimateIn>
          </div>
        </div>
      </section>

      {/* ── VALUES ── */}
      <section className="py-24 bg-dot-pattern" style={{ backgroundColor: '#F5F7F5' }}>
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

      {/* ── SERVICE AREA ── */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="mb-12">
            <p
              className="text-xs font-bold uppercase tracking-widest mb-4"
              style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Our Service Area
            </p>
            <h2
              className="text-4xl lg:text-5xl font-bold mb-6"
              style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Serving 21+ Cities Across DFW
            </h2>
            <p className="text-base max-w-2xl leading-relaxed" style={{ color: '#6B7280' }}>
              Headquartered in Allen, TX, Streamflare Media Group works with businesses throughout the DFW
              Metroplex — from Plano and Frisco to Dallas, Fort Worth, and every city in between.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {cities.map((city) => (
              <span
                key={city}
                className="text-xs px-3 py-1.5 uppercase tracking-wide font-medium"
                style={{ border: '1px solid #E5E7EB', color: '#6B7280' }}
              >
                {city}
              </span>
            ))}
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
            Ready to Work With an Agency That Actually Gives a Damn?
          </h2>
          <p className="text-base mb-10 max-w-xl mx-auto" style={{ color: 'rgba(255,255,255,0.85)' }}>
            Get a free consultation and see what Streamflare can do for your DFW business.
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
