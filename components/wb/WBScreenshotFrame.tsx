import Image from "next/image";

/**
 * A single static product screenshot, framed like a browser window (desktop)
 * or an iPhone (mobile) — the still-frame counterpart to WBShowcase /
 * WBPhoneShowcase, used on the /features/[topic] deep-dive pages.
 */
export default function WBScreenshotFrame({
  src,
  alt,
  kind = "desktop",
  caption,
}: {
  src: string;
  alt: string;
  kind?: "desktop" | "mobile";
  caption?: string;
}) {
  if (kind === "mobile") {
    return (
      <div className="flex flex-col items-center">
        <div className="rounded-[3rem] bg-gray-900 p-[10px] shadow-[0_24px_60px_rgba(10,20,40,0.28)]">
          <div
            className="relative w-[248px] overflow-hidden rounded-[2.4rem] bg-white sm:w-[280px]"
            style={{ aspectRatio: "331 / 720" }}
          >
            <Image src={src} alt={alt} fill sizes="280px" className="object-cover" />
          </div>
        </div>
        {caption && <p className="mt-5 text-[14px] font-bold text-gray-900">{caption}</p>}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_24px_60px_rgba(10,20,40,0.16)]">
      <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" aria-hidden />
        <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" aria-hidden />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" aria-hidden />
        <span className="ml-3 hidden flex-1 justify-center sm:flex">
          <span className="rounded-md bg-white px-6 py-1 text-[11.5px] font-semibold text-gray-400 ring-1 ring-inset ring-gray-200">
            workbenchfsm.com/app
          </span>
        </span>
        <span className="w-[54px]" aria-hidden />
      </div>
      <div className="relative aspect-[1512/791]">
        <Image src={src} alt={alt} fill sizes="(min-width: 1152px) 1100px, 100vw" className="object-cover" />
      </div>
      {caption && (
        <p className="border-t border-gray-100 px-4 py-2.5 text-center text-[12.5px] font-semibold text-gray-500">
          {caption}
        </p>
      )}
    </div>
  );
}
