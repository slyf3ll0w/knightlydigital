import Image from "next/image";
import Link from "next/link";
import { WB_HOME } from "./WBNav";

const APP_STORE_URL = "https://apps.apple.com/app/workbench-fsm/id6789991103";

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
    heading: "Get started",
    links: [
      { label: "Apply for access", href: "/apply" },
      { label: "Log in", href: "/app/login" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "Streamflaire", href: "https://streamflaire.com", external: true },
      { label: "info@streamflaire.com", href: "mailto:info@streamflaire.com", external: true },
    ],
  },
  {
    heading: "Policies",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
    ],
  },
];

export default function WBFooter() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[minmax(220px,1fr)_repeat(4,auto)] lg:gap-16">
        <div className="max-w-xs">
          <Image
            src="/workbench-logo.png"
            alt="WorkBench"
            width={1714}
            height={285}
            className="h-6 w-auto"
          />
          <p className="mt-4 text-[13px] leading-relaxed text-gray-500">
            Field service management for home-service teams. Free to run,
            fair when you get paid. A{" "}
            <a
              href="https://streamflaire.com"
              target="_blank"
              rel="noopener"
              className="font-semibold text-gray-600 hover:text-gray-900"
            >
              Streamflaire
            </a>{" "}
            product.
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
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
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
          <p className="text-[11.5px] text-gray-400">© 2026 WorkBench</p>
          <p className="text-[11.5px] text-gray-400">Dallas–Fort Worth, TX</p>
        </div>
      </div>
    </footer>
  );
}
