"use client";

import { useEffect, useState } from "react";

type Appearance = "system" | "light" | "dark";

/**
 * My Profile → "Appearance — for this device": light / dark / automatic.
 *
 * A per-DEVICE preference (localStorage "hub-theme", never the database):
 * field phones want their own light/dark choice, and it must apply with no
 * network round-trip. The head script in app/layout.tsx owns the stamping;
 * applyHubTheme() re-reads localStorage. Light is the default — Automatic
 * (follow the device) is an explicit opt-in, otherwise phones set to system
 * dark flip the app to dark mid-session, which reads as a bug.
 */
export default function AppearanceCard() {
  const [appearance, setAppearance] = useState<Appearance>("light");
  useEffect(() => {
    try {
      const t = localStorage.getItem("hub-theme");
      if (t === "light" || t === "dark" || t === "system") setAppearance(t);
    } catch {}
  }, []);

  function pickAppearance(v: Appearance) {
    setAppearance(v);
    try {
      localStorage.setItem("hub-theme", v);
    } catch {}
    (window as unknown as { applyHubTheme?: () => void }).applyHubTheme?.();
  }

  return (
    <div className="card-ledger p-5 mt-5">
      <h2 className="text-[13px] font-semibold text-gray-500 mb-1">Appearance — for this device</h2>
      <p className="text-sm text-gray-600 mb-3">
        Light or dark on this phone or computer only. Automatic follows the device&apos;s own setting.
      </p>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["light", "Light"],
            ["dark", "Dark"],
            ["system", "Automatic"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => pickAppearance(value)}
            aria-pressed={appearance === value}
            className={`rounded-[10px] border px-3.5 py-2 text-sm font-medium transition-colors ${
              appearance === value
                ? "border-green-500 ring-2 ring-green-500/30 text-gray-900"
                : "border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
