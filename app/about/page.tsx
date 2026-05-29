import type { Metadata } from "next";
import Link from "next/link";
import { services } from "@/lib/services";
import { CtaStrip } from "@/components/CtaStrip";

export const metadata: Metadata = {
  title: "About | Knightly Digital Group",
  description:
    "Knightly Digital Group is an Allen, TX digital agency specializing in custom software, Meta ads management, and social media posting for DFW businesses.",
};

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-primary text-primary-foreground py-24">
        <div className="max-w-7xl mx-auto px-5">
          <p className="text-xs tracking-[0.3em] font-bold uppercase text-accent/70 mb-4">
            Who We Are
          </p>
          <h1 className="text-5xl lg:text-7xl font-black uppercase leading-tight max-w-2xl">
            Built in Allen.<br />
            <span className="text-primary-foreground/40">Built for DFW.</span>
          </h1>
        </div>
      </section>

      {/* Story */}
      <section className="bg-patterned py-20">
        <div className="max-w-7xl mx-auto px-5 grid lg:grid-cols-2 gap-16">
          <div>
            <h2 className="text-3xl font-black uppercase leading-tight mb-6">
              We Started With a Simple Observation
            </h2>
            <div className="h-1 w-12 bg-primary mb-8" />
            <div className="flex flex-col gap-5 text-muted-foreground leading-relaxed">
              <p>
                Most DFW businesses were either under-served by solo freelancers who couldn&apos;t keep up, or over-charged by large agencies who treated them like an account number. Neither built lasting results.
              </p>
              <p>
                We founded Knightly Digital Group in Allen, TX to fill that gap — a focused team with the capability of an agency and the accountability of a local partner. We specialize in three things because we believe doing fewer things exceptionally well beats doing everything adequately.
              </p>
              <p>
                Every client gets a direct point of contact. Every strategy is built specifically for the DFW market. And every month, you get a plain-English report that tells you exactly what your investment is doing.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="bg-primary text-primary-foreground p-10">
              <p className="text-6xl font-black text-accent mb-3">DFW</p>
              <p className="text-sm text-primary-foreground/70">We don&apos;t serve every market — we serve this one, deeply. The DFW Metroplex is our home turf and we know how to win here.</p>
            </div>
            <div className="bg-muted p-10">
              <p className="text-6xl font-black text-primary mb-3">3</p>
              <p className="text-sm text-muted-foreground">Three services. That&apos;s it. No bloated service menus, no upsell tactics, no services we&apos;re not exceptional at.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="bg-primary text-primary-foreground py-20">
        <div className="max-w-7xl mx-auto px-5">
          <p className="text-xs tracking-[0.25em] font-bold uppercase text-accent/70 mb-4">How We Operate</p>
          <h2 className="text-4xl font-black uppercase mb-14">Our Commitments to You</h2>
          <div className="grid md:grid-cols-3 gap-0 border border-primary-foreground/15">
            {[
              {
                n: "01",
                title: "Dedicated Contact",
                body: "Your account has one owner on our end — someone who knows your business, picks up the phone, and takes responsibility.",
              },
              {
                n: "02",
                title: "Market-Specific Strategy",
                body: "We don&apos;t copy-paste campaigns. Every strategy is designed around your specific city, customers, and competitive landscape.",
              },
              {
                n: "03",
                title: "Radical Transparency",
                body: "You see everything — spend, results, what worked, what didn&apos;t. We don&apos;t hide behind vanity metrics.",
              },
            ].map((v, i) => (
              <div
                key={v.n}
                className={`p-10 ${i < 2 ? "border-b md:border-b-0 md:border-r border-primary-foreground/15" : ""}`}
              >
                <p className="text-4xl font-black text-accent/30 mb-5">{v.n}</p>
                <h3 className="font-black uppercase text-lg mb-3">{v.title}</h3>
                <p className="text-sm text-primary-foreground/65 leading-relaxed">{v.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Services links */}
      <section className="bg-background border-y border-border py-16">
        <div className="max-w-7xl mx-auto px-5">
          <p className="text-xs tracking-[0.25em] font-bold uppercase text-muted-foreground mb-8">Our Services</p>
          <div className="grid md:grid-cols-3 gap-4">
            {services.map((s) => (
              <Link
                key={s.slug}
                href={`/${s.slug}`}
                className="border border-border p-8 hover:border-primary hover:bg-muted transition-colors group"
              >
                <p className="font-black text-lg uppercase tracking-tight group-hover:text-primary transition-colors mb-2">
                  {s.shortName}
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">{s.tagline}</p>
                <span className="text-xs font-bold uppercase tracking-widest text-primary/60 group-hover:text-primary transition-colors">
                  Learn More &rarr;
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <CtaStrip city="Allen" />
    </>
  );
}
