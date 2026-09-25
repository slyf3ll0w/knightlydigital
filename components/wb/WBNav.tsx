"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, Phone, X } from "lucide-react";
import { WB_PHONE } from "@/lib/wb-site";

/**
 * WorkBench marketing nav: a floating white pill under the brand keel:
 * logo, a hairline, the page links (orange dot on the current one), then
 * Log in and the Get started pill. On the phone the links fold into a card
 * that drops out of the pill. The home is built at /wb; middleware rewrites
 * the site root to it, so all links point at "/".
 */
export const WB_HOME = "/";

const links = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/vs/jobber", label: "Compare", match: "/vs" },
  { href: "/contact", label: "Contact" },
];

export default function WBNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the phone menu on navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isActive = (href: string, match?: string) => {
    const base = match ?? href;
    return pathname === base || pathname.startsWith(`${base}/`);
  };

  return (
    <>
      <div className="wb-keel" aria-hidden />
      <header className="fixed inset-x-0 top-0 z-50 px-3 pt-4 sm:px-5 sm:pt-5">
        <div className="wb-navpill mx-auto flex h-14 max-w-5xl items-center rounded-full pl-4 pr-2 sm:pl-5">
          <Link href={WB_HOME} className="flex shrink-0 items-center" aria-label="WorkBench home">
            <Image
              src="/workbench-logo.png"
              alt="WorkBench"
              width={1714}
              height={285}
              priority
              className="h-[22px] w-auto sm:h-6"
            />
          </Link>

          <span className="mx-4 hidden h-6 w-px bg-gray-300 md:block" aria-hidden />

          <nav className="hidden items-center gap-0.5 md:flex" aria-label="Primary">
            {links.map((l) => {
              const active = isActive(l.href, l.match);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[14px] transition-colors ${
                    active ? "font-bold text-gray-900" : "font-semibold text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {active && <span className="h-1.5 w-1.5 rounded-full bg-[#F86A0A]" aria-hidden />}
                  {l.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <Link
              href="/app/login"
              className="hidden rounded-full px-3.5 py-2 text-[14px] font-semibold text-gray-600 transition-colors hover:text-gray-900 sm:block"
            >
              Log in
            </Link>
            <Link href="/apply" className="wb-pill wb-pill-primary wb-pill-sm">
              Get started
            </Link>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={open ? "Close menu" : "Open menu"}
              className="ml-1 flex h-10 w-10 items-center justify-center rounded-full text-gray-700 transition-colors hover:bg-gray-100 md:hidden"
            >
              {open ? <X className="h-5 w-5" strokeWidth={2.25} /> : <Menu className="h-5 w-5" strokeWidth={2.25} />}
            </button>
          </div>
        </div>

        {open && (
          <nav className="wb-navmenu mx-auto mt-2 max-w-5xl rounded-[1.25rem] bg-white p-2 md:hidden" aria-label="Menu">
            <ul>
              {links.map((l) => {
                const active = isActive(l.href, l.match);
                return (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className={`flex items-center gap-2.5 rounded-xl px-4 py-3 text-[15px] ${
                        active ? "bg-[#F6F8FB] font-bold text-gray-900" : "font-semibold text-gray-700"
                      }`}
                    >
                      {active && <span className="h-1.5 w-1.5 rounded-full bg-[#F86A0A]" aria-hidden />}
                      {l.label}
                    </Link>
                  </li>
                );
              })}
              <li className="sm:hidden">
                <Link href="/app/login" className="block rounded-xl px-4 py-3 text-[15px] font-semibold text-gray-700">
                  Log in
                </Link>
              </li>
              <li className="mt-1 border-t border-gray-100 pt-1">
                <a href={WB_PHONE.href} className="flex items-center gap-2.5 rounded-xl px-4 py-3 text-[15px] font-semibold text-gray-700">
                  <Phone className="h-4 w-4 text-[#F86A0A]" strokeWidth={2.25} aria-hidden />
                  {WB_PHONE.display}
                </a>
              </li>
            </ul>
          </nav>
        )}
      </header>
    </>
  );
}
