import type { Metadata } from 'next';
import Link from 'next/link';
import { AnimateIn } from '@/components/AnimateIn';

export const metadata: Metadata = {
  title: 'Services',
  description:
    'Custom software & web design, Meta ads management, and social media management for DFW businesses. Built for businesses that want better systems, better visibility, and better growth.',
};

function CheckIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function ServicesPage() {
  return (
    <>
      {/* ── HERO ── */}
      <section
        className="pt-36 pb-24 bg-dot-pattern"
        style={{ backgroundColor: '#0C0F0C' }}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <p
            className="text-xs font-bold uppercase tracking-widest mb-5"
            style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
          >
            Services
          </p>
          <h1
            className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight max-w-3xl mb-6"
            style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
          >
            Services That Move the Needle
          </h1>
          <p className="text-lg max-w-2xl leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
            Built for businesses that want better systems, better visibility, and better growth. Every service is delivered custom — no cookie-cutter packages, no recycled strategies.
          </p>
        </div>
      </section>

      {/* ── SERVICE 1: Custom Software ── */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            {/* Left: content */}
            <div>
              <span
                className="text-6xl font-bold block mb-4"
                style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif', lineHeight: 1 }}
              >
                01
              </span>
              <h2
                className="text-3xl lg:text-4xl font-bold mb-6"
                style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Custom Software &amp; Web Design
              </h2>
              <p className="text-base leading-relaxed mb-5" style={{ color: '#6B7280' }}>
                Your website is your hardest-working salesperson. Most DFW businesses are running on outdated sites or builder templates that weren&apos;t designed to convert — just to exist.
              </p>
              <p className="text-base leading-relaxed mb-8" style={{ color: '#6B7280' }}>
                We design and develop custom websites and web applications that are fast, mobile-first, and built around a single goal: turning visitors into calls, leads, and customers. Every project is built from scratch to match your brand and your market.
              </p>

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
                  {[
                    'Custom Design & Development',
                    'Mobile-Responsive Layouts',
                    'SEO-Ready Architecture',
                    'CMS Integration',
                    'Landing Pages & Funnels',
                    'E-Commerce Solutions',
                    'Ongoing Maintenance',
                  ].map((item) => (
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

              <div className="mt-10">
                <Link
                  href="/contact"
                  className="inline-block text-sm font-semibold uppercase tracking-wider px-8 py-3 transition-opacity hover:opacity-90"
                  style={{ backgroundColor: '#22C55E', color: '#ffffff', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  Get a Quote →
                </Link>
              </div>
            </div>

            {/* Right: dark info card */}
            <div className="lg:pt-4">
              <div
                className="p-8"
                style={{ backgroundColor: '#0C0F0C', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <p
                  className="text-xs font-bold uppercase tracking-widest mb-6"
                  style={{ color: '#6B7280', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  Project Overview
                </p>
                <div className="flex flex-col gap-1 mb-6">
                  {[
                    { label: 'Type', value: 'Custom Build' },
                    { label: 'Timeline', value: '4–8 Weeks' },
                    { label: 'Stack', value: 'Next.js / React' },
                    { label: 'Mobile', value: '100% Responsive' },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between py-3"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <span style={{ color: '#6B7280', fontFamily: 'Oxanium, system-ui, sans-serif', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        {row.label}
                      </span>
                      <span style={{ color: '#ffffff', fontFamily: 'Oxanium, system-ui, sans-serif', fontSize: '0.875rem' }}>
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
                <div
                  className="h-2 w-full"
                  style={{ backgroundColor: 'rgba(34,197,94,0.2)' }}
                >
                  <div className="h-2 w-4/5" style={{ backgroundColor: '#22C55E' }} />
                </div>
                <p
                  className="text-xs mt-2 uppercase tracking-widest"
                  style={{ color: '#6B7280', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  Avg. Client Satisfaction
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SERVICE 2: Meta Ads ── */}
      <section className="py-24 bg-dot-pattern" style={{ backgroundColor: '#F5F7F5' }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            {/* Left: content */}
            <div>
              <span
                className="text-6xl font-bold block mb-4"
                style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif', lineHeight: 1 }}
              >
                02
              </span>
              <h2
                className="text-3xl lg:text-4xl font-bold mb-6"
                style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Meta Ads Management
              </h2>
              <p className="text-base leading-relaxed mb-5" style={{ color: '#6B7280' }}>
                Running ads that don&apos;t convert isn&apos;t a budget problem — it&apos;s a strategy problem. Most agencies copy the same ad templates across every client and call it campaign management. That&apos;s not what we do.
              </p>
              <p className="text-base leading-relaxed mb-8" style={{ color: '#6B7280' }}>
                We manage Facebook and Instagram campaigns that are purpose-built for your audience, your offer, and your DFW market. From creative strategy and audience research to A/B testing and monthly optimization — we handle everything so you can focus on running your business.
              </p>

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
                  {[
                    'Campaign Strategy & Setup',
                    'Audience Research & Targeting',
                    'Ad Creative & Copywriting',
                    'A/B Testing',
                    'Retargeting Campaigns',
                    'Monthly Reporting & Optimization',
                  ].map((item) => (
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

              <div className="mt-10">
                <Link
                  href="/contact"
                  className="inline-block text-sm font-semibold uppercase tracking-wider px-8 py-3 transition-opacity hover:opacity-90"
                  style={{ backgroundColor: '#22C55E', color: '#ffffff', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  Get a Quote →
                </Link>
              </div>
            </div>

            {/* Right: metrics card */}
            <div className="lg:pt-4">
              <div
                className="p-8"
                style={{ backgroundColor: '#0C0F0C', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <p
                  className="text-xs font-bold uppercase tracking-widest mb-6"
                  style={{ color: '#6B7280', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  Campaign Metrics
                </p>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  {[
                    { label: 'Avg. ROAS', value: '4.2×' },
                    { label: 'CTR', value: '3.1%' },
                    { label: 'Reach', value: '50K+' },
                    { label: 'Cost/Lead', value: '-38%' },
                  ].map((m) => (
                    <div
                      key={m.label}
                      className="p-4 text-center"
                      style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <p
                        className="text-xl font-bold"
                        style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                      >
                        {m.value}
                      </p>
                      <p
                        className="text-xs mt-1 uppercase tracking-widest"
                        style={{ color: '#6B7280', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                      >
                        {m.label}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-center" style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'Oxanium, system-ui, sans-serif' }}>
                  Representative client results
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SERVICE 3: Social Media ── */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            {/* Left: content */}
            <div>
              <span
                className="text-6xl font-bold block mb-4"
                style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif', lineHeight: 1 }}
              >
                03
              </span>
              <h2
                className="text-3xl lg:text-4xl font-bold mb-6"
                style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Social Media Management
              </h2>
              <p className="text-base leading-relaxed mb-5" style={{ color: '#6B7280' }}>
                Inconsistent social media is one of the fastest ways to erode customer trust. If your last post was three weeks ago or your content looks like it was made in five minutes, your audience notices — and so do your competitors.
              </p>
              <p className="text-base leading-relaxed mb-8" style={{ color: '#6B7280' }}>
                We create and publish high-quality, on-brand content across your social channels — consistent posting, authentic voice, and real community engagement that builds relationships with the people most likely to become your customers.
              </p>

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
                  {[
                    'Content Calendar & Strategy',
                    'Graphic Design & Copywriting',
                    'Platform Management (Facebook, Instagram, LinkedIn)',
                    'Community Engagement & Response',
                    'Review Management',
                    'Monthly Analytics Report',
                  ].map((item) => (
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

              <div className="mt-10">
                <Link
                  href="/contact"
                  className="inline-block text-sm font-semibold uppercase tracking-wider px-8 py-3 transition-opacity hover:opacity-90"
                  style={{ backgroundColor: '#22C55E', color: '#ffffff', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  Get a Quote →
                </Link>
              </div>
            </div>

            {/* Right: content calendar card */}
            <div className="lg:pt-4">
              <div
                className="p-8"
                style={{ backgroundColor: '#0C0F0C', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <p
                  className="text-xs font-bold uppercase tracking-widest mb-6"
                  style={{ color: '#6B7280', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  Monthly Content
                </p>
                <div className="flex flex-col gap-3">
                  {[
                    { platform: 'Facebook', posts: '12 Posts' },
                    { platform: 'Instagram', posts: '16 Posts' },
                    { platform: 'LinkedIn', posts: '8 Posts' },
                  ].map((p) => (
                    <div
                      key={p.platform}
                      className="flex items-center justify-between py-3"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <span
                        className="text-sm font-semibold text-white"
                        style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
                      >
                        {p.platform}
                      </span>
                      <span
                        className="text-xs px-3 py-1 font-semibold uppercase tracking-widest"
                        style={{
                          backgroundColor: 'rgba(34,197,94,0.15)',
                          color: '#22C55E',
                          fontFamily: 'Oxanium, system-ui, sans-serif',
                          border: '1px solid rgba(34,197,94,0.3)',
                        }}
                      >
                        {p.posts}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-6 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center justify-between">
                    <span
                      className="text-xs uppercase tracking-widest"
                      style={{ color: '#6B7280', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                    >
                      Total Monthly Posts
                    </span>
                    <span
                      className="text-xl font-bold"
                      style={{ color: '#ffffff', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                    >
                      36+
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── YOU GET WHAT YOU PAY FOR ── */}
      <section className="py-24" style={{ backgroundColor: '#0C0F0C' }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2
              className="text-3xl lg:text-4xl font-bold text-white mb-6"
              style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              You Get What You Pay For.
            </h2>
            <p className="text-base leading-relaxed mb-6" style={{ color: 'rgba(255,255,255,0.6)' }}>
              There are hundreds of digital agencies in DFW. Most of them sell you on a low monthly retainer, automate your posts with scheduling software, run the same ad templates for every client, and call it a month. You get a PDF report with impressions and engagement numbers that don&apos;t translate to anything that matters to your business.
            </p>
            <p className="text-base leading-relaxed mb-10" style={{ color: 'rgba(255,255,255,0.6)' }}>
              Streamflare is different. We keep our client roster small on purpose so every business gets real attention, real strategy, and real results. You&apos;re not paying for seat-filler work — you&apos;re paying for someone who actually gives a damn about your numbers.
            </p>
            <div
              className="p-6"
              style={{ borderLeft: '4px solid #22C55E', backgroundColor: 'rgba(34,197,94,0.06)' }}
            >
              <p
                className="text-xl font-bold text-white"
                style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                &ldquo;Small roster. Serious focus. Real results.&rdquo;
              </p>
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
            Ready to grow your business?
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
