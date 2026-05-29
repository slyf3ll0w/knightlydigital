import type { Metadata } from "next";
import { Hero } from "@/components/Hero";
import { ServicesSection } from "@/components/ServicesSection";
import { WhyUs } from "@/components/WhyUs";
import { CtaStrip } from "@/components/CtaStrip";
import { ServiceAreaMap } from "@/components/ServiceAreaMap";

export const metadata: Metadata = {
  title: "Digital Marketing Agency | Allen, TX | Knightly Digital Group",
  description:
    "Knightly Digital Group is Allen TX's local digital agency — custom software, Meta ads management, and social media posting for DFW businesses. Call (214) 555-0100.",
};

export default function AllenHome() {
  return (
    <>
      <Hero
        city="Allen, TX"
        topLine="Digital Solutions"
        headline="SOFTWARE & MARKETING"
        highlightWord="THAT GROW"
        subHeadline="YOUR BUSINESS"
        sub="Custom software, precision ad campaigns, and consistent social media — all from one Allen-based team that knows the DFW market."
        bgImage="https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=1600&q=80"
      />

      <ServicesSection />

      {/* Local intro strip */}
      <section className="bg-background border-y border-border py-16">
        <div className="max-w-7xl mx-auto px-5 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-xs tracking-[0.25em] font-bold uppercase text-muted-foreground mb-3">
              Based in Allen, TX
            </p>
            <h2 className="text-4xl font-black uppercase leading-tight mb-6">
              Your DFW Neighbor.<br />
              <span className="text-muted-foreground">Your Digital Team.</span>
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We&apos;re not a remote vendor — we&apos;re a Collin County team that understands what it takes to compete in the DFW market. From the Bethany Lakes corridor to the 121 business corridor, we work with Allen businesses every day.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              When you partner with Knightly Digital Group, you get a team that answers calls, knows your name, and is invested in seeing your business win.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-primary text-primary-foreground p-8">
              <p className="text-4xl font-black text-accent mb-2">DFW</p>
              <p className="text-xs tracking-wider uppercase text-primary-foreground/60">Metroplex Coverage</p>
            </div>
            <div className="bg-muted p-8">
              <p className="text-4xl font-black text-primary mb-2">Fast</p>
              <p className="text-xs tracking-wider uppercase text-muted-foreground">Turnaround Times</p>
            </div>
            <div className="bg-muted p-8">
              <p className="text-4xl font-black text-primary mb-2">Local</p>
              <p className="text-xs tracking-wider uppercase text-muted-foreground">Allen, TX Team</p>
            </div>
            <div className="bg-primary text-primary-foreground p-8">
              <p className="text-4xl font-black text-accent mb-2">Real</p>
              <p className="text-xs tracking-wider uppercase text-primary-foreground/60">Measurable Results</p>
            </div>
          </div>
        </div>
      </section>

      <WhyUs />
      <CtaStrip city="Allen" />
      <ServiceAreaMap />
    </>
  );
}
