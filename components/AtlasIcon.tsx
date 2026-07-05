/**
 * The Atlas mark — a compass needle. Atlas → maps → dispatching crews to
 * jobs. This is the one icon for everything AI in the product (assistant
 * bubble, drawer header, setup wizard); never Sparkles, which reads as
 * generic "AI feature" chrome. Inherits currentColor like a lucide icon.
 */
export default function AtlasIcon({
  size = 20,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="1.75" />
      {/* needle: filled NE half, open SW half */}
      <path d="M16.4 7.6 L13.1 13.1 L10.9 10.9 Z" fill="currentColor" />
      <path
        d="M13.1 13.1 L7.6 16.4 L10.9 10.9 Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
