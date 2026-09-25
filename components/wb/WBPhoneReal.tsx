import Image from "next/image";

/**
 * A real App Store screenshot in the device frame, served at full size
 * (unoptimized: the 640px original, so it is sharp on retina), with an
 * optional magnifier that blows up one region of the SAME screenshot so
 * the text reads at hero size. `zoom` is in source pixels (640 x 1385).
 */

const SRC_W = 640;

export default function WBPhoneReal({
  src,
  alt,
  className = "",
  widthClass = "w-[190px] sm:w-[230px] xl:w-[248px]",
}: {
  src: string;
  alt: string;
  className?: string;
  widthClass?: string;
}) {
  return (
    <div className={`rounded-[2.2rem] bg-gray-900 p-[7px] shadow-[0_24px_50px_rgba(10,20,40,0.35)] ${className}`}>
      <div className={`relative overflow-hidden rounded-[1.8rem] bg-white ${widthClass}`} style={{ aspectRatio: "640 / 1385" }}>
        <Image src={src} alt={alt} fill unoptimized priority sizes="248px" className="object-cover" />
      </div>
    </div>
  );
}

/** One region of a screenshot, magnified onto a white card. */
export function WBZoom({
  src,
  region,
  width,
  className = "",
}: {
  src: string;
  region: { x: number; y: number; w: number; h: number };
  width: number;
  className?: string;
}) {
  const scale = width / region.w;
  return (
    <div className={`overflow-hidden rounded-2xl bg-white p-1.5 ${className}`} aria-hidden>
      <div
        className="rounded-xl"
        style={{
          width,
          height: Math.round(region.h * scale),
          backgroundImage: `url(${src})`,
          backgroundSize: `${Math.round(SRC_W * scale)}px auto`,
          backgroundPosition: `${-Math.round(region.x * scale)}px ${-Math.round(region.y * scale)}px`,
          backgroundRepeat: "no-repeat",
        }}
      />
    </div>
  );
}
