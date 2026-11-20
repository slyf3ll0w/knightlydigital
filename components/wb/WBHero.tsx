/**
 * Hero wrapper for every marketing page without a photo: the first band
 * under the header. Since the 2026-11-19 "heavy" redesign it matches the
 * home hero — the navy-into-blue gradient the immersive header sits on —
 * and children written for a light hero are recolored by .wb-photo-panel
 * (globals.css): white type, the accent in orange, outline pills as glass.
 * (The ribbon is gone; `ribbon` is accepted for older callers.)
 */
export const WB_HERO_BG = "linear-gradient(180deg, #10214A 0%, #12306E 60%, #1847AE 100%)";

export default function WBHero({
  children,
  className = "",
  containerClassName = "",
}: {
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
  /** Not drawn (2026-11-19). */
  ribbon?: boolean;
}) {
  return (
    <section data-wb-hero className={`wb-photo-panel relative overflow-hidden text-white ${className}`} style={{ background: WB_HERO_BG }}>
      <div className={`relative mx-auto max-w-6xl px-5 pb-16 pt-[8.5rem] sm:px-8 sm:pb-24 sm:pt-[10.5rem] ${containerClassName}`}>
        {children}
      </div>
    </section>
  );
}
