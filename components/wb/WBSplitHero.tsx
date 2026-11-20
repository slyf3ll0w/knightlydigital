import Image from "next/image";
import { WB_HERO_BG } from "@/components/wb/WBHero";
import WBKoala, { WBKoalaSays } from "@/components/wb/WBKoala";
import WBScribble from "@/components/wb/WBScribble";

/**
 * The inner pages' photo hero ("heavy" redesign 2026-11-19, matching the
 * home): the navy-into-blue gradient full width, the copy on the left, the
 * page's photo in a solid frame on the right, cut off by the bottom of the
 * hero, with an optional caption plate on it. Children are written as for
 * a light hero; .wb-photo-panel (globals.css) recolors them.
 *
 * `mascot` swaps the photo for the koala on the navy panel (contact,
 * book-a-call; David's pick). `phone` and `note` are accepted for older
 * callers and not drawn (David 2026-11-18: no phone mockups in heroes).
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
  note,
  mascot,
  priority = true,
}: {
  children: React.ReactNode;
  photo: { src: string; alt: string };
  /** Not drawn (2026-11-18). */
  phone?: Shot;
  chip?: { icon: React.ReactNode; title: string; sub: string };
  /** A hand-written note with a drawn arrow under the copy (white on the panel). */
  note?: React.ReactNode;
  /** The koala on the navy panel instead of the photo, with an optional speech bubble. */
  mascot?: { say?: React.ReactNode };
  priority?: boolean;
}) {
  return (
    <section data-wb-hero className="wb-photo-panel relative overflow-hidden text-white" style={{ background: WB_HERO_BG }}>
      <div className={`relative mx-auto grid max-w-6xl items-center gap-12 px-5 pt-32 sm:px-8 sm:pt-40 lg:grid-cols-[1.05fr_1fr] ${mascot ? "pb-0" : "pb-0 lg:pb-0"}`}>
        <div className={`text-center lg:text-left ${mascot ? "pb-6 lg:pb-24" : "pb-4 lg:pb-28"}`}>
          {children}
          {note && (
            <div className="mt-6 hidden items-end gap-1 lg:flex" aria-hidden>
              <p className="pb-2 text-[15px] font-extrabold leading-snug text-white">{note}</p>
              <WBScribble variant="droop" tone="chalk" delay={0.6} className="h-[80px] w-[62px] flex-none" />
            </div>
          )}
          {mascot && chip && <div className="mt-8 flex justify-center lg:justify-start"><Plate chip={chip} /></div>}
        </div>

        {mascot ? (
          <figure className="relative mx-auto w-full max-w-sm self-end pt-16 lg:max-w-none">
            {mascot.say && <WBKoalaSays className="absolute left-0 top-0 z-10 max-w-[15rem] sm:left-4">{mascot.say}</WBKoalaSays>}
            <WBKoala priority={priority} sizes="(min-width: 1024px) 360px, 70vw" className="mx-auto w-[72%] drop-shadow-[0_24px_30px_rgba(0,0,0,0.45)]" />
          </figure>
        ) : (
          // The photo in a solid frame, cut off by the bottom of the hero.
          <div className="relative h-[300px] self-end overflow-hidden rounded-t-xl shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_40px_80px_-30px_rgba(0,0,0,0.7)] sm:h-[380px] lg:h-[460px]">
            <Image src={photo.src} alt={photo.alt} fill priority={priority} sizes="(min-width: 1024px) 560px, 100vw" className="object-cover" />
            {chip && (
              <div className="absolute bottom-5 left-5">
                <Plate chip={chip} />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function Plate({ chip }: { chip: { icon: React.ReactNode; title: string; sub: string } }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-white py-3 pl-3 pr-5 text-left shadow-[0_18px_40px_-16px_rgba(0,0,0,0.6)]">
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-md bg-orange-50">{chip.icon}</span>
      <span>
        <span className="block text-[14.5px] font-extrabold !text-gray-900">{chip.title}</span>
        <span className="block text-[13px] !text-gray-500">{chip.sub}</span>
      </span>
    </div>
  );
}

/** Close-up regions on the App Store screenshots in public/screens, in source pixels. */
export { WB_SHOTS } from "@/lib/wb-site";
