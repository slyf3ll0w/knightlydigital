import type { Metadata } from "next";
import Link from "next/link";
import { services } from "@/lib/services";
import { CtaStrip } from "@/components/CtaStrip";

export const metadata: Metadata = {
  title: "Digital Marketing & Custom Software | Allen, TX | Streamflare Media Group",
  description:
    "Streamflare Media Group is a premium digital agency in Allen, TX — delivering custom software, Meta ads management, and social media strategy for businesses across the DFW Metroplex.",
};

const serviceIcons = [
  <svg key="code" className="w-9 h-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
  <svg key="ads" className="w-9 h-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  <svg key="social" className="w-9 h-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>,
];

export default function AllenHome() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="relative min-h-screen flex flex-col justify-center overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=1800&q=80')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-black/92 via-black/78 to-black/55" />
        <div className="absolute bottom-0 left-0 right-0 overflow-hidden h-20 z-10">
          <svg viewBox="0 0 1440 80" preserveAspectRatio="none" className="w-full h-full" fill="white">
            <path d="M0,80 L1440,0 L1440,80 Z" />
          </svg>
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-5 py-32">
          <div className="inline-flex items-center gap-3 border border-accent/40 bg-accent/10 px-5 py-2.5 mb-10">
            <span className="block w-2 h-2 rounded-full bg-accent flex-shrink-0" />
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-accent">
              Allen, TX &mdash; Serving 21+ DFW Cities
            </span>
          </div>

          <h1 className="text-6xl sm:text-7xl lg:text-[6.5rem] font-black uppercase leading-[0.93] tracking-tight text-white mb-10 max-w-4xl">
            Where<br />
            Strategy<br />
            <span className="text-accent">Meets</span><br />
            Execution.
          </h1>

          <p className="text-lg text-white/60 max-w-xl mb-12 leading-relaxed font-medium">
            We partner exclusively with DFW businesses serious about growth — custom software, precision Meta ads, and strategic content. One dedicated partner. Zero generic playbooks.
          </p>

          <div className="flex flex-col sm:flex-row items-start gap-4">
            <a
              href="tel:2145550100"
              className="inline-flex items-center gap-3 bg-accent text-white font-black px-10 py-5 text-sm tracking-widest uppercase hover:bg-accent/85 transition-colors"
            >
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.67A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
              </svg>
              (214) 555-0100
            </a>
            <Link
              href="/contact"
              className="inline-flex items-center gap-3 border-2 border-white/35 text-white font-black px-10 py-5 text-sm tracking-widest uppercase hover:border-white hover:bg-white/10 transition-colors"
            >
              Free Consultation
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Industry Trust Bar ── */}
      <section className="bg-background border-b border-border py-4">
        <div className="max-w-7xl mx-auto px-5 flex flex-col sm:flex-row items-center gap-4">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground whitespace-nowrap flex-shrink-0">
            Trusted by businesses in:
          </p>
          <div className="hidden sm:block w-px h-4 bg-border flex-shrink-0" />
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-6 gap-y-1">
            {["Healthcare", "Real Estate", "Retail", "Professional Services", "Technology", "Hospitality"].map((ind) => (
              <span key={ind} className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">{ind}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Services ── */}
      <section className="bg-patterned py-24">
        <div className="max-w-7xl mx-auto px-5">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 mb-14">
            <div>
              <p className="text-xs tracking-[0.3em] font-bold uppercase text-muted-foreground mb-4">What We Do</p>
              <h2 className="text-4xl lg:text-5xl font-black uppercase leading-tight">
                Services Built for<br />
                <span className="text-muted-foreground">Serious Growth.</span>
              </h2>
            </div>
            <Link
              href="/contact"
              className="self-start lg:self-auto text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors border-b border-border hover:border-accent pb-1 whitespace-nowrap"
            >
              Not Sure What You Need? Let&apos;s Talk &rarr;
            </Link>
          </div>

          <div className="grid lg:grid-cols-3 gap-0 border border-border">
            {services.map((s, i) => (
              <Link
                key={s.slug}
                href={`/${s.slug}`}
                className={`group bg-card p-10 flex flex-col gap-6 hover:bg-primary transition-all duration-200 ${
                  i < services.length - 1 ? "lg:border-r border-b lg:border-b-0 border-border" : ""
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="w-16 h-16 bg-primary group-hover:bg-accent text-primary-foreground flex items-center justify-center flex-shrink-0 transition-colors duration-200">
                    {serviceIcons[i]}
                  </div>
                  <span className="text-6xl font-black text-border group-hover:text-primary-foreground/10 leading-none transition-colors duration-200 select-none">
                    0{i + 1}
                  </span>
                </div>
                <div className="flex-1">
                  <h3 className="font-black text-xl uppercase tracking-tight mb-3 group-hover:text-primary-foreground transition-colors duration-200">{s.name}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed group-hover:text-primary-foreground/55 transition-colors duration-200">{s.description}</p>
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-primary group-hover:text-accent transition-colors duration-200">
                  Learn More &rarr;
                </span>
              </Link>
            ))}
          </div>

          <div className="mt-px bg-muted border border-border border-t-0 px-8 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-bold text-foreground">More services are coming.</span>{" "}
              We expand deliberately — new capabilities launch only when we can deliver them at the same standard we hold everything else to.
            </p>
            <Link href="/about" className="text-xs font-bold uppercase tracking-widest text-foreground hover:text-accent transition-colors whitespace-nowrap flex-shrink-0">
              Our Story &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* ── Process / How We Work ── */}
      <section className="bg-primary text-primary-foreground py-24">
        <div className="max-w-7xl mx-auto px-5">
          <div className="mb-14">
            <p className="text-xs tracking-[0.3em] font-bold uppercase text-accent/70 mb-4">Our Approach</p>
            <h2 className="text-4xl lg:text-5xl font-black uppercase leading-tight">
              How Every Engagement<br />
              <span className="text-primary-foreground/30">Is Handled.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-0 border border-primary-foreground/10">
            {[
              {
                n: "01",
                title: "Discovery",
                body: "We start by understanding your business, market, and what real success looks like — before recommending anything.",
              },
              {
                n: "02",
                title: "Strategy",
                body: "A custom plan built around your specific goals and competitive environment. No templates. No recycled playbooks.",
              },
              {
                n: "03",
                title: "Execution",
                body: "Your dedicated account manager drives delivery across every service — owning the full scope, not a piece of it.",
              },
              {
                n: "04",
                title: "Optimization",
                body: "We track what matters, report in plain English, and continuously refine to compound your results over time.",
              },
            ].map((step, i) => (
              <div key={step.n} className={`p-10 relative ${i < 3 ? "border-b lg:border-b-0 lg:border-r border-primary-foreground/10" : ""}`}>
                <div className="absolute top-5 right-5 text-primary-foreground/[0.05] font-black text-8xl leading-none select-none pointer-events-none">
                  {step.n}
                </div>
                <div className="w-10 h-1 bg-accent mb-8" />
                <h3 className="font-black uppercase text-lg tracking-tight mb-4">{step.title}</h3>
                <p className="text-sm text-primary-foreground/50 leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── About / Identity Split ── */}
      <section className="bg-patterned py-24">
        <div className="max-w-7xl mx-auto px-5">
          <div className="grid lg:grid-cols-2 gap-0 border border-border">
            <div className="bg-card p-12 lg:p-16 flex flex-col">
              <div>
                <p className="text-xs tracking-[0.3em] font-bold uppercase text-muted-foreground mb-5">Who We Are</p>
                <h2 className="text-4xl lg:text-5xl font-black uppercase leading-tight mb-8">
                  A Different Kind<br />of Digital Agency.
                </h2>
                <div className="h-1 w-12 bg-accent mb-8" />
                <p className="text-muted-foreground leading-relaxed mb-5">
                  Streamflare Media Group is based in Allen, TX and works with businesses across the DFW Metroplex that are serious about growth and need a partner — not a vendor.
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  Every client has one named point of contact on our team. Every strategy is built from scratch. We don&apos;t take on more than we can serve at this standard — which means when we&apos;re working together, you have our full attention and accountability.
                </p>
              </div>
              <div className="mt-10 pt-10 border-t border-border">
                <Link
                  href="/about"
                  className="inline-flex items-center gap-3 border-2 border-foreground text-foreground font-black px-8 py-4 text-sm tracking-widest uppercase hover:bg-foreground hover:text-background transition-colors"
                >
                  More About Us &rarr;
                </Link>
              </div>
            </div>
            <div className="bg-primary text-primary-foreground p-12 lg:p-16 flex flex-col gap-10">
              <div className="grid grid-cols-2 gap-px bg-primary-foreground/10">
                {[
                  { value: "DFW", label: "Market Focus" },
                  { value: "1:1", label: "Account Management" },
                  { value: "21+", label: "Cities Served" },
                  { value: "0", label: "Generic Playbooks" },
                ].map((stat) => (
                  <div key={stat.label} className="bg-primary py-9 px-6 text-center">
                    <p className="text-4xl font-black text-accent mb-2">{stat.value}</p>
                    <p className="text-xs tracking-wider uppercase text-primary-foreground/40">{stat.label}</p>
                  </div>
                ))}
              </div>
              <blockquote className="border-l-4 border-accent pl-6 mt-auto">
                <p className="text-primary-foreground/65 italic text-sm leading-relaxed mb-3">
                  &ldquo;Serious businesses deserve serious partners — not a rotating cast of junior staff and recycled templates.&rdquo;
                </p>
                <cite className="text-xs font-bold uppercase tracking-wider text-accent not-italic">
                  Streamflare Media Group &mdash; Allen, TX
                </cite>
              </blockquote>
            </div>
          </div>
        </div>
      </section>

      {/* ── Why Streamflare ── */}
      <section className="bg-background border-y border-border py-24">
        <div className="max-w-7xl mx-auto px-5">
          <div className="mb-14">
            <p className="text-xs tracking-[0.3em] font-bold uppercase text-muted-foreground mb-4">Why Streamflare</p>
            <h2 className="text-4xl lg:text-5xl font-black uppercase leading-tight">
              What You Get<br />
              <span className="text-muted-foreground">Every Engagement.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
                title: "Dedicated Contact",
                body: "One person owns your account — knows your business, answers your calls, takes full accountability for results.",
              },
              {
                icon: <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>,
                title: "Market-First Strategy",
                body: "Every campaign is designed around your specific market, customer profile, and competitive environment.",
              },
              {
                icon: <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
                title: "Transparent Reporting",
                body: "Plain-English reports on a consistent schedule. You always know what your investment is doing.",
              },
              {
                icon: <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>,
                title: "Built to Scale",
                body: "Engagements structured to grow with your business — no switching agencies as your needs evolve.",
              },
            ].map((r) => (
              <div key={r.title} className="bg-card border border-border p-8 hover:border-accent group transition-all">
                <div className="w-12 h-12 bg-muted group-hover:bg-accent group-hover:text-white text-foreground flex items-center justify-center mb-6 transition-colors">
                  {r.icon}
                </div>
                <h3 className="font-black uppercase text-sm tracking-wide mb-3">{r.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{r.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA Split ── */}
      <section className="bg-primary text-primary-foreground">
        <div className="max-w-7xl mx-auto px-5 py-24 grid lg:grid-cols-2 gap-0">
          <div className="flex flex-col justify-center lg:pr-16">
            <p className="text-xs tracking-[0.3em] font-bold uppercase text-accent/70 mb-5">Ready to Start?</p>
            <h2 className="text-4xl lg:text-5xl font-black uppercase leading-tight mb-6">
              Let&apos;s See if<br />We&apos;re a Fit.
            </h2>
            <p className="text-primary-foreground/55 leading-relaxed mb-10 max-w-md">
              We&apos;re selective — and we&apos;re honest. Tell us about your business and your goals, and we&apos;ll give you a straight answer on whether we can help.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/contact"
                className="inline-flex items-center justify-center gap-2 bg-accent text-white font-black px-8 py-4 text-sm tracking-widest uppercase hover:bg-accent/85 transition-colors"
              >
                Start a Conversation &rarr;
              </Link>
              <a
                href="tel:2145550100"
                className="inline-flex items-center justify-center gap-2 border-2 border-primary-foreground/20 text-primary-foreground font-black px-8 py-4 text-sm tracking-widest uppercase hover:border-primary-foreground/40 transition-colors"
              >
                (214) 555-0100
              </a>
            </div>
          </div>
          <div className="border-t lg:border-t-0 lg:border-l border-primary-foreground/10 mt-12 pt-12 lg:mt-0 lg:pt-0 lg:pl-16 flex flex-col justify-center divide-y divide-primary-foreground/10">
            {[
              { label: "Response time", value: "Within 1 business day" },
              { label: "Engagement type", value: "Direct partnership — no middle layers" },
              { label: "Account structure", value: "One dedicated point of contact" },
              { label: "Strategy approach", value: "Built from scratch for your business" },
              { label: "Reporting", value: "Plain-English, on a consistent schedule" },
            ].map((item) => (
              <div key={item.label} className="py-5 flex flex-col gap-1">
                <p className="text-xs font-bold uppercase tracking-wider text-primary-foreground/35">{item.label}</p>
                <p className="text-sm font-bold text-primary-foreground/80">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaStrip city="Allen" />
    </>
  );
}
