"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import SectionHeader from "@/components/SectionHeader";

/**
 * My Profile → "Email me too": the team notification emails (new request,
 * client message, booking, paid checkout) that go to the company inbox when
 * it is this person's login email. Push already carries the same news, so
 * the default is automatic — no email while any of their devices has push
 * on (lib/notify.ts, User.emailAlerts: null / true / false).
 */
type Choice = "auto" | "always" | "never";

const OPTIONS: { value: Choice; label: string; hint: string }[] = [
  {
    value: "auto",
    label: "Only when push is off",
    hint: "Skip the email while a phone or browser of yours has notifications on.",
  },
  { value: "always", label: "Always", hint: "Email every notification as well as pushing it." },
  { value: "never", label: "Never", hint: "Push only — no notification emails at all." },
];

const toChoice = (v: boolean | null): Choice => (v === true ? "always" : v === false ? "never" : "auto");
const toValue = (c: Choice): boolean | null => (c === "always" ? true : c === "never" ? false : null);

export default function EmailAlertsCard({ initial, pushOn }: { initial: boolean | null; pushOn: boolean }) {
  const [choice, setChoice] = useState<Choice>(toChoice(initial));
  const [busy, setBusy] = useState<Choice | null>(null);
  const [error, setError] = useState("");

  const emailsNow = choice === "always" || (choice === "auto" && !pushOn);

  async function pick(next: Choice) {
    if (next === choice || busy) return;
    setBusy(next);
    setError("");
    try {
      const res = await fetch("/api/app/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailAlerts: toValue(next) }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || "Couldn't save.");
      setChoice(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="ds-card p-5 mt-5">
      <SectionHeader
        title="Email me too"
        hint="New requests, client messages and bookings reach you as a push. Whether they also land in your inbox:"
      />
      <div className="mt-3 flex flex-col gap-1.5" role="radiogroup" aria-label="Notification emails">
        {OPTIONS.map((o) => {
          const on = choice === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => pick(o.value)}
              disabled={busy !== null}
              className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors disabled:opacity-60 ${
                on
                  ? "border-[color:var(--ds-primary)] bg-[color:var(--ds-primary-soft)]"
                  : "border-gray-200 hover:bg-gray-50 active:bg-gray-100"
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                  on ? "border-[color:var(--ds-primary)] bg-[color:var(--ds-primary)] text-[color:var(--ds-on-primary)]" : "border-gray-300"
                }`}
              >
                {busy === o.value ? <Loader2 size={12} className="animate-spin" /> : on ? <Check size={12} /> : null}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-gray-800">{o.label}</span>
                <span className="block text-xs text-gray-500">{o.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2.5 text-xs text-gray-500">
        {emailsNow
          ? "Right now: you get the emails."
          : pushOn
            ? "Right now: push only — a device of yours has notifications on."
            : "Right now: push only."}
      </p>
      {error && (
        <p className="mt-2 text-xs text-[color:var(--ds-bad)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
