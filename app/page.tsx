import Link from 'next/link';
import { LeadForm } from '@/components/LeadForm';
import { EstimateForm } from '@/components/EstimateForm';
import { AnimateIn } from '@/components/AnimateIn';

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

const softwareFeatures = [
  {
    title: 'Built for Your Workflow',
    body: "Off-the-shelf software makes your team adapt to it. We build software that adapts to you — your processes, your team, and your customers.",
  },
  {
    title: 'Web Apps & Client Portals',
    body: 'Give your clients a branded portal to view orders, send messages, and track progress. Reduce back-and-forth and deliver a professional experience.',
  },
  {
    title: 'Integrated & Scalable',
    body: 'Built on modern frameworks that grow with your business. We think about your Year 1 and your Year 5 before we write the first line of code.',
  },
];

export default function HomePage() {
  return (
    <>
      {/* ── HERO ── light background, Jobber-inspired ── */}
      <section
        className="relative flex items-center min-h-screen pt-[100px] bg-dot-pattern-light"
        style={{
          backgroundColor: '#F8FAF8',
          clipPath: 'polygon(0 0, 100% 0, 100% 96%, 0 100%)',
          paddingBottom: '7rem',
        }}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8 w-full py-16 lg:py-0">
          <div className="grid lg:grid-cols-2 gap-14 items-center">

            {/* Left: copy + inline lead form */}
            <div>
              <p
                className="anim-fade-up text-xs font-bold uppercase tracking-widest mb-5"
                style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                DFW&apos;s Full-Service Digital Agency
              </p>
              <h1
                className="anim-fade-up anim-delay-1 font-bold leading-none tracking-tight mb-6"
                style={{
                  fontFamily: 'Oxanium, system-ui, sans-serif',
                  fontSize: 'clamp(2.8rem, 6vw, 4.5rem)',
                  color: '#0A0A0F',
                  lineHeight: 1.08,
                }}
              >
                Custom Software.
                <br />
                Smarter Marketing.
                <br />
                <span style={{ color: '#22C55E' }}>Built for DFW.</span>
              </h1>

              <p
                className="anim-fade-up anim-delay-2 text-lg leading-relaxed max-w-xl mb-2"
                style={{ color: '#4B5563' }}
              >
                We design and build custom web applications, business software, and digital marketing systems for DFW businesses ready to grow.
              </p>

              <div className="anim-fade-up anim-delay-3">
                <LeadForm dark={false} />
              </div>

              <div
                className="anim-fade-up anim-delay-4 mt-10 pt-8 flex flex-wrap gap-3"
                style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }}
              >
                {['Allen, TX Headquarters', 'DFW-Focused', 'No Templates — Ever'].map((stat) => (
                  <span
                    key={stat}
                    className="text-xs uppercase tracking-widest px-4 py-2 font-semibold"
                    style={{
                      border: '1px solid rgba(0,0,0,0.12)',
                      color: '#6B7280',
                      fontFamily: 'Oxanium, system-ui, sans-serif',
                    }}
                  >
                    {stat}
                  </span>
                ))}
              </div>
            </div>

            {/* Right: dark estimate card */}
            <div className="hidden lg:block anim-fade-up anim-delay-2">
              <div
                className="p-8 shadow-2xl"
                style={{ backgroundColor: '#0C0F0C', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <EstimateForm dark />
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── SOFTWARE FOCUS CALLOUT ── dark section ── */}
      <section className="py-24 bg-dot-pattern" style={{ backgroundColor: '#0C0F0C' }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <AnimateIn className="mb-14">
            <p
              className="text-xs font-bold uppercase tracking-widest mb-4"
              style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Custom Software Design
            </p>
            <h2
              className="text-4xl lg:text-5xl font-bold text-white leading-tight max-w-2xl"
              style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Software That Works the Way You Do
            </h2>
          </AnimateIn>

          <div className="grid md:grid-cols-3 gap-6">
            {softwareFeatures.map((feat, i) => (
              <AnimateIn key={feat.title} delay={i * 120}>
                <div
                  className="card-lift p-7 h-full"
                  style={{ border: '1px solid rgba(255,255,255,0.08)', backgroundColor: '#111511' }}
                >
                  <div style={{ width: '32px', height: '2px', backgroundColor: '#22C55E', marginBottom: '20px' }} />
                  <h3
                    className="text-base font-bold text-white mb-3"
                    style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
                  >
                    {feat.title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {feat.body}
                  </p>
                </div>
              </AnimateIn>
            ))}
          </div>

          <AnimateIn delay={400}>
            <div className="mt-10">
              <Link
                href="/services"
                className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wider transition-opacity hover:opacity-75"
                style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                See All Services →
              </Link>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── BUILD / GROW / MANAGE ── light section ── */}
      <section className="py-24 bg-grid-pattern" style={{ backgroundColor: '#ffffff' }}>
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
              Everything Your Business Needs Online
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
                <div className="card-lift h-full" style={{ border: '1px solid #E5E7EB' }}>
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

      {/* ── THREE PILLARS strip ── */}
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

      {/* ── PAIN POINTS ── light section ── */}
      <section className="py-24 bg-dot-pattern-light" style={{ backgroundColor: '#F5F7F5' }}>
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
                You&apos;re great at what you do. But outdated software and a weak digital presence cost you time, money, and customers — every single day.
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
                style={{ backgroundColor: '#0C0F0C', border: '1px solid rgba(255,255,255,0.10)' }}
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

      {/* ── OUR PROCESS ── white section ── */}
      <section className="py-24 bg-grid-pattern" style={{ backgroundColor: '#ffffff' }}>
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
              Ready to Build Something That Actually Works?
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

      {/* ── SERVICE AREA ── dark section ── */}
      <section className="py-24 bg-dot-pattern" style={{ backgroundColor: '#0C0F0C' }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <AnimateIn className="mb-12">
            <p
              className="text-xs font-bold uppercase tracking-widest mb-4"
              style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Our Service Area
            </p>
            <h2
              className="text-4xl lg:text-5xl font-bold mb-6 text-white"
              style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Serving DFW — All of It.
            </h2>
            <p className="text-base max-w-2xl leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Based in Allen, TX, we work with businesses across the entire DFW Metroplex. If you&apos;re in North Texas, we&apos;ve got you covered.
            </p>
          </AnimateIn>

          <AnimateIn delay={100}>
            <div className="flex flex-wrap gap-2">
              {cities.map((city) => (
                <span
                  key={city}
                  className="text-xs px-3 py-1.5 uppercase tracking-wide font-medium transition-colors"
                  style={{ border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.45)' }}
                >
                  {city}
                </span>
              ))}
            </div>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
