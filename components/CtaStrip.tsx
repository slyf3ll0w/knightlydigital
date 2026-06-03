import Link from "next/link";

type CtaStripProps = {
  city?: string;
};

export function CtaStrip({ city = "Allen" }: CtaStripProps) {
  return (
    <section className="bg-accent">
      <div className="max-w-7xl mx-auto px-5 py-16 flex flex-col lg:flex-row items-center justify-between gap-8">
        <div>
          <p className="text-xs tracking-[0.25em] font-bold uppercase text-accent-foreground/60 mb-2">
            Ready to Move Forward?
          </p>
          <h2 className="text-3xl lg:text-4xl font-black uppercase text-accent-foreground leading-tight">
            Let&apos;s Build Something<br />
            <span className="text-accent-foreground/80">for {city}.</span>
          </h2>
        </div>
        <div className="flex flex-col sm:flex-row gap-4">
          <a
            href="tel:2145550100"
            className="border-2 border-accent-foreground/30 text-accent-foreground font-bold px-8 py-4 text-sm tracking-widest uppercase hover:bg-accent-foreground/10 transition-colors text-center"
          >
            (214) 555-0100
          </a>
          <Link
            href="/contact"
            className="bg-primary text-primary-foreground font-bold px-8 py-4 text-sm tracking-widest uppercase hover:bg-primary/85 transition-colors text-center"
          >
            Free Consultation
          </Link>
        </div>
      </div>
    </section>
  );
}
