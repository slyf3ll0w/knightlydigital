import Link from "next/link";
import { Plus } from "lucide-react";

/**
 * Illustrated empty state for list pages and dashboard panels — small
 * line-art + one clear action, instead of centered gray text. New accounts
 * see these before anything else, so they carry the first impression.
 */

export type EmptyArt = "requests" | "quotes" | "jobs" | "invoices" | "contacts" | "schedule";

function Art({ name }: { name: EmptyArt }) {
  const base = {
    fill: "none",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const gray = { ...base, stroke: "#D1D5DB" }; // gray-300 to sit on the graph-paper canvas
  const green = { ...base, stroke: "#2E6FF2" };

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
  title,
  body,
  actionHref,
  actionLabel,
  showPlusIcon = true,
}: {
  art: EmptyArt;
  title: string;
  body?: string;
  actionHref?: string;
  actionLabel?: string;
  showPlusIcon?: boolean;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <Art name={art} />
      <p className="mt-4 text-sm font-semibold text-gray-900">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-gray-500">{body}</p>}
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-green-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-600 active:bg-green-700"
        >
          {showPlusIcon && <Plus size={15} />}
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
