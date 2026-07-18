'use client';

import { useState } from 'react';
import Link from 'next/link';

/**
 * Pricing + full feature list for the free job manager, shared by the home
 * page and /crm. Billing toggle defaults to Annual ("Free"); flipping to
 * Monthly prices it at "Still free" — the joke is the whole pricing model.
 */

const OXANIUM = { fontFamily: 'Oxanium, system-ui, sans-serif' } as const;

const featureGroups: { label: string; items: string[] }[] = [
  {
    label: 'Run the Work',
    items: [
      'Client database & history',
      'Custom client fields',
      'CSV import from Jobber & HCP',
      'Online booking forms',
      'Self-scheduling with approval',
      'Appointments & estimates',
      'Drag-to-schedule calendar',
      'Job pipeline with photos',
    ],
  },
  {
    label: 'Get Paid',
    items: [
      'Quotes with e-signature',
      'Optional items & discounts',
      'Deposits',
      'One-click invoicing',
      'Card & ACH payments',
      'Card surcharging',
      'Automatic payment reminders',
      'Recurring billing',
    ],
  },
  {
    label: 'Grow & Manage',
    items: [
      'Automatic review requests',
      'Contracts & e-signatures',
      'Branded client portal',
      'Price book',
      'Expense & profit insights',
      'Unlimited users & team roles',
      'Atlas AI assistant + AI setup',
    ],
  },
];

function Check() {
  return (
    <svg
      className="w-4 h-4 flex-shrink-0"
      style={{ marginTop: '2px' }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#22C55E"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function HubPricing() {
  const [billing, setBilling] = useState<'annual' | 'monthly'>('annual');
  const annual = billing === 'annual';

  return (
    <div className="grid lg:grid-cols-[340px_1fr]" style={{ border: '1px solid #E5E7EB' }}>
      {/* ── Price panel ── */}
      <div
        className="chamfer p-8 lg:p-10 flex flex-col"
        style={{ backgroundColor: '#0C0F0C' }}
      >
        <p
          className="text-xs font-bold uppercase tracking-widest mb-6"
          style={{ ...OXANIUM, color: '#22C55E' }}
        >
          WorkBench
        </p>

        {/* Billing toggle */}
        <div
          className="inline-flex self-start mb-8 p-1"
          style={{ border: '1px solid rgba(255,255,255,0.15)' }}
          role="group"
          aria-label="Billing period"
        >
          {(['annual', 'monthly'] as const).map((period) => (
            <button
              key={period}
              type="button"
              onClick={() => setBilling(period)}
              className="text-xs font-bold uppercase tracking-wider px-4 py-2 transition-colors"
              style={{
                ...OXANIUM,
                backgroundColor: billing === period ? '#ffffff' : 'transparent',
                color: billing === period ? '#0C0F0C' : 'rgba(255,255,255,0.5)',
              }}
            >
              {period === 'annual' ? 'Annual' : 'Monthly'}
            </button>
          ))}
        </div>

        {/* Price */}
        <p
          className="font-bold text-white mb-2"
          style={{ ...OXANIUM, fontSize: annual ? '3.4rem' : '2.6rem', lineHeight: 1.05 }}
        >
          {annual ? 'Free' : 'Still free'}
        </p>
        <p className="text-sm mb-8" style={{ color: 'rgba(255,255,255,0.5)' }}>
          {annual
            ? '$0 per year — every feature, unlimited users.'
            : '$0 per month. Same everything — the monthly plan just bills you nothing more often.'}
        </p>

        <ul className="flex flex-col gap-3 mb-10">
          {['No credit card required', 'No trial clock', 'No paid tier to upgrade into'].map(
            (item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-white">
                <Check />
                {item}
              </li>
            )
          )}
        </ul>

        <Link
          href="/contact"
          className="mt-auto inline-block text-center text-sm font-bold uppercase tracking-wider px-7 py-4 text-white transition-opacity hover:opacity-90"
          style={{ ...OXANIUM, backgroundColor: '#22C55E' }}
        >
          Get Started Free →
        </Link>
      </div>

      {/* ── Feature list ── */}
      <div className="bg-white p-8 lg:p-10">
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-10">
          {featureGroups.map((group) => (
            <div key={group.label}>
              <p
                className="text-xs font-bold uppercase tracking-widest mb-4 pb-3"
                style={{ ...OXANIUM, color: '#22C55E', borderBottom: '1px solid #E5E7EB' }}
              >
                {group.label}
              </p>
              <ul className="flex flex-col gap-2.5">
                {group.items.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm" style={{ color: '#374151' }}>
                    <Check />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
