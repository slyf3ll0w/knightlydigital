import Image from "next/image";
import { AnimateIn } from "@/components/AnimateIn";
import WBVideo from "@/components/wb/WBVideo";

/**
 * "From the field": Edan from Knight Light Christmas Lighting walking
 * through an install on WorkBench, on video (it has sound, so it lives here
 * rather than with the silent clips in WBInAction).
 *
 * David 2026-11-18: the written review cards are gone; the video is the
 * testimonial. (Brendan's and Edan's approved quotes from 2026-09-25 are in
 * git history if they are ever wanted back.)
 */
export default function WBTestimonials() {
  return (
    <section className="border-t border-gray-200 bg-[#F5F7FA]">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
        <AnimateIn>
          <h2 className="mt-4 text-3xl font-extrabold leading-[1.1] sm:text-[2.6rem]">
            Hear it from an owner who runs the busy season on WorkBench.
          </h2>
          <div className="mt-8 flex items-center gap-4">
            <span className="flex h-14 w-14 flex-none items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-gray-200">
              <Image src="/brand/customers/knight-light.png" alt="Knight Light Christmas Lighting logo" width={83} height={70} className="h-full w-full object-contain p-1" />
            </span>
            <span>
              <span className="block text-[16px] font-extrabold text-gray-900">Edan</span>
              <span className="block text-[14px] text-gray-500">Owner, Knight Light Christmas Lighting</span>
            </span>
          </div>
        </AnimateIn>
        <AnimateIn delay={100}>
          <div className="wb-window">
            <WBVideo
              src="/video/knight-light-edan.mp4"
              poster="/video/knight-light-edan-poster.jpg"
              label="Edan from Knight Light Christmas Lighting on running installs with WorkBench"
              caption="Watch Edan's walkthrough"
            />
          </div>
        </AnimateIn>
      </div>
    </section>
  );
}
