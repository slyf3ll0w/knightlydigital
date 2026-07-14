'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';

type FormState = {
  fullName: string;
  businessName: string;
  email: string;
  phone: string;
  service: string;
  message: string;
};

const initialForm: FormState = {
  fullName: '',
  businessName: '',
  email: '',
  phone: '',
  service: '',
  message: '',
};

// TEST: JobFlow embeddable booking form (Excellent PC Building account).
// Flip to false to restore the original Streamflaire contact form.
const USE_JOBFLOW_EMBED = false;
const JOBFLOW_EMBED_SRC = 'https://streamflaire.com/embed/excellent-pc-building';

export default function ContactPage() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      setSubmitted(true);
      setForm(initialForm);
    }, 1000);
  }

  return (
    <>
      {/* Page hero + two-column layout */}
      <section
        className="min-h-screen pt-[108px] bg-paper"
        style={{ backgroundColor: '#0C0F0C' }}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-20">
          <div className="grid lg:grid-cols-2 gap-16 items-start">

            {/* Left column: info */}
            <div>
              <p
                className="text-xs font-bold uppercase tracking-widest mb-5"
                style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Get in Touch
              </p>
              <h1
                className="text-4xl sm:text-5xl font-bold text-white leading-tight mb-6"
                style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Let&apos;s Talk About Your Business
              </h1>
              <p className="text-base leading-relaxed mb-12" style={{ color: 'rgba(255,255,255,0.55)' }}>
                Fill out the form and a member of our team will reach back within one business day.
              </p>

              <div className="flex flex-col gap-6">
                {/* Location */}
                <div
                  className="flex items-start gap-4 pb-6"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <div
                    className="w-10 h-10 flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)' }}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  </div>
                  <div>
                    <p
                      className="text-sm font-bold text-white mb-0.5"
                      style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
                    >
                      Allen, TX
                    </p>
                    <p className="text-sm" style={{ color: '#6B7280' }}>DFW Metroplex</p>
                  </div>
                </div>

                {/* Phone */}
                <div
                  className="flex items-start gap-4 pb-6"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <div
                    className="w-10 h-10 flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)' }}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2">
                      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.67A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                    </svg>
                  </div>
                  <div>
                    <p
                      className="text-sm font-bold text-white mb-0.5"
                      style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
                    >
                      Phone
                    </p>
                    <a
                      href="tel:2145550100"
                      className="text-sm transition-colors hover:text-white"
                      style={{ color: '#6B7280' }}
                    >
                      (214) 555-0100
                    </a>
                  </div>
                </div>

                {/* Email */}
                <div
                  className="flex items-start gap-4 pb-6"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <div
                    className="w-10 h-10 flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)' }}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                  </div>
                  <div>
                    <p
                      className="text-sm font-bold text-white mb-0.5"
                      style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
                    >
                      Email
                    </p>
                    <a
                      href="mailto:info@streamflaire.com"
                      className="text-sm transition-colors hover:text-white"
                      style={{ color: '#6B7280' }}
                    >
                      info@streamflaire.com
                    </a>
                  </div>
                </div>

                {/* Hours */}
                <div className="flex items-start gap-4">
                  <div
                    className="w-10 h-10 flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)' }}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </div>
                  <div>
                    <p
                      className="text-sm font-bold text-white mb-0.5"
                      style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
                    >
                      Business Hours
                    </p>
                    <p className="text-sm" style={{ color: '#6B7280' }}>Mon–Fri, 9am–6pm CST</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right column: form */}
            <div>
              <div className="bg-white p-8 lg:p-10">
                {USE_JOBFLOW_EMBED ? (
                  <iframe
                    src={JOBFLOW_EMBED_SRC}
                    style={{ width: '100%', maxWidth: 560, height: 760, border: 0 }}
                    title="Request a service from Excellent PC Building"
                  />
                ) : submitted ? (
                  <div className="text-center py-12">
                    <div
                      className="w-14 h-14 mx-auto mb-6 flex items-center justify-center"
                      style={{ backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)' }}
                    >
                      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <h2
                      className="text-2xl font-bold mb-3"
                      style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                    >
                      Message Sent!
                    </h2>
                    <p className="text-sm mb-8" style={{ color: '#6B7280' }}>
                      Thank you for reaching out. A member of our team will be in touch within one business day.
                    </p>
                    <button
                      onClick={() => setSubmitted(false)}
                      className="text-sm font-semibold uppercase tracking-wider transition-colors"
                      style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                    >
                      Send Another Message →
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} noValidate>
                    <h2
                      className="text-xl font-bold mb-6"
                      style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                    >
                      Start a Conversation
                    </h2>

                    <div className="grid sm:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label
                          htmlFor="fullName"
                          className="block text-xs font-bold uppercase tracking-wider mb-2"
                          style={{ color: '#6B7280', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                        >
                          Full Name <span style={{ color: '#22C55E' }}>*</span>
                        </label>
                        <input
                          id="fullName"
                          name="fullName"
                          type="text"
                          required
                          value={form.fullName}
                          onChange={handleChange}
                          className="w-full px-4 py-3 text-sm bg-white outline-none transition-colors"
                          style={{
                            border: '1px solid #E5E7EB',
                            color: '#0A0A0F',
                          }}
                          placeholder="Jane Smith"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="businessName"
                          className="block text-xs font-bold uppercase tracking-wider mb-2"
                          style={{ color: '#6B7280', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                        >
                          Business Name
                        </label>
                        <input
                          id="businessName"
                          name="businessName"
                          type="text"
                          value={form.businessName}
                          onChange={handleChange}
                          className="w-full px-4 py-3 text-sm bg-white outline-none"
                          style={{ border: '1px solid #E5E7EB', color: '#0A0A0F' }}
                          placeholder="Acme Co."
                        />
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label
                          htmlFor="email"
                          className="block text-xs font-bold uppercase tracking-wider mb-2"
                          style={{ color: '#6B7280', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                        >
                          Email <span style={{ color: '#22C55E' }}>*</span>
                        </label>
                        <input
                          id="email"
                          name="email"
                          type="email"
                          required
                          value={form.email}
                          onChange={handleChange}
                          className="w-full px-4 py-3 text-sm bg-white outline-none"
                          style={{ border: '1px solid #E5E7EB', color: '#0A0A0F' }}
                          placeholder="jane@example.com"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="phone"
                          className="block text-xs font-bold uppercase tracking-wider mb-2"
                          style={{ color: '#6B7280', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                        >
                          Phone
                        </label>
                        <input
                          id="phone"
                          name="phone"
                          type="tel"
                          value={form.phone}
                          onChange={handleChange}
                          className="w-full px-4 py-3 text-sm bg-white outline-none"
                          style={{ border: '1px solid #E5E7EB', color: '#0A0A0F' }}
                          placeholder="(214) 555-0000"
                        />
                      </div>
                    </div>

                    <div className="mb-4">
                      <label
                        htmlFor="service"
                        className="block text-xs font-bold uppercase tracking-wider mb-2"
                        style={{ color: '#6B7280', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                      >
                        Service Interested In
                      </label>
                      <select
                        id="service"
                        name="service"
                        value={form.service}
                        onChange={handleChange}
                        className="w-full px-4 py-3 text-sm bg-white outline-none appearance-none"
                        style={{ border: '1px solid #E5E7EB', color: form.service ? '#0A0A0F' : '#6B7280' }}
                      >
                        <option value="">Select a service...</option>
                        <option value="custom-software">Custom Software</option>
                        <option value="custom-web-design">Custom Web Design</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div className="mb-6">
                      <label
                        htmlFor="message"
                        className="block text-xs font-bold uppercase tracking-wider mb-2"
                        style={{ color: '#6B7280', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                      >
                        Message / Project Details
                      </label>
                      <textarea
                        id="message"
                        name="message"
                        rows={5}
                        value={form.message}
                        onChange={handleChange}
                        className="w-full px-4 py-3 text-sm bg-white outline-none resize-none"
                        style={{ border: '1px solid #E5E7EB', color: '#0A0A0F' }}
                        placeholder="Tell us about your project or goals..."
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full text-sm font-bold uppercase tracking-wider py-4 transition-opacity hover:opacity-90 disabled:opacity-70"
                      style={{
                        backgroundColor: '#22C55E',
                        color: '#ffffff',
                        fontFamily: 'Oxanium, system-ui, sans-serif',
                      }}
                    >
                      {submitting ? 'Sending...' : 'Send Message →'}
                    </button>

                    <p
                      className="text-xs text-center mt-4"
                      style={{ color: '#6B7280' }}
                    >
                      Your information is never shared.
                    </p>
                  </form>
                )}
              </div>
            </div>

          </div>
        </div>
      </section>
    </>
  );
}
