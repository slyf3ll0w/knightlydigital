import Link from 'next/link';
import Image from 'next/image';
import { AnimateIn } from '@/components/AnimateIn';
import { SketchUnderline } from '@/components/SketchUnderline';

function CheckIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <>
      {/* ── HERO ── green wrapper so clipPath cut shows green, not white ── */}
      <div style={{ backgroundColor: '#22C55E' }}>
      <section
        className="relative bg-paper-warm"
        style={{
          clipPath: 'polygon(0 0, 100% 0, 100% 96%, 0 100%)',
          paddingTop: '108px',
          paddingBottom: '44px',
        }}
      >
        <div className="max-w-3xl mx-auto px-6 lg:px-8 w-full pt-2 pb-4 text-center">

          <div className="anim-fade-up flex justify-center mb-4">
            <Image
              src="/logo.png"
              alt="Streamflare Media Group"
              width={340}
              height={68}
              priority
              quality={100}
              sizes="340px"
              unoptimized
            />
          </div>

          <div className="anim-fade-up anim-delay-1 flex justify-center mb-5">
            <div style={{ width: '56px', height: '2px', backgroundColor: '#22C55E' }} />
          </div>

          <h1
            className="anim-fade-up anim-delay-2 font-bold tracking-tight mb-4"
            style={{
              fontFamily: 'Oxanium, system-ui, sans-serif',
              fontSize: 'clamp(2.4rem, 5vw, 3.8rem)',
              color: '#0A0A0F',
              lineHeight: 1.12,
            }}
          >
            Custom Software &amp; Digital Marketing
            <br />
            <span style={{ color: '#22C55E', display: 'inline-block', marginTop: '4px' }}>
              <SketchUnderline>Built for Your Business.</SketchUnderline>
            </span>
          </h1>

          <p
            className="anim-fade-up anim-delay-3 text-lg leading-relaxed mb-7 mx-auto"
            style={{ color: '#4B5563', maxWidth: '560px' }}
          >
            We design and build custom software, manage your digital marketing, and give every service business a free job management tool — so you can run a tighter operation and grow faster.
          </p>

          <div className="anim-fade-up anim-delay-4 flex flex-wrap justify-center gap-4 mb-8">
            <Link
              href="/contact"
              className="text-sm font-bold uppercase tracking-wider px-8 py-4 text-white transition-all hover:opacity-90 hover:-translate-y-0.5"
              style={{ backgroundColor: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Start a Project →
            </Link>
            <Link
              href="/custom-software"
              className="text-sm font-bold uppercase tracking-wider px-8 py-4 transition-all hover:bg-black hover:text-white"
              style={{
                border: '1.5px solid #0A0A0F',
                color: '#0A0A0F',
                fontFamily: 'Oxanium, system-ui, sans-serif',
              }}
            >
              Explore Services
            </Link>
          </div>

          <div
            className="anim-fade-up anim-delay-5 flex items-center justify-center gap-0 pt-6"
            style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }}
          >
            {['No Templates — Ever', 'Modern Tech Stack', 'Fixed-Price Projects'].map((stat, i) => (
              <div key={stat} className="flex items-center">
                {i > 0 && (
                  <span className="mx-5" style={{ color: '#22C55E', fontSize: '1rem', lineHeight: 1 }}>·</span>
                )}
                <span
                  className="text-xs uppercase tracking-widest font-medium"
                  style={{ color: '#6B7280', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  {stat}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
      </div>

      {/* ── INTRODUCING FREE JOB MANAGER ── green ── */}
      <section className="py-24" style={{ backgroundColor: '#22C55E' }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8">

          <AnimateIn className="mb-14 text-center">
            <p
              className="text-xs font-bold uppercase tracking-widest mb-5"
              style={{ color: 'rgba(0,0,0,0.45)', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Free for Everyone
            </p>
            <h2
              className="text-4xl lg:text-5xl font-bold leading-tight mx-auto mb-6"
              style={{ fontFamily: 'Oxanium, system-ui, sans-serif', color: '#0A0A0F', maxWidth: '820px' }}
            >
              Introducing Streamflare&apos;s{' '}
              <SketchUnderline color="rgba(0,0,0,0.35)">Free Job Manager</SketchUnderline>
              {' '}for Service Businesses
            </h2>
            <p
              className="text-base lg:text-lg mx-auto leading-relaxed"
              style={{ color: 'rgba(0,0,0,0.6)', maxWidth: '600px' }}
            >
              The whole software — job pipeline, scheduling, invoicing, payments, and more — is completely free. Every feature. No trial. No plans to upgrade into. Free forever.
            </p>
          </AnimateIn>

          <AnimateIn className="mb-8">
            <div
              className="grid grid-cols-1 md:grid-cols-3"
              style={{ gap: '2px', backgroundColor: 'rgba(0,0,0,0.18)' }}
            >
              {[
                {
                  title: 'Job Pipeline',
                  desc: 'Lead → Scheduled → In Progress → Invoiced → Paid. Board or list view — one click moves a job.',
                },
                {
                  title: 'Scheduling Calendar',
                  desc: 'Drag a job onto a day and assign a tech. No double-bookings. No missed appointments.',
                },
                {
                  title: 'Quotes & Invoicing',
                  desc: 'Build a quote, send it, get it accepted online, then flip it to an invoice in one step.',
                },
                {
                  title: 'Online Payments',
                  desc: 'Card, ACH, pay-by-link — processed through your payment processor. Surcharging built in.',
                },
                {
                  title: 'Review Automation',
                  desc: 'The moment a job is paid, a Google review request fires automatically.',
                },
                {
                  title: 'Mobile Field Access',
                  desc: 'Full tool from any phone browser. Mark jobs complete, upload photos, send invoices — on the roof.',
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="p-7 lg:p-8"
                  style={{ backgroundColor: '#0C0F0C' }}
                >
                  <div style={{ width: '22px', height: '2px', backgroundColor: '#22C55E', marginBottom: '14px' }} />
                  <h3
                    className="text-sm font-bold text-white mb-2"
                    style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
                  >
                    {item.title}
                  </h3>
                  <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </AnimateIn>

          <AnimateIn>
            <div
              className="flex items-center gap-5 p-5 mb-10"
              style={{ backgroundColor: 'rgba(0,0,0,0.14)', borderLeft: '4px solid rgba(0,0,0,0.25)' }}
            >
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(0,0,0,0.7)' }}>
                <span
                  className="font-bold"
                  style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  Free forever — no plans, no upgrade path, no catch.
                </span>{' '}
                Every feature listed. Not a trial. Not a &ldquo;basic tier.&rdquo; The full tool — free, for any service business.
              </p>
            </div>
            <div className="text-center">
              <Link
                href="/crm"
                className="inline-block text-sm font-bold uppercase tracking-wider px-8 py-4 transition-all hover:opacity-80"
                style={{ backgroundColor: '#0A0A0F', color: '#ffffff', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Explore All Features →
              </Link>
            </div>
          </AnimateIn>

        </div>
      </section>

      {/* ── CUSTOM SOFTWARE DESIGN ── paper ── */}
      <section className="py-24 bg-paper">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            <AnimateIn>
              <p
                className="text-xs font-bold uppercase tracking-widest mb-4"
                style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Custom Software Design
              </p>
              <h2
                className="text-3xl lg:text-4xl font-bold mb-6 leading-tight"
                style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Your Software. Your Workflows.{' '}
                <SketchUnderline>Built for You.</SketchUnderline>
              </h2>
              <p className="text-base leading-relaxed mb-8" style={{ color: '#6B7280' }}>
                Whether you need software built around the exact way your business runs, or you have an idea for a product you want to take to market — we design and build it. Custom, fast, and competitively priced. The quote is free and there&apos;s no obligation.
              </p>

              <div className="grid sm:grid-cols-2 gap-4 mb-8">
                <div
                  className="p-5"
                  style={{ border: '1px solid #E5E7EB', backgroundColor: '#ffffff' }}
                >
                  <p
                    className="text-xs font-bold uppercase tracking-widest mb-3"
                    style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                  >
                    For Your Business
                  </p>
                  <ul className="flex flex-col gap-2">
                    {['Custom CRM', 'Client Portals', 'Booking Systems', 'Internal Dashboards'].map((item) => (
                      <li key={item} className="flex items-center gap-2 text-sm" style={{ color: '#374151' }}>
                        <CheckIcon />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div
                  className="p-5"
                  style={{ border: '1px solid #E5E7EB', backgroundColor: '#ffffff' }}
                >
                  <p
                    className="text-xs font-bold uppercase tracking-widest mb-3"
                    style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                  >
                    For Your Idea
                  </p>
                  <ul className="flex flex-col gap-2">
                    {['SaaS Tools', 'Web Platforms', 'Industry Apps', 'MVPs & Launches'].map((item) => (
                      <li key={item} className="flex items-center gap-2 text-sm" style={{ color: '#374151' }}>
                        <CheckIcon />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="flex flex-wrap gap-4">
                <Link
                  href="/custom-software"
                  className="inline-block text-sm font-bold uppercase tracking-wider px-7 py-3 text-white transition-opacity hover:opacity-90"
                  style={{ backgroundColor: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  Get a Free Quote →
                </Link>
                <Link
                  href="/custom-software"
                  className="inline-block text-sm font-bold uppercase tracking-wider px-7 py-3 transition-all hover:bg-black hover:text-white"
                  style={{ border: '1.5px solid #0A0A0F', color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  Learn More
                </Link>
              </div>
            </AnimateIn>

            <AnimateIn delay={150}>
              <div className="relative overflow-hidden" style={{ height: '480px' }}>
                <Image
                  src="https://plus.unsplash.com/premium_photo-1683134153517-32015af21911?w=800&q=85"
                  alt="Software development team collaborating on code"
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
                <div
                  className="absolute inset-0"
                  style={{ background: 'linear-gradient(135deg, rgba(12,15,12,0.15) 0%, transparent 50%)' }}
                />
                <div
                  className="absolute bottom-0 left-0 right-0 p-6"
                  style={{ background: 'linear-gradient(to top, rgba(12,15,12,0.7) 0%, transparent 100%)' }}
                >
                  <p
                    className="text-sm font-bold text-white mb-1"
                    style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
                  >
                    Competitive Pricing. Fast Turnaround.
                  </p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
                    Most projects ship in 4–8 weeks. A custom build might cost less than you think.
                  </p>
                </div>
              </div>
            </AnimateIn>

          </div>
        </div>
      </section>

      {/* ── ALL-INCLUSIVE DIGITAL MARKETING ── dark ── */}
      <section className="py-24 bg-dot-pattern" style={{ backgroundColor: '#0C0F0C' }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            <AnimateIn>
              <div className="relative overflow-hidden" style={{ height: '480px' }}>
                <Image
                  src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&q=85"
                  alt="Digital marketing analytics and strategy"
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
                <div
                  className="absolute inset-0"
                  style={{ background: 'linear-gradient(135deg, rgba(12,15,12,0.3) 0%, transparent 60%)' }}
                />
                <div
                  className="absolute bottom-0 left-0 right-0 p-6"
                  style={{ background: 'linear-gradient(to top, rgba(12,15,12,0.85) 0%, transparent 100%)' }}
                >
                  <p
                    className="text-sm font-bold text-white mb-1"
                    style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
                  >
                    Small Roster. Serious Focus.
                  </p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
                    We keep our client count intentionally low so every business gets real attention.
                  </p>
                </div>
              </div>
            </AnimateIn>

            <AnimateIn delay={150}>
              <p
                className="text-xs font-bold uppercase tracking-widest mb-4"
                style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                All-Inclusive Digital Marketing
              </p>
              <h2
                className="text-3xl lg:text-4xl font-bold text-white mb-6 leading-tight"
                style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Every Channel.{' '}
                <SketchUnderline color="#22C55E">One Team.</SketchUnderline>
              </h2>
              <p className="text-base leading-relaxed mb-8" style={{ color: 'rgba(255,255,255,0.55)' }}>
                SEO, Google LSA Management, Meta Ads, and Social Media — all managed by one team that knows your business. No more juggling vendors with disconnected strategies. When one team runs every channel, your message stays consistent and your budget works harder.
              </p>

              <div
                className="grid grid-cols-2 gap-3 mb-8"
              >
                {[
                  { label: 'SEO', desc: 'Show up when the right people are searching.' },
                  { label: 'Google LSA', desc: 'Top of search with a Google Guaranteed badge.' },
                  { label: 'Meta Ads', desc: 'Facebook & Instagram campaigns built for your market.' },
                  { label: 'Social Media', desc: 'Consistent, on-brand content across your platforms.' },
                ].map((channel) => (
                  <div
                    key={channel.label}
                    className="p-4"
                    style={{ border: '1px solid rgba(255,255,255,0.09)', backgroundColor: '#111511' }}
                  >
                    <p
                      className="text-xs font-bold text-white mb-1"
                      style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
                    >
                      {channel.label}
                    </p>
                    <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      {channel.desc}
                    </p>
                  </div>
                ))}
              </div>

              <p className="text-xs mb-6" style={{ color: 'rgba(255,255,255,0.35)', fontFamily: 'Oxanium, system-ui, sans-serif' }}>
                Custom plans — pricing is tailored to your business and goals.
              </p>

              <div className="flex flex-wrap gap-4">
                <Link
                  href="/digital-marketing"
                  className="inline-block text-sm font-bold uppercase tracking-wider px-7 py-3 text-white transition-opacity hover:opacity-90"
                  style={{ backgroundColor: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  Contact for Plans →
                </Link>
                <Link
                  href="/digital-marketing"
                  className="inline-block text-sm font-bold uppercase tracking-wider px-7 py-3 transition-all hover:bg-white hover:text-black"
                  style={{ border: '1.5px solid rgba(255,255,255,0.25)', color: 'rgba(255,255,255,0.8)', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  Learn More
                </Link>
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
              Ready to Build Something That <SketchUnderline color="#ffffff">Actually Works?</SketchUnderline>
            </h2>
            <p className="text-base mb-10 max-w-xl mx-auto" style={{ color: 'rgba(255,255,255,0.85)' }}>
              Get a free consultation and see what Streamflare can build for your DFW business.
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
