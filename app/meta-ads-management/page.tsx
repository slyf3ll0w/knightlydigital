import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getServiceBySlug, services } from "@/lib/services";
import { CtaStrip } from "@/components/CtaStrip";
import { ContactForm } from "@/components/ContactForm";

const svc = getServiceBySlug("meta-ads-management")!;
const otherServices = services.filter((s) => s.slug !== svc.slug);

export const metadata: Metadata = {
  title: `Meta Ads Management | Allen, TX | Streamflare Media Group`,
  description: `${svc.description} Serving Allen, TX and the greater DFW Metroplex.`,
};

export default function MetaAdsPage() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="relative min-h-[70vh] flex flex-col justify-end overflow-hidden">
        <Image src={svc.heroImage} alt={svc.name} fill className="object-cover object-center" priority />
        <div className="absolute inset-0 bg-gradient-to-t from-black/92 via-black/55 to-black/20" />
        <div className="relative z-10 max-w-7xl mx-auto px-5 pb-20 w-full">
          <nav className="flex items-center gap-2 text-xs text-white/45 mb-8 font-medium tracking-wider">
            <Link href="/" className="hover:text-white/75 transition-colors">Home</Link>
            <span>/</span>
            <span className="text-white/75">{svc.shortName}</span>
          </nav>
          <p className="text-xs tracking-[0.3em] font-bold uppercase text-accent/80 mb-3">Allen, TX &mdash; DFW Metroplex</p>
          <h1 className="text-4xl lg:text-6xl font-black uppercase text-white leading-tight max-w-3xl mb-4">{svc.name}</h1>
          <p className="text-white/55 max-w-xl text-sm leading-relaxed">{svc.tagline}</p>
        </div>
      </section>

      {/* ── Key Points Bar ── */}
      <section className="bg-primary text-primary-foreground border-b border-primary-foreground/10">
        <div className="max-w-7xl mx-auto px-5 py-6 grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-primary-foreground/10">
          {[
            { label: "Platform", value: "Facebook & Instagram" },
            { label: "Approach", value: "Data-driven, refined continuously" },
            { label: "Reporting", value: "Plain-English, on a schedule" },
          ].map((item) => (
            <div key={item.label} className="py-4 sm:py-0 sm:px-8 first:pl-0 last:pr-0">
              <p className="text-xs font-bold uppercase tracking-wider text-primary-foreground/35 mb-1">{item.label}</p>
              <p className="text-sm font-bold text-primary-foreground/80">{item.value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Main Content ── */}
      <section className="bg-patterned py-20">
        <div className="max-w-7xl mx-auto px-5 grid lg:grid-cols-3 gap-12">
          <div className="lg:col-span-2">
            <p className="text-xs tracking-[0.25em] font-bold uppercase text-muted-foreground mb-4">{svc.shortName} &mdash; Allen, TX</p>
            <h2 className="text-3xl font-black uppercase leading-tight mb-6">{svc.tagline}</h2>
            <div className="h-1 w-12 bg-accent mb-8" />
            <p className="text-muted-foreground leading-relaxed text-lg mb-6">{svc.description}</p>
            <p className="text-muted-foreground leading-relaxed mb-12">
              The DFW Metroplex has millions of Facebook and Instagram users. Businesses that appear in front of their ideal customers at the right moment win market share — those that don&apos;t watch their competitors do. Every campaign we manage is built on data, not guesswork, and refined continuously for performance.
            </p>

            <h3 className="text-lg font-black uppercase tracking-wide mb-5">What&apos;s Included</h3>
            <div className="flex flex-col gap-0 border border-border">
              {svc.details.map((d, i) => (
                <div key={d} className={`flex items-start gap-5 px-6 py-5 ${i < svc.details.length - 1 ? "border-b border-border" : ""}`}>
                  <span className="text-accent font-black text-lg flex-shrink-0 mt-0.5">&#9658;</span>
                  <p className="text-sm text-foreground leading-relaxed">{d}</p>
                </div>
              ))}
            </div>

            <div className="mt-14">
              <p className="text-xs tracking-[0.25em] font-bold uppercase text-muted-foreground mb-5">Also Available</p>
              <div className="grid sm:grid-cols-2 gap-4">
                {otherServices.map((s) => (
                  <Link key={s.slug} href={`/${s.slug}`} className="border border-border p-6 hover:border-accent hover:bg-muted transition-all group">
                    <p className="font-bold text-sm uppercase tracking-wide group-hover:text-accent transition-colors mb-1">{s.shortName}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{s.tagline.split("—")[0].trim()}</p>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="bg-primary text-primary-foreground p-8 mb-6">
              <div className="w-8 h-1 bg-accent mb-5" />
              <h3 className="font-black uppercase text-lg mb-1">Get Started</h3>
              <p className="text-sm text-primary-foreground/60 mb-7">Talk to us about Meta ads for your business.</p>
              <div className="flex flex-col gap-4">
                <a href="tel:2145550100" className="flex items-center gap-3 text-sm text-primary-foreground/75 hover:text-primary-foreground transition-colors">
                  <div className="w-9 h-9 bg-primary-foreground/10 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 3.07 9.81a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 2 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L6.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                  </div>
                  (214) 555-0100
                </a>
                <a href="mailto:info@streamflaremedia.com" className="flex items-center gap-3 text-sm text-primary-foreground/75 hover:text-primary-foreground transition-colors">
                  <div className="w-9 h-9 bg-primary-foreground/10 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                  </div>
                  info@streamflaremedia.com
                </a>
              </div>
            </div>
            <ContactForm defaultValues={{ service: svc.slug }} />
          </div>
        </div>
      </section>

      <CtaStrip city="Allen" />
    </>
  );
}
