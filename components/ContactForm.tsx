"use client";

import { useState, FormEvent } from "react";
import { services } from "@/lib/services";

type FormState = {
  name: string;
  email: string;
  phone: string;
  service: string;
  message: string;
};

export function ContactForm({ defaultValues }: { defaultValues?: Partial<FormState> }) {
  const [form, setForm] = useState<FormState>({
    name: defaultValues?.name ?? "",
    email: defaultValues?.email ?? "",
    phone: defaultValues?.phone ?? "",
    service: defaultValues?.service ?? "",
    message: "",
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    // Replace with actual form handler (Formspree, etc.)
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="bg-muted border border-border p-10 text-center">
        <div className="w-14 h-14 bg-primary flex items-center justify-center mx-auto mb-5">
          <svg className="w-7 h-7 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <h3 className="text-xl font-black uppercase mb-2">Message Received</h3>
        <p className="text-muted-foreground text-sm">We&apos;ll be in touch within one business day.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Full Name *
          </label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full bg-background border border-border px-4 py-3 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors"
            placeholder="John Smith"
          />
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Phone Number
          </label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="w-full bg-background border border-border px-4 py-3 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors"
            placeholder="(214) 555-0100"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
          Email Address *
        </label>
        <input
          type="email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="w-full bg-background border border-border px-4 py-3 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors"
          placeholder="you@company.com"
        />
      </div>
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
          Service Interest
        </label>
        <select
          value={form.service}
          onChange={(e) => setForm({ ...form, service: e.target.value })}
          className="w-full bg-background border border-border px-4 py-3 text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
        >
          <option value="">— Select a Service —</option>
          {services.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
          <option value="multiple">Multiple Services</option>
          <option value="not-sure">Not Sure Yet</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
          Tell Us About Your Business
        </label>
        <textarea
          rows={5}
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          className="w-full bg-background border border-border px-4 py-3 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors resize-none"
          placeholder="What are you trying to accomplish? What's your timeline?"
        />
      </div>
      <button
        type="submit"
        className="bg-primary text-primary-foreground font-bold py-4 px-8 text-sm tracking-widest uppercase hover:bg-primary/80 transition-colors self-start"
      >
        Send Message &rarr;
      </button>
    </form>
  );
}
