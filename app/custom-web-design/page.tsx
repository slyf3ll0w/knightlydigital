import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { AnimateIn } from '@/components/AnimateIn';
import { SketchUnderline } from '@/components/SketchUnderline';

export const metadata: Metadata = {
  title: 'Custom Web Design',
  description:
    'Custom websites designed and hand-coded from scratch — no templates, no page builders. Fast, mobile-first, and built to turn visitors into customers. Free no-obligation quote.',
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
    name: 'Custom Website Design',
    short: 'Design',
    desc: 'Your site is designed from a blank canvas around your brand, your customers, and what makes your business different. No themes, no templates, no "pick a layout" — a design that exists nowhere else on the internet.',
    includes: [
      'Discovery session on your brand and goals',
      'Custom layout and visual design — never a template',
      'Brand-matched colors, typography, and imagery',
      'Copywriting help that speaks to your customers',
      'Revisions until the design is right',
    ],
  },
  {
    num: '02',
    name: 'Hand-Coded Development',
    short: 'Build',
    desc: 'We build with the same modern stack powering today’s best software companies — not a drag-and-drop page builder. That means pages that load fast, score well with Google, and don’t break when a plugin updates.',
    includes: [
      'Hand-coded with a modern framework — no WordPress bloat',
      'Mobile-first, responsive on every screen size',
      'Fast load times and strong Core Web Vitals',
      'Clean structure and on-page SEO fundamentals built in',
      'Contact forms, booking, and lead capture wired up',
    ],
  },
  {
    num: '03',
    name: 'Redesigns & Landing Pages',
    short: 'Redesign',
    desc: 'Already have a site that looks dated, loads slowly, or doesn’t bring in work? We rebuild it properly — keeping what works, fixing what doesn’t. We also build focused landing pages for campaigns and offers.',
    includes: [
      'Honest audit of your current site',
      'Full redesign or targeted refresh',
      'Content and image migration handled for you',
      'Campaign landing pages built to convert',
      'Redirects handled so you keep your Google standing',
    ],
  },
  {
    num: '04',
    name: 'Launch, Hosting & Care',
    short: 'Care',
    desc: 'We handle the launch end to end — domain, hosting, and SSL — and stay available afterward for updates and changes. You own everything: the code, the content, and the accounts.',
    includes: [
      'Domain, hosting, and SSL setup',
      'Full ownership of your code and content',
      'Analytics set up so you can see what’s working',
      'Ongoing updates and content changes on request',
      'No forced monthly retainer',
    ],
  },
];

export default function CustomWebDesignPage() {
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
            Custom Web Design
          </p>
          <h1
            className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight max-w-4xl mb-6"
            style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
          >
            No Templates.{' '}
            <SketchUnderline color="#22C55E">No Compromises.</SketchUnderline>
          </h1>
          <p className="text-lg max-w-2xl leading-relaxed mb-6" style={{ color: 'rgba(255,255,255,0.6)' }}>
            Your website is the first impression most customers ever get of your business. We design and hand-code custom sites from scratch — no page builders, no recycled themes — built to load fast, look sharp on every device, and turn visitors into customers.
          </p>
          <p className="text-sm leading-relaxed mb-10 max-w-xl" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Fixed-price builds with a free, no-obligation quote. Most sites ship in 2–4 weeks.
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

      {/* ── OVERVIEW STRIP ── four pillars ── */}
      <section className="py-16 bg-dot-pattern" style={{ backgroundColor: '#111511' }}>
        <AnimateIn>
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="flex flex-col md:flex-row items-stretch divide-y md:divide-y-0 md:divide-x divide-white/10">
              {['Custom Design', 'Hand-Coded', 'Mobile-First', 'Search-Ready'].map((pillar) => (
                <div key={pillar} className="flex-1 px-10 py-8 text-center">
                  <p className="text-base font-bold text-white" style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}>
                    {pillar}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </AnimateIn>
      </section>

      {/* ── WHY CUSTOM ── paper ── */}
      <section className="py-24 bg-paper">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            <AnimateIn>
              <p
                className="text-xs font-bold uppercase tracking-widest mb-4"
                style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Why Custom
              </p>
              <h2
                className="text-3xl lg:text-4xl font-bold mb-6 leading-tight"
                style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Templates look like templates.{' '}
                <SketchUnderline>Customers notice.</SketchUnderline>
              </h2>
              <p className="text-base leading-relaxed mb-5" style={{ color: '#6B7280' }}>
                Most small-business websites come from the same handful of themes and page builders. They load slowly, they look like everyone else&apos;s, and they were designed to be easy to sell — not to win your customers over.
              </p>
              <p className="text-base leading-relaxed mb-5" style={{ color: '#6B7280' }}>
                A custom site starts with your business instead of a layout. Every section exists because it earns its place: it explains what you do, builds trust, and moves the visitor toward contacting you. Nothing is filler.
              </p>
              <p className="text-base leading-relaxed" style={{ color: '#6B7280' }}>
                And because we hand-code instead of stacking plugins, the result is faster, more secure, and easier for Google to rank — with nothing to break every time a theme updates.
              </p>
            </AnimateIn>

            <AnimateIn delay={150}>
              <div className="relative overflow-hidden" style={{ height: '400px' }}>
                <Image
                  src="https://images.unsplash.com/photo-1467232004584-a241de8bcf5d?w=700&q=85"
                  alt="Designer sketching a website layout"
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
          src="https://images.unsplash.com/photo-1547658719-da2b51169166?w=1400&q=85"
          alt="Web design and development workspace"
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
              We keep our roster small so every site gets real design attention — not a recycled theme.
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
                      Get a Free Quote →
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
                Fixed Price. No Hourly{' '}
                <SketchUnderline color="#22C55E">Surprises.</SketchUnderline>
              </h2>
              <p className="text-base leading-relaxed mb-5" style={{ color: 'rgba(255,255,255,0.6)' }}>
                Every site is quoted as a fixed-price project before we start — based on the pages, features, and content you actually need. A five-page site for a local service business is a different build than an e-commerce store, and the price should reflect that.
              </p>
              <p className="text-base leading-relaxed mb-10" style={{ color: 'rgba(255,255,255,0.6)' }}>
                Tell us what you&apos;re trying to build and we&apos;ll give you a real number — no discovery fees, no vague ranges, and no obligation to move forward.
              </p>
              <div
                className="p-6 mb-8"
                style={{ borderLeft: '4px solid #22C55E', backgroundColor: 'rgba(34,197,94,0.06)' }}
              >
                <p
                  className="text-base font-bold text-white"
                  style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  &ldquo;A custom site costs less than you think — and looks like it cost more.&rdquo;
                </p>
                <p className="text-sm mt-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Modern frameworks and AI-assisted development mean our build times are short and our overhead is low — and we pass that directly to you.
                </p>
              </div>
              <Link
                href="/contact"
                className="inline-block text-sm font-bold uppercase tracking-wider px-8 py-4 text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Get a Free Quote →
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
              Ready for a Website That Actually Wins Work?
            </h2>
            <p className="text-base mb-10 max-w-xl mx-auto" style={{ color: 'rgba(255,255,255,0.85)' }}>
              Get a free, no-obligation quote. Tell us about your business — we&apos;ll show you what a custom site can do for it.
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
