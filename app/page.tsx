import Link from 'next/link';

const cities = [
  'Allen', 'Plano', 'Frisco', 'McKinney', 'Dallas', 'Fort Worth',
  'Arlington', 'Garland', 'Irving', 'Richardson', 'Mesquite', 'Carrollton',
  'Denton', 'Lewisville', 'Flower Mound', 'Southlake', 'Grapevine',
  'Colleyville', 'Rockwall', 'Grand Prairie', 'Bedford',
];

const serviceCards = [
  {
    num: '01',
    name: 'Custom Software & Web Design',
    description:
      'We build custom websites and web applications designed to convert visitors into customers. No templates — every project is built around your brand and your goals.',
    href: '/services',
  },
  {
    num: '02',
    name: 'Meta Ads Management',
    description:
      'Data-driven paid social campaigns on Facebook and Instagram that generate measurable ROI. From creative strategy to audience targeting and A/B testing, we handle it all.',
    href: '/services',
  },
  {
    num: '03',
    name: 'Social Media Management',
    description:
      'Consistent, on-brand content that builds your audience and keeps your business top of mind. Authentic voice, community management, and real engagement.',
    href: '/services',
  },
];

const reasons = [
  {
    title: 'DFW-Native',
    body: 'We know the Dallas-Fort Worth market inside and out — the neighborhoods, the competition, the customers.',
  },
  {
    title: 'Full-Service',
    body: 'One team handles your web presence, paid ads, and social media. No juggling multiple vendors.',
  },
  {
    title: 'Data-Driven',
    body: 'Every decision is backed by real analytics. We measure what matters and optimize relentlessly.',
  },
  {
    title: 'Transparent',
    body: "Regular reporting in plain language so you always know exactly what's working and why.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* ── HERO ── */}
      <section
        className="relative flex items-center min-h-screen pt-16"
        style={{ backgroundColor: '#07080E' }}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8 w-full py-20 lg:py-0">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            {/* Left: copy */}
            <div>
              <h1
                className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-none tracking-tight mb-6"
                style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                <span className="block text-white">DIGITAL MARKETING</span>
                <span className="block text-white">
                  THAT DRIVES{' '}
                  <span style={{ color: '#1A52E8' }}>RESULTS</span>
                </span>
              </h1>

              <p className="text-lg mb-10 max-w-xl" style={{ color: '#6B7280' }}>
                Full-service digital agency serving businesses across the DFW Metroplex.
              </p>

              <div className="flex flex-wrap items-center gap-4 mb-12">
                <Link
                  href="/contact"
                  className="inline-block text-sm font-semibold uppercase tracking-wider px-8 py-3 transition-colors hover:opacity-90"
                  style={{ backgroundColor: '#1A52E8', color: '#ffffff', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  Start a Project
                </Link>
                <Link
                  href="/services"
                  className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wider transition-colors text-white/70 hover:text-white"
                  style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  View Services <span aria-hidden>→</span>
                </Link>
              </div>

              {/* Stat pills */}
              <div
                className="pt-8"
                style={{ borderTop: '1px solid rgba(255,255,255,0.10)' }}
              >
                <div className="flex flex-wrap gap-3">
                  {['21+ Cities Served', 'DFW-Focused', 'Full-Service Agency'].map((stat) => (
                    <span
                      key={stat}
                      className="text-xs uppercase tracking-widest px-4 py-2 font-semibold"
                      style={{
                        border: '1px solid rgba(255,255,255,0.15)',
                        color: 'rgba(255,255,255,0.6)',
                        fontFamily: 'Oxanium, system-ui, sans-serif',
                      }}
                    >
                      {stat}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: mock dashboard card */}
            <div className="hidden lg:block">
              <div
                className="p-6"
                style={{ backgroundColor: '#0F1019', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                {/* Card header */}
                <div
                  className="flex items-center justify-between mb-6 pb-4"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div>
                    <p
                      className="text-xs uppercase tracking-widest font-semibold mb-1"
                      style={{ color: '#6B7280', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                    >
                      Active Campaigns
                    </p>
                    <p
                      className="text-2xl font-bold text-white"
                      style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
                    >
                      4 Running
                    </p>
                  </div>
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: '#1A52E8', boxShadow: '0 0 8px #1A52E8' }}
                  />
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  {[
                    { label: 'Impressions', value: '124K' },
                    { label: 'Clicks', value: '3,840' },
                    { label: 'Conversions', value: '216' },
                  ].map((s) => (
                    <div key={s.label} className="text-center">
                      <p
                        className="text-xl font-bold text-white"
                        style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
                      >
                        {s.value}
                      </p>
                      <p
                        className="text-xs mt-1 uppercase tracking-wide"
                        style={{ color: '#6B7280', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                      >
                        {s.label}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Bar chart */}
                <div>
                  <p
                    className="text-xs uppercase tracking-widest font-semibold mb-3"
                    style={{ color: '#6B7280', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                  >
                    Weekly Performance
                  </p>
                  <div className="flex items-end gap-2 h-20">
                    {[45, 62, 55, 78, 90, 68, 85].map((pct, i) => (
                      <div key={i} className="flex-1 flex flex-col justify-end h-full">
                        <div
                          style={{
                            height: `${pct}%`,
                            backgroundColor: i === 4 || i === 6 ? '#1A52E8' : 'rgba(26,82,232,0.25)',
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between mt-2">
                    {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                      <span
                        key={i}
                        className="flex-1 text-center text-xs"
                        style={{ color: '#6B7280', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Bottom metric */}
                <div
                  className="mt-6 pt-4 flex items-center justify-between"
                  style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <span
                    className="text-xs uppercase tracking-widest"
                    style={{ color: '#6B7280', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                  >
                    Avg. ROAS
                  </span>
                  <span
                    className="text-sm font-bold"
                    style={{ color: '#1A52E8', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                  >
                    4.2×
                  </span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── WHAT WE DO ── */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="mb-14">
            <p
              className="text-xs font-bold uppercase tracking-widest mb-4"
              style={{ color: '#1A52E8', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              What We Do
            </p>
            <h2
              className="text-4xl lg:text-5xl font-bold"
              style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Services Built for Growth
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {serviceCards.map((svc) => (
              <div
                key={svc.num}
                className="p-8 flex flex-col transition-all"
                style={{ border: '1px solid #E5E7EB' }}
              >
                <span
                  className="text-3xl font-bold mb-6 block"
                  style={{ color: '#1A52E8', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  {svc.num}
                </span>
                <h3
                  className="text-lg font-bold mb-3"
                  style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  {svc.name}
                </h3>
                <p className="text-sm leading-relaxed flex-1 mb-6" style={{ color: '#6B7280' }}>
                  {svc.description}
                </p>
                <Link
                  href={svc.href}
                  className="text-sm font-semibold inline-flex items-center gap-1 transition-colors"
                  style={{ color: '#1A52E8', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  Learn More →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHY STREAMFLARE ── */}
      <section className="py-24" style={{ backgroundColor: '#07080E' }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            {/* Left */}
            <div>
              <p
                className="text-xs font-bold uppercase tracking-widest mb-4"
                style={{ color: '#1A52E8', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Why Streamflare
              </p>
              <h2
                className="text-4xl lg:text-5xl font-bold text-white leading-tight"
                style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Precision Marketing for DFW Businesses
              </h2>
              <div
                className="mt-8 pt-8"
                style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
              >
                <p className="text-base leading-relaxed" style={{ color: '#6B7280' }}>
                  Most agencies treat every client the same. We don&apos;t. Every campaign, every website, and every
                  piece of content is crafted specifically for your business, your market, and your customers — with the
                  DFW Metroplex in focus from day one.
                </p>
              </div>
            </div>

            {/* Right: reasons */}
            <div className="flex flex-col gap-6">
              {reasons.map((r) => (
                <div
                  key={r.title}
                  className="pl-5 py-1"
                  style={{ borderLeft: '2px solid #1A52E8' }}
                >
                  <h3
                    className="text-base font-bold text-white mb-1"
                    style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
                  >
                    {r.title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: '#6B7280' }}>
                    {r.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── SERVICE AREA ── */}
      <section className="py-24" style={{ backgroundColor: '#F5F6FA' }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="mb-12">
            <p
              className="text-xs font-bold uppercase tracking-widest mb-4"
              style={{ color: '#1A52E8', fontFamily: 'Oxanium, system-ui, sans-serif' }}
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
      <section className="py-20" style={{ backgroundColor: '#1A52E8' }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
          <h2
            className="text-3xl lg:text-4xl font-bold text-white mb-4"
            style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
          >
            Ready to grow your business?
          </h2>
          <p className="text-base mb-10 max-w-xl mx-auto" style={{ color: 'rgba(255,255,255,0.75)' }}>
            Get a free consultation and see what Streamflare can do for you.
          </p>
          <Link
            href="/contact"
            className="inline-block bg-white font-bold text-sm uppercase tracking-wider px-10 py-4 transition-colors hover:bg-gray-100"
            style={{ color: '#1A52E8', fontFamily: 'Oxanium, system-ui, sans-serif' }}
          >
            Schedule a Consultation →
          </Link>
        </div>
      </section>
    </>
  );
}
