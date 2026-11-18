import Image from "next/image";

/**
 * The WorkBench mascot: a koala in the WorkBench cap and polo, thumbs up.
 * David's art (2026-11-18), background removed, at public/wb/koala.webp
 * (988 x 1536 source, 1000 px tall). He has no name: the site calls him
 * "our mascot". Where he appears (David's pick): the contact page, the book-a-call page
 * the site's 404, and the floating contact launcher (WBContactButton). Keep him to those unless David adds a place.
 */
export const KOALA = {
  src: "/wb/koala.webp",
  width: 643,
  height: 1000,
  alt: "Our mascot, a koala in a WorkBench cap and polo, giving a thumbs up",
} as const;

export default function WBKoala({ className = "", priority = false, sizes = "320px" }: { className?: string; priority?: boolean; sizes?: string }) {
  return (
    <Image
      src={KOALA.src}
      alt={KOALA.alt}
      width={KOALA.width}
      height={KOALA.height}
      priority={priority}
      sizes={sizes}
      className={`h-auto select-none ${className}`}
      draggable={false}
    />
  );
}

/** A speech bubble for the mascot: white, a dark outline like his art, a tail at the bottom left. */
export function WBKoalaSays({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
    <p
      className={`relative rounded-xl border-[2.5px] border-[#0A1428] bg-white px-4 py-2.5 text-[15px] font-extrabold leading-snug text-[#0A1428] shadow-[4px_4px_0_#0A1428]`}
    >
      {children}
      <span
        className="absolute -bottom-[11px] left-7 h-5 w-5 rotate-45 border-b-[2.5px] border-r-[2.5px] border-[#0A1428] bg-white"
        aria-hidden
      />
    </p>
    </div>
  );
}
