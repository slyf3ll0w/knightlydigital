'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

const navLinks = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
];

const serviceItems = [
  {
    label: 'Free Job Manager',
    href: '/crm',
    desc: 'Pipeline, scheduling, invoicing & payments — free.',
  },
  {
    label: 'Custom Software Design',
    href: '/custom-software',
    desc: 'Software built for your workflows or your idea.',
  },
  {
    label: 'All-Inclusive Digital Marketing',
    href: '/digital-marketing',
    desc: 'SEO, Google LSA, Meta Ads & Social — one team.',
  },
];

const serviceHrefs = serviceItems.map((s) => s.href);

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [servicesMobileOpen, setServicesMobileOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [visible, setVisible] = useState(true);
  const pathname = usePathname();
  const lastScrollY = useRef(0);
  const servicesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleScroll() {
      const currentY = window.scrollY;
      if (currentY < 80) {
        setVisible(true);
      } else if (currentY < lastScrollY.current - 8) {
        setVisible(true);
      } else if (currentY > lastScrollY.current + 8) {
        setVisible(false);
        setMobileOpen(false);
      }
      lastScrollY.current = currentY;
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  function handleServicesEnter() {
    if (servicesTimeoutRef.current) clearTimeout(servicesTimeoutRef.current);
    setServicesOpen(true);
  }

  function handleServicesLeave() {
    servicesTimeoutRef.current = setTimeout(() => setServicesOpen(false), 160);
  }

  const isServicesActive = serviceHrefs.some((href) => pathname === href);

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50"
      style={{ transform: visible ? 'translateY(0)' : 'translateY(-100%)', transition: 'transform 0.3s ease' }}
    >

      {/* ── Top info bar ── */}
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

      {/* ── Main nav ── */}
      <div className="bg-white" style={{ borderBottom: '1px solid #E5E7EB' }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-[72px]">

            {/* Logo */}
            <Link href="/" className="flex-shrink-0">
              <Image
                src="/logo.png"
                alt="Streamflaire Media Group"
                width={270}
                height={54}
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

              {/* Services dropdown trigger */}
              <div
                className="relative"
                onMouseEnter={handleServicesEnter}
                onMouseLeave={handleServicesLeave}
              >
                <button
                  className="flex items-center gap-1.5 text-sm font-medium tracking-wide transition-colors"
                  style={{
                    color: isServicesActive ? '#0A0A0F' : '#6B7280',
                    fontFamily: 'Oxanium, system-ui, sans-serif',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Services
                  <svg
                    width="10"
                    height="6"
                    viewBox="0 0 10 6"
                    fill="none"
                    style={{
                      transform: servicesOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease',
                      flexShrink: 0,
                    }}
                  >
                    <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {/* Dropdown panel */}
                {servicesOpen && (
                  <div
                    className="absolute top-full left-1/2 bg-white z-50"
                    style={{
                      transform: 'translateX(-50%)',
                      marginTop: '12px',
                      border: '1px solid #E5E7EB',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.10)',
                      minWidth: '280px',
                    }}
                    onMouseEnter={handleServicesEnter}
                    onMouseLeave={handleServicesLeave}
                  >
                    <div style={{ height: '3px', backgroundColor: '#22C55E' }} />
                    {serviceItems.map((item, i) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setServicesOpen(false)}
                        className="block px-5 py-4 transition-colors hover:bg-gray-50"
                        style={{
                          borderBottom: i < serviceItems.length - 1 ? '1px solid #F3F4F6' : 'none',
                        }}
                      >
                        <p
                          className="text-sm font-bold mb-0.5"
                          style={{
                            color: pathname === item.href ? '#22C55E' : '#0A0A0F',
                            fontFamily: 'Oxanium, system-ui, sans-serif',
                          }}
                        >
                          {item.label}
                        </p>
                        <p className="text-xs" style={{ color: '#9CA3AF' }}>
                          {item.desc}
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </nav>

            {/* Desktop CTA */}
            <div className="hidden md:flex items-center gap-5">
              <Link
                href="/app/login"
                className="text-sm transition-colors hover:text-gray-900"
                style={{ color: '#9CA3AF', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                JobFlow Login
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

            {/* Mobile Services accordion */}
            <button
              onClick={() => setServicesMobileOpen(!servicesMobileOpen)}
              className="text-sm font-medium tracking-wide flex items-center justify-between w-full"
              style={{
                color: isServicesActive ? '#0A0A0F' : '#6B7280',
                fontFamily: 'Oxanium, system-ui, sans-serif',
                background: 'none',
                border: 'none',
                borderBottom: '1px solid #F3F4F6',
                cursor: 'pointer',
                padding: '12px 0',
              }}
            >
              Services
              <svg
                width="10"
                height="6"
                viewBox="0 0 10 6"
                fill="none"
                style={{
                  transform: servicesMobileOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s ease',
                  color: '#6B7280',
                }}
              >
                <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {servicesMobileOpen && (
              <div style={{ backgroundColor: '#F9FAFB', marginLeft: '12px', borderLeft: '2px solid #22C55E' }}>
                {serviceItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => { setMobileOpen(false); setServicesMobileOpen(false); }}
                    className="block px-4 py-3"
                    style={{ borderBottom: '1px solid #F3F4F6' }}
                  >
                    <p
                      className="text-sm font-bold"
                      style={{
                        color: pathname === item.href ? '#22C55E' : '#0A0A0F',
                        fontFamily: 'Oxanium, system-ui, sans-serif',
                      }}
                    >
                      {item.label}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: '#9CA3AF' }}>
                      {item.desc}
                    </p>
                  </Link>
                ))}
              </div>
            )}

            <Link
              href="/app/login"
              onClick={() => setMobileOpen(false)}
              className="py-3 text-sm transition-colors hover:text-gray-900"
              style={{ borderBottom: '1px solid #F3F4F6', color: '#9CA3AF', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              JobFlow Login
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
