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
  <svg key="code" className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
  <svg key="ads" className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  <svg key="social" className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>,
];

export default function AllenHome() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="relative min-h-[88vh] flex flex-col justify-center overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=1800&q=80')" }}
        />
        <div className="absolute inset-0 bg-black/72" />

        <div className="relative z-10 max-w-6xl mx-auto px-5 py-20">
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black uppercase leading-tight text-white mb-6 max-w-3xl">
            Where Strategy<br />Meets Execution.
          </h1>
          <p className="text-lg text-white/65 max-w-xl mb-10 leading-relaxed">
            We work with a select group of DFW businesses and give each a dedicated partner who takes full ownership of their digital presence — custom software, paid advertising, and strategic content.
          </p>
          <div className="flex flex-wrap gap-4">
            <a
              href="tel:2145550100"
              className="bg-accent text-white font-bold px-8 py-4 text-sm tracking-wider uppercase hover:bg-accent/85 transition-colors"
            >
              (214) 555-0100
            </a>
            <Link
              href="/contact"
              className="border-2 border-white/40 text-white font-bold px-8 py-4 text-sm tracking-wider uppercase hover:bg-white/10 transition-colors"
            >
              Free Consultation
            </Link>
          </div>
        </div>
      </section>

      {/* ── Services ── */}
      <section className="bg-patterned py-20">
        <div className="max-w-7xl mx-auto px-5">
          <div className="mb-12">
            <p className="text-xs tracking-[0.25em] font-bold uppercase text-muted-foreground mb-3">What We Do</p>
            <h2 className="text-3xl lg:text-4xl font-black uppercase">Our Services</h2>
            <div className="h-1 w-10 bg-accent mt-4" />
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {services.map((s, i) => (
              <div key={s.slug} className="bg-card border border-border p-8 hover:border-accent transition-colors group flex flex-col">
                <div className="w-12 h-12 bg-primary text-primary-foreground flex items-center justify-center mb-6 group-hover:bg-accent transition-colors">
                  {serviceIcons[i]}
                </div>
                <h3 className="font-black text-lg uppercase tracking-tight mb-3">{s.name}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed mb-6 flex-1">{s.description}</p>
                <Link
                  href={`/${s.slug}`}
                  className="text-xs font-bold uppercase tracking-widest text-foreground group-hover:text-accent transition-colors"
                >
                  Learn More &rarr;
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── About / Identity ── */}
      <section className="bg-primary text-primary-foreground py-20">
        <div className="max-w-7xl mx-auto px-5 grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <p className="text-xs tracking-[0.25em] font-bold uppercase text-accent/70 mb-4">Based in Allen, TX</p>
            <h2 className="text-3xl lg:text-4xl font-black uppercase leading-tight mb-6">
              A Direct Partnership.<br />Not a Vendor Relationship.
            </h2>
            <p className="text-primary-foreground/65 leading-relaxed mb-5">
              We work with a select group of DFW businesses and give each one a dedicated point of contact — someone who knows your business, answers your calls, and takes full responsibility for results.
            </p>
            <p className="text-primary-foreground/65 leading-relaxed mb-8">
              Every strategy is built from scratch around your market and goals. No recycled playbooks.
            </p>
            <Link
              href="/about"
              className="inline-flex items-center gap-2 text-sm font-bold text-white border-b border-white/30 hover:border-accent hover:text-accent pb-0.5 transition-colors"
            >
              About Streamflare &rarr;
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-px bg-primary-foreground/10">
            {[
              { value: "DFW", label: "Home Market" },
              { value: "1:1", label: "Account Management" },
              { value: "21+", label: "Cities Served" },
              { value: "0", label: "Generic Playbooks" },
            ].map((stat) => (
              <div key={stat.label} className="bg-primary p-8 text-center">
                <p className="text-4xl font-black text-accent mb-2">{stat.value}</p>
                <p className="text-xs tracking-wider uppercase text-primary-foreground/45">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaStrip city="Allen" />
    </>
  );
}
