import Link from "next/link";
import InfoTip from "@/components/ds/InfoTip";
import Arrow from "@/components/ds/Arrow";
import type { ReactNode } from "react";
import { Plus, type LucideIcon } from "lucide-react";
import { hueInk } from "@/lib/section-colors";

/**
 * THE empty state — list pages, dashboard panels and in-card "nothing here
 * yet" rows, instead of the two dozen centered-gray-text recipes. New
 * accounts see these before anything else, so they carry the first
 * impression. Three flavors:
 *
 * - `art`     — the line-art illustration (the big list pages)
 * - `icon`    — a section-hued chip-tool tile with a lucide icon (settings
 *               panels, boards; the recipe the Agreements templates panel set)
 * - `compact` — no art, tighter padding, for empties INSIDE a card section
 *               (payments on an invoice, photos on a job, a card's list)
 *
 * `children` is the action slot for anything richer than one link (an
 * inline add form, a second button, example chips).
 */

export type EmptyArt = "requests" | "quotes" | "jobs" | "invoices" | "contacts" | "schedule";

function Art({ name, hue }: { name: EmptyArt; hue?: string }) {
  const base = {
    fill: "none",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const gray = { ...base, stroke: "#D1D5DB" }; // gray-300 to sit on the graph-paper canvas
  // Section hue when the page has one; brand accent otherwise. Hues are CSS
  // vars now, and var() only resolves in style, not presentation attributes.
  const green = { ...base, style: { stroke: hue ?? "var(--ds-primary, #0B57D8)" } };

  switch (name) {
    case "requests":
      return (
        <svg width="120" height="88" viewBox="0 0 120 88" aria-hidden>
          <path {...gray} d="M24 46 L24 70 Q24 74 28 74 L92 74 Q96 74 96 70 L96 46" />
          <path {...gray} d="M24 46 L36 26 Q37 24 40 24 L80 24 Q83 24 84 26 L96 46" />
          <path {...gray} d="M24 46 L44 46 Q46 46 47 48 L50 54 Q51 56 53 56 L67 56 Q69 56 70 54 L73 48 Q74 46 76 46 L96 46" />
          <path {...green} d="M60 4 L60 14 M55 10 L60 15 L65 10" />
          <circle {...green} cx="103" cy="20" r="3" />
          <circle {...gray} cx="14" cy="32" r="2.5" />
        </svg>
      );
    case "quotes":
      return (
        <svg width="120" height="88" viewBox="0 0 120 88" aria-hidden>
          <path {...gray} d="M36 8 L74 8 L86 20 L86 80 L36 80 Z" />
          <path {...gray} d="M74 8 L74 20 L86 20" />
          <path {...gray} d="M44 32 L70 32 M44 42 L78 42 M44 52 L66 52" />
          <path {...green} d="M44 66 L60 66" />
          <path {...green} d="M94 50 L104 60 L82 82 L70 84 L72 72 Z" />
          <circle {...gray} cx="18" cy="22" r="2.5" />
        </svg>
      );
    case "jobs":
      return (
        <svg width="120" height="88" viewBox="0 0 120 88" aria-hidden>
          <rect {...gray} x="32" y="14" width="56" height="68" rx="5" />
          <path {...gray} d="M48 14 Q48 6 60 6 Q72 6 72 14 L72 20 L48 20 Z" />
          <path {...gray} d="M42 38 L52 38 M42 52 L52 52 M42 66 L52 66" />
          <path {...green} d="M58 36 L62 41 L70 31" />
          <path {...green} d="M58 50 L62 55 L70 45" />
          <path {...gray} d="M58 66 L74 66" />
          <circle {...green} cx="100" cy="28" r="3" />
          <circle {...gray} cx="16" cy="60" r="2.5" />
        </svg>
      );
    case "invoices":
      return (
        <svg width="120" height="88" viewBox="0 0 120 88" aria-hidden>
          <path {...gray} d="M38 6 L82 6 L82 82 L74 76 L66 82 L58 76 L50 82 L42 76 L38 79 Z" />
          <path {...gray} d="M48 22 L72 22 M48 32 L72 32 M48 42 L64 42" />
          <path {...green} d="M60 50 L60 70 M66 53 Q60 49 56 54 Q53 58 60 60 Q67 62 64 66 Q60 70 54 67" />
          <circle {...green} cx="96" cy="16" r="3" />
          <circle {...gray} cx="20" cy="40" r="2.5" />
        </svg>
      );
    case "contacts":
      return (
        <svg width="120" height="88" viewBox="0 0 120 88" aria-hidden>
          <circle {...gray} cx="48" cy="32" r="13" />
          <path {...gray} d="M24 78 Q24 56 48 56 Q72 56 72 78" />
          <circle {...green} cx="82" cy="38" r="10" />
          <path {...green} d="M64 76 Q66 60 82 60 Q98 60 100 76" />
          <circle {...gray} cx="18" cy="20" r="2.5" />
          <circle {...green} cx="106" cy="18" r="3" />
        </svg>
      );
    case "schedule":
      return (
        <svg width="120" height="88" viewBox="0 0 120 88" aria-hidden>
          <rect {...gray} x="26" y="16" width="68" height="62" rx="5" />
          <path {...gray} d="M26 34 L94 34" />
          <path {...gray} d="M42 8 L42 22 M78 8 L78 22" />
          <path {...gray} d="M38 46 L46 46 M56 46 L64 46 M74 46 L82 46 M38 60 L46 60 M56 60 L64 60" />
          <circle {...green} cx="78" cy="62" r="10" />
          <path {...green} d="M78 57 L78 62 L82 64" />
          <circle {...gray} cx="14" cy="48" r="2.5" />
        </svg>
      );
  }
}

export default function EmptyState({
  art,
  icon: Icon,
  title,
  body,
  actionHref,
  actionLabel,
  showPlusIcon = true,
  hue,
  compact = false,
  children,
}: {
  /** Line-art illustration (list pages). */
  art?: EmptyArt;
  /** Lucide icon on a section-hued chip-tool tile (panels, boards). */
  icon?: LucideIcon;
  title: string;
  body?: ReactNode;
  actionHref?: string;
  actionLabel?: string;
  showPlusIcon?: boolean;
  /** Section hue: the art's accent strokes, or the icon tile's fill. */
  hue?: string;
  /** In-card empty: tighter padding, no art, quieter title. */
  compact?: boolean;
  /** Action slot for anything richer than one link. */
  children?: ReactNode;
}) {
  const tile = hue ?? "var(--ds-primary, #0B57D8)";
  if (compact) {
    return (
      <div className="flex flex-col items-center px-5 py-8 text-center">
        <p className="flex items-center gap-1 text-sm font-medium text-[color:var(--ds-ink-2)]">
          <span>{title}</span>
          {body && <InfoTip>{body}</InfoTip>}
        </p>
        {actionHref && actionLabel && (
          <Link href={actionHref} className="btn-primary btn-sm mt-3 inline-flex">
            {showPlusIcon && <Plus size={13} />}
            {actionLabel}
          </Link>
        )}
        {children}
      </div>
    );
  }
  return (
    <div className={`flex flex-col items-center px-6 text-center ${art ? "py-14" : "py-10"}`}>
      {art ? (
        <Art name={art} hue={hue} />
      ) : Icon ? (
        <span
          className="chip-tool flex h-11 w-11 items-center justify-center rounded-[12px]"
          style={{ backgroundColor: tile, color: hueInk(tile) }}
          aria-hidden
        >
          <Icon size={20} strokeWidth={2.25} />
        </span>
      ) : null}
      <p className={`flex items-center justify-center gap-1 text-[15px] font-medium text-[color:var(--ds-ink)] ${art ? "mt-4" : Icon ? "mt-3.5" : ""}`}>
        <span>{title}</span>
        {body && <InfoTip>{body}</InfoTip>}
      </p>
      {actionHref && actionLabel && (
        // The arrow gets its own slot (never rotated, never overlapping) — see components/ds Hint.
        <span className="my-2 block h-[58px] w-[44px] shrink-0 text-[color:var(--ds-ink-2)]" aria-hidden>
          <Arrow delay={0.3} className="h-full w-full" />
        </span>
      )}
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="btn-primary inline-flex"
        >
          {showPlusIcon && <Plus size={15} />}
          {actionLabel}
        </Link>
      )}
      {children}
    </div>
  );
}
