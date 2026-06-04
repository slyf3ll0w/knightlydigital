'use client';

import { useState } from 'react';

export function EstimateForm() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [projectDetails, setProjectDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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
      <div className="text-center py-10">
        <div
          className="w-14 h-14 mx-auto mb-5 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)' }}
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h3
          className="text-xl font-bold mb-2"
          style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
        >
          Request Received!
        </h3>
        <p className="text-sm" style={{ color: '#6B7280' }}>
          Thanks, {firstName}. We&apos;ll get back to you within 1 business day.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h3
        className="text-xl font-bold mb-1"
        style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
      >
        Get a Free Estimate
      </h3>
      <p className="text-sm mb-2" style={{ color: '#6B7280' }}>
        Tell us about your project and we&apos;ll get back to you within 1 business day.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <input
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="First Name"
          type="text"
          required
          className="px-4 py-3 text-sm outline-none bg-white"
          style={{ border: '1px solid #E5E7EB', color: '#0A0A0F' }}
        />
        <input
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Last Name"
          type="text"
          className="px-4 py-3 text-sm outline-none bg-white"
          style={{ border: '1px solid #E5E7EB', color: '#0A0A0F' }}
        />
      </div>

      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Phone Number"
        type="tel"
        className="px-4 py-3 text-sm outline-none bg-white"
        style={{ border: '1px solid #E5E7EB', color: '#0A0A0F' }}
      />

      <textarea
        value={projectDetails}
        onChange={(e) => setProjectDetails(e.target.value)}
        placeholder="Tell us about your project or what you're looking for..."
        rows={3}
        className="px-4 py-3 text-sm outline-none resize-none bg-white"
        style={{ border: '1px solid #E5E7EB', color: '#0A0A0F' }}
      />

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-4 text-sm font-bold uppercase tracking-wider text-white transition-opacity hover:opacity-90 disabled:opacity-70"
        style={{
          backgroundColor: '#22C55E',
          fontFamily: 'Oxanium, system-ui, sans-serif',
        }}
      >
        {submitting ? 'Sending...' : 'Get a Free Estimate →'}
      </button>

      <p className="text-xs text-center" style={{ color: '#9CA3AF' }}>
        Your information is never shared. We respond within 1 business day.
      </p>
    </form>
  );
}
