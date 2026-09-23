import Image from "next/image";
import Link from "next/link";
import { WB_HOME } from "./WBNav";
import { APP_STORE_URL, WB_EMAIL, WB_EMAIL_HREF, WB_PHONE } from "@/lib/wb-site";

const columns: {
  heading: string;
  links: { label: string; href: string; external?: boolean }[];
}[] = [
  {
    heading: "Product",
    links: [
      { label: "Home", href: WB_HOME },
      { label: "Features", href: "/features" },
      { label: "Pricing", href: "/pricing" },
      { label: "Roadmap", href: "/roadmap" },
      { label: "iPhone app", href: APP_STORE_URL, external: true },
    ],
  },
  {
    heading: "Compare",
    links: [
      { label: "vs. Jobber", href: "/vs/jobber" },
      { label: "vs. Housecall Pro", href: "/vs/housecall-pro" },
      { label: "vs. ServiceTitan", href: "/vs/servicetitan" },
    ],
  },
  {
    heading: "Account",
    links: [
      { label: "Get started", href: "/apply" },
      { label: "Log in", href: "/app/login" },
    ],
  },
  {
    heading: "Contact",
    links: [
      { label: WB_PHONE.display, href: WB_PHONE.href, external: true },
      { label: WB_EMAIL, href: WB_EMAIL_HREF, external: true },
      { label: "Contact page", href: "/contact" },
      { label: "Streamflaire", href: "https://streamflaire.com", external: true },
    ],
  },
  {
    heading: "Policies",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Registering for texting", href: "/texting-registration" },
    ],
  },
];

export default function WBFooter() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[minmax(220px,1fr)_repeat(5,auto)] lg:gap-12">
        <div className="max-w-xs">
          <Image
            src="/workbench-logo.png"
            alt="WorkBench"
            width={1714}
            height={285}
            className="h-6 w-auto"
          />
          <p className="mt-4 text-[13.5px] leading-relaxed text-gray-500">
            Field service management software for home-service companies.
            Free to use, funded by payment processing. Built by{" "}
            <a
              href="https://streamflaire.com"
              target="_blank"
              rel="noopener"
              className="font-semibold text-gray-600 hover:text-gray-900"
            >
              Streamflaire
            </a>
            .
          </p>
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener"
            aria-label="Download WorkBench on the App Store"
            className="mt-5 inline-block transition-opacity hover:opacity-80"
          >
            <Image
              src="/app-store-badge.svg"
              alt="Download on the App Store"
              width={120}
              height={40}
              unoptimized
              className="h-10 w-auto"
            />
          </a>
        </div>
        {columns.map((col) => (
          <div key={col.heading}>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
              {col.heading}
            </p>
            <ul className="mt-3 space-y-2 text-[13.5px] text-gray-600">
              {col.links.map((l) =>
                l.external ? (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      {...(l.href.startsWith("http")
                        ? { target: "_blank", rel: "noopener" }
                        : {})}
                      className="hover:text-gray-900"
                    >
                      {l.label}
                    </a>
                  </li>
                ) : (
                  <li key={l.label}>
                    <Link href={l.href} className="hover:text-gray-900">
                      {l.label}
                    </Link>
                  </li>
                )
              )}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-gray-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <p className="text-[12px] text-gray-400">© 2026 WorkBench</p>
          <p className="text-[12px] text-gray-400">Dallas–Fort Worth, TX</p>
        </div>
      </div>
    </footer>
  );
}
