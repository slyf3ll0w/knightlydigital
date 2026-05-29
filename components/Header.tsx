"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { services } from "@/lib/services";

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => {
      const cur = window.scrollY;
      setVisible(cur < lastScrollY.current || cur < 60);
      lastScrollY.current = cur;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
    <header
      className={`sticky top-0 z-[1001] transition-transform duration-300 ${
        visible ? "translate-y-0" : "-translate-y-full"
      }`}
    >
      <div className="bg-primary border-b-2 border-primary/30">
        <div className="max-w-7xl mx-auto px-5 flex items-center justify-between h-20">

          {/* Logo */}
          <Link href="/" className="flex-shrink-0 flex items-center">
            <Image
              src="/logo.png"
              alt="Knightly Digital Group"
              width={260}
              height={64}
              className="h-14 w-auto object-contain brightness-0 invert"
              priority
            />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1">
            <Link
              href="/"
              className={`px-4 py-2 text-sm font-semibold tracking-wide transition-colors ${
                pathname === "/"
                  ? "text-accent"
                  : "text-primary-foreground/80 hover:text-primary-foreground"
              }`}
            >
              Home
            </Link>

            {/* Services dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setServicesOpen(!servicesOpen)}
                className="flex items-center gap-1 px-4 py-2 text-sm font-semibold tracking-wide text-primary-foreground/80 hover:text-primary-foreground transition-colors"
              >
                Services
                <svg
                  className={`w-3.5 h-3.5 transition-transform ${servicesOpen ? "rotate-180" : ""}`}
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M2 4l4 4 4-4" />
                </svg>
              </button>
              {servicesOpen && (
                <div className="absolute top-full left-0 mt-1 bg-card border border-border shadow-xl min-w-[280px] z-50">
                  {services.map((s) => (
                    <Link
                      key={s.slug}
                      href={`/${s.slug}`}
                      className="block px-5 py-3.5 text-sm text-foreground hover:bg-muted hover:text-primary transition-colors border-b border-border last:border-0"
                    >
                      <span className="font-semibold">{s.shortName}</span>
                      <span className="block text-xs text-muted-foreground mt-0.5">
                        {s.tagline.split("—")[0].trim()}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <Link
              href="/about"
              className={`px-4 py-2 text-sm font-semibold tracking-wide transition-colors ${
                pathname === "/about"
                  ? "text-accent"
                  : "text-primary-foreground/80 hover:text-primary-foreground"
              }`}
            >
              About
            </Link>
            <Link
              href="/contact"
              className={`px-4 py-2 text-sm font-semibold tracking-wide transition-colors ${
                pathname === "/contact"
                  ? "text-accent"
                  : "text-primary-foreground/80 hover:text-primary-foreground"
              }`}
            >
              Contact
            </Link>
          </nav>

          {/* CTA */}
          <div className="hidden lg:flex items-center gap-4">
            <a
              href="tel:2145550100"
              className="text-accent font-bold text-sm tracking-wider hover:text-accent/80 transition-colors"
            >
              (214) 555-0100
            </a>
            <Link
              href="/contact"
              className="bg-accent text-accent-foreground font-bold px-7 py-3 text-sm tracking-widest uppercase hover:bg-accent/80 transition-colors"
            >
              Contact Us
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            className="lg:hidden p-2 text-primary-foreground/80 hover:text-primary-foreground"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden bg-card border-b border-border shadow-lg">
          <div className="max-w-7xl mx-auto px-5 py-4 flex flex-col gap-1">
            <Link href="/" className="py-3 px-2 font-semibold text-foreground border-b border-border">Home</Link>
            <div className="py-2 px-2 border-b border-border">
              <p className="font-semibold text-foreground mb-2">Services</p>
              {services.map((s) => (
                <Link
                  key={s.slug}
                  href={`/${s.slug}`}
                  className="block py-2 px-3 text-sm text-muted-foreground hover:text-foreground"
                >
                  {s.shortName}
                </Link>
              ))}
            </div>
            <Link href="/about" className="py-3 px-2 font-semibold text-foreground border-b border-border">About</Link>
            <Link href="/contact" className="py-3 px-2 font-semibold text-foreground border-b border-border">Contact</Link>
            <a href="tel:2145550100" className="py-3 px-2 text-sm text-muted-foreground">(214) 555-0100</a>
            <Link
              href="/contact"
              className="mt-2 bg-primary text-primary-foreground font-bold px-5 py-3 text-center text-sm tracking-widest uppercase"
            >
              Contact Us
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
