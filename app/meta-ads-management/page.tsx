import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getServiceBySlug, services } from "@/lib/services";
import { CtaStrip } from "@/components/CtaStrip";
import { ContactForm } from "@/components/ContactForm";

const svc = getServiceBySlug("meta-ads-management")!;
const otherServices = services.filter((s) => s.slug !== svc.slug);

export const metadata: Metadata = {
  title: `Meta Ads Management | Allen, TX | Knightly Digital Group`,
  description: `${svc.description} Serving Allen, TX and the greater DFW Metroplex.`,
};

export default function MetaAdsPage() {
  return (
    <>
      <section className="relative min-h-[55vh] flex flex-col justify-end overflow-hidden">
        <Image src={svc.heroImage} alt={svc.name} fill className="object-cover object-center" priority />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-black/30" />
        <div className="relative z-10 max-w-7xl mx-auto px-5 pb-16 w-full">
          <nav className="flex items-center gap-2 text-xs text-white/50 mb-6 font-medium tracking-wider">
            <Link href="/" className="hover:text-white/80 transition-colors">Home</Link>
            <span>/</span>
            <span className="text-white/80">{svc.shortName}</span>
          </nav>
          <p className="text-xs tracking-[0.3em] font-bold uppercase text-accent/80 mb-3">Allen, TX</p>
          <h1 className="text-4xl lg:text-6xl font-black uppercase text-white leading-tight max-w-3xl">{svc.name}</h1>
        </div>
      </section>

      <section className="bg-patterned py-20">
        <div className="max-w-7xl mx-auto px-5 grid lg:grid-cols-3 gap-12">
          <div className="lg:col-span-2">
            <p className="text-xs tracking-[0.25em] font-bold uppercase text-muted-foreground mb-4">{svc.shortName} in Allen, TX</p>
            <h2 className="text-3xl font-black uppercase leading-tight mb-6">{svc.tagline}</h2>
            <div className="h-1 w-12 bg-primary mb-8" />
            <p className="text-muted-foreground leading-relaxed text-lg mb-8">{svc.description}</p>
            <p className="text-muted-foreground leading-relaxed mb-10">
              The DFW Metroplex has millions of Facebook and Instagram users. Allen businesses that appear in front of their ideal customers at the right moment win market share — those that don&apos;t watch their competitors do. Our campaigns are built on data, not guesswork.
            </p>
            <h3 className="text-lg font-black uppercase tracking-wide mb-6">What&apos;s Included</h3>
            <div className="flex flex-col gap-0 border border-border">
              {svc.details.map((d, i) => (
                <div key={d} className={`flex items-start gap-5 px-6 py-5 ${i < svc.details.length - 1 ? "border-b border-border" : ""}`}>
                  <span className="text-accent font-black text-lg flex-shrink-0 mt-0.5">▸</span>
                  <p className="text-sm text-foreground leading-relaxed">{d}</p>
                </div>
              ))}
            </div>
            <div className="mt-14">
              <p className="text-xs tracking-[0.25em] font-bold uppercase text-muted-foreground mb-5">Also Available in Allen</p>
              <div className="grid sm:grid-cols-2 gap-4">
                {otherServices.map((s) => (
                  <Link key={s.slug} href={`/${s.slug}`} className="border border-border p-6 hover:border-primary hover:bg-muted transition-colors group">
                    <p className="font-bold text-sm uppercase tracking-wide group-hover:text-primary transition-colors">{s.shortName}</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{s.tagline.split("—")[0].trim()}</p>
                  </Link>
                ))}
              </div>
            </div>
          </div>
          <div>
            <div className="bg-primary text-primary-foreground p-8 mb-6">
              <h3 className="font-black uppercase text-lg mb-1">Get Started Today</h3>
              <p className="text-sm text-primary-foreground/70 mb-6">Let&apos;s talk Meta ads for your Allen business.</p>
              <div className="flex flex-col gap-4">
                <a href="tel:2145550100" className="flex items-center gap-3 text-sm text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                  <div className="w-9 h-9 bg-primary-foreground/10 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 3.07 9.81a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 2 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L6.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                  </div>
                  (214) 555-0100
                </a>
                <a href="mailto:info@knightlydigital.com" className="flex items-center gap-3 text-sm text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                  <div className="w-9 h-9 bg-primary-foreground/10 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
                  </div>
                  info@knightlydigital.com
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
