import Link from "next/link";
import { ArrowRight } from "lucide-react";
import WBDoodle from "@/components/wb/WBDoodle";

/**
 * The closing band on every marketing page ("heavy" redesign 2026-11-19):
 * the home's brand-blue band with a faint hand-drawn compass, the headline,
 * one orange pill and one ghost pill (no phone line: David 2026-11-19).
 */
export default function WBCta({
  title = "Ready to get started?",
  body = "Tell us about your business and your account opens today. Bring your client list, set your prices, and send the first quote this afternoon.",
  secondary = { label: "How the pricing works", href: "/pricing" },
}: {
  title?: React.ReactNode;
  body?: React.ReactNode;
  secondary?: { label: string; href: string } | null;
}) {
  return (
    <section className="relative overflow-hidden text-white" style={{ background: "linear-gradient(135deg, #0A45B8 0%, #0B57D8 55%, #2563EB 100%)" }}>
      <WBDoodle word="atlas" ink="#FFFFFF" opacity={0.07} className="-right-20 -top-24 w-[460px] rotate-12 max-lg:hidden" />
      <div className="relative mx-auto grid max-w-6xl gap-8 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1.3fr_1fr] lg:items-center">
        <div>
          <h2 className="max-w-xl text-3xl font-extrabold leading-[1.05] sm:text-[3rem]">{title}</h2>
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
        </div>
      </div>
    </section>
  );
}
