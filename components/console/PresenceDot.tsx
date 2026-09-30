import type { PresenceState } from "@/lib/presence";

/**
 * The three-state presence mark (David, 2026-09-30): a filled green dot
 * with a soft ring = in the app now; a hollow green ring = active today;
 * a faint grey dot = older; a faint hollow ring = never signed in. Always
 * paired with the last-seen words, never alone.
 */
export default function PresenceDot({ state, className = "" }: { state: PresenceState; className?: string }) {
  const style: React.CSSProperties =
    state === "online"
      ? { background: "var(--ds-good)", boxShadow: "0 0 0 3px var(--ds-good-soft)" }
      : state === "today"
        ? { boxShadow: "inset 0 0 0 2px var(--ds-good)" }
        : state === "away"
          ? { background: "var(--ds-faint)", opacity: 0.6 }
          : { boxShadow: "inset 0 0 0 1.5px var(--ds-faint)", opacity: 0.6 };
  const title =
    state === "online" ? "In the app now" : state === "today" ? "Active today" : state === "away" ? "Not active today" : "Never signed in";
  return (
    <span
      aria-label={title}
      title={title}
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${className}`}
      style={style}
    />
  );
}
