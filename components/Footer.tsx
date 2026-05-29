import Link from "next/link";
import Image from "next/image";
import { services } from "@/lib/services";
import { cities } from "@/lib/cities";

export function Footer() {
  const featuredCities = cities.slice(0, 12);

  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="max-w-7xl mx-auto px-5 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 pb-12 border-b border-primary-foreground/15">

          {/* Brand */}
          <div className="md:col-span-1">
            <Image
              src="/logo.png"
              alt="Knightly Digital Group"
              width={220}
              height={54}
              className="h-12 w-auto object-contain brightness-0 invert mb-5"
            />
            <p className="text-sm text-primary-foreground/70 leading-relaxed">
              Equipping DFW businesses for digital victory through custom software, precision ad campaigns, and consistent social media.
            </p>
            <div className="mt-6 flex flex-col gap-2 text-sm text-primary-foreground/70">
              <a href="tel:2145550100" className="hover:text-primary-foreground transition-colors">
                (214) 555-0100
              </a>
              <a href="mailto:info@knightlydigital.com" className="hover:text-primary-foreground transition-colors">
                info@knightlydigital.com
              </a>
              <span>Allen, TX 75002</span>
            </div>
          </div>

          {/* Services */}
          <div>
            <h4 className="text-xs font-bold tracking-[0.15em] uppercase text-primary-foreground/50 mb-5">
              Services
            </h4>
            <ul className="flex flex-col gap-2.5">
              {services.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={`/${s.slug}`}
                    className="text-sm text-primary-foreground/70 hover:text-primary-foreground transition-colors"
                  >
                    {s.shortName}
                  </Link>
                </li>
              ))}
            </ul>
            <h4 className="text-xs font-bold tracking-[0.15em] uppercase text-primary-foreground/50 mt-8 mb-5">
              Company
            </h4>
            <ul className="flex flex-col gap-2.5">
              <li><Link href="/about" className="text-sm text-primary-foreground/70 hover:text-primary-foreground transition-colors">About Us</Link></li>
              <li><Link href="/contact" className="text-sm text-primary-foreground/70 hover:text-primary-foreground transition-colors">Contact</Link></li>
            </ul>
          </div>

          {/* Service Areas */}
          <div className="md:col-span-2">
            <h4 className="text-xs font-bold tracking-[0.15em] uppercase text-primary-foreground/50 mb-5">
              DFW Service Areas
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {featuredCities.map((city) => (
                <Link
                  key={city.slug}
                  href={city.slug === "allen-tx" ? "/" : `/${city.slug}`}
                  className="text-sm text-primary-foreground/70 hover:text-primary-foreground transition-colors"
                >
                  {city.name}
                </Link>
              ))}
              {cities.slice(12).map((city) => (
                <Link
                  key={city.slug}
                  href={`/${city.slug}`}
                  className="text-sm text-primary-foreground/70 hover:text-primary-foreground transition-colors"
                >
                  {city.name}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-primary-foreground/40">
          <p>© {new Date().getFullYear()} Knightly Digital Group. All rights reserved. Allen, TX</p>
          <p>Built for the DFW Metroplex</p>
        </div>
      </div>
    </footer>
  );
}
