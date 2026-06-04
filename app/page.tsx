import Link from 'next/link';
import Image from 'next/image';
import { LeadForm } from '@/components/LeadForm';
import { AnimateIn } from '@/components/AnimateIn';
import { SketchUnderline } from '@/components/SketchUnderline';

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

function XIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

const buildServices = [
  'Custom Web Applications',
  'Business Software & Portals',
  'Website Design & Development',
  'Branding & Visual Identity',
  'Ongoing Maintenance',
];

const growServices = [
  'Meta Ads Management',
  'Facebook & Instagram Campaigns',
  'Audience Research & Targeting',
  'Ad Creative & Copywriting',
  'Campaign Optimization',
];

const manageServices = [
  'Social Media Posting',
  'Content Creation & Graphics',
  'Platform Management',
  'Community Engagement',
  'Monthly Analytics Reports',
];

const painPoints = [
  "Your business runs on outdated software or manual processes that slow you down",
  "Your website looks outdated and doesn't generate calls or leads",
  "You're paying for ads but can't tell if they're actually working",
  "Your social media is inconsistent — or nonexistent",
  "You've wasted money on agencies that overpromised and underdelivered",
];

const streamflareStrengths = [
  'Custom software and websites built around your workflow',
  'DFW market knowledge — we know your customers',
  'Straightforward monthly reporting, no fluff',
];

const processSteps = [
  {
    num: '01',
    title: 'Discover',
    body: "We start by learning your business, your goals, and who you're trying to reach. The more we understand your workflow and market, the better your software and marketing will perform.",
  },
  {
    num: '02',
    title: 'Build',
    body: 'We design and develop your software, website, or ad campaigns — built around your brand and business logic. You review and approve every step before we move forward.',
  },
  {
    num: '03',
    title: 'Launch & Grow',
    body: 'Once live, we track everything and optimize continuously. You get clear monthly reports — actual numbers, plain language, no jargon.',
  },
];


export default function HomePage() {
  return (
    <>
      {/* ── HERO — centered, brand-forward, paper warm background ── */}
      <section
        className="relative bg-paper-warm"
        style={{
          clipPath: 'polygon(0 0, 100% 0, 100% 96%, 0 100%)',
          paddingTop: '108px',
          paddingBottom: '44px',
        }}
      >
        <div className="max-w-3xl mx-auto px-6 lg:px-8 w-full pt-2 pb-4 text-center">

          {/* Large logo — own colors on light background */}
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

          {/* Thin green rule */}
          <div className="anim-fade-up anim-delay-1 flex justify-center mb-5">
            <div style={{ width: '56px', height: '2px', backgroundColor: '#22C55E' }} />
          </div>

          {/* Headline */}
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
            We design and build custom web applications, business software, and digital marketing systems for businesses ready to grow — wherever you are.
          </p>

          {/* CTAs */}
          <div className="anim-fade-up anim-delay-4 flex flex-wrap justify-center gap-4 mb-8">
            <Link
              href="/contact"
              className="text-sm font-bold uppercase tracking-wider px-8 py-4 text-white transition-all hover:opacity-90 hover:-translate-y-0.5"
              style={{ backgroundColor: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Start a Project →
            </Link>
            <Link
              href="/services"
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

          {/* Clean stat row — no pill boxes */}
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

      {/* ── LEAD CAPTURE — inline form strip ── */}
      <section className="py-14 bg-paper">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center gap-6 md:gap-10">
            <div className="flex-shrink-0 text-center md:text-left">
              <p
                className="text-lg font-bold"
                style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Ready to get started?
              </p>
              <p className="text-sm" style={{ color: '#6B7280' }}>
                Drop your info and we&apos;ll reach out within one business day.
              </p>
            </div>
            <div className="flex-1 w-full">
              <LeadForm dark={false} />
            </div>
          </div>
        </div>
      </section>

      {/* ── SOFTWARE SECTION — redesigned ── */}
      <section className="py-24 bg-dot-pattern" style={{ backgroundColor: '#0C0F0C' }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8">

          {/* Header — two-column split */}
          <AnimateIn className="mb-14">
            <div className="grid lg:grid-cols-2 gap-10 items-end">
              <div>
                <p
                  className="text-xs font-bold uppercase tracking-widest mb-5"
                  style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  Software Design &amp; Development
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
                  We build with the same open-source tools powering modern software companies — and pass the savings directly to you. Same quality. Fraction of the cost.
                </p>
              </div>
            </div>
          </AnimateIn>

          {/* Three benefit blocks */}
          <AnimateIn className="mb-14">
            <div
              className="grid grid-cols-1 md:grid-cols-3"
              style={{ border: '1px solid rgba(255,255,255,0.09)' }}
            >
              {[
                {
                  num: '01',
                  title: 'You own it all.',
                  desc: 'Code, data, hosting — all yours from day one. No lock-in, no proprietary platforms you have to keep paying for.',
                },
                {
                  num: '02',
                  title: 'No markup.',
                  desc: "We build with proven open-source tools and don't charge a premium for them. You pay for the work, not the overhead.",
                },
                {
                  num: '03',
                  title: '4–8 weeks.',
                  desc: 'Modern frameworks let us skip a lot of what legacy agencies bill hours for. Faster builds, lower cost, same quality.',
                },
              ].map((item, i) => (
                <div
                  key={item.num}
                  className="p-8"
                  style={{
                    borderRight: i < 2 ? '1px solid rgba(255,255,255,0.09)' : 'none',
                    borderBottom: '1px solid rgba(255,255,255,0.09)',
                  }}
                >
                  <p
                    className="font-bold mb-3"
                    style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif', fontSize: '2.8rem', lineHeight: 1 }}
                  >
                    {item.num}
                  </p>
                  <h3
                    className="text-lg font-bold text-white mb-2"
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

          {/* Two use-case cards */}
          <div className="grid md:grid-cols-2 gap-5">

            <AnimateIn delay={100}>
              <div
                className="card-lift flex flex-col h-full"
                style={{ border: '1px solid rgba(255,255,255,0.09)', backgroundColor: '#111511' }}
              >
                <div style={{ height: '3px', backgroundColor: 'rgba(255,255,255,0.15)' }} />
                <div className="p-8 flex flex-col flex-1">
                  <p
                    className="text-xs font-bold uppercase tracking-widest mb-4"
                    style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                  >
                    For Your Business
                  </p>
                  <h3
                    className="text-2xl font-bold text-white mb-4 leading-snug"
                    style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
                  >
                    Replace the manual work<br />with a system built for you.
                  </h3>
                  <p className="text-sm leading-relaxed mb-6 flex-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    Running your business on spreadsheets, disconnected tools, or repetitive manual steps? We design and build the exact software your workflow needs — nothing extra, nothing missing.
                  </p>
                  <div
                    className="pt-5 mb-6"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    <p
                      className="text-xs uppercase tracking-widest mb-2"
                      style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                    >
                      Builds include
                    </p>
                    <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      CRM Systems · Client Portals · Booking Tools · Dashboards · Inventory Systems
                    </p>
                  </div>
                  <Link
                    href="/contact"
                    className="text-sm font-bold uppercase tracking-wider transition-colors hover:opacity-75 inline-flex items-center gap-2"
                    style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                  >
                    Get a Quote →
                  </Link>
                </div>
              </div>
            </AnimateIn>

            <AnimateIn delay={220}>
              <div
                className="card-lift flex flex-col h-full"
                style={{ border: '1px solid rgba(34,197,94,0.25)', backgroundColor: '#111511', borderLeft: '3px solid #22C55E' }}
              >
                <div className="p-8 flex flex-col flex-1">
                  <p
                    className="text-xs font-bold uppercase tracking-widest mb-4"
                    style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                  >
                    For Your Idea
                  </p>
                  <h3
                    className="text-2xl font-bold text-white mb-4 leading-snug"
                    style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
                  >
                    Turn your concept<br />into a live product.
                  </h3>
                  <p className="text-sm leading-relaxed mb-6 flex-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    Have an idea for a software product you want to launch and sell? We take it from zero to a polished, live application — designed for users, built to scale, ready to market.
                  </p>
                  <div
                    className="pt-5 mb-6"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    <p
                      className="text-xs uppercase tracking-widest mb-2"
                      style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                    >
                      Builds include
                    </p>
                    <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      SaaS Tools · Web Platforms · Marketplaces · MVPs · Niche Applications
                    </p>
                  </div>
                  <Link
                    href="/contact"
                    className="text-sm font-bold uppercase tracking-wider transition-colors hover:opacity-75 inline-flex items-center gap-2"
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

      {/* ── BUILD / GROW / MANAGE ── paper section ── */}
      <section className="py-24 bg-paper">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">

          <AnimateIn className="mb-14">
            <p
              className="text-xs font-bold uppercase tracking-widest mb-4"
              style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              What We Do
            </p>
            <h2
              className="text-4xl lg:text-5xl font-bold"
              style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Everything Your Business <SketchUnderline>Needs Online</SketchUnderline>
            </h2>
          </AnimateIn>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                title: 'Build',
                desc: 'Custom software, web applications, and websites designed to replace friction with function.',
                items: buildServices,
                delay: 0,
              },
              {
                title: 'Grow',
                desc: 'Reach more of the right people with paid advertising built around your goals.',
                items: growServices,
                delay: 120,
              },
              {
                title: 'Manage',
                desc: 'Stay consistent and visible without spending your week on social media.',
                items: manageServices,
                delay: 240,
              },
            ].map((col) => (
              <AnimateIn key={col.title} delay={col.delay}>
                <div
                  className="card-lift h-full bg-white"
                  style={{ border: '1px solid #E5E7EB' }}
                >
                  <div style={{ height: '5px', backgroundColor: '#22C55E' }} />
                  <div className="p-7">
                    <h3
                      className="text-xl font-bold mb-3"
                      style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                    >
                      {col.title}
                    </h3>
                    <p className="text-sm leading-relaxed mb-6" style={{ color: '#6B7280' }}>
                      {col.desc}
                    </p>
                    <ul className="flex flex-col gap-2.5">
                      {col.items.map((item) => (
                        <li key={item} className="flex items-center gap-3 text-sm" style={{ color: '#374151' }}>
                          <CheckIcon />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── THREE PILLARS strip ── dark ── */}
      <section className="py-16 bg-dot-pattern" style={{ backgroundColor: '#0C0F0C' }}>
        <AnimateIn>
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="flex flex-col md:flex-row items-stretch divide-y md:divide-y-0 md:divide-x divide-white/10">
              {[
                { label: 'DFW Headquarters', sub: 'Allen, TX — serving the full Metroplex' },
                { label: 'Built From Scratch', sub: 'Every project is custom — no templates, no shortcuts' },
                { label: 'One Team', sub: 'Software, ads, and social all under one roof' },
              ].map((item) => (
                <div key={item.label} className="flex-1 px-10 py-8 text-center">
                  <p className="text-lg font-bold text-white mb-2" style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}>
                    {item.label}
                  </p>
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {item.sub}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </AnimateIn>
      </section>

      {/* ── VISUAL FEATURE IMAGE ── */}
      <section className="relative overflow-hidden" style={{ height: '360px' }}>
        <Image
          src="https://images.unsplash.com/photo-1551434678-e076c223a692?w=1400&q=85"
          alt="Team collaborating on a project"
          fill
          className="object-cover"
          sizes="100vw"
        />
        <div
          className="absolute inset-0 flex items-center"
          style={{ background: 'linear-gradient(to right, rgba(12,15,12,0.88) 0%, rgba(12,15,12,0.6) 45%, rgba(12,15,12,0.15) 100%)' }}
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
              We treat your project like it&apos;s our own business on the line.
            </h2>
          </div>
        </div>
      </section>

      {/* ── PAIN POINTS ── paper-warm section ── */}
      <section className="py-24 bg-paper-warm">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-start">

            <AnimateIn>
              <p
                className="text-xs font-bold uppercase tracking-widest mb-4"
                style={{ color: '#6B7280', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Sound Familiar?
              </p>
              <h2
                className="text-3xl lg:text-4xl font-bold mb-5 leading-tight"
                style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Is Your Business Held Back by Bad Tech or Bad Marketing?
              </h2>
              <p className="text-base leading-relaxed mb-8" style={{ color: '#6B7280' }}>
                You&apos;re great at what you do. But outdated software and a weak digital presence cost you time, money, and customers every day.
              </p>
              <ul className="flex flex-col gap-3 mb-8">
                {painPoints.map((point) => (
                  <li key={point} className="flex items-start gap-3 text-sm leading-relaxed" style={{ color: '#374151' }}>
                    <XIcon />
                    {point}
                  </li>
                ))}
              </ul>
              <Link
                href="/contact"
                className="text-sm font-bold uppercase tracking-wider transition-opacity hover:opacity-70"
                style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                We fix all of this →
              </Link>
            </AnimateIn>

            <AnimateIn delay={150}>
              <div
                className="p-8"
                style={{ backgroundColor: '#0C0F0C', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <p
                  className="text-xl font-bold mb-3 tracking-wide"
                  style={{ color: '#ffffff', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  STREAMFLARE FIXES THIS.
                </p>
                <p className="text-sm leading-relaxed mb-6" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  We&apos;re not a generic agency running the same playbook for every client. Every strategy — and every line of code — is built specifically for your business.
                </p>
                <ul className="flex flex-col gap-3 mb-8">
                  {streamflareStrengths.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-white">
                      <CheckIcon />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/contact"
                  className="inline-block text-sm font-bold uppercase tracking-wider px-6 py-3 transition-opacity hover:opacity-90"
                  style={{ backgroundColor: '#22C55E', color: '#ffffff', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  Start the Conversation →
                </Link>
              </div>
            </AnimateIn>

          </div>
        </div>
      </section>

      {/* ── OUR PROCESS ── paper section ── */}
      <section className="py-24 bg-paper">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-start">

            <AnimateIn>
              <p
                className="text-xs font-bold uppercase tracking-widest mb-4"
                style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Our Process
              </p>
              <h2
                className="text-3xl lg:text-4xl font-bold mb-6 leading-tight"
                style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                From First Call to Full Launch
              </h2>
              <p className="text-base leading-relaxed" style={{ color: '#6B7280' }}>
                Simple, transparent, and focused on your business. No confusing timelines, no surprise fees — just clear steps from kickoff to launch and beyond.
              </p>
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
