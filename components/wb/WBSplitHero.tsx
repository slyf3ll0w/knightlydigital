import Image from "next/image";
import WBHero from "@/components/wb/WBHero";
import WBKoala, { WBKoalaSays } from "@/components/wb/WBKoala";

/**
 * The inner pages' hero: copy on the left, one real job-site photo on the
 * right, set in an offset brand-blue frame with a caption plate along its
 * bottom edge, the way a trade business shows its work.
 *
 * Redesigned 2026-11-18 (David: the phone screenshot and the floating cards
 * read as AI-made). `phone` and `note` are still accepted so older callers
 * compile, but they no longer render: the product itself is shown in the
 * desktop screenshot section under the hero. `chip` becomes the caption.
 */

type Shot = {
  src: string;
  alt: string;
  size?: { w: number; h: number };
  zoom?: { x: number; y: number; w: number; h: number };
};

export default function WBSplitHero({
  children,
  photo,
  chip,
  mascot,
  priority = true,
}: {
  children: React.ReactNode;
  photo: { src: string; alt: string };
  /** No longer drawn (2026-11-18). */
  phone?: Shot;
  chip?: { icon: React.ReactNode; title: string; sub: string };
  /** No longer drawn (2026-11-18). */
  note?: React.ReactNode;
  /** Show the koala mascot on a blue panel instead of the photo, with an optional speech bubble. Contact, book-a-call and 404 only. */
  mascot?: { say?: React.ReactNode };
  priority?: boolean;
}) {
  return (
    <WBHero containerClassName="sm:pb-24">
      <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <div className="text-center lg:text-left">{children}</div>

        {mascot ? (
          <figure className="relative mx-auto w-full max-w-md pt-10 lg:max-w-none">
            <div className="wb-dark relative mx-auto aspect-[5/4] w-full overflow-visible rounded-lg">
              <div className="absolute inset-x-0 bottom-0 h-3 rounded-b-lg bg-[#F86A0A]" aria-hidden />
              <WBKoala priority={priority} sizes="(min-width: 1024px) 300px, 60vw" className="absolute bottom-3 left-1/2 w-[58%] -translate-x-1/2 drop-shadow-[0_18px_24px_rgba(0,0,0,0.35)]" />
            </div>
            {mascot.say && <WBKoalaSays className="absolute left-0 top-0 max-w-[15rem] sm:-left-4">{mascot.say}</WBKoalaSays>}
            {chip && (
              <figcaption className="absolute -bottom-5 right-0 flex max-w-[85%] items-center gap-3 rounded-l-md border-r-4 border-[#F86A0A] bg-white py-3 pl-4 pr-5 text-left shadow-[0_12px_30px_-14px_rgba(10,20,40,0.45)] sm:-right-6">
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-md bg-orange-50">{chip.icon}</span>
                <span>
                  <span className="block text-[14px] font-extrabold text-gray-900">{chip.title}</span>
                  <span className="block text-[12.5px] text-gray-500">{chip.sub}</span>
                </span>
              </figcaption>
            )}
          </figure>
        ) : (
          <figure className="relative mx-auto w-full max-w-md pb-4 pr-4 lg:max-w-none">
            {/* the offset frame behind the photo */}
            <div className="absolute bottom-0 right-0 top-6 left-6 rounded-lg bg-[#0B57D8]" aria-hidden />
            <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-gray-200 shadow-[0_24px_50px_-24px_rgba(10,20,40,0.45)] sm:aspect-[5/4] lg:aspect-[4/5]">
              <Image src={photo.src} alt={photo.alt} fill priority={priority} sizes="(min-width: 1024px) 500px, 90vw" className="object-cover" />
            </div>
            {chip && (
              <figcaption className="absolute bottom-10 left-0 flex max-w-[85%] items-center gap-3 rounded-r-md border-l-4 border-[#F86A0A] bg-white py-3 pl-4 pr-5 text-left shadow-[0_12px_30px_-14px_rgba(10,20,40,0.45)] sm:-left-6">
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-md bg-orange-50">{chip.icon}</span>
                <span>
                  <span className="block text-[14px] font-extrabold text-gray-900">{chip.title}</span>
                  <span className="block text-[12.5px] text-gray-500">{chip.sub}</span>
                </span>
              </figcaption>
            )}
          </figure>
        )}
      </div>
    </WBHero>
  );
}

/** Close-up regions on the App Store screenshots in public/screens, in source pixels. */
export { WB_SHOTS } from "@/lib/wb-site";
