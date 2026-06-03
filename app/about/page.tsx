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
      {/* ── Hero ── */}
      <section className="bg-primary text-primary-foreground pt-24 pb-20 relative overflow-hidden">
        <div className="absolute bottom-0 left-0 right-0 overflow-hidden h-16 z-10">
          <svg viewBox="0 0 1440 64" preserveAspectRatio="none" className="w-full h-full" fill="white">
            <path d="M0,64 L1440,0 L1440,64 Z" />
          </svg>
        </div>
        <div className="max-w-7xl mx-auto px-5 relative z-10">
          <p className="text-xs tracking-[0.3em] font-bold uppercase text-accent/70 mb-5">Who We Are</p>
          <h1 className="text-5xl lg:text-7xl font-black uppercase leading-tight max-w-3xl mb-8">
            Built in Allen.<br />
            <span className="text-primary-foreground/30">Built for Results.</span>
          </h1>
          <p className="text-primary-foreground/55 max-w-lg leading-relaxed">
            A premium digital agency serving DFW businesses that are serious about growth. We operate with the accountability of a direct partner, not the anonymity of a large agency.
          </p>
        </div>
      </section>

      {/* ── Story ── */}
      <section className="bg-patterned py-24">
        <div className="max-w-7xl mx-auto px-5">
          <div className="grid lg:grid-cols-2 gap-0 border border-border">
            <div className="bg-card p-12 lg:p-16">
              <h2 className="text-3xl font-black uppercase leading-tight mb-6">
                We Built This Around<br />One Premise
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
              <div className="mt-10">
                <Link
                  href="/contact"
                  className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-foreground hover:text-accent transition-colors border-b border-border hover:border-accent pb-1"
                >
                  Start a Conversation &rarr;
                </Link>
              </div>
            </div>
            <div className="flex flex-col gap-px bg-border">
              <div className="bg-primary text-primary-foreground p-12 flex-1 flex flex-col justify-between">
                <p className="text-7xl font-black text-accent mb-4">DFW</p>
                <p className="text-sm text-primary-foreground/55 leading-relaxed">
                  The Dallas-Fort Worth Metroplex is our home market. We know the competitive landscape, the consumer base, and what it takes to win here — and we bring that to every engagement.
                </p>
              </div>
              <div className="bg-muted p-12 flex-1 flex flex-col justify-between">
                <p className="text-5xl font-black text-primary mb-4">1:1</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Every client has a dedicated account owner — not a rotating team, not a ticketing system. One person who knows your business and is responsible for your results.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Founding Quote ── */}
      <section className="bg-accent text-white py-20">
        <div className="max-w-5xl mx-auto px-5 text-center">
          <p className="text-3xl lg:text-4xl font-black uppercase leading-tight mb-6">
            &ldquo;Serious businesses deserve serious partners — not a rotating cast of junior staff and recycled templates.&rdquo;
          </p>
          <div className="w-16 h-1 bg-white/30 mx-auto mb-5" />
          <p className="text-white/60 text-xs font-bold uppercase tracking-[0.3em]">
            The Premise Behind Streamflare Media Group
          </p>
        </div>
      </section>

      {/* ── Values ── */}
      <section className="bg-primary text-primary-foreground py-24">
        <div className="max-w-7xl mx-auto px-5">
          <p className="text-xs tracking-[0.25em] font-bold uppercase text-accent/70 mb-4">How We Operate</p>
          <h2 className="text-4xl font-black uppercase mb-14">Our Commitments to Every Client</h2>
          <div className="grid md:grid-cols-3 gap-0 border border-primary-foreground/10">
            {[
              {
                n: "01",
                title: "Dedicated Ownership",
                body: "Your account has one owner on our team — someone who knows your business, picks up the phone, and takes full responsibility for outcomes.",
              },
              {
                n: "02",
                title: "Market-Specific Strategy",
                body: "We don't duplicate campaigns. Every strategy is built around your specific city, customer profile, and competitive environment.",
              },
              {
                n: "03",
                title: "Radical Transparency",
                body: "You see everything — spend, results, what worked, what didn't. No spin, no vanity metrics, no information gaps.",
              },
            ].map((v, i) => (
              <div key={v.n} className={`p-10 ${i < 2 ? "border-b md:border-b-0 md:border-r border-primary-foreground/10" : ""}`}>
                <div className="w-10 h-1 bg-accent mb-8" />
                <p className="text-5xl font-black text-accent/20 mb-4">{v.n}</p>
                <h3 className="font-black uppercase text-lg mb-3">{v.title}</h3>
                <p className="text-sm text-primary-foreground/55 leading-relaxed">{v.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Services ── */}
      <section className="bg-background border-y border-border py-20">
        <div className="max-w-7xl mx-auto px-5">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-10">
            <div>
              <p className="text-xs tracking-[0.25em] font-bold uppercase text-muted-foreground mb-3">What We Offer</p>
              <h2 className="text-3xl font-black uppercase">Current Services</h2>
            </div>
            <p className="text-sm text-muted-foreground max-w-sm">More offerings are coming — we expand only when we can deliver at the same standard we hold everything else to.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {services.map((s) => (
              <Link
                key={s.slug}
                href={`/${s.slug}`}
                className="border border-border p-8 hover:border-accent hover:bg-muted transition-all group"
              >
                <p className="font-black text-xl uppercase tracking-tight group-hover:text-accent transition-colors mb-2">
                  {s.shortName}
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed mb-5">{s.tagline}</p>
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
