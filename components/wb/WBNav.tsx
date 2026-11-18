"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, ChevronDown, Menu, Phone, X } from "lucide-react";
import { WB_PHONE } from "@/lib/wb-site";

/**
 * WorkBench marketing header (David 2026-11-18, round 3): one rounded white
 * bar floating just under the top of the page (Dotcom-style), with the
 * logo, the page links (Features, Compare and Resources open a menu), the
 * phone number (a pill), Log in and Get started. Frosted glass, link hovers
 * in WorkBench blue, a light sweep across Get started, and a Features menu
 * with a small real screenshot beside each feature (round 5). It tightens and gains a shadow once
 * the page scrolls. The current page gets an orange underline. On the phone
 * the links open in a rounded sheet under the bar. The home is built at
 * /wb; middleware rewrites the site root to it, so links point at "/".
 */
export const WB_HOME = "/";

type MenuItem = { href: string; label: string; sub?: string; thumb?: string };
type NavLink = { href: string; label: string; match?: string[]; wide?: boolean; menu?: MenuItem[] };

const links: NavLink[] = [
  {
    href: "/features",
    label: "Features",
    wide: true,
    menu: [
      { href: "/features/scheduling-dispatch", label: "Scheduling & dispatch", sub: "Calendar, crews, routes", thumb: "/screens/desktop-schedule.jpg" },
      { href: "/features/quotes-and-invoicing", label: "Quotes & invoicing", sub: "Signed quotes, one-click invoices", thumb: "/screens/desktop-quotes.jpg" },
      { href: "/features/payments", label: "Payments", sub: "Card and bank, one flat rate", thumb: "/screens/desktop-invoices.jpg" },
      { href: "/features/client-portal", label: "Client portal", sub: "Pay, approve, book, message", thumb: "/screens/desktop-jobs.jpg" },
      { href: "/features/time-tracking", label: "Time tracking", sub: "Clock-in, timesheets, labor cost", thumb: "/screens/mobile-timeclock.png" },
      { href: "/features/atlas", label: "Atlas assistant", sub: "Talk or type, it does the work", thumb: "/screens/mobile-atlas.png" },
      { href: "/features", label: "Every feature" },
    ],
  },
  { href: "/pricing", label: "Pricing" },
  { href: "/trades", label: "Trades" },
  {
    href: "/vs/jobber",
    label: "Compare",
    match: ["/vs", "/alternatives"],
    menu: [
      { href: "/vs/jobber", label: "WorkBench vs Jobber" },
      { href: "/vs/housecall-pro", label: "WorkBench vs Housecall Pro" },
      { href: "/vs/servicetitan", label: "WorkBench vs ServiceTitan" },
      { href: "/alternatives", label: "All alternatives" },
    ],
  },
  {
    href: "/help",
    label: "Resources",
    match: ["/help", "/tools", "/announcements"],
    menu: [
      { href: "/help", label: "Help Center", sub: "Step-by-step guides" },
      { href: "/tools", label: "Free tools", sub: "Invoice and estimate generators" },
      { href: "/announcements", label: "What's new", sub: "Every release, explained" },
      { href: "/book-a-call", label: "Book a setup call", sub: "Free, with a real person" },
    ],
  },
  { href: "/contact", label: "Contact" },
];

export default function WBNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Close the phone menu on navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isActive = (l: NavLink) => {
    const bases = [l.href, ...(l.match ?? []), ...(l.menu?.map((m) => m.href) ?? [])];
    return bases.some((b) => pathname === b || pathname.startsWith(`${b}/`));
  };

  return (
    <header className="sticky top-0 z-50 px-2 pt-2 sm:px-3 sm:pt-3">
      {/* frosted glass bar (round 5: no gradient edge) */}
      <div
        className={`mx-auto max-w-[1240px] rounded-2xl border border-white/70 bg-white/80 ring-1 ring-black/[0.06] backdrop-blur-xl backdrop-saturate-150 transition-shadow duration-300 ${
          scrolled ? "shadow-[0_18px_44px_-18px_rgba(10,20,40,0.35)]" : "shadow-[0_10px_34px_-20px_rgba(10,20,40,0.3)]"
        }`}
      >
        <div>
        <div className={`flex items-center gap-5 pl-4 pr-2.5 transition-all duration-300 sm:pl-6 ${scrolled ? "h-[62px]" : "h-[70px] lg:h-[78px]"}`}>
          <Link href={WB_HOME} className="flex shrink-0 items-center" aria-label="WorkBench FSM home">
            <Image
              src="/workbench-wordmark.png"
              alt="WorkBench FSM"
              width={1054}
              height={199}
              priority
              className={`w-auto transition-all duration-300 ${scrolled ? "h-[26px]" : "h-[28px] lg:h-[34px]"}`}
            />
          </Link>

          <nav className="ml-2 hidden h-full items-stretch lg:flex" aria-label="Primary">
            {links.map((l) => {
              const active = isActive(l);
              return (
                <div key={l.label} className="group relative flex items-stretch">
                  <Link
                    href={l.href}
                    aria-current={active && pathname === l.href ? "page" : undefined}
                    className={`wb-navlink relative my-3 inline-flex items-center gap-1 rounded-lg px-3 text-[15px] font-bold transition-colors xl:px-3.5 ${
                      active ? "text-[#0B57D8]" : "text-gray-700 hover:bg-[#F2F6FE] hover:text-[#0B57D8]"
                    }`}
                    data-active={active || undefined}
                  >
                    {l.label}
                    {l.menu && (
                      <ChevronDown className="h-3.5 w-3.5 text-gray-400 transition-transform group-hover:rotate-180" strokeWidth={2.5} aria-hidden />
                    )}
                  </Link>
                  {l.menu && (
                    <div className="invisible absolute left-0 top-full z-50 pt-2 opacity-0 transition-opacity duration-150 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                      <ul className={`rounded-2xl border border-gray-200 bg-white p-2 shadow-[0_24px_50px_-18px_rgba(10,20,40,0.35)] ${l.wide ? "grid w-[40rem] grid-cols-2 gap-1" : "w-[19rem]"}`}>
                        {l.menu.map((m) => (
                          <li key={m.href}>
                            <Link href={m.href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-[#F2F6FE]">
                              {m.thumb && (
                                <span className="relative h-11 w-16 flex-none overflow-hidden rounded-md bg-gray-100 ring-1 ring-gray-200">
                                  <Image src={m.thumb} alt="" fill sizes="64px" className="object-cover object-left-top" />
                                </span>
                              )}
                              <span>
                                <span className={`block text-[14.5px] font-bold ${m.sub ? "text-gray-900" : "text-[#0B57D8]"}`}>{m.label}</span>
                                {m.sub && <span className="block text-[13px] text-gray-500">{m.sub}</span>}
                              </span>
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

          <div className="ml-auto flex items-center gap-2">
            <a href={WB_PHONE.href} className="hidden items-center gap-1.5 rounded-full bg-[#F2F6FE] px-3.5 py-2 text-[14px] font-bold text-[#0B57D8] ring-1 ring-[#D9E6FC] transition-colors hover:bg-[#0B57D8] hover:text-white xl:inline-flex [&:hover_svg]:text-white">
              <Phone className="h-4 w-4 text-[#F86A0A]" strokeWidth={2.5} aria-hidden />
              {WB_PHONE.display}
            </a>
            <Link href="/app/login" className="hidden px-3 text-[14.5px] font-bold text-gray-700 hover:text-gray-900 sm:block">
              Log in
            </Link>
            <Link href="/apply" className="wb-pill wb-pill-orange wb-pill-sm wb-shine">
              Get started
              <ArrowRight className="hidden h-4 w-4 sm:block" strokeWidth={2.5} />
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
        </div>
      </div>

      {open && (
        <nav
          className="mx-auto mt-2 max-h-[calc(100dvh-96px)] max-w-[1240px] overflow-y-auto rounded-2xl border border-gray-200 bg-white px-5 py-2 shadow-[0_24px_50px_-18px_rgba(10,20,40,0.35)] lg:hidden"
          aria-label="Menu"
        >
          <ul>
            {links.map((l) => (
              <li key={l.label} className="border-b border-gray-100 last:border-0">
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
          </ul>
          <div className="grid grid-cols-2 gap-2.5 py-4">
            <Link href="/app/login" className="wb-pill wb-pill-outline">
              Log in
            </Link>
            <a href={WB_PHONE.href} className="wb-pill wb-pill-outline">
              <Phone className="h-4 w-4 text-[#F86A0A]" strokeWidth={2.5} aria-hidden />
              Call
            </a>
          </div>
        </nav>
      )}
    </header>
  );
}
