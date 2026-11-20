import { AnimateIn } from "@/components/AnimateIn";
import WBOdometer from "./WBOdometer";
import WBVsCost, { typicalSavings, typicalShopLine } from "./WBVsCost";
import { COMPETITORS } from "@/lib/wb-savings";

/**
 * The pricing page's savings moment (David 2026-11-19: "the calculator is
 * pretty dumb, just have an average savings for the average home service
 * business"). One number — what a typical three-person shop keeps in a year
 * next to the cheaper of Jobber and Housecall Pro — rolling in on the blue
 * band, with the year of software and card fees as bars beside it. All of
 * it computed by lib/wb-savings.ts (WBVsCost); nothing typed.
 */
export default function WBPriceAverage() {
  const { keptYearCents } = typicalSavings();
  const names = COMPETITORS.map((c) => c.name).join(" or ");
  return (
    <section id="savings" className="scroll-mt-24 text-white" style={{ background: "linear-gradient(135deg, #0A45B8 0%, #0B57D8 55%, #2563EB 100%)" }}>
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-[0.95fr_1.05fr]">
        <AnimateIn>
          <h2 className="text-[2.2rem] leading-[1.05] sm:text-[3.2rem]">
            What the average shop <span className="text-[#BFD6FF]">keeps by switching.</span>
          </h2>
          <div className="relative mt-10 overflow-hidden rounded-xl bg-[#F86A0A] px-6 pb-20 pt-8 shadow-[0_2px_0_rgba(0,0,0,0.15),0_30px_50px_-28px_rgba(0,0,0,0.55)] sm:px-8">
            <WBOdometer value={keptYearCents / 100} money className="text-[4.2rem] font-black leading-none tracking-[-0.04em] sm:text-[5.6rem]" />
            <p className="mt-3 text-[18px] font-bold text-white">a year, next to {names}.</p>
            <svg viewBox="0 0 400 80" preserveAspectRatio="none" className="wb-scribble absolute inset-x-0 bottom-0 h-16 w-full" aria-hidden style={{ ["--wb-draw-delay" as string]: "0.6s" }}>
              <path d="M0 70 C 40 66, 70 60, 100 62 C 140 64, 160 48, 200 44 C 240 40, 260 30, 300 26 C 340 22, 370 12, 400 6" pathLength={1} stroke="rgba(255,255,255,0.75)" strokeWidth={4} fill="none" strokeLinecap="round" />
            </svg>
          </div>
          <p className="mt-6 max-w-md text-[17px] leading-relaxed text-white/85">
            Based on a typical crew: {typicalShopLine()}. Let clients pay the service fee at checkout and the card fees come off your bill too.
          </p>
        </AnimateIn>
        <AnimateIn delay={120}>
          <div className="rounded-xl bg-white p-6 text-[#0A1428] shadow-[0_2px_0_rgba(0,0,0,0.15),0_30px_50px_-28px_rgba(0,0,0,0.55)] sm:p-8">
            <WBVsCost />
          </div>
        </AnimateIn>
      </div>
    </section>
  );
}
