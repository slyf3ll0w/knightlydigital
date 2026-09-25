/**
 * Hero wrapper for every marketing page: pulls itself up under the floating
 * nav (the layout pads <main> for it), lays graph paper behind the copy,
 * and fades the paper out before the next band begins.
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
    <section className={`relative -mt-20 overflow-hidden sm:-mt-24 ${className}`}>
      <div className="wb-paper absolute inset-0" aria-hidden />
      <div
        className={`relative mx-auto max-w-6xl px-5 pb-14 pt-[7.75rem] sm:px-8 sm:pb-20 sm:pt-[10.5rem] ${containerClassName}`}
      >
        {children}
      </div>
    </section>
  );
}
