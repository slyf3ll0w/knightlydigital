import type { Metadata } from "next";
import Link from "next/link";
import { services } from "@/lib/services";
import { CtaStrip } from "@/components/CtaStrip";

export const metadata: Metadata = {
  title: "About | Streamflare Media Group",
  description:
    "Streamflare Media Group is a premium digital agency in Allen, TX — partnering with growth-minded businesses through custom software, paid advertising, and strategic social media.",
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
            <span className="text-primary-foreground/40">Built for Results.</span>
          </h1>
        </div>
      </section>

      {/* Story */}
      <section className="bg-patterned py-20">
        <div className="max-w-7xl mx-auto px-5 grid lg:grid-cols-2 gap-16">
          <div>
            <h2 className="text-3xl font-black uppercase leading-tight mb-6">
              We Built This Around One Premise
            </h2>
            <div className="h-1 w-12 bg-accent mb-8" />
            <div className="flex flex-col gap-5 text-muted-foreground leading-relaxed">
              <p>
                Most businesses either deal with solo freelancers who can&apos;t handle the full scope, or large agencies where their account gets passed to junior staff and templated solutions. Neither approach produces the results that serious businesses need.
              </p>
              <p>
                Streamflare Media Group was founded in Allen, TX to operate at a different standard — the focused capability of a specialized team, combined with the accountability of a direct partnership. Every client has a named point of contact. Every strategy is built around their specific goals, market, and customers.
              </p>
              <p>
                We&apos;re growing our service offerings deliberately, adding capabilities only when we can deliver them at the same level we hold everything else to. What&apos;s available today is what we do exceptionally well — and we stand behind every engagement we take on.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="bg-primary text-primary-foreground p-10">
              <p className="text-6xl font-black text-accent mb-3">DFW</p>
              <p className="text-sm text-primary-foreground/70">The Dallas-Fort Worth Metroplex is our home market. We know the competitive landscape, the consumer base, and what it takes to win here — and we bring that to every engagement.</p>
            </div>
            <div className="bg-muted p-10">
              <p className="text-4xl font-black text-primary mb-3">1:1</p>
              <p className="text-sm text-muted-foreground">Every client has a dedicated account owner — not a rotating team, not a ticketing system. One person who knows your business and is responsible for your results.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="bg-primary text-primary-foreground py-20">
        <div className="max-w-7xl mx-auto px-5">
          <p className="text-xs tracking-[0.25em] font-bold uppercase text-accent/70 mb-4">How We Operate</p>
          <h2 className="text-4xl font-black uppercase mb-14">Our Commitments to Every Client</h2>
          <div className="grid md:grid-cols-3 gap-0 border border-primary-foreground/15">
            {[
              {
                n: "01",
                title: "Dedicated Ownership",
                body: "Your account has one owner on our team — someone who knows your business, picks up the phone, and takes full responsibility for outcomes.",
              },
              {
                n: "02",
                title: "Market-Specific Strategy",
                body: "We don&apos;t duplicate campaigns. Every strategy is built around your specific city, customer profile, and competitive environment.",
              },
              {
                n: "03",
                title: "Radical Transparency",
                body: "You see everything — spend, results, what worked, what didn&apos;t. No spin, no vanity metrics, no information gaps.",
              },
            ].map((v, i) => (
              <div
                key={v.n}
                className={`p-10 ${i < 2 ? "border-b md:border-b-0 md:border-r border-primary-foreground/15" : ""}`}
              >
                <p className="text-4xl font-black text-accent/30 mb-5">{v.n}</p>
                <h3 className="font-black uppercase text-lg mb-3">{v.title}</h3>
                <p
                  className="text-sm text-primary-foreground/65 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: v.body }}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="bg-background border-y border-border py-16">
        <div className="max-w-7xl mx-auto px-5">
          <p className="text-xs tracking-[0.25em] font-bold uppercase text-muted-foreground mb-8">Current Services</p>
          <div className="grid md:grid-cols-3 gap-4">
            {services.map((s) => (
              <Link
                key={s.slug}
                href={`/${s.slug}`}
                className="border border-border p-8 hover:border-accent hover:bg-muted transition-colors group"
              >
                <p className="font-black text-lg uppercase tracking-tight group-hover:text-accent transition-colors mb-2">
                  {s.shortName}
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">{s.tagline}</p>
                <span className="text-xs font-bold uppercase tracking-widest text-primary/60 group-hover:text-accent transition-colors">
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
