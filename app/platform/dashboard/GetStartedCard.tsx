"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronRight } from "lucide-react";
import { postJson } from "@/lib/safe-fetch";
import { Card, InfoTip } from "@/components/ds";
import type { GetStarted } from "@/lib/get-started";

/**
 * The Get started checklist on Home — the first thing a new company sees,
 * on phones and desktops alike. Every row ticks itself from real data
 * (lib/get-started.ts); tapping a row opens the place where that step gets
 * done. Hide stamps Company.getStartedHiddenAt so it stays gone on every device;
 * Settings → Company brings it back. The card also leaves on its own once
 * every core item is done.
 */
export default function GetStartedCard({ data }: { data: GetStarted }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const pct = data.total === 0 ? 0 : Math.round((data.done / data.total) * 100);

  async function hide() {
    setHidden(true); // optimistic — worst case it reappears next visit
    await postJson("/api/app/setup/dismiss");
    router.refresh();
  }

  if (hidden || data.complete) return null;

  return (
    <Card className="ds-rise mb-6 overflow-hidden lg:mb-0" aria-label="Get started checklist">
      <div className="flex items-center justify-between gap-3 px-4 pt-4 lg:px-5">
        <p className="flex items-center gap-1 text-[15px] font-semibold text-[color:var(--ds-ink)]">
          Get started
          <InfoTip>
            Each step ticks itself off as you go. Hide it any time — Settings → Company brings it back.
          </InfoTip>
        </p>
        <div className="flex items-center gap-3">
          <span className="ds-num text-[12.5px] font-medium text-[color:var(--ds-ink-2)]">
            {data.done} of {data.total} done
          </span>
          <button
            type="button"
            onClick={hide}
            className="text-[12.5px] font-medium text-[color:var(--ds-ink-2)] underline-offset-2 hover:underline"
          >
            Hide
          </button>
        </div>
      </div>

      <div className="mx-4 mt-3 h-1.5 overflow-hidden rounded-full lg:mx-5" style={{ background: "color-mix(in srgb, var(--ds-primary) 14%, transparent)" }}>
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, background: "var(--ds-primary)" }}
          role="progressbar"
          aria-valuenow={data.done}
          aria-valuemin={0}
          aria-valuemax={data.total}
        />
      </div>

      <ul className="ds-divide mt-3">
        {data.items.map((it) => (
          <li key={it.key}>
            <Link
              prefetch={false}
              href={it.href}
              className={`flex items-center gap-3 px-4 py-3 lg:px-5 ${it.done ? "opacity-70" : ""}`}
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2"
                style={
                  it.done
                    ? { background: "var(--ds-good)", borderColor: "var(--ds-good)", color: "#fff" }
                    : { borderColor: "color-mix(in srgb, var(--ds-ink-2) 45%, transparent)" }
                }
                aria-hidden
              >
                {it.done && <Check size={14} strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-[14.5px] font-medium text-[color:var(--ds-ink)] ${it.done ? "line-through decoration-[color:var(--ds-ink-2)]/50" : ""}`}>
                  {it.title}
                  {it.optional && !it.done && (
                    <span className="ml-2 align-middle text-[11px] font-medium uppercase tracking-wide text-[color:var(--ds-ink-2)]">
                      Optional
                    </span>
                  )}
                </span>
                <span className="hidden text-[12.5px] text-[color:var(--ds-ink-2)] lg:block">{it.sub}</span>
              </span>
              <ChevronRight size={16} className="shrink-0 text-[color:var(--ds-ink-2)]" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
