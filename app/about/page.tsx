import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About Us',
  description:
    'Streamflare Media Group is a full-service digital agency headquartered in Allen, TX, dedicated to helping DFW businesses build a dominant online presence.',
};

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

const cities = [
  'Allen', 'Plano', 'Frisco', 'McKinney', 'Dallas', 'Fort Worth',
  'Arlington', 'Garland', 'Irving', 'Richardson', 'Mesquite', 'Carrollton',
  'Denton', 'Lewisville', 'Flower Mound', 'Southlake', 'Grapevine',
  'Colleyville', 'Rockwall', 'Grand Prairie', 'Bedford',
];

const values = [
  'Quality Over Volume',
  'Transparent Communication',
  'DFW-First Focus',
  'Results That Matter',
];

export default function AboutPage() {
  return (
    <>
      {/* ── HERO ── */}
      <section
        className="pt-32 pb-24"
        style={{ backgroundColor: '#07080E' }}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <p
            className="text-xs font-bold uppercase tracking-widest mb-5"
            style={{ color: '#1A52E8', fontFamily: 'Oxanium, system-ui, sans-serif' }}
          >
            About Streamflare
          </p>
          <h1
            className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight max-w-3xl mb-6"
            style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
          >
            Built for Businesses That Take Marketing Seriously
          </h1>
          <p className="text-lg max-w-2xl leading-relaxed" style={{ color: '#6B7280' }}>
            Streamflare Media Group is a full-service digital agency headquartered in Allen, TX, dedicated to
            helping DFW businesses build a dominant online presence.
          </p>
        </div>
      </section>

      {/* ── OUR STORY ── */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            {/* Left: story text */}
            <div>
              <p
                className="text-xs font-bold uppercase tracking-widest mb-4"
                style={{ color: '#1A52E8', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Our Story
              </p>
              <h2
                className="text-3xl lg:text-4xl font-bold mb-6"
                style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                A Clear Mission from Day One
              </h2>
              <p className="text-base leading-relaxed mb-6" style={{ color: '#6B7280' }}>
                Streamflare was founded with a clear mission — to give DFW small and mid-size businesses access to
                the same caliber of digital marketing typically reserved for enterprise brands. We don&apos;t use
                cookie-cutter templates or automated strategies.
              </p>
              <p className="text-base leading-relaxed mb-10" style={{ color: '#6B7280' }}>
                Every campaign, every website, every post is crafted specifically for your business and your market.
                When you work with Streamflare, you get a dedicated team that treats your growth like their own.
              </p>

              <div
                className="pt-8"
                style={{ borderTop: '1px solid #E5E7EB' }}
              >
                <p
                  className="text-xs font-bold uppercase tracking-widest mb-5"
                  style={{ color: '#6B7280', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  Our Values
                </p>
                <ul className="flex flex-col gap-3">
                  {values.map((v) => (
                    <li
                      key={v}
                      className="flex items-center gap-3 text-sm font-semibold"
                      style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                    >
                      <span
                        className="w-1.5 h-1.5 flex-shrink-0"
                        style={{ backgroundColor: '#1A52E8' }}
                      />
                      {v}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Right: decorative dark card */}
            <div className="lg:pt-8">
              <div
                className="p-8"
                style={{ backgroundColor: '#07080E', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <p
                  className="text-xs font-bold uppercase tracking-widest mb-6"
                  style={{ color: '#6B7280', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  By the Numbers
                </p>
                <div className="flex flex-col gap-6">
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
                        className="text-2xl font-bold text-white"
                        style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
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
            </div>
          </div>
        </div>
      </section>

      {/* ── WHAT WE DO ── */}
      <section className="py-24" style={{ backgroundColor: '#F5F6FA' }}>
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
                className="p-8 flex flex-col bg-white transition-all"
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
                  className="text-sm font-semibold inline-flex items-center gap-1"
                  style={{ color: '#1A52E8', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  Learn More →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SERVICE AREA ── */}
      <section className="py-24 bg-white">
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
