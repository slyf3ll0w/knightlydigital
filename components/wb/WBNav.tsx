"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Phone } from "lucide-react";
import { WB_PHONE } from "@/lib/wb-site";

/**
 * WorkBench marketing nav. The home is built at /wb; middleware rewrites
 * the site root to it, so all links point at "/".
 */
export const WB_HOME = "/";

const links = [
  { href: WB_HOME, label: "Home" },
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
];

export default function WBNav() {
  const pathname = usePathname();
  // The root is middleware-rewritten to /wb, so the client router can report
  // either path while on the home page.
  const isActive = (href: string) =>
    href === WB_HOME
      ? pathname === "/" || pathname === "/wb"
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-xl">
      {/* brand keel — blue into orange, like the wordmark */}
      <div
        className="h-[3px]"
        style={{ background: "linear-gradient(90deg, #0B57D8 0%, #0B57D8 55%, #F86A0A 100%)" }}
        aria-hidden
      />
      <div className="border-b border-gray-200">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link href={WB_HOME} className="flex min-w-0 items-center gap-3" aria-label="WorkBench home">
            <Image
              src="/workbench-logo.png"
              alt="WorkBench"
              width={1714}
              height={285}
              priority
              className="h-6 w-auto sm:h-7"
            />
            <span className="mt-1 hidden text-[10.5px] font-semibold uppercase tracking-[0.14em] text-gray-400 md:block">
              by Streamflaire
            </span>
          </Link>
          <nav className="hidden items-center gap-8 sm:flex">
            {links.map((l) => {
              const active = isActive(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`wb-navlink text-[14px] transition-colors ${
                    active
                      ? "wb-active font-bold text-[#0B57D8]"
                      : "font-semibold text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
            <a
              href={WB_PHONE.href}
              className="inline-flex items-center gap-2 text-[14px] font-semibold text-gray-700 transition-colors hover:text-[#0B57D8]"
            >
              <Phone className="h-4 w-4 text-[#F86A0A]" strokeWidth={2.25} aria-hidden />
              {WB_PHONE.display}
            </a>
            <Link
              href="/app/login"
              className="wb-navlink text-[14px] font-semibold text-gray-600 transition-colors hover:text-gray-900"
            >
              Log in
            </Link>
            <Link
              href="/apply"
              className="wb-btn-tool rounded-lg bg-[#0B57D8] px-5 py-2.5 text-[14px] font-bold text-white"
            >
              Get started
            </Link>
          </nav>
          {/* Mobile: log in + the essential action */}
          <div className="flex shrink-0 items-center gap-3 sm:hidden">
            <a
              href={WB_PHONE.href}
              aria-label={`Call ${WB_PHONE.display}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#0B57D8] ring-1 ring-inset ring-gray-200"
            >
              <Phone className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            </a>
            <Link
              href="/app/login"
              className="whitespace-nowrap text-[13px] font-semibold text-gray-600"
            >
              Log in
            </Link>
            <Link
              href="/apply"
              className="wb-btn-tool whitespace-nowrap rounded-lg bg-[#0B57D8] px-4 py-2 text-[13px] font-bold text-white"
            >
              Get started
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
