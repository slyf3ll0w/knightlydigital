import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Hero } from "@/components/Hero";
import { ServicesSection } from "@/components/ServicesSection";
import { WhyUs } from "@/components/WhyUs";
import { CtaStrip } from "@/components/CtaStrip";
import { ServiceAreaMap } from "@/components/ServiceAreaMap";
import { getCityBySlug, getAllCitySlugs } from "@/lib/cities";

type Props = { params: Promise<{ city: string }> };

export async function generateStaticParams() {
  return getAllCitySlugs().map((slug) => ({ city: slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city: slug } = await params;
  const city = getCityBySlug(slug);
  if (!city) return {};
  return {
    title: `Digital Marketing Agency | ${city.name}, TX | Knightly Digital Group`,
    description: `Knightly Digital Group serves ${city.name}, TX — ${city.blurb}. Custom software, Meta ads, and social media posting for local businesses. Call (214) 555-0100.`,
  };
}

export default async function CityPage({ params }: Props) {
  const { city: slug } = await params;
  const city = getCityBySlug(slug);
  if (!city) notFound();

  return (
    <>
      <Hero
        city={`${city.name}, TX`}
        topLine="Digital Solutions"
        headline="SOFTWARE & MARKETING"
        highlightWord="FOR"
        subHeadline={city.name.toUpperCase()}
        sub={`Knightly Digital Group brings custom software, Meta ad management, and social media posting to businesses in ${city.name} — ${city.blurb}.`}
        bgImage="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1600&q=80"
      />

      <ServicesSection citySlug={slug} cityName={city.name} />

      {/* City-specific intro */}
      <section className="bg-background border-y border-border py-16">
        <div className="max-w-7xl mx-auto px-5 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-xs tracking-[0.25em] font-bold uppercase text-muted-foreground mb-3">
              Serving {city.name}, TX
            </p>
            <h2 className="text-4xl font-black uppercase leading-tight mb-6">
              Digital Growth<br />
              <span className="text-muted-foreground">for {city.name} Businesses.</span>
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {city.name} is {city.blurb}. Businesses here compete for a sophisticated, digitally-active customer base — and standing out requires more than a website.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Knightly Digital Group, based in nearby Allen, TX, brings the same high-performance software development, targeted Meta advertising, and consistent social media presence that grows DFW businesses month after month.
            </p>
          </div>
          <div className="bg-primary text-primary-foreground p-10">
            <p className="text-xs tracking-[0.2em] uppercase text-primary-foreground/50 mb-6">
              What {city.name} businesses get
            </p>
            <ul className="flex flex-col gap-4">
              {[
                `Custom software built for your ${city.name} operation`,
                `Meta ad campaigns targeting ${city.name} zip codes`,
                `Branded social content posted consistently`,
                "A single dedicated point of contact",
                "Monthly plain-English performance reports",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-primary-foreground/80">
                  <span className="text-accent mt-0.5 flex-shrink-0">▸</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <WhyUs />
      <CtaStrip city={city.name} />
      <ServiceAreaMap />
    </>
  );
}
