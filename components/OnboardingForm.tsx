"use client";

import { useState } from "react";
import { ServiceOnboarding, OnboardingResponses, isOnboardingComplete } from "@/lib/onboarding";

interface Props {
  service: ServiceOnboarding;
  initialResponses: OnboardingResponses;
  onSave: (responses: OnboardingResponses) => Promise<void>;
}

export function OnboardingForm({ service, initialResponses, onSave }: Props) {
  const [responses, setResponses] = useState<OnboardingResponses>(initialResponses);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function setValue(key: string, value: string | string[]) {
    setResponses((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function toggleMulti(key: string, option: string) {
    const current = (responses[key] as string[]) ?? [];
    setValue(
      key,
      current.includes(option) ? current.filter((v) => v !== option) : [...current, option]
    );
  }

  async function handleSave() {
    setSaving(true);
    await onSave(responses);
    setSaving(false);
    setSaved(true);
  }

  const complete = isOnboardingComplete(service, responses);

  return (
    <div>
      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        {service.questions.map((q) => (
          <div key={q.key} className={q.type === "textarea" || q.type === "multiselect" ? "sm:col-span-2" : ""}>
            <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
              {q.label}
              {q.required && <span className="text-destructive ml-1">*</span>}
            </label>

            {q.type === "select" && (
              <select
                value={(responses[q.key] as string) ?? ""}
                onChange={(e) => setValue(q.key, e.target.value)}
                className="w-full px-4 py-3 text-sm border border-border bg-white focus:outline-none focus:border-accent transition-colors"
              >
                <option value="">Select...</option>
                {q.options!.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            )}

            {q.type === "multiselect" && (
              <div className="flex flex-wrap gap-2 pt-0.5">
                {q.options!.map((opt) => {
                  const selected = ((responses[q.key] as string[]) ?? []).includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => toggleMulti(q.key, opt)}
                      className={`text-xs px-3 py-2 font-bold uppercase tracking-wide border transition-colors ${
                        selected
                          ? "bg-accent text-accent-foreground border-accent"
                          : "bg-white text-muted-foreground border-border hover:border-accent hover:text-accent"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}

            {(q.type === "text" || q.type === "url") && (
              <input
                type={q.type === "url" ? "url" : "text"}
                value={(responses[q.key] as string) ?? ""}
                onChange={(e) => setValue(q.key, e.target.value)}
                placeholder={q.placeholder}
                className="w-full px-4 py-3 text-sm border border-border bg-white focus:outline-none focus:border-accent transition-colors"
              />
            )}

            {q.type === "textarea" && (
              <textarea
                value={(responses[q.key] as string) ?? ""}
                onChange={(e) => setValue(q.key, e.target.value)}
                placeholder={q.placeholder}
                rows={3}
                className="w-full px-4 py-3 text-sm border border-border bg-white focus:outline-none focus:border-accent transition-colors resize-none"
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-accent text-accent-foreground font-black text-xs uppercase tracking-widest px-8 py-3 hover:bg-accent/85 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {saved && (
          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "#22C55E" }}>
            ✓ Saved
          </span>
        )}
        {!complete && (
          <span className="text-xs text-muted-foreground">
            Fill in required fields (*) to mark as complete.
          </span>
        )}
      </div>
    </div>
  );
}
