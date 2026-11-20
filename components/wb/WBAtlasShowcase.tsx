import WBAtlasDemo from "@/components/wb/WBAtlasDemo";
import WBScribble from "@/components/wb/WBScribble";

/**
 * The assistant section: the copy (children) beside the live demo, with a
 * chalk note pointing at it. (The row of topic chips that lit up with each
 * scene is gone — David 2026-11-19: chip rows read as AI-made.)
 */
export default function WBAtlasShowcase({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-[1fr_440px] lg:gap-16">
      <div className="relative">
        {children}
        <div className="pointer-events-none mt-10 hidden items-start justify-end gap-2 pr-2 lg:flex" aria-hidden>
          <p className="pt-1 text-right text-[16px] font-extrabold leading-snug text-white">
            Real requests,
            <br />
            real answers
          </p>
          <WBScribble variant="swoop" tone="chalk" delay={0.6} className="mt-5 h-[46px] w-[92px] flex-none" />
        </div>
      </div>
      <WBAtlasDemo />
    </div>
  );
}
