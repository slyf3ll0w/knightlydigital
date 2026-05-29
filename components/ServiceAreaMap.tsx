import Link from "next/link";
import { cities } from "@/lib/cities";

export function ServiceAreaMap() {
  return (
    <section className="bg-muted-patterned py-20">
      <div className="max-w-7xl mx-auto px-5">
        <div className="mb-12">
          <p className="text-xs tracking-[0.25em] font-bold uppercase text-muted-foreground mb-3">
            Where We Work
          </p>
          <h2 className="text-4xl font-black uppercase text-foreground">
            Serving the DFW<br />
            <span className="text-muted-foreground">Metroplex</span>
          </h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-px bg-border">
          {cities.map((city) => (
            <Link
              key={city.slug}
              href={city.slug === "allen-tx" ? "/" : `/${city.slug}`}
              className="bg-background px-5 py-4 flex flex-col gap-1 hover:bg-primary hover:text-primary-foreground transition-colors group"
            >
              <span className="font-bold text-sm">{city.name}</span>
              <span className="text-xs text-muted-foreground group-hover:text-primary-foreground/70 transition-colors">
                TX
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
