import type { Metadata } from "next";
import Link from "next/link";
import { services } from "@/lib/services";
import { CtaStrip } from "@/components/CtaStrip";

export const metadata: Metadata = {
  title: "Digital Marketing & Custom Software | Allen, TX | Knightly Digital Group",
  description:
    "Knightly Digital Group is an Allen TX digital agency delivering custom software, Meta ads management, and social media posting for businesses across the DFW Metroplex. Call (214) 555-0100.",
};

export default function AllenHome() {
  return (
    <>
      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="relative min-h-[86vh] flex flex-col justify-center overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=1800&q=80')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/65 to-black/80" />

        {/* Wave bottom */}
        <div className="absolute bottom-0 left-0 right-0 overflow-hidden h-20 z-10">
          <svg viewBox="0 0 1440 80" preserveAspectRatio="none" className="w-full h-full" fill="white">
            <path d="M0,80 C360,0 1080,0 1440,80 L1440,80 L0,80 Z" />
          </svg>
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-5 py-28 text-center">
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black uppercase leading-tight tracking-tight text-white mb-6">
            Digital Solutions
            <br />
            <span className="text-accent">That Grow</span> Your Business
          </h1>
          <p className="text-lg text-white/75 max-w-2xl mx-auto mb-10 leading-relaxed font-medium">
            Knightly Digital Group delivers custom software, targeted Meta ad campaigns, and consistent social media — built for DFW businesses that want real results.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="tel:2145550100"
              className="bg-accent text-accent-foreground font-black px-10 py-4 text-base tracking-wider uppercase hover:bg-accent/80 transition-colors"
            >
              (214) 555-0100
            </a>
            <Link
              href="/contact"
              className="border-2 border-white text-white font-black px-10 py-4 text-base tracking-wider uppercase hover:bg-white/10 transition-colors"
            >
              Free Consultation
            </Link>
          </div>
        </div>
      </section>

      {/* ── Services ─────────────────────────────────────────── */}
      <section className="bg-patterned py-24">
        <div className="max-w-7xl mx-auto px-5">
          <div className="mb-14">
            <p className="text-xs tracking-[0.3em] font-bold uppercase text-muted-foreground mb-3">What We Do</p>
            <h2 className="text-4xl lg:text-5xl font-black uppercase">
              Three Services.<br />
              <span className="text-muted-foreground">One Focused Team.</span>
            </h2>
          </div>

          <div className="grid lg:grid-cols-3 gap-0 border border-border">
            {services.map((s, i) => {
              const icons = [
                <svg key="code" className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
                <svg key="ads" className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
                <svg key="social" className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>,
              ];
              return (
                <div
                  key={s.slug}
                  className={`bg-card p-10 flex flex-col gap-5 hover:bg-muted transition-colors group ${
                    i < services.length - 1 ? "lg:border-r border-b lg:border-b-0 border-border" : ""
                  }`}
                >
                  <div className="w-14 h-14 bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0">
                    {icons[i]}
                  </div>
                  <div>
                    <h3 className="font-black text-lg uppercase tracking-tight mb-3">{s.name}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">{s.description}</p>
                  </div>
                  <Link
                    href={`/${s.slug}`}
                    className="self-start text-xs font-bold uppercase tracking-widest text-primary group-hover:underline mt-auto"
                  >
                    Learn More &rarr;
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── About strip ───────────────────────────────────────── */}
      <section className="bg-primary text-primary-foreground py-20">
        <div className="max-w-7xl mx-auto px-5 grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <p className="text-xs tracking-[0.3em] font-bold uppercase text-accent/70 mb-4">Who We Are</p>
            <h2 className="text-4xl lg:text-5xl font-black uppercase leading-tight mb-6">
              A DFW Agency<br />
              <span className="text-primary-foreground/50">That Delivers.</span>
            </h2>
            <p className="text-primary-foreground/70 leading-relaxed mb-5">
              Knightly Digital Group is based in Allen, TX — and we work with businesses across the DFW Metroplex and beyond. We keep our service offerings tight on purpose: custom software, Meta ads, and social media posting. Three things. Done exceptionally well.
            </p>
            <p className="text-primary-foreground/70 leading-relaxed mb-8">
              Every client has a dedicated point of contact. Every strategy is built around your specific business — not pulled from a template. And every month, you get a report that tells you plainly what&apos;s happening and what comes next.
            </p>
            <Link
              href="/about"
              className="inline-block border-2 border-primary-foreground/30 text-primary-foreground font-bold px-8 py-3 text-sm tracking-widest uppercase hover:bg-primary-foreground/10 transition-colors"
            >
              About Us
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-px bg-primary-foreground/10">
            {[
              { value: "21+", label: "DFW Cities Served" },
              { value: "3", label: "Specialized Services" },
              { value: "100%", label: "Texas-Based Team" },
              { value: "0", label: "Cookie-Cutter Strategies" },
            ].map((stat) => (
              <div key={stat.label} className="bg-primary py-10 px-8 text-center">
                <p className="text-4xl font-black text-accent mb-2">{stat.value}</p>
                <p className="text-xs tracking-wider uppercase text-primary-foreground/50">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why choose us ──────────────────────────────────────── */}
      <section className="bg-patterned py-20">
        <div className="max-w-7xl mx-auto px-5">
          <div className="mb-14">
            <p className="text-xs tracking-[0.3em] font-bold uppercase text-muted-foreground mb-3">Why Knightly Digital</p>
            <h2 className="text-4xl font-black uppercase">Built Different.</h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-0 border border-border">
            {[
              {
                title: "Dedicated Contact",
                body: "One person owns your account. They know your business, answer calls, and are accountable for your results.",
              },
              {
                title: "Market-First Strategy",
                body: "Every campaign and software build is designed around your city and your customer — not a generic playbook.",
              },
              {
                title: "Transparent Reporting",
                body: "Plain-English monthly reports. You always know exactly what your investment is doing and what we&apos;re doing next.",
              },
              {
                title: "Built to Scale",
                body: "Our services grow with you. There&apos;s no need to switch agencies as your business expands across the Metroplex.",
              },
            ].map((r, i) => (
              <div
                key={r.title}
                className={`bg-card p-8 ${i < 3 ? "border-b md:border-b-0 md:border-r border-border" : ""}`}
              >
                <div className="text-3xl font-black text-primary/15 mb-4">0{i + 1}</div>
                <h3 className="font-black uppercase text-sm tracking-wide mb-3">{r.title}</h3>
                <p
                  className="text-sm text-muted-foreground leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: r.body }}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaStrip city="Allen" />
    </>
  );
}
