'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

const navLinks = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about' },
  { label: 'Services', href: '/services' },
  { label: 'Contact', href: '/contact' },
];

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="fixed top-0 left-0 right-0 z-50">

      {/* ── Top info bar — dark strip ── */}
      <div
        className="hidden md:block"
        style={{ backgroundColor: '#0C0F0C', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8 flex items-center justify-between h-9">
          <div
            className="flex items-center gap-4 text-xs"
            style={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'Oxanium, system-ui, sans-serif' }}
          >
            <span>Allen, TX — Serving the DFW Metroplex</span>
            <span style={{ color: 'rgba(255,255,255,0.18)' }}>|</span>
            <a href="tel:2145550100" className="hover:text-white transition-colors">
              (214) 555-0100
            </a>
            <span style={{ color: 'rgba(255,255,255,0.18)' }}>|</span>
            <a href="mailto:info@streamflaremedia.com" className="hover:text-white transition-colors">
              info@streamflaremedia.com
            </a>
          </div>
          <Link
            href="/contact"
            className="text-xs font-semibold transition-colors hover:opacity-80"
            style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
          >
            Schedule a Free Consultation →
          </Link>
        </div>
      </div>

      {/* ── Main nav — white background ── */}
      <div
        className="bg-white"
        style={{ borderBottom: '1px solid #E5E7EB' }}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">

            {/* Logo — own colors on white background */}
            <Link href="/" className="flex-shrink-0">
              <Image
                src="/logo.png"
                alt="Streamflare Media Group"
                width={230}
                height={46}
                priority
              />
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-8">
              {navLinks.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="text-sm font-medium tracking-wide transition-colors"
                    style={{
                      color: isActive ? '#0A0A0F' : '#6B7280',
                      fontFamily: 'Oxanium, system-ui, sans-serif',
                    }}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            {/* Desktop CTA */}
            <div className="hidden md:flex items-center gap-5">
              <Link
                href="/portal"
                className="text-sm transition-colors hover:text-gray-900"
                style={{ color: '#9CA3AF', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Client Portal
              </Link>
              <Link
                href="/contact"
                className="text-sm font-bold uppercase tracking-wider px-5 py-2 text-white transition-all hover:opacity-90 hover:-translate-y-px"
                style={{ backgroundColor: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Get Started
              </Link>
            </div>

            {/* Mobile Hamburger */}
            <button
              className="md:hidden flex flex-col justify-center items-center w-9 h-9 gap-1.5"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              <span className={`block w-6 h-0.5 bg-gray-800 transition-all duration-200 origin-center ${mobileOpen ? 'rotate-45 translate-y-2' : ''}`} />
              <span className={`block w-6 h-0.5 bg-gray-800 transition-all duration-200 ${mobileOpen ? 'opacity-0 scale-x-0' : ''}`} />
              <span className={`block w-6 h-0.5 bg-gray-800 transition-all duration-200 origin-center ${mobileOpen ? '-rotate-45 -translate-y-2' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden bg-white" style={{ borderTop: '1px solid #E5E7EB' }}>
          <div className="px-6 py-4 flex flex-col">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="py-3 text-sm font-medium tracking-wide transition-colors"
                  style={{
                    borderBottom: '1px solid #F3F4F6',
                    color: isActive ? '#0A0A0F' : '#6B7280',
                    fontFamily: 'Oxanium, system-ui, sans-serif',
                  }}
                >
                  {link.label}
                </Link>
              );
            })}
            <Link
              href="/portal"
              onClick={() => setMobileOpen(false)}
              className="py-3 text-sm transition-colors hover:text-gray-900"
              style={{ borderBottom: '1px solid #F3F4F6', color: '#9CA3AF', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Client Portal
            </Link>
            <div className="pt-4 pb-2">
              <Link
                href="/contact"
                onClick={() => setMobileOpen(false)}
                className="block text-center text-sm font-bold uppercase tracking-wider px-5 py-3 w-full text-white"
                style={{ backgroundColor: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
