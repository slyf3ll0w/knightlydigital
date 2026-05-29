"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

type HeroProps = {
  city: string;
  topLine?: string;
  headline: string;
  highlightWord: string;
  subHeadline: string;
  sub?: string;
  bgImage: string;
};

export function Hero({
  city,
  topLine = "DIGITAL SOLUTIONS",
  headline,
  highlightWord,
  subHeadline,
  sub,
  bgImage,
}: HeroProps) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", phone: "" });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(form).toString();
    router.push(`/contact?${params}`);
  };

  const beforeHighlight = headline.split(highlightWord)[0];
  const afterHighlight = headline.split(highlightWord)[1] ?? "";

  return (
    <section className="relative min-h-[90vh] flex flex-col justify-center overflow-hidden">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url('${bgImage}')` }}
      />
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/70 to-black/85" />

      {/* Curved bottom */}
      <div className="absolute bottom-0 left-0 right-0 overflow-hidden h-20 z-10">
        <svg viewBox="0 0 1440 80" preserveAspectRatio="none" className="w-full h-full" fill="white">
          <path d="M0,80 C360,0 1080,0 1440,80 L1440,80 L0,80 Z" />
        </svg>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-5 py-24 text-center">
        {/* Top label */}
        <p className="text-xs tracking-[0.3em] font-semibold text-accent/80 uppercase mb-6">
          {topLine} &mdash; {city}
        </p>

        {/* Headline */}
        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black uppercase leading-tight tracking-tight mb-6">
          <span className="block text-white/90 text-3xl sm:text-4xl font-bold mb-2 tracking-widest">
            {beforeHighlight.trim()}
          </span>
          <span className="block">
            <span className="bg-accent/90 text-primary px-3 py-1 inline-block mr-3">
              {highlightWord}
            </span>
            <span className="text-white">{subHeadline}</span>
          </span>
        </h1>

        {sub && (
          <p className="text-base text-white/70 font-medium mt-4 mb-8 max-w-xl mx-auto">
            {sub}
          </p>
        )}

        {/* Inline lead form */}
        <form
          onSubmit={handleSubmit}
          className="mt-10 flex flex-col sm:flex-row gap-0 max-w-3xl mx-auto border border-white/20"
        >
          <div className="flex items-center bg-white/10 backdrop-blur-sm border-r border-white/20 flex-1">
            <svg className="w-4 h-4 text-white/40 ml-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
            <input
              type="text"
              placeholder="Full Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="bg-transparent text-white placeholder-white/40 px-3 py-4 text-sm w-full outline-none"
            />
          </div>
          <div className="flex items-center bg-white/10 backdrop-blur-sm border-r border-white/20 flex-1">
            <svg className="w-4 h-4 text-white/40 ml-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            <input
              type="email"
              placeholder="Email Address"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="bg-transparent text-white placeholder-white/40 px-3 py-4 text-sm w-full outline-none"
            />
          </div>
          <div className="flex items-center bg-white/10 backdrop-blur-sm border-r border-white/20 flex-1">
            <svg className="w-4 h-4 text-white/40 ml-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 3.07 9.81a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 2 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L6.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            <input
              type="tel"
              placeholder="Phone Number"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="bg-transparent text-white placeholder-white/40 px-3 py-4 text-sm w-full outline-none"
            />
          </div>
          <button
            type="submit"
            className="bg-accent text-accent-foreground font-bold px-8 py-4 text-sm tracking-wider uppercase hover:bg-accent/80 transition-colors whitespace-nowrap flex items-center gap-2"
          >
            Get Started
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </form>
      </div>
    </section>
  );
}
