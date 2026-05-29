import Link from "next/link";
import { services } from "@/lib/services";

const icons = {
  "custom-software": (
    <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
      <line x1="12" y1="2" x2="12" y2="22" strokeOpacity="0.4" />
    </svg>
  ),
  "meta-ads-management": (
    <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  ),
  "social-media-posting": (
    <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  ),
};

type ServicesSectionProps = {
  citySlug?: string;
  cityName?: string;
};

export function ServicesSection({ citySlug, cityName }: ServicesSectionProps) {
  const prefix = citySlug && citySlug !== "allen-tx" ? `/${citySlug}` : "";

  return (
    <section className="bg-patterned py-24">
      <div className="max-w-7xl mx-auto px-5">
        <div className="mb-16">
          <p className="text-xs tracking-[0.25em] font-bold uppercase text-muted-foreground mb-3">
            What We Do
          </p>
          <h2 className="text-4xl lg:text-5xl font-black uppercase leading-tight">
            {cityName ? (
              <>
                <span className="text-primary">Digital Services</span>
                <br />
                <span className="text-muted-foreground text-2xl font-bold">Serving {cityName}, TX</span>
              </>
            ) : (
              <>
                <span className="text-primary">Three Pillars.</span>
                <br />
                <span className="text-muted-foreground">One Focused Team.</span>
              </>
            )}
          </h2>
        </div>

        <div className="flex flex-col gap-0">
          {services.map((s, i) => (
            <div
              key={s.slug}
              className={`flex flex-col lg:flex-row ${
                i % 2 === 1 ? "lg:flex-row-reverse" : ""
              } border border-border group hover:border-primary/30 transition-colors`}
            >
              {/* Number + Icon block */}
              <div className="lg:w-64 flex-shrink-0 bg-primary text-primary-foreground flex flex-col justify-center items-center p-10 gap-4">
                <span className="text-7xl font-black opacity-20 leading-none select-none">
                  0{i + 1}
                </span>
                <div className="text-primary-foreground/80">
                  {icons[s.slug as keyof typeof icons]}
                </div>
              </div>
              {/* Content */}
              <div className="flex-1 p-10 lg:p-14 flex flex-col justify-center bg-card">
                <h3 className="text-2xl font-black uppercase tracking-tight mb-4 text-foreground">
                  {s.name}
                </h3>
                <p className="text-muted-foreground leading-relaxed mb-6 max-w-xl">
                  {s.description}
                </p>
                <Link
                  href={`${prefix}/${s.slug}`}
                  className="self-start bg-primary text-primary-foreground font-bold px-6 py-3 text-xs tracking-widest uppercase hover:bg-primary/80 transition-colors"
                >
                  Learn More &rarr;
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
