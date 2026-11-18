import Image from "next/image";
import WBKoala, { WBKoalaSays } from "@/components/wb/WBKoala";
import WBScribble from "@/components/wb/WBScribble";

/**
 * The inner pages' photo hero, Railway-style: one big rounded panel inset
 * from the page edges, a real job photo filling it under a navy wash that
 * is darkest behind the copy, white type, and an optional caption plate in
 * the corner. Children are written as for a light hero; .wb-photo-panel
 * (globals.css) recolors them.
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
    <section className="bg-white px-2 pt-2 sm:px-3 sm:pt-3">
      <div className="wb-photo-panel relative overflow-hidden rounded-2xl bg-[#0A1428]">
        {!mascot && (
          <>
            <Image src={photo.src} alt={photo.alt} fill priority={priority} sizes="100vw" className="object-cover" />
            <div
              className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,20,40,0.82)_0%,rgba(10,20,40,0.9)_100%)] lg:bg-[linear-gradient(90deg,rgba(10,20,40,0.94)_0%,rgba(10,20,40,0.82)_42%,rgba(10,20,40,0.3)_75%,rgba(10,20,40,0.15)_100%)]"
              aria-hidden
            />
          </>
        )}
        {mascot && <div className="wb-dark absolute inset-0" aria-hidden />}

        <div className={`relative mx-auto grid max-w-6xl items-center gap-10 px-5 pt-28 sm:px-8 sm:pt-36 lg:min-h-[600px] lg:grid-cols-[1.1fr_1fr] ${mascot ? "pb-0" : "pb-16 sm:pb-24"}`}>
          <div className={`text-center lg:text-left ${mascot ? "pb-6 lg:pb-24" : ""}`}>
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
            <div className="hidden lg:block" aria-hidden />
          )}
        </div>

        {chip && !mascot && (
          <div className="relative flex justify-center pb-6 lg:absolute lg:bottom-8 lg:right-8 lg:block lg:pb-0">
            <Plate chip={chip} />
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
