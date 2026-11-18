import WBRibbon from "@/components/wb/WBRibbon";

/**
 * Hero wrapper for every marketing page without a photo: the first band
 * under the header. White, with one sweep of the brand colors (.wb-ribbon,
 * Stripe-style) across the top right. David 2026-11-18: no grid pattern.
 * Copy sits on the left, so the ribbon never runs under text on desktop;
 * on phones it shrinks to a corner accent.
 */
export default function WBHero({
  children,
  className = "",
  containerClassName = "",
  ribbon = true,
}: {
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
  /** Off for heroes whose right side carries its own art. */
  ribbon?: boolean;
}) {
  return (
    <section className={`relative overflow-hidden border-b border-gray-200 bg-white ${className}`}>
      {ribbon && (
        <WBRibbon className="right-0 top-0 h-[200px] w-[75%] opacity-60 sm:h-[340px] sm:w-[60%] sm:opacity-80 lg:h-full lg:max-h-[560px] lg:w-[52%] lg:opacity-100" />
      )}
      <div className={`relative mx-auto max-w-6xl px-5 pb-14 pt-12 sm:px-8 sm:pb-20 sm:pt-16 ${containerClassName}`}>
        {children}
      </div>
    </section>
  );
}
