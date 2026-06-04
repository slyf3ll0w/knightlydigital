'use client';

import { useState } from 'react';

export function LeadForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      setSubmitted(true);
    }, 1000);
  }

  if (submitted) {
    return (
      <div className="flex items-center gap-3 py-3 mt-8">
        <span
          className="text-xl flex-shrink-0"
          style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
        >
          ✓
        </span>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem' }}>
          Got it! We&apos;ll reach out within one business day.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 mt-8">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Full Name"
        type="text"
        required
        className="flex-1 px-4 py-3 text-sm text-white placeholder:text-white/40 bg-transparent outline-none"
        style={{ border: '1px solid rgba(255,255,255,0.15)' }}
      />
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email Address"
        type="email"
        required
        className="flex-1 px-4 py-3 text-sm text-white placeholder:text-white/40 bg-transparent outline-none"
        style={{ border: '1px solid rgba(255,255,255,0.15)' }}
      />
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Phone Number"
        type="tel"
        className="flex-1 px-4 py-3 text-sm text-white placeholder:text-white/40 bg-transparent outline-none"
        style={{ border: '1px solid rgba(255,255,255,0.15)' }}
      />
      <button
        type="submit"
        disabled={submitting}
        className="px-6 py-3 text-sm font-bold uppercase tracking-wider text-white whitespace-nowrap disabled:opacity-70 transition-opacity hover:opacity-90"
        style={{
          backgroundColor: '#22C55E',
          fontFamily: 'Oxanium, system-ui, sans-serif',
        }}
      >
        {submitting ? '...' : 'Get Started →'}
      </button>
    </form>
  );
}
