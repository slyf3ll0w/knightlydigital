"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { services } from "@/lib/services";

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setServicesOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setServicesOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-[1001]">

      {/* ── Row 1: Top info bar ── */}
      <div className="bg-muted border-b border-border">
        <div className="max-w-7xl mx-auto px-5 py-2 flex items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="text-yellow-500 tracking-tight text-sm">★★★★★</span>
            <span className="hidden sm:inline font-medium">5-Star Rated Digital Agency</span>
          </div>
          {/* Social icons */}
          <div className="hidden md:flex items-center gap-1">
            {/* Facebook */}
            <a href="#" aria-label="Facebook" className="w-7 h-7 bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/80 transition-colors">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/>
              </svg>
            </a>
            {/* Instagram */}
            <a href="#" aria-label="Instagram" className="w-7 h-7 bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/80 transition-colors">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
              </svg>
            </a>
            {/* LinkedIn */}
            <a href="#" aria-label="LinkedIn" className="w-7 h-7 bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/80 transition-colors">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"/><circle cx="4" cy="4" r="2"/>
              </svg>
            </a>
          </div>
          <div className="flex items-center gap-1 font-medium">
            <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            Mon–Fri &nbsp;9AM–6PM CST
          </div>
        </div>
      </div>

      {/* ── Row 2: Logo + contact + CTA ── */}
      <div className="bg-background border-b border-border">
        <div className="max-w-7xl mx-auto px-5 py-4 flex items-center justify-between gap-6">

          {/* Logo — large */}
          <Link href="/" className="flex-shrink-0">
            <Image
              src="/logo.png"
              alt="Knightly Digital Group"
              width={380}
              height={94}
              className="h-20 w-auto object-contain"
              priority
            />
          </Link>

          {/* Desktop: contact blocks + CTA */}
          <div className="hidden lg:flex items-center gap-5">

            {/* Phone */}
            <div className="flex items-center gap-4">
              <div className="w-13 h-13 bg-primary flex items-center justify-center flex-shrink-0 p-3">
                <svg className="w-6 h-6 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.67A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
                </svg>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Phone Number</p>
                <a href="tel:2145550100" className="text-foreground font-black text-lg hover:text-primary transition-colors leading-tight">
                  (214) 555-0100
                </a>
              </div>
            </div>

            <div className="w-px h-12 bg-border" />

            {/* Email */}
            <div className="flex items-center gap-4">
              <div className="w-13 h-13 bg-primary flex items-center justify-center flex-shrink-0 p-3">
                <svg className="w-6 h-6 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Send Your Mail</p>
                <a href="mailto:info@knightlydigital.com" className="text-foreground font-bold text-sm hover:text-primary transition-colors">
                  info@knightlydigital.com
                </a>
              </div>
            </div>

            <div className="w-px h-12 bg-border" />

            {/* CTA */}
            <Link
              href="/contact"
              className="bg-primary hover:bg-primary/85 text-primary-foreground font-black px-8 py-4 text-sm tracking-wider uppercase transition-colors whitespace-nowrap"
            >
              Free Consultation
            </Link>
          </div>

          {/* Mobile: phone link + hamburger */}
          <div className="flex lg:hidden items-center gap-3">
            <a href="tel:2145550100" className="text-primary font-bold text-sm">(214) 555-0100</a>
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Toggle menu"
            >
              {mobileOpen ? (
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              ) : (
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Row 3: Nav bar ── */}
      <nav className="bg-primary hidden lg:block">
        <div className="max-w-7xl mx-auto px-5 flex items-center">
          <Link
            href="/"
            className={`px-5 py-4 text-sm font-bold tracking-wide transition-colors ${
              pathname === "/" ? "bg-black/20 text-primary-foreground" : "text-primary-foreground/80 hover:text-primary-foreground hover:bg-black/10"
            }`}
          >
            Home
          </Link>

          {/* Services dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setServicesOpen(!servicesOpen)}
              className="flex items-center gap-1.5 px-5 py-4 text-sm font-bold tracking-wide text-primary-foreground/80 hover:text-primary-foreground hover:bg-black/10 transition-colors"
            >
              Services
              <svg className={`w-3.5 h-3.5 transition-transform ${servicesOpen ? "rotate-180" : ""}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 4l4 4 4-4"/>
              </svg>
            </button>
            {servicesOpen && (
              <div className="absolute top-full left-0 bg-card border border-border shadow-xl min-w-[300px] z-50">
                {services.map((s) => (
                  <Link
                    key={s.slug}
                    href={`/${s.slug}`}
                    className="block px-5 py-4 hover:bg-muted transition-colors border-b border-border last:border-0"
                  >
                    <span className="font-bold text-sm text-foreground">{s.name}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">{s.tagline.split("—")[0].trim()}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <Link
            href="/about"
            className={`px-5 py-4 text-sm font-bold tracking-wide transition-colors ${
              pathname === "/about" ? "bg-black/20 text-primary-foreground" : "text-primary-foreground/80 hover:text-primary-foreground hover:bg-black/10"
            }`}
          >
            About Us
          </Link>
          <Link
            href="/contact"
            className={`px-5 py-4 text-sm font-bold tracking-wide transition-colors ${
              pathname === "/contact" ? "bg-black/20 text-primary-foreground" : "text-primary-foreground/80 hover:text-primary-foreground hover:bg-black/10"
            }`}
          >
            Contact
          </Link>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden bg-card border-b border-border shadow-lg">
          <div className="max-w-7xl mx-auto px-5 py-4 flex flex-col">
            <Link href="/" className="py-3 px-2 font-bold text-foreground border-b border-border text-sm">Home</Link>
            <div className="py-3 px-2 border-b border-border">
              <p className="font-bold text-sm text-foreground mb-2">Services</p>
              {services.map((s) => (
                <Link key={s.slug} href={`/${s.slug}`} className="block py-2 px-3 text-sm text-muted-foreground hover:text-foreground">
                  {s.shortName}
                </Link>
              ))}
            </div>
            <Link href="/about" className="py-3 px-2 font-bold text-sm text-foreground border-b border-border">About Us</Link>
            <Link href="/contact" className="py-3 px-2 font-bold text-sm text-foreground border-b border-border">Contact</Link>
            <a href="mailto:info@knightlydigital.com" className="py-3 px-2 text-sm text-muted-foreground">info@knightlydigital.com</a>
            <Link href="/contact" className="mt-3 bg-primary text-primary-foreground font-bold px-5 py-3 text-sm text-center uppercase tracking-wider">
              Free Consultation
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
