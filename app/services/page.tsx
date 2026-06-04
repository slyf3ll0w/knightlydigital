import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Services',
  description:
    'Custom software & web design, Meta ads management, and social media management for DFW businesses. Full-service digital marketing from Streamflare Media Group.',
};

export default function ServicesPage() {
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
            Services
          </p>
          <h1
            className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight max-w-3xl mb-6"
            style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
          >
            Services That Move the Needle
          </h1>
          <p className="text-lg max-w-2xl leading-relaxed" style={{ color: '#6B7280' }}>
            From custom-built websites to paid ads and social media, we offer everything your DFW business needs
            to grow online.
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
                style={{ color: '#1A52E8', fontFamily: 'Oxanium, system-ui, sans-serif', lineHeight: 1 }}
              >
                01
              </span>
              <h2
                className="text-3xl lg:text-4xl font-bold mb-6"
                style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Custom Software &amp; Web Design
              </h2>
              <p className="text-base leading-relaxed mb-8" style={{ color: '#6B7280' }}>
                Your website is your most important sales tool. We design and develop custom websites and web
                applications that are fast, mobile-first, and built to convert. No templates — every project is
                crafted from the ground up to match your brand and your goals.
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
                    'Ongoing Maintenance',
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-center gap-3 text-sm"
                      style={{ color: '#0A0A0F' }}
                    >
                      <span
                        className="w-1.5 h-1.5 flex-shrink-0"
                        style={{ backgroundColor: '#1A52E8' }}
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-10">
                <Link
                  href="/contact"
                  className="inline-block text-sm font-semibold uppercase tracking-wider px-8 py-3 transition-colors hover:opacity-90"
                  style={{ backgroundColor: '#1A52E8', color: '#ffffff', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  Get a Quote →
                </Link>
              </div>
            </div>

            {/* Right: decorative dark card */}
            <div className="lg:pt-4">
              <div
                className="p-8"
                style={{ backgroundColor: '#07080E', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <p
                  className="text-xs font-bold uppercase tracking-widest mb-6"
                  style={{ color: '#6B7280', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  Project Overview
                </p>
                <div className="flex flex-col gap-1 font-mono text-sm mb-6">
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
                  style={{ backgroundColor: 'rgba(26,82,232,0.2)' }}
                >
                  <div className="h-2 w-4/5" style={{ backgroundColor: '#1A52E8' }} />
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
      <section className="py-24" style={{ backgroundColor: '#F5F6FA' }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            {/* Left: content */}
            <div>
              <span
                className="text-6xl font-bold block mb-4"
                style={{ color: '#1A52E8', fontFamily: 'Oxanium, system-ui, sans-serif', lineHeight: 1 }}
              >
                02
              </span>
              <h2
                className="text-3xl lg:text-4xl font-bold mb-6"
                style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Meta Ads Management
              </h2>
              <p className="text-base leading-relaxed mb-8" style={{ color: '#6B7280' }}>
                We manage Facebook and Instagram advertising campaigns that put your brand in front of the right
                people at the right time. From creative strategy to audience targeting and A/B testing, we handle
                everything so you can focus on running your business.
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
                    'Monthly Reporting & Optimization',
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-center gap-3 text-sm"
                      style={{ color: '#0A0A0F' }}
                    >
                      <span
                        className="w-1.5 h-1.5 flex-shrink-0"
                        style={{ backgroundColor: '#1A52E8' }}
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-10">
                <Link
                  href="/contact"
                  className="inline-block text-sm font-semibold uppercase tracking-wider px-8 py-3 transition-colors hover:opacity-90"
                  style={{ backgroundColor: '#1A52E8', color: '#ffffff', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  Get a Quote →
                </Link>
              </div>
            </div>

            {/* Right: metrics card */}
            <div className="lg:pt-4">
              <div
                className="p-8"
                style={{ backgroundColor: '#07080E', border: '1px solid rgba(255,255,255,0.08)' }}
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
                        style={{ color: '#1A52E8', fontFamily: 'Oxanium, system-ui, sans-serif' }}
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
                style={{ color: '#1A52E8', fontFamily: 'Oxanium, system-ui, sans-serif', lineHeight: 1 }}
              >
                03
              </span>
              <h2
                className="text-3xl lg:text-4xl font-bold mb-6"
                style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Social Media Management
              </h2>
              <p className="text-base leading-relaxed mb-8" style={{ color: '#6B7280' }}>
                We create and publish high-quality, on-brand content across your social channels, keeping your
                audience engaged and your brand visible. Consistent posting, authentic voice, and community
                management that builds real relationships.
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
                    'Community Engagement',
                    'Monthly Analytics Report',
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-center gap-3 text-sm"
                      style={{ color: '#0A0A0F' }}
                    >
                      <span
                        className="w-1.5 h-1.5 flex-shrink-0"
                        style={{ backgroundColor: '#1A52E8' }}
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-10">
                <Link
                  href="/contact"
                  className="inline-block text-sm font-semibold uppercase tracking-wider px-8 py-3 transition-colors hover:opacity-90"
                  style={{ backgroundColor: '#1A52E8', color: '#ffffff', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  Get a Quote →
                </Link>
              </div>
            </div>

            {/* Right: content calendar card */}
            <div className="lg:pt-4">
              <div
                className="p-8"
                style={{ backgroundColor: '#07080E', border: '1px solid rgba(255,255,255,0.08)' }}
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
                          backgroundColor: 'rgba(26,82,232,0.15)',
                          color: '#1A52E8',
                          fontFamily: 'Oxanium, system-ui, sans-serif',
                          border: '1px solid rgba(26,82,232,0.3)',
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

      {/* ── MORE COMING SOON ── */}
      <section className="py-24" style={{ backgroundColor: '#07080E' }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
          <div
            className="inline-block px-4 py-1.5 mb-6 text-xs font-bold uppercase tracking-widest"
            style={{ border: '1px solid rgba(26,82,232,0.4)', color: '#1A52E8', fontFamily: 'Oxanium, system-ui, sans-serif' }}
          >
            Coming Soon
          </div>
          <h2
            className="text-3xl lg:text-4xl font-bold text-white mb-4"
            style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
          >
            More Services Coming Soon
          </h2>
          <p className="text-base max-w-xl mx-auto mb-10 leading-relaxed" style={{ color: '#6B7280' }}>
            We&apos;re constantly expanding our service offerings. Contact us to learn about additional ways we can
            support your growth.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wider transition-colors text-white/70 hover:text-white"
            style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
          >
            Contact Us →
          </Link>
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
