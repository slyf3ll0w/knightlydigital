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
    <header
      className="fixed top-0 left-0 right-0 z-50"
      style={{ backgroundColor: '#0C0F0C', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link href="/" className="flex-shrink-0">
            <div className="inline-block px-2 py-1" style={{ backgroundColor: '#6D7070' }}>
              <Image
                src="/logo.png"
                alt="Streamflare Media Group"
                width={160}
                height={32}
                priority
              />
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-sm font-medium tracking-wide transition-colors ${
                    isActive ? 'text-white' : 'text-white/70 hover:text-white'
                  }`}
                  style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
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
              className="text-sm text-white/60 hover:text-white/90 transition-colors tracking-wide"
              style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Client Portal
            </Link>
            <Link
              href="/contact"
              className="text-sm font-semibold uppercase tracking-wider px-5 py-2 transition-colors hover:opacity-90"
              style={{
                backgroundColor: '#22C55E',
                color: '#ffffff',
                fontFamily: 'Oxanium, system-ui, sans-serif',
              }}
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
            <span
              className={`block w-6 h-0.5 bg-white transition-all duration-200 origin-center ${
                mobileOpen ? 'rotate-45 translate-y-2' : ''
              }`}
            />
            <span
              className={`block w-6 h-0.5 bg-white transition-all duration-200 ${
                mobileOpen ? 'opacity-0 scale-x-0' : ''
              }`}
            />
            <span
              className={`block w-6 h-0.5 bg-white transition-all duration-200 origin-center ${
                mobileOpen ? '-rotate-45 -translate-y-2' : ''
              }`}
            />
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div
          className="md:hidden"
          style={{
            backgroundColor: '#0C0F0C',
            borderTop: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div className="px-6 py-4 flex flex-col">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`py-3 text-sm font-medium tracking-wide transition-colors ${
                    isActive ? 'text-white' : 'text-white/70 hover:text-white'
                  }`}
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
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
              className="py-3 text-sm text-white/60 hover:text-white tracking-wide transition-colors"
              style={{
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                fontFamily: 'Oxanium, system-ui, sans-serif',
              }}
            >
              Client Portal
            </Link>
            <div className="pt-4 pb-2">
              <Link
                href="/contact"
                onClick={() => setMobileOpen(false)}
                className="block text-center text-sm font-semibold uppercase tracking-wider px-5 py-3 w-full transition-colors hover:opacity-90"
                style={{
                  backgroundColor: '#22C55E',
                  color: '#ffffff',
                  fontFamily: 'Oxanium, system-ui, sans-serif',
                }}
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
