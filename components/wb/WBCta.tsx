import Link from "next/link";
import { ArrowRight, Phone } from "lucide-react";
import { WB_PHONE } from "@/lib/wb-site";

/**
 * The closing band on every marketing page: a solid navy strip with the
 * headline, one primary action, one secondary link, and the phone number.
 * Full width and square-cornered on purpose — it reads like a business
 * site's footer call-out rather than a launch-page card.
 */
export default function WBCta({
  title = "Ready to get started?",
  body = "Tell us about your business and your account opens today. A person reviews every application and onboards your company personally.",
  secondary = { label: "How the pricing works", href: "/pricing" },
}: {
  title?: React.ReactNode;
  body?: React.ReactNode;
  secondary?: { label: string; href: string } | null;
}) {
  return (
    <section className="bg-[#0A1428] text-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-14 sm:px-8 sm:py-16 lg:grid-cols-[1.3fr_1fr] lg:items-center">
        <div>
          <h2 className="max-w-xl text-3xl font-extrabold leading-tight sm:text-4xl">{title}</h2>
          <p className="mt-4 max-w-lg text-[15.5px] leading-relaxed text-blue-100/80">{body}</p>
        </div>
        <div className="flex flex-col items-start gap-4 lg:items-end">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/apply"
              className="wb-btn inline-flex items-center gap-2 rounded-md bg-[#F86A0A] px-6 py-3 text-[15px] font-bold text-white"
            >
              Get started
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
            </Link>
            {secondary && (
              <Link
                href={secondary.href}
                className="inline-flex items-center rounded-md border border-white/30 px-6 py-3 text-[15px] font-bold text-white transition-colors hover:bg-white/10"
              >
                {secondary.label}
              </Link>
            )}
          </div>
          <a
            href={WB_PHONE.href}
            className="inline-flex items-center gap-2 text-[15px] font-semibold text-white/90 hover:text-white"
          >
            <Phone className="h-4 w-4 text-[#FF8B33]" strokeWidth={2.25} aria-hidden />
            Or call us at {WB_PHONE.display}
          </a>
        </div>
      </div>
    </section>
  );
}
