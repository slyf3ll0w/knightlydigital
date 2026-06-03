import type { Metadata } from "next";
import Link from "next/link";
import { services } from "@/lib/services";
import { CtaStrip } from "@/components/CtaStrip";

export const metadata: Metadata = {
  title: "Digital Marketing & Custom Software | Allen, TX | Streamflare Media Group",
  description:
    "Streamflare Media Group is a premium digital agency in Allen, TX — delivering custom software, Meta ads management, and social media strategy for businesses across the DFW Metroplex.",
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
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/70 to-black/85" />

        <div className="absolute bottom-0 left-0 right-0 overflow-hidden h-20 z-10">
          <svg viewBox="0 0 1440 80" preserveAspectRatio="none" className="w-full h-full" fill="white">
            <path d="M0,80 C360,0 1080,0 1440,80 L1440,80 L0,80 Z" />
          </svg>
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-5 py-28 text-center">
          <p className="text-xs tracking-[0.3em] font-bold uppercase text-accent/80 mb-6">
            Allen, TX &mdash; Serving the DFW Metroplex
          </p>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black uppercase leading-tight tracking-tight text-white mb-6">
            Where Strategy<br />
            <span className="text-accent">Meets Execution.</span>
          </h1>
          <p className="text-lg text-white/75 max-w-2xl mx-auto mb-10 leading-relaxed font-medium">
            Streamflare Media Group partners with businesses that take their digital presence seriously — delivering custom software, precision ad campaigns, and strategic social media with a level of ownership you won&apos;t find anywhere else.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="tel:2145550100"
              className="bg-accent text-accent-foreground font-black px-10 py-4 text-base tracking-wider uppercase hover:bg-accent/85 transition-colors"
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
            <p className="text-xs tracking-[0.3em] font-bold uppercase text-muted-foreground mb-3">Current Offerings</p>
            <h2 className="text-4xl lg:text-5xl font-black uppercase">
              High-Impact Services.<br />
              <span className="text-muted-foreground">Expertly Executed.</span>
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
                  <div className="w-14 h-14 bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 group-hover:bg-accent transition-colors">
                    {icons[i]}
                  </div>
                  <div>
                    <h3 className="font-black text-lg uppercase tracking-tight mb-3">{s.name}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">{s.description}</p>
                  </div>
                  <Link
                    href={`/${s.slug}`}
                    className="self-start text-xs font-bold uppercase tracking-widest text-primary group-hover:text-accent mt-auto transition-colors"
                  >
                    Learn More &rarr;
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Identity strip ───────────────────────────────────────── */}
      <section className="bg-primary text-primary-foreground py-20">
        <div className="max-w-7xl mx-auto px-5 grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <p className="text-xs tracking-[0.3em] font-bold uppercase text-accent/70 mb-4">Who We Are</p>
            <h2 className="text-4xl lg:text-5xl font-black uppercase leading-tight mb-6">
              A Premium Digital<br />
              <span className="text-primary-foreground/40">Partner.</span>
            </h2>
            <p className="text-primary-foreground/70 leading-relaxed mb-5">
              Streamflare Media Group is based in Allen, TX and works with businesses across the DFW Metroplex and beyond. We don&apos;t operate like a traditional agency — every client has a dedicated point of contact, every strategy is built from scratch, and every engagement is treated as a partnership.
            </p>
            <p className="text-primary-foreground/70 leading-relaxed mb-8">
              We&apos;re selective about who we work with because we commit fully to every client we take on. If we&apos;re a fit, you&apos;ll have a team that operates like an extension of your own business — not a vendor you have to manage.
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
              { value: "DFW", label: "Market Expertise" },
              { value: "1:1", label: "Dedicated Account Management" },
              { value: "100%", label: "Texas-Based Team" },
              { value: "0", label: "Generic Playbooks" },
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
            <p className="text-xs tracking-[0.3em] font-bold uppercase text-muted-foreground mb-3">Why Streamflare</p>
            <h2 className="text-4xl font-black uppercase">What Sets Us Apart.</h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-0 border border-border">
            {[
              {
                title: "Dedicated Contact",
                body: "One person owns your account — knows your business, answers your calls, and takes full accountability for results.",
              },
              {
                title: "Market-First Strategy",
                body: "Every campaign and build is designed around your specific market and customer profile — not a copy-pasted playbook.",
              },
              {
                title: "Transparent Reporting",
                body: "Plain-English reports on a consistent schedule. You always know what your investment is doing and what comes next.",
              },
              {
                title: "Built to Scale",
                body: "Our engagements are structured to grow alongside your business — no switching agencies as your needs evolve.",
              },
            ].map((r, i) => (
              <div
                key={r.title}
                className={`bg-card p-8 ${i < 3 ? "border-b md:border-b-0 md:border-r border-border" : ""}`}
              >
                <div className="text-3xl font-black text-accent/20 mb-4">0{i + 1}</div>
                <h3 className="font-black uppercase text-sm tracking-wide mb-3">{r.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{r.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Client portal CTA ──────────────────────────────────── */}
      <section className="bg-primary text-primary-foreground py-16">
        <div className="max-w-7xl mx-auto px-5 flex flex-col lg:flex-row items-center justify-between gap-8">
          <div>
            <p className="text-xs tracking-[0.25em] font-bold uppercase text-accent/70 mb-2">Existing Clients</p>
            <h2 className="text-2xl font-black uppercase leading-tight">
              Access Your Client Portal
            </h2>
            <p className="text-primary-foreground/60 text-sm mt-2">
              Order services, message your account manager, and track your projects — all in one place.
            </p>
          </div>
          <Link
            href="/portal/login"
            className="flex items-center gap-3 bg-accent hover:bg-accent/85 text-accent-foreground font-bold px-8 py-4 text-sm tracking-widest uppercase transition-colors whitespace-nowrap"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            Sign In to Portal
          </Link>
        </div>
      </section>

      <CtaStrip city="Allen" />
    </>
  );
}
