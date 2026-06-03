"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ContactForm } from "@/components/ContactForm";

function ContactPageInner() {
  const params = useSearchParams();
  const defaultValues = {
    name: params.get("name") ?? "",
    email: params.get("email") ?? "",
    phone: params.get("phone") ?? "",
  };

  return (
    <>
      {/* ── Hero ── */}
      <section className="bg-primary text-primary-foreground pt-24 pb-20 relative overflow-hidden">
        <div className="absolute bottom-0 left-0 right-0 overflow-hidden h-14 z-10">
          <svg viewBox="0 0 1440 56" preserveAspectRatio="none" className="w-full h-full" fill="white">
            <path d="M0,56 L1440,0 L1440,56 Z" />
          </svg>
        </div>
        <div className="max-w-7xl mx-auto px-5 relative z-10">
          <p className="text-xs tracking-[0.3em] font-bold uppercase text-accent/70 mb-4">Allen, TX</p>
          <h1 className="text-5xl lg:text-7xl font-black uppercase leading-tight mb-6">
            Let&apos;s Talk.
          </h1>
          <p className="text-primary-foreground/55 max-w-lg leading-relaxed mb-10">
            Tell us about your business and what you&apos;re trying to accomplish. We respond to every inquiry within one business day — and we&apos;re direct about whether we&apos;re a fit.
          </p>
          <div className="flex flex-wrap gap-x-10 gap-y-5">
            {[
              { label: "Response Time", value: "Within 1 business day" },
              { label: "Consultation", value: "Free, no pressure" },
              { label: "Location", value: "Allen, TX 75002" },
              { label: "Hours", value: "Mon–Fri, 9AM–6PM CST" },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-xs font-bold uppercase tracking-wider text-primary-foreground/35 mb-1">{item.label}</p>
                <p className="text-sm font-bold text-primary-foreground/80">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Content ── */}
      <section className="bg-patterned py-24">
        <div className="max-w-7xl mx-auto px-5 grid lg:grid-cols-3 gap-12">

          <div className="lg:col-span-2">
            <h2 className="text-2xl font-black uppercase mb-2">Send a Message</h2>
            <p className="text-muted-foreground text-sm mb-8">Fill out the form and we&apos;ll respond within one business day.</p>
            <ContactForm defaultValues={defaultValues} />
          </div>

          <div>
            <h2 className="text-2xl font-black uppercase mb-8">Contact Info</h2>
            <div className="flex flex-col gap-0 border border-border divide-y divide-border">
              <div className="p-6">
                <p className="text-xs tracking-[0.2em] font-bold uppercase text-muted-foreground mb-2">Phone</p>
                <a href="tel:2145550100" className="text-xl font-bold text-foreground hover:text-accent transition-colors">
                  (214) 555-0100
                </a>
              </div>
              <div className="p-6">
                <p className="text-xs tracking-[0.2em] font-bold uppercase text-muted-foreground mb-2">Email</p>
                <a href="mailto:info@streamflaremedia.com" className="text-base font-bold text-foreground hover:text-accent transition-colors break-all">
                  info@streamflaremedia.com
                </a>
              </div>
              <div className="p-6">
                <p className="text-xs tracking-[0.2em] font-bold uppercase text-muted-foreground mb-2">Location</p>
                <p className="text-base text-foreground font-bold">Allen, TX 75002</p>
                <p className="text-sm text-muted-foreground mt-1">Serving the DFW Metroplex</p>
              </div>
              <div className="p-6">
                <p className="text-xs tracking-[0.2em] font-bold uppercase text-muted-foreground mb-2">Hours</p>
                <p className="text-sm font-bold text-foreground">Monday &ndash; Friday</p>
                <p className="text-sm text-muted-foreground">9:00 AM &ndash; 6:00 PM CST</p>
              </div>
            </div>

            <div className="mt-6 bg-primary text-primary-foreground p-8">
              <div className="w-8 h-1 bg-accent mb-5" />
              <p className="font-black uppercase text-sm mb-2">Prefer a Quick Call?</p>
              <p className="text-xs text-primary-foreground/55 mb-6 leading-relaxed">
                We&apos;re happy to spend 15 minutes determining if we&apos;re a good fit — no pressure, no pitch deck.
              </p>
              <a
                href="tel:2145550100"
                className="block bg-accent text-white font-bold px-6 py-3 text-sm tracking-widest uppercase text-center hover:bg-accent/85 transition-colors"
              >
                Call Now &rarr;
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export default function ContactPage() {
  return (
    <Suspense>
      <ContactPageInner />
    </Suspense>
  );
}
