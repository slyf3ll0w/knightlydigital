"use client";

import { useState } from "react";
import { PortalShell } from "@/components/PortalShell";
import { OnboardingForm } from "@/components/OnboardingForm";
import { SERVICE_ONBOARDING, OnboardingResponses } from "@/lib/onboarding";

type OnboardingState = Record<string, { responses: OnboardingResponses; completedAt: string | null }>;

interface Props {
  userName: string;
  initialOnboardings: OnboardingState;
}

export function OnboardingClient({ userName, initialOnboardings }: Props) {
  const [onboardings, setOnboardings] = useState<OnboardingState>(initialOnboardings);
  const [openService, setOpenService] = useState<string | null>(null);

  async function saveOnboarding(serviceKey: string, responses: OnboardingResponses) {
    const res = await fetch("/api/portal/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceKey, responses }),
    });
    if (res.ok) {
      const data = await res.json();
      setOnboardings((prev) => ({
        ...prev,
        [serviceKey]: { responses, completedAt: data.completedAt ?? null },
      }));
    }
  }

  const completedCount = Object.values(onboardings).filter((o) => o.completedAt).length;

  return (
    <PortalShell userName={userName} unreadCount={0}>
      <div className="max-w-3xl">
        <div className="mb-8">
          <p className="text-xs tracking-[0.25em] font-bold uppercase text-muted-foreground mb-1">Portal</p>
          <h1 className="text-3xl font-black uppercase">Onboarding</h1>
          <p className="text-muted-foreground text-sm mt-2">
            Fill out the intake form for each service you&apos;re signed up for. This helps our team get started quickly.
          </p>
          {completedCount > 0 && (
            <p className="text-xs font-bold uppercase tracking-wide mt-2" style={{ color: "#22C55E" }}>
              {completedCount} of {SERVICE_ONBOARDING.length} service{SERVICE_ONBOARDING.length !== 1 ? "s" : ""} complete
            </p>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {SERVICE_ONBOARDING.map((service) => {
            const saved = onboardings[service.serviceKey];
            const isComplete = !!saved?.completedAt;
            const hasData = saved && Object.keys(saved.responses).length > 0;
            const isOpen = openService === service.serviceKey;

            return (
              <div key={service.serviceKey} className="bg-white border border-border">
                <button
                  type="button"
                  onClick={() => setOpenService(isOpen ? null : service.serviceKey)}
                  className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-muted transition-colors"
                >
                  <div>
                    <p className="font-black text-sm uppercase tracking-wide">{service.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{service.description}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    {isComplete ? (
                      <span className="text-xs font-black uppercase tracking-wide px-2 py-1 bg-green-100 text-green-700">Complete</span>
                    ) : hasData ? (
                      <span className="text-xs font-black uppercase tracking-wide px-2 py-1 bg-yellow-100 text-yellow-700">In Progress</span>
                    ) : (
                      <span className="text-xs font-black uppercase tracking-wide px-2 py-1 bg-gray-100 text-gray-500">Not Started</span>
                    )}
                    <svg
                      className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    >
                      <path d="M6 9l6 6 6-6"/>
                    </svg>
                  </div>
                </button>

                {isOpen && (
                  <div className="px-6 pb-6 border-t border-border pt-5">
                    <OnboardingForm
                      service={service}
                      initialResponses={saved?.responses ?? {}}
                      onSave={(responses) => saveOnboarding(service.serviceKey, responses)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </PortalShell>
  );
}
