import Link from "next/link";
import { ArrowRight, Phone } from "lucide-react";
import { WB_PHONE } from "@/lib/wb-site";

/**
 * The closing band on every marketing page: navy with a blue breath, the
 * headline, one orange pill, one ghost pill, and the phone number.
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
    <section className="wb-dark text-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.3fr_1fr] lg:items-center">
        <div>
          <h2 className="max-w-xl text-3xl font-extrabold leading-[1.1] sm:text-[2.6rem]">{title}</h2>
          <p className="mt-4 max-w-lg text-[15.5px] leading-relaxed text-blue-100/80">{body}</p>
        </div>
        <div className="flex flex-col items-start gap-4 lg:items-end">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/apply" className="wb-pill wb-pill-orange">
              Get started
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
            </Link>
            {secondary && (
              <Link href={secondary.href} className="wb-pill wb-pill-ghost">
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
