import Link from 'next/link';
import Image from 'next/image';

const serviceLinks = [
  { label: 'Custom Software & Web Design', href: '/services' },
  { label: 'Meta Ads Management', href: '/services' },
  { label: 'Social Media Management', href: '/services' },
];

const companyLinks = [
  { label: 'About Us', href: '/about' },
  { label: 'Services', href: '/services' },
  { label: 'Contact', href: '/contact' },
  { label: 'Client Portal', href: '/portal' },
];

const socialLinks = [
  {
    label: 'Facebook',
    href: '#',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" />
      </svg>
    ),
  },
  {
    label: 'Instagram',
    href: '#',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
      </svg>
    ),
  },
  {
    label: 'LinkedIn',
    href: '#',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z" />
        <circle cx="4" cy="4" r="2" />
      </svg>
    ),
  },
];

export function Footer() {
  return (
    <footer style={{ backgroundColor: '#0C0F0C', color: '#ffffff' }}>
      {/* Top green accent line */}
      <div style={{ height: '2px', backgroundColor: '#22C55E' }} />

      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 pb-12" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>

          {/* Brand column */}
          <div>
            <div className="inline-block px-2 py-1 mb-5" style={{ backgroundColor: '#6D7070' }}>
              <Image
                src="/logo.png"
                alt="Streamflare Media Group"
                width={160}
                height={32}
              />
            </div>
            <p className="text-sm leading-relaxed mb-6" style={{ color: '#6B7280' }}>
              Full-service digital agency serving growth-minded businesses across the DFW Metroplex.
            </p>
            <div className="flex items-center gap-3">
              {socialLinks.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={s.label}
                  className="w-8 h-8 flex items-center justify-center transition-colors"
                  style={{ border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)' }}
                >
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          {/* Services */}
          <div>
            <h4
              className="text-xs font-bold uppercase tracking-widest mb-5"
              style={{ color: 'rgba(255,255,255,0.4)' }}
            >
              Services
            </h4>
            <ul className="flex flex-col gap-3">
              {serviceLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm transition-colors hover:text-white"
                    style={{ color: 'rgba(255,255,255,0.6)' }}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4
              className="text-xs font-bold uppercase tracking-widest mb-5"
              style={{ color: 'rgba(255,255,255,0.4)' }}
            >
              Company
            </h4>
            <ul className="flex flex-col gap-3">
              {companyLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm transition-colors hover:text-white"
                    style={{ color: 'rgba(255,255,255,0.6)' }}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact info */}
          <div>
            <h4
              className="text-xs font-bold uppercase tracking-widest mb-5"
              style={{ color: 'rgba(255,255,255,0.4)' }}
            >
              Contact
            </h4>
            <ul className="flex flex-col gap-3 text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
              <li>
                <span className="block font-medium" style={{ color: 'rgba(255,255,255,0.9)' }}>
                  Allen, TX
                </span>
                <span>DFW Metroplex</span>
              </li>
              <li>
                <a
                  href="tel:2145550100"
                  className="transition-colors hover:text-white"
                >
                  (214) 555-0100
                </a>
              </li>
              <li>
                <a
                  href="mailto:info@streamflaremedia.com"
                  className="transition-colors hover:text-white break-all"
                >
                  info@streamflaremedia.com
                </a>
              </li>
              <li style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>
                Mon–Fri, 9am–6pm CST
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom strip */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
          <p>© 2025 Streamflare Media Group. All rights reserved.</p>
          <Link
            href="/privacy"
            className="transition-colors hover:text-white/60"
          >
            Privacy Policy
          </Link>
        </div>
      </div>
    </footer>
  );
}
