import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { AnimateIn } from '@/components/AnimateIn';
import { SketchUnderline } from '@/components/SketchUnderline';

export const metadata: Metadata = {
  title: 'All-Inclusive Digital Marketing',
  description:
    'SEO, Google LSA Management, Meta Ad Management, and Social Media Posting — every channel managed by one team. Contact us for custom plans.',
};

function CheckIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

const services = [
  {
    num: '01',
    name: 'Search Engine Optimization',
    short: 'SEO',
    desc: 'Show up when the right people are searching. We build and execute SEO strategies around the keywords your customers actually use — locally and beyond. Technical optimization, content, and link building all covered.',
    includes: [
      'Local and national keyword strategy',
      'On-page and technical SEO',
      'Google Business Profile optimization',
      'Content strategy and creation',
      'Monthly ranking and traffic reports',
    ],
  },
  {
    num: '02',
    name: 'Google Local Services Ads',
    short: 'Google LSA',
    desc: 'LSA puts your business at the very top of Google search results — above the organic results and above standard paid ads — with a Google Guaranteed badge that builds instant trust. We manage the setup, verification, bidding, and ongoing optimization.',
    includes: [
      'LSA account setup and verification',
      'Google Guaranteed badge management',
      'Lead tracking and review management',
      'Bid strategy and budget optimization',
      'Weekly lead quality monitoring',
    ],
  },
  {
    num: '03',
    name: 'Meta Ad Management',
    short: 'Meta Ads',
    desc: 'Facebook and Instagram campaigns built around your audience, your offer, and your market — not copied from a template. We handle creative strategy, audience research, ad copy, A/B testing, and ongoing optimization so your budget actually works.',
    includes: [
      'Campaign strategy and setup',
      'Audience research and targeting',
      'Ad creative and copywriting',
      'A/B testing and retargeting',
      'Monthly reporting and optimization',
    ],
  },
  {
    num: '04',
    name: 'Social Media Posting',
    short: 'Social',
    desc: 'Consistent, on-brand content published across your platforms — without you spending your week on it. We create, schedule, and post content that reflects your brand voice and keeps your audience engaged.',
    includes: [
      'Content calendar and strategy',
      'Graphic design and copywriting',
      'Platform management (Facebook, Instagram, LinkedIn)',
      'Community engagement and responses',
      'Monthly analytics report',
    ],
  },
];

export default function DigitalMarketingPage() {
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
            All-Inclusive Digital Marketing
          </p>
          <h1
            className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight max-w-4xl mb-6"
            style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
          >
            Every Channel.{' '}
            <SketchUnderline color="#22C55E">One Team.</SketchUnderline>
          </h1>
          <p className="text-lg max-w-2xl leading-relaxed mb-6" style={{ color: 'rgba(255,255,255,0.6)' }}>
            SEO, Google LSA Management, Meta Ads, and Social Media — all managed together by one team that knows your business. No more juggling multiple agencies with disconnected strategies.
          </p>
          <p className="text-sm leading-relaxed mb-10 max-w-xl" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Packages are custom to each business. Contact us to discuss what fits your goals and budget.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link
              href="/contact"
              className="text-sm font-bold uppercase tracking-wider px-8 py-4 text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Contact for Plans →
            </Link>
            <a
              href="#services"
              className="text-sm font-bold uppercase tracking-wider px-8 py-4 transition-all hover:bg-white hover:text-black"
              style={{
                border: '1.5px solid rgba(255,255,255,0.25)',
                color: 'rgba(255,255,255,0.8)',
                fontFamily: 'Oxanium, system-ui, sans-serif',
              }}
            >
              See What&apos;s Included
            </a>
          </div>
        </div>
      </section>

      {/* ── OVERVIEW STRIP ── four channels ── */}
      <section className="py-16 bg-dot-pattern" style={{ backgroundColor: '#111511' }}>
        <AnimateIn>
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="flex flex-col md:flex-row items-stretch divide-y md:divide-y-0 md:divide-x divide-white/10">
              {['SEO', 'Google LSA', 'Meta Ads', 'Social Media'].map((channel) => (
                <div key={channel} className="flex-1 px-10 py-8 text-center">
                  <p className="text-base font-bold text-white" style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}>
                    {channel}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </AnimateIn>
      </section>

      {/* ── ONE TEAM ADVANTAGE ── paper ── */}
      <section className="py-24 bg-paper">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            <AnimateIn>
              <p
                className="text-xs font-bold uppercase tracking-widest mb-4"
                style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Why All-Inclusive
              </p>
              <h2
                className="text-3xl lg:text-4xl font-bold mb-6 leading-tight"
                style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                One team. Every channel.{' '}
                <SketchUnderline>Connected strategy.</SketchUnderline>
              </h2>
              <p className="text-base leading-relaxed mb-5" style={{ color: '#6B7280' }}>
                Most businesses piece together their marketing from multiple vendors — one for SEO, one for ads, another for social. Each one works in a silo. The messaging is inconsistent, the strategy doesn&apos;t connect, and no one has the full picture of what&apos;s working.
              </p>
              <p className="text-base leading-relaxed mb-5" style={{ color: '#6B7280' }}>
                When one team manages every channel, your SEO content reinforces your ad targeting. Your social presence supports your LSA reputation. Your campaigns are built around the same message, the same audience, and the same goals.
              </p>
              <p className="text-base leading-relaxed" style={{ color: '#6B7280' }}>
                That&apos;s what all-inclusive means. Not just more services — a connected approach that makes every dollar work harder.
              </p>
            </AnimateIn>

            <AnimateIn delay={150}>
              <div className="relative overflow-hidden" style={{ height: '400px' }}>
                <Image
                  src="https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=700&q=85"
                  alt="Marketing team working together at laptops"
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

          </div>
        </div>
      </section>

      {/* ── FULL-WIDTH IMAGE STRIP ── */}
      <section className="relative overflow-hidden" style={{ height: '340px' }}>
        <Image
          src="https://plus.unsplash.com/premium_photo-1661425715124-310ec1b49b8a?w=1400&q=85"
          alt="Digital marketing analytics and strategy"
          fill
          className="object-cover object-center"
          sizes="100vw"
        />
        <div
          className="absolute inset-0 flex items-center"
          style={{ background: 'linear-gradient(to right, rgba(12,15,12,0.90) 0%, rgba(12,15,12,0.6) 50%, rgba(12,15,12,0.15) 100%)' }}
        >
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <p
              className="text-xs font-bold uppercase tracking-widest mb-4"
              style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              DFW Market Focus
            </p>
            <h2
              className="text-3xl lg:text-4xl font-bold text-white max-w-xl leading-tight"
              style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              We keep our roster small so every client gets real attention — not a templated strategy.
            </h2>
          </div>
        </div>
      </section>

      {/* ── SERVICES DETAIL ── alternating paper/paper-warm ── */}
      <div id="services">
        {services.map((service, idx) => (
          <section
            key={service.num}
            className={`py-24 ${idx % 2 === 0 ? 'bg-paper' : 'bg-paper-warm'}`}
          >
            <div className="max-w-7xl mx-auto px-6 lg:px-8">
              <AnimateIn>
                <div className="grid lg:grid-cols-2 gap-16 items-start">
                  <div>
                    <span
                      className="text-6xl font-bold block mb-4"
                      style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif', lineHeight: 1 }}
                    >
                      {service.num}
                    </span>
                    <p
                      className="text-xs font-bold uppercase tracking-widest mb-3"
                      style={{ color: '#6B7280', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                    >
                      {service.short}
                    </p>
                    <h2
                      className="text-3xl lg:text-4xl font-bold mb-6"
                      style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                    >
                      {service.name}
                    </h2>
                    <p className="text-base leading-relaxed mb-8" style={{ color: '#6B7280' }}>
                      {service.desc}
                    </p>
                    <Link
                      href="/contact"
                      className="inline-block text-sm font-bold uppercase tracking-wider px-7 py-3 transition-opacity hover:opacity-90 text-white"
                      style={{ backgroundColor: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                    >
                      Contact for Plans →
                    </Link>
                  </div>

                  <div
                    className="pt-8"
                    style={{ borderTop: '1px solid #E5E7EB' }}
                  >
                    <p
                      className="text-xs font-bold uppercase tracking-widest mb-5"
                      style={{ color: '#6B7280', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                    >
                      What&apos;s Included
                    </p>
                    <ul className="flex flex-col gap-3">
                      {service.includes.map((item) => (
                        <li
                          key={item}
                          className="flex items-center gap-3 text-sm"
                          style={{ color: '#374151' }}
                        >
                          <CheckIcon />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </AnimateIn>
            </div>
          </section>
        ))}
      </div>

      {/* ── PRICING / CONTACT ── dark ── */}
      <section className="py-24 bg-dot-pattern" style={{ backgroundColor: '#0C0F0C' }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="max-w-3xl">
            <AnimateIn>
              <p
                className="text-xs font-bold uppercase tracking-widest mb-4"
                style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Pricing
              </p>
              <h2
                className="text-3xl lg:text-4xl font-bold text-white mb-6"
                style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Plans Built Around{' '}
                <SketchUnderline color="#22C55E">Your Business.</SketchUnderline>
              </h2>
              <p className="text-base leading-relaxed mb-5" style={{ color: 'rgba(255,255,255,0.6)' }}>
                We don&apos;t post pricing because the right plan depends on your business — your market, your goals, and what channels make the most sense for where you are right now. A local service business in Allen, TX has different needs than a regional contractor scaling across DFW.
              </p>
              <p className="text-base leading-relaxed mb-10" style={{ color: 'rgba(255,255,255,0.6)' }}>
                Contact us and we&apos;ll put together a plan around what you actually need — not a package that forces you to pay for services that don&apos;t apply to your situation.
              </p>
              <div
                className="p-6 mb-8"
                style={{ borderLeft: '4px solid #22C55E', backgroundColor: 'rgba(34,197,94,0.06)' }}
              >
                <p
                  className="text-base font-bold text-white"
                  style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  &ldquo;Small roster. Serious focus. Real results.&rdquo;
                </p>
                <p className="text-sm mt-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  We keep our client count intentionally low so every business gets real attention — not the same recycled strategy with your logo swapped in.
                </p>
              </div>
              <Link
                href="/contact"
                className="inline-block text-sm font-bold uppercase tracking-wider px-8 py-4 text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Contact for Plans →
              </Link>
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
              Ready to Grow Your DFW Business?
            </h2>
            <p className="text-base mb-10 max-w-xl mx-auto" style={{ color: 'rgba(255,255,255,0.85)' }}>
              Get a free consultation and find out what the right combination of channels can do for your business.
            </p>
            <Link
              href="/contact"
              className="inline-block bg-white font-bold text-sm uppercase tracking-wider px-10 py-4 transition-all hover:shadow-lg hover:-translate-y-0.5"
              style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Schedule a Free Consultation →
            </Link>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
