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
      {/* Hero */}
      <section className="bg-primary text-primary-foreground py-20">
        <div className="max-w-7xl mx-auto px-5">
          <p className="text-xs tracking-[0.3em] font-bold uppercase text-accent/70 mb-4">Allen, TX</p>
          <h1 className="text-5xl lg:text-6xl font-black uppercase leading-tight">
            Let&apos;s Talk.
          </h1>
          <p className="text-primary-foreground/60 mt-4 max-w-md">
            Tell us about your business and what you&apos;re trying to accomplish. We&apos;ll get back to you within one business day.
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="bg-patterned py-20">
        <div className="max-w-7xl mx-auto px-5 grid lg:grid-cols-3 gap-16">

          {/* Form */}
          <div className="lg:col-span-2">
            <h2 className="text-2xl font-black uppercase mb-8">Send a Message</h2>
            <ContactForm defaultValues={defaultValues} />
          </div>

          {/* Contact info */}
          <div>
            <h2 className="text-2xl font-black uppercase mb-8">Contact Info</h2>
            <div className="flex flex-col gap-8">
              <div>
                <p className="text-xs tracking-[0.2em] font-bold uppercase text-muted-foreground mb-3">Phone</p>
                <a href="tel:2145550100" className="text-xl font-bold text-foreground hover:text-primary transition-colors">
                  (214) 555-0100
                </a>
              </div>
              <div>
                <p className="text-xs tracking-[0.2em] font-bold uppercase text-muted-foreground mb-3">Email</p>
                <a href="mailto:info@knightlydigital.com" className="text-base font-bold text-foreground hover:text-primary transition-colors">
                  info@knightlydigital.com
                </a>
              </div>
              <div>
                <p className="text-xs tracking-[0.2em] font-bold uppercase text-muted-foreground mb-3">Location</p>
                <p className="text-base text-foreground font-bold">Allen, TX 75002</p>
                <p className="text-sm text-muted-foreground mt-1">Serving the DFW Metroplex</p>
              </div>
              <div>
                <p className="text-xs tracking-[0.2em] font-bold uppercase text-muted-foreground mb-3">Hours</p>
                <p className="text-sm text-foreground">Monday – Friday</p>
                <p className="text-sm text-muted-foreground">9:00 AM – 6:00 PM CST</p>
              </div>
            </div>

            <div className="mt-10 bg-primary text-primary-foreground p-8">
              <p className="font-black uppercase text-sm mb-2">Prefer a Call?</p>
              <p className="text-xs text-primary-foreground/60 mb-5">
                We&apos;re happy to have a quick 15-minute conversation to see if we&apos;re a good fit.
              </p>
              <a
                href="tel:2145550100"
                className="block bg-accent text-accent-foreground font-bold px-6 py-3 text-sm tracking-widest uppercase text-center hover:bg-accent/80 transition-colors"
              >
                Call Now
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
