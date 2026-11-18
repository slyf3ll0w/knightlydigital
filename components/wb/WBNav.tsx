"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, Menu, Phone, X } from "lucide-react";
import { WB_PHONE } from "@/lib/wb-site";

/**
 * WorkBench marketing header, built like a trade business's site: a navy
 * utility bar (the offer, the phone number, Help, Log in) that scrolls
 * away, then a solid white bar that sticks: logo, the page links (Features
 * and Compare open a menu), Book a call and Get started. The current page
 * gets an orange underline. On the phone the links fold into a sheet under
 * the bar. The home is built at /wb; middleware rewrites the site root to
 * it, so links point at "/".
 */
export const WB_HOME = "/";

type NavLink = { href: string; label: string; match?: string; menu?: { href: string; label: string; sub?: string }[] };

const links: NavLink[] = [
  {
    href: "/features",
    label: "Features",
    menu: [
      { href: "/features/scheduling-dispatch", label: "Scheduling & dispatch", sub: "Calendar, crews, routes" },
      { href: "/features/quotes-and-invoicing", label: "Quotes & invoicing", sub: "Signed quotes, one-click invoices" },
      { href: "/features/payments", label: "Payments", sub: "Card and bank, one flat rate" },
      { href: "/features/client-portal", label: "Client portal", sub: "Pay, approve, book, message" },
      { href: "/features/time-tracking", label: "Time tracking", sub: "Clock-in, timesheets, labor cost" },
      { href: "/features/atlas", label: "Atlas assistant", sub: "Talk or type, it does the work" },
      { href: "/features", label: "Every feature" },
    ],
  },
  { href: "/pricing", label: "Pricing" },
  { href: "/trades", label: "Trades" },
  {
    href: "/vs/jobber",
    label: "Compare",
    match: "/vs",
    menu: [
      { href: "/vs/jobber", label: "WorkBench vs Jobber" },
      { href: "/vs/housecall-pro", label: "WorkBench vs Housecall Pro" },
      { href: "/vs/servicetitan", label: "WorkBench vs ServiceTitan" },
      { href: "/alternatives", label: "All alternatives" },
    ],
  },
  { href: "/tools", label: "Free tools" },
  { href: "/contact", label: "Contact" },
];

/** `seats` comes from the server (lib/plans INCLUDED_SEATS), so the bar never
 *  reads an env var in the browser. */
export default function WBNav({ seats }: { seats: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Close the phone menu on navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isActive = (l: NavLink) => {
    const bases = [l.match ?? l.href, ...(l.menu?.map((m) => m.href) ?? [])];
    if (l.href === "/vs/jobber") bases.push("/alternatives");
    return bases.some((b) => pathname === b || pathname.startsWith(`${b}/`));
  };

  return (
    <>
      {/* Utility bar: scrolls away with the page. */}
      <div className="bg-[#0A1428] text-[13px] text-white/80">
        <div className="mx-auto flex h-9 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <p className="truncate">
            <span className="font-semibold text-white">Free for your first {seats} users.</span>
            <span className="hidden sm:inline"> Full access, no credit card, no trial clock.</span>
          </p>
          <div className="flex flex-none items-center gap-4">
            <a href={WB_PHONE.href} className="inline-flex items-center gap-1.5 font-semibold text-white hover:text-[#FFB27A]">
              <Phone className="h-3.5 w-3.5 text-[#FF8B33]" strokeWidth={2.5} aria-hidden />
              {WB_PHONE.display}
            </a>
            <span className="hidden h-3.5 w-px bg-white/25 sm:block" aria-hidden />
            <Link href="/help" className="hidden hover:text-white sm:block">
              Help Center
            </Link>
            <Link href="/app/login" className="hidden hover:text-white sm:block">
              Log in
            </Link>
          </div>
        </div>
      </div>

      <header
        className={`sticky top-0 z-50 border-b bg-white transition-shadow duration-200 ${
          scrolled ? "border-gray-200 shadow-[0_6px_24px_-12px_rgba(10,20,40,0.25)]" : "border-gray-200/80"
        }`}
      >
        <div className="mx-auto flex h-[68px] max-w-6xl items-center gap-6 px-5 sm:px-8 lg:h-[76px]">
          <Link href={WB_HOME} className="flex shrink-0 items-center" aria-label="WorkBench FSM home">
            <Image
              src="/workbench-wordmark.png"
              alt="WorkBench FSM"
              width={1054}
              height={199}
              priority
              className="h-[26px] w-auto lg:h-[30px]"
            />
          </Link>

          <nav className="hidden h-full items-stretch lg:flex" aria-label="Primary">
            {links.map((l) => {
              const active = isActive(l);
              return (
                <div key={l.href} className="group relative flex items-stretch">
                  <Link
                    href={l.href}
                    aria-current={active && pathname === l.href ? "page" : undefined}
                    className={`wb-navlink relative inline-flex items-center gap-1 px-3 text-[15px] font-semibold transition-colors xl:px-3.5 ${
                      active ? "text-gray-900" : "text-gray-600 hover:text-gray-900"
                    }`}
                    data-active={active || undefined}
                  >
                    {l.label}
                    {l.menu && (
                      <ChevronDown className="h-3.5 w-3.5 text-gray-400 transition-transform group-hover:rotate-180" strokeWidth={2.5} aria-hidden />
                    )}
                  </Link>
                  {l.menu && (
                    <div className="invisible absolute left-0 top-full z-50 pt-0 opacity-0 transition-opacity duration-150 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                      <ul className="w-[19rem] rounded-b-lg border border-t-0 border-gray-200 bg-white py-2 shadow-[0_18px_40px_-16px_rgba(10,20,40,0.3)]">
                        {l.menu.map((m) => (
                          <li key={m.href}>
                            <Link
                              href={m.href}
                              className={`block px-5 py-2.5 hover:bg-[#F5F7FA] ${m.sub ? "" : "border-t border-gray-100 mt-1 pt-3"}`}
                            >
                              <span className={`block text-[14.5px] font-bold ${m.sub ? "text-gray-900" : "text-[#0B57D8]"}`}>{m.label}</span>
                              {m.sub && <span className="block text-[13px] text-gray-500">{m.sub}</span>}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2.5">
            <span className="hidden xl:block">
              <Link href="/book-a-call" className="wb-pill wb-pill-outline wb-pill-sm">
                Book a call
              </Link>
            </span>
            <Link href="/apply" className="wb-pill wb-pill-primary wb-pill-sm">
              Get started
            </Link>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={open ? "Close menu" : "Open menu"}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-800 transition-colors hover:bg-gray-100 lg:hidden"
            >
              {open ? <X className="h-6 w-6" strokeWidth={2.25} /> : <Menu className="h-6 w-6" strokeWidth={2.25} />}
            </button>
          </div>
        </div>

        {open && (
          <nav className="max-h-[calc(100dvh-68px)] overflow-y-auto border-t border-gray-200 bg-white lg:hidden" aria-label="Menu">
            <ul className="mx-auto max-w-6xl px-5 py-3 sm:px-8">
              {links.map((l) => (
                <li key={l.href} className="border-b border-gray-100 last:border-0">
                  {l.menu ? (
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-center justify-between py-3.5 text-[16px] font-bold text-gray-900 [&::-webkit-details-marker]:hidden">
                        {l.label}
                        <ChevronDown className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" strokeWidth={2.5} />
                      </summary>
                      <ul className="pb-3">
                        {l.menu.map((m) => (
                          <li key={m.href}>
                            <Link href={m.href} className="block py-2 pl-3 text-[15px] font-semibold text-gray-600">
                              {m.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : (
                    <Link href={l.href} className="block py-3.5 text-[16px] font-bold text-gray-900">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
              <li className="border-b border-gray-100">
                <Link href="/help" className="block py-3.5 text-[16px] font-bold text-gray-900">
                  Help Center
                </Link>
              </li>
              <li className="grid grid-cols-2 gap-2.5 py-4">
                <Link href="/app/login" className="wb-pill wb-pill-outline">
                  Log in
                </Link>
                <Link href="/book-a-call" className="wb-pill wb-pill-outline">
                  Book a call
                </Link>
              </li>
            </ul>
          </nav>
        )}
      </header>
    </>
  );
}
