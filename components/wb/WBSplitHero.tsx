import Image from "next/image";
import WBHero from "@/components/wb/WBHero";
import WBScribble from "@/components/wb/WBScribble";

/**
 * The home page's hero, reusable: copy on the left; on the right a real
 * job-site photo with the phone app over its corner, a magnified close-up
 * of one spot on that same screenshot, an optional floating status chip,
 * and an optional hand-drawn arrow label pointing at the phone.
 *
 * Screenshots are real App Store captures served at full size
 * (unoptimized) so they stay sharp; `zoom.region` is in the screenshot's own
 * pixels. The close-up's position is derived from the region, so it always
 * sits beside the part of the phone it magnifies.
 */

type Shot = {
  src: string;
  alt: string;
  /** Source size of the screenshot (defaults to the 640 x 1385 App Store captures). */
  size?: { w: number; h: number };
  zoom?: { x: number; y: number; w: number; h: number };
};

const ZOOM_W = 290;

export default function WBSplitHero({
  children,
  photo,
  phone,
  chip,
  note,
  priority = true,
}: {
  children: React.ReactNode;
  photo: { src: string; alt: string };
  /** Omit for a photo-only hero (contact, apply). */
  phone?: Shot;
  chip?: { icon: React.ReactNode; title: string; sub: string };
  note?: React.ReactNode;
  priority?: boolean;
}) {
  const size = phone?.size ?? { w: 640, h: 1385 };
  const ratio = size.h / size.w;
  const z = phone?.zoom;
  const zScale = z ? ZOOM_W / z.w : 1;
  const zH = z ? Math.round(z.h * zScale) : 0;
  const zFrac = z ? 1 - (z.y + z.h / 2) / size.h : 0;

  return (
    <WBHero className="bg-white" containerClassName="sm:pb-24">
      <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
        <div className="text-center lg:text-left">{children}</div>

        <div className="relative mx-auto w-full max-w-md [--pw:176px] sm:[--pw:230px] lg:max-w-none xl:[--pw:248px]">
          <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] shadow-[0_30px_70px_rgba(10,20,40,0.22)] sm:aspect-square lg:aspect-[4/5]">
            <Image src={photo.src} alt={photo.alt} fill priority={priority} sizes="(min-width: 1024px) 520px, 90vw" className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" aria-hidden />
          </div>

          {chip && (
            <div
              className="wb-float absolute right-3 top-5 flex items-center gap-3 rounded-2xl bg-white py-2.5 pl-2.5 pr-4 text-left sm:-right-5 sm:top-8"
              style={{ "--wb-tilt": "2deg", animationDelay: "-2.2s" } as React.CSSProperties}
            >
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-orange-50">{chip.icon}</span>
              <span>
                <span className="block text-[13.5px] font-bold text-gray-900">{chip.title}</span>
                <span className="block text-[12px] text-gray-500">{chip.sub}</span>
              </span>
            </div>
          )}

          {/* the phone, over the photo's corner */}
          {phone && (
          <div className="absolute -bottom-10 left-3 rounded-[2.2rem] bg-gray-900 p-[7px] shadow-[0_24px_50px_rgba(10,20,40,0.35)] sm:-bottom-12 sm:-left-8">
            <div className="relative overflow-hidden rounded-[1.8rem] bg-white" style={{ width: "var(--pw)", aspectRatio: `${size.w} / ${size.h}` }}>
              <Image src={phone.src} alt={phone.alt} fill unoptimized priority={priority} sizes="248px" className="object-cover" />
            </div>
          </div>
          )}

          {/* the same screenshot, magnified on one spot */}
          {phone && z && (
            <div
              className="wb-float absolute hidden overflow-hidden rounded-2xl bg-white p-1.5 sm:block"
              style={{
                left: "calc(var(--pw) - 52px)",
                bottom: `calc(var(--pw) * ${(ratio * zFrac).toFixed(4)} - 48px + 7px - ${Math.round(zH / 2)}px)`,
              }}
              aria-hidden
            >
              <div
                className="rounded-xl"
                style={{
                  width: ZOOM_W,
                  height: zH,
                  backgroundImage: `url(${phone!.src})`,
                  backgroundSize: `${Math.round(size.w * zScale)}px auto`,
                  backgroundPosition: `${-Math.round(z.x * zScale)}px ${-Math.round(z.y * zScale)}px`,
                  backgroundRepeat: "no-repeat",
                }}
              />
            </div>
          )}

          {phone && note && (
            <div className="absolute -left-[16.5rem] bottom-6 hidden w-[14rem] items-end gap-1 xl:flex" aria-hidden>
              <p className="pb-1 text-right text-[15px] font-extrabold leading-snug text-[#10244A]">{note}</p>
              <WBScribble variant="swoop" delay={0.8} className="h-[50px] w-[96px] flex-none -rotate-[18deg]" />
            </div>
          )}
        </div>
      </div>
    </WBHero>
  );
}

/** Close-up regions on the App Store screenshots in public/screens, in source pixels. */
export const WB_SHOTS = {
  schedule: { src: "/screens/mobile-01.png", alt: "The WorkBench phone app: the week's schedule, one card per job", zoom: { x: 18, y: 540, w: 604, h: 142 } },
  jobs: { src: "/screens/mobile-02.png", alt: "The WorkBench phone app: the jobs list with status on every job", zoom: { x: 24, y: 590, w: 596, h: 180 } },
  invoices: { src: "/screens/mobile-03.png", alt: "The WorkBench phone app: invoices, each marked paid", zoom: { x: 22, y: 414, w: 584, h: 188 } },
  clients: { src: "/screens/mobile-04.png", alt: "The WorkBench phone app: every client in one list", zoom: { x: 24, y: 516, w: 590, h: 176 } },
  quotes: { src: "/screens/mobile-05.png", alt: "The WorkBench phone app: quotes, converted to jobs", zoom: { x: 24, y: 414, w: 588, h: 188 } },
  insights: { src: "/screens/mobile-06.png", alt: "The WorkBench phone app: revenue, expenses, and profit", zoom: { x: 20, y: 366, w: 596, h: 252 } },
  menu: { src: "/screens/mobile-atlas.png", alt: "The WorkBench phone app menu with Atlas at the top", size: { w: 331, h: 720 }, zoom: { x: 12, y: 165, w: 306, h: 52 } },
  timeclock: { src: "/screens/mobile-timeclock.png", alt: "A job in the WorkBench phone app with the Clock In button", size: { w: 331, h: 720 }, zoom: { x: 12, y: 462, w: 306, h: 80 } },
} satisfies Record<string, Shot>;
