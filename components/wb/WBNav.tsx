"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Mail, Menu, Phone, X } from "lucide-react";
import { WB_EMAIL, WB_EMAIL_HREF, WB_PHONE } from "@/lib/wb-site";

/**
 * WorkBench marketing nav: a slim contact bar (phone, email, log in) over
 * a plain white menu bar. The home is built at /wb; middleware rewrites
 * the site root to it, so all links point at "/".
 */
export const WB_HOME = "/";

const links = [
  { href: WB_HOME, label: "Home" },
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" },
];

export default function WBNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the phone menu on navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // The root is middleware-rewritten to /wb, so the client router can report
  // either path while on the home page.
  const isActive = (href: string) =>
    href === WB_HOME
      ? pathname === "/" || pathname === "/wb"
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 bg-white shadow-[0_1px_0_#E5E7EB]">
      {/* Contact bar */}
      <div className="hidden bg-[#0A1428] text-[13px] text-white/85 sm:block">
        <div className="mx-auto flex h-9 max-w-6xl items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-6">
            <a href={WB_PHONE.href} className="inline-flex items-center gap-2 font-semibold hover:text-white">
              <Phone className="h-3.5 w-3.5 text-[#FF8B33]" strokeWidth={2.25} aria-hidden />
              {WB_PHONE.display}
            </a>
            <a href={WB_EMAIL_HREF} className="inline-flex items-center gap-2 hover:text-white">
              <Mail className="h-3.5 w-3.5 text-[#FF8B33]" strokeWidth={2.25} aria-hidden />
              {WB_EMAIL}
            </a>
          </div>
          <Link href="/app/login" className="font-semibold hover:text-white">
            Log in to WorkBench
          </Link>
        </div>
      </div>

      {/* Menu bar */}
      <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between px-5 sm:px-8">
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

        <nav className="hidden items-center gap-7 sm:flex">
          {links.map((l) => {
            const active = isActive(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`wb-navlink text-[14.5px] transition-colors ${
                  active ? "wb-active font-bold text-[#0B57D8]" : "font-semibold text-gray-700 hover:text-gray-900"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
          <Link
            href="/apply"
            className="wb-btn rounded-md bg-[#0B57D8] px-5 py-2.5 text-[14px] font-bold text-white"
          >
            Get started
          </Link>
        </nav>

        {/* Phone: tap-to-call, the main action, and a menu */}
        <div className="flex shrink-0 items-center gap-2.5 sm:hidden">
          <a
            href={WB_PHONE.href}
            aria-label={`Call ${WB_PHONE.display}`}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 text-[#0B57D8]"
          >
            <Phone className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </a>
          <Link
            href="/apply"
            className="wb-btn whitespace-nowrap rounded-md bg-[#0B57D8] px-4 py-2 text-[13px] font-bold text-white"
          >
            Get started
          </Link>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 text-gray-700"
          >
            {open ? <X className="h-4 w-4" strokeWidth={2.25} /> : <Menu className="h-4 w-4" strokeWidth={2.25} />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-gray-200 bg-white sm:hidden">
          <ul className="px-5 py-2">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className={`block border-b border-gray-100 py-3 text-[15px] ${
                    isActive(l.href) ? "font-bold text-[#0B57D8]" : "font-semibold text-gray-800"
                  }`}
                >
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/app/login" className="block border-b border-gray-100 py-3 text-[15px] font-semibold text-gray-800">
                Log in
              </Link>
            </li>
            <li>
              <a href={WB_PHONE.href} className="flex items-center gap-2 py-3 text-[15px] font-semibold text-gray-800">
                <Phone className="h-4 w-4 text-[#F86A0A]" strokeWidth={2.25} aria-hidden />
                {WB_PHONE.display}
              </a>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
