/**
 * Hero wrapper for every marketing page: the first band under the header.
 * Pale job-sheet paper (a faint ruled grid, .wb-bloom) with a hairline at
 * the bottom; no colored glows (2026-11-18 redesign). The header is solid
 * and sticky now, so the hero starts below it instead of under it.
 */
export default function WBHero({
  children,
  className = "",
  containerClassName = "",
}: {
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
}) {
  return (
    <section className={`relative overflow-hidden border-b border-gray-200 ${className}`}>
      <div className="wb-bloom absolute inset-0" aria-hidden />
      <div className={`relative mx-auto max-w-6xl px-5 pb-14 pt-12 sm:px-8 sm:pb-20 sm:pt-16 ${containerClassName}`}>
        {children}
      </div>
    </section>
  );
}
