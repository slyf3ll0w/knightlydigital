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
    heading: "Features",
    links: [
      { label: "Scheduling & dispatch", href: "/features/scheduling-dispatch" },
      { label: "Quotes & invoicing", href: "/features/quotes-and-invoicing" },
      { label: "Payments", href: "/features/payments" },
      { label: "Client portal", href: "/features/client-portal" },
      { label: "Time tracking", href: "/features/time-tracking" },
      { label: "Atlas", href: "/features/atlas" },
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
    heading: "Company",
    links: [
      { label: "Get started", href: "/apply" },
      { label: "Log in", href: "/app/login" },
      { label: "Contact", href: "/contact" },
      { label: "Streamflaire", href: "https://streamflaire.com", external: true },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Registering for texting", href: "/texting-registration" },
    ],
  },
];

export default function WBFooter() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[minmax(240px,1.2fr)_repeat(4,minmax(0,1fr))] lg:gap-10">
        <div className="max-w-xs">
          <Image
            src="/workbench-logo.png"
            alt="WorkBench"
            width={1714}
            height={285}
            className="h-6 w-auto"
          />
          <p className="mt-5 text-[14px] leading-relaxed text-gray-500">
            Field service management software for home-service companies.
            Free for the whole team, funded by payment processing.
          </p>
          <div className="mt-6 space-y-2 text-[14px] font-semibold text-gray-800">
            <a href={WB_PHONE.href} className="block hover:text-[#0B57D8]">
              {WB_PHONE.display}
            </a>
            <a href={WB_EMAIL_HREF} className="block hover:text-[#0B57D8]">
              {WB_EMAIL}
            </a>
          </div>
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener"
            aria-label="Download WorkBench on the App Store"
            className="mt-6 inline-block transition-opacity hover:opacity-80"
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
            <p className="text-[13.5px] font-bold text-gray-900">{col.heading}</p>
            <ul className="mt-4 space-y-2.5 text-[14px] text-gray-500">
              {col.links.map((l) =>
                l.external ? (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      {...(l.href.startsWith("http") ? { target: "_blank", rel: "noopener" } : {})}
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
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-5 py-5 sm:px-8">
          <p className="text-[13px] text-gray-400">
            © 2026 WorkBench, by{" "}
            <a href="https://streamflaire.com" target="_blank" rel="noopener" className="hover:text-gray-600">
              Streamflaire
            </a>
          </p>
          <p className="text-[13px] text-gray-400">Allen, Texas</p>
        </div>
      </div>
    </footer>
  );
}
