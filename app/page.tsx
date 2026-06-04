import Link from 'next/link';
import { LeadForm } from '@/components/LeadForm';
import { EstimateForm } from '@/components/EstimateForm';

const cities = [
  'Allen', 'Plano', 'Frisco', 'McKinney', 'Dallas', 'Fort Worth',
  'Arlington', 'Garland', 'Irving', 'Richardson', 'Mesquite', 'Carrollton',
  'Denton', 'Lewisville', 'Flower Mound', 'Southlake', 'Grapevine',
  'Colleyville', 'Rockwall', 'Grand Prairie', 'Bedford',
];

function CheckIcon() {
  return (
    <svg
      className="w-4 h-4 flex-shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#22C55E"
      strokeWidth="2.5"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      className="w-4 h-4 flex-shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#EF4444"
      strokeWidth="2.5"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

const buildServices = [
  'Web Design & Development',
  'Custom Software',
  'Branding & Identity',
  'Landing Pages',
  'E-Commerce',
];

const growServices = [
  'Meta Ads Management',
  'Search Engine Optimization',
  'Google Ads',
  'Email Marketing',
  'Paid Social Strategy',
];

const manageServices = [
  'Social Media Posting',
  'Content Creation',
  'Review Management',
  'Analytics Reporting',
  'Ongoing Maintenance',
];

const painPoints = [
  'Your website looks outdated or doesn\'t convert visitors into calls',
  'You\'re running ads but can\'t tell if they\'re actually working',
  'Your social media is inconsistent — or nonexistent',
  'Competitors with worse services are outranking you on Google',
  'You\'ve wasted money on agencies that overpromised and underdelivered',
];

const streamflareStrengths = [
  'Custom strategy — not templates',
  'DFW-native market knowledge',
  'Transparent reporting every month',
];

const processSteps = [
  {
    num: '01',
    title: 'Discover',
    body: 'We learn your business, your goals, and your competition. The more we understand your market, the stronger your results.',
  },
  {
    num: '02',
    title: 'Build',
    body: 'We design and develop your website, campaigns, or content — built around your brand identity and launch goals. You approve every step.',
  },
  {
    num: '03',
    title: 'Launch & Grow',
    body: 'We go live, measure everything, and optimize continuously. You get regular reports in plain language — no jargon, just results.',
  },
];

export default function HomePage() {
  return (
    <>
      {/* ── HERO ── */}
      <section
        className="relative flex items-center min-h-screen pt-16 bg-dot-pattern"
        style={{
          backgroundColor: '#0C0F0C',
          clipPath: 'polygon(0 0, 100% 0, 100% 95%, 0 100%)',
          paddingBottom: '6rem',
        }}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8 w-full py-20 lg:py-0">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            {/* Left: copy + inline lead form */}
            <div>
              <p
                className="text-xs font-bold uppercase tracking-widest mb-5"
                style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                DFW&apos;s Full-Service Digital Agency
              </p>
              <h1
                className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-none tracking-tight mb-6"
                style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                <span className="block text-white">Websites That</span>
                <span className="block text-white">Start Conversations</span>
              </h1>

              <p className="text-lg mb-2 max-w-xl leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
                Web design, social media, and digital advertising that engages your audience, builds trust, and turns visitors into customers.
              </p>

              {/* Inline lead form */}
              <LeadForm />

              {/* Stat pills */}
              <div
                className="mt-10 pt-8"
                style={{ borderTop: '1px solid rgba(255,255,255,0.10)' }}
              >
                <div className="flex flex-wrap gap-3">
                  {['21+ Cities Served', 'DFW-Focused', 'No Templates — Ever'].map((stat) => (
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

            {/* Right: estimate card */}
            <div className="hidden lg:block">
              <div className="bg-white p-8 shadow-xl">
                <EstimateForm />
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── BUILD / GROW / MANAGE ── */}
      <section className="py-24 bg-white bg-grid-pattern">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-6">

            {/* Build */}
            <div style={{ border: '1px solid #E5E7EB' }}>
              <div style={{ height: '6px', backgroundColor: '#22C55E' }} />
              <div className="p-6">
                <h3
                  className="text-xl font-bold mb-4"
                  style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  Build
                </h3>
                <p className="text-sm mb-5" style={{ color: '#6B7280' }}>
                  Launch your digital presence the right way — custom, fast, and designed to convert.
                </p>
                <ul className="flex flex-col gap-2.5">
                  {buildServices.map((item) => (
                    <li key={item} className="flex items-center gap-3 text-sm" style={{ color: '#374151' }}>
                      <CheckIcon />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Grow */}
            <div style={{ border: '1px solid #E5E7EB' }}>
              <div style={{ height: '6px', backgroundColor: '#22C55E' }} />
              <div className="p-6">
                <h3
                  className="text-xl font-bold mb-4"
                  style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  Grow
                </h3>
                <p className="text-sm mb-5" style={{ color: '#6B7280' }}>
                  Drive real traffic and real leads with paid media, SEO, and strategic marketing.
                </p>
                <ul className="flex flex-col gap-2.5">
                  {growServices.map((item) => (
                    <li key={item} className="flex items-center gap-3 text-sm" style={{ color: '#374151' }}>
                      <CheckIcon />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Manage */}
            <div style={{ border: '1px solid #E5E7EB' }}>
              <div style={{ height: '6px', backgroundColor: '#22C55E' }} />
              <div className="p-6">
                <h3
                  className="text-xl font-bold mb-4"
                  style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  Manage
                </h3>
                <p className="text-sm mb-5" style={{ color: '#6B7280' }}>
                  Keep your brand consistent and your audience engaged — we handle the ongoing work.
                </p>
                <ul className="flex flex-col gap-2.5">
                  {manageServices.map((item) => (
                    <li key={item} className="flex items-center gap-3 text-sm" style={{ color: '#374151' }}>
                      <CheckIcon />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── STATS / CREDIBILITY ── */}
      <section className="py-20" style={{ backgroundColor: '#0C0F0C' }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
          <div className="flex flex-col md:flex-row items-center justify-center divide-y md:divide-y-0 md:divide-x divide-white/10">
            {[
              { value: '21+', label: 'Cities Across DFW' },
              { value: '100%', label: 'Custom Builds — No Templates' },
              { value: '3', label: 'Core Services, Dozens of Solutions' },
            ].map((stat) => (
              <div key={stat.label} className="px-10 py-8">
                <p
                  className="text-4xl font-bold mb-2"
                  style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  {stat.value}
                </p>
                <p
                  className="text-xs uppercase tracking-widest"
                  style={{ color: 'rgba(255,255,255,0.55)', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
          <div
            className="mt-10 pt-10"
            style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
          >
            <p
              className="text-2xl font-bold text-white"
              style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Top Rated Digital Agency Serving DFW Businesses
            </p>
          </div>
        </div>
      </section>

      {/* ── PAIN POINTS ── */}
      <section className="py-24 bg-dot-pattern" style={{ backgroundColor: '#F5F7F5' }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-start">

            {/* Left */}
            <div>
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
                Is Your Business Struggling to Get Found Online?
              </h2>
              <p className="text-base leading-relaxed mb-8" style={{ color: '#6B7280' }}>
                You&apos;re great at what you do. But if your digital presence isn&apos;t working, your best customers are finding your competitors instead.
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
                className="text-sm font-bold uppercase tracking-wider transition-colors hover:opacity-80"
                style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                We fix all of this →
              </Link>
            </div>

            {/* Right: dark solution card */}
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
              <p className="text-sm leading-relaxed mb-6" style={{ color: 'rgba(255,255,255,0.6)' }}>
                We&apos;re not a generic agency that runs cookie-cutter campaigns. Every strategy we build is tailored to your business, your market, and your customers — with DFW always in focus.
              </p>
              <ul className="flex flex-col gap-3 mb-8">
                {streamflareStrengths.map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm text-white">
                    <CheckIcon />
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href="/contact"
                className="inline-block text-sm font-bold uppercase tracking-wider px-6 py-3 transition-opacity hover:opacity-90"
                style={{
                  backgroundColor: '#22C55E',
                  color: '#ffffff',
                  fontFamily: 'Oxanium, system-ui, sans-serif',
                }}
              >
                Start the Conversation →
              </Link>
            </div>

          </div>
        </div>
      </section>

      {/* ── OUR PROCESS ── */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-start">

            {/* Left: heading */}
            <div>
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
                We keep the process simple, transparent, and focused on you. No confusing timelines, no surprise fees. Just clear steps from kickoff to launch and beyond.
              </p>
            </div>

            {/* Right: steps */}
            <div
              className="flex flex-col gap-8 pl-6"
              style={{ borderLeft: '2px solid #22C55E' }}
            >
              {processSteps.map((step) => (
                <div key={step.num}>
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className="text-3xl font-bold"
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
            Ready to Dominate Your Market?
          </h2>
          <p className="text-base mb-10 max-w-xl mx-auto" style={{ color: 'rgba(255,255,255,0.85)' }}>
            Get a free consultation and see what Streamflare can do for your DFW business.
          </p>
          <Link
            href="/contact"
            className="inline-block bg-white font-bold text-sm uppercase tracking-wider px-10 py-4 transition-colors hover:bg-gray-50"
            style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
          >
            Schedule a Free Consultation →
          </Link>
        </div>
      </section>

      {/* ── SERVICE AREA ── */}
      <section className="py-24 bg-dot-pattern" style={{ backgroundColor: '#0C0F0C' }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="mb-12">
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
              Serving 21+ Cities Across DFW
            </h2>
            <p className="text-base max-w-2xl leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Headquartered in Allen, TX, Streamflare Media Group works with businesses throughout the DFW
              Metroplex — from Plano and Frisco to Dallas, Fort Worth, and every city in between.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {cities.map((city) => (
              <span
                key={city}
                className="text-xs px-3 py-1.5 uppercase tracking-wide font-medium"
                style={{ border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.55)' }}
              >
                {city}
              </span>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
