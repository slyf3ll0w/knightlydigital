'use client';

import { useState } from 'react';

interface Props {
  dark?: boolean;
}

export function LeadForm({ dark = true }: Props) {
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

  const inputStyle = dark
    ? {
        border: '1px solid rgba(255,255,255,0.15)',
        color: '#ffffff',
        backgroundColor: 'transparent',
      }
    : {
        border: '1px solid rgba(0,0,0,0.15)',
        color: '#0A0A0F',
        backgroundColor: '#ffffff',
      };

  const textClass = dark
    ? 'text-white placeholder:text-white/40'
    : 'text-gray-900 placeholder:text-gray-400';

  if (submitted) {
    return (
      <div className="flex items-center gap-3 py-3 mt-8">
        <span className="text-xl flex-shrink-0" style={{ color: '#22C55E' }}>✓</span>
        <p className="text-sm" style={{ color: dark ? 'rgba(255,255,255,0.7)' : '#4B5563' }}>
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
        className={`flex-1 px-4 py-3 text-sm bg-transparent outline-none ${textClass}`}
        style={inputStyle}
      />
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email Address"
        type="email"
        required
        className={`flex-1 px-4 py-3 text-sm bg-transparent outline-none ${textClass}`}
        style={inputStyle}
      />
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Phone Number"
        type="tel"
        className={`flex-1 px-4 py-3 text-sm bg-transparent outline-none ${textClass}`}
        style={inputStyle}
      />
      <button
        type="submit"
        disabled={submitting}
        className="px-6 py-3 text-sm font-bold uppercase tracking-wider text-white whitespace-nowrap disabled:opacity-70 transition-all hover:opacity-90 hover:-translate-y-px"
        style={{ backgroundColor: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
      >
        {submitting ? '...' : 'Get Started →'}
      </button>
    </form>
  );
}
