"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown, Menu, Phone, X } from "lucide-react";
import { WB_PHONE } from "@/lib/wb-site";
import { MARK_BAR, MARK_LEG_LEFT, MARK_LEG_RIGHT, MARK_ORANGE, MARK_ROUND, MARK_W, MARK_WHITE } from "@/lib/brand-mark";

/**
 * WorkBench marketing header (David 2026-11-18, round 3; "heavy" pass
 * 2026-11-19): one solid white bar floating just under the top of the page,
 * with the logo, the page links (Features, Compare and Resources open a
 * menu that eases in), the phone number as a person to call (navy disc +
 * "Talk to a person"; the blue pill read as AI-made), Log in and Get
 * started (no hover animation on the links: David 2026-11-19).
 * A Features menu shows a small real screenshot beside each feature. It
 * tightens once the page scrolls. The current page gets an orange underline. On the phone
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
    match: ["/help", "/tools", "/announcements", "/custom-software"],
    menu: [
      { href: "/help", label: "Help Center", sub: "Step-by-step guides" },
      { href: "/tools", label: "Free tools", sub: "Invoice and estimate generators" },
      { href: "/announcements", label: "What's new", sub: "Every release, explained" },
      { href: "/book-a-call", label: "Book a setup call", sub: "Free, with a real person" },
      { href: "/custom-software", label: "Custom software", sub: "Built around your business" },
    ],
  },
  { href: "/contact", label: "Contact" },
];

/** The immersive bar's color: WorkBench navy at the top of the page, easing
 *  into the classic WorkBench blue (#0065FC, the app icon's) by the bottom
 *  (David 2026-11-19). */
function barColor(t: number) {
  const from = [10, 20, 40];
  const to = [0, 101, 252];
  const e = t * t * (3 - 2 * t);
  const [r, g, b] = from.map((f, k) => Math.round(f + (to[k] - f) * e));
  return `rgb(${r}, ${g}, ${b})`;
}

export default function WBNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [menusShut, setMenusShut] = useState(false);
  const firstPath = useRef(true);
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  // 0 at the top of the page → 1 at the bottom (the immersive bar's color).
  const [depth, setDepth] = useState(0);

  // Close the phone menu on navigation.
  useEffect(() => {
    setOpen(false);
    // A dropdown link was clicked: the menu stays open while it has focus or
    // the pointer, so drop the focus and hold the menus shut until the
    // pointer leaves the bar (David 2026-11-19: the menu didn't go away).
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    (document.activeElement as HTMLElement | null)?.blur?.();
    setMenusShut(true);
  }, [pathname]);

  useEffect(() => {
    // Floats over the top of each hero; slides away while reading down the
    // page and comes back on the first scroll up, so it never sits on top
    // of what someone is reading (David round 6).
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 24);
      const room = document.documentElement.scrollHeight - window.innerHeight;
      setDepth(room > 0 ? Math.min(1, Math.max(0, y / room)) : 0);
      if (Math.abs(y - last) > 6) {
        setHidden(y > last && y > 160);
        last = y;
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The immersive header (home direction preview, David 2026-11-19: "redo
  // the header to something really cool"): transparent and full width on top
  // of the navy hero, white type; on scroll it draws in to a compact solid
  // bar that stays with you the whole way down (never hides) and shifts
  // from navy to WorkBench blue. Hover stays a color change only.
  // Every marketing page uses it (David 2026-11-19: "keep the header the
  // same everywhere"); every page opens on a navy hero for it to sit on.
  const immersive = true;
  // Transparent at the top only over a navy hero (WBHero, WBSplitHero, the
  // home hero, the public Help hero all mark themselves data-wb-hero); a
  // page that opens on white gets the solid bar from the first pixel, so the
  // white header can never vanish into a white page.
  const [darkTop, setDarkTop] = useState(true);
  useEffect(() => {
    const hero = document.querySelector("main [data-wb-hero], main .help-public > .help-hero");
    setDarkTop(!!hero && hero.getBoundingClientRect().top + window.scrollY < 24);
  }, [pathname]);
  const solid = scrolled || !darkTop;
  const t = (light: string, dark: string) => (immersive ? dark : light);

  const isActive = (l: NavLink) => {
    const bases = [l.href, ...(l.match ?? []), ...(l.menu?.map((m) => m.href) ?? [])];
    return bases.some((b) => pathname === b || pathname.startsWith(`${b}/`));
  };

  return (
    <header
      onFocusCapture={() => setHidden(false)}
      className={`fixed inset-x-0 top-0 z-50 transition-transform duration-300 px-2 pt-2 sm:px-3 sm:pt-3 ${hidden && !open && !immersive ? "-translate-y-[120%]" : "translate-y-0"}`}
    >
      <div
        className={
          immersive
            ? `mx-auto rounded-xl transition-[max-width,box-shadow] duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
                solid
                  ? "max-w-[1210px] bg-[#0A1428] shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_18px_40px_-18px_rgba(0,0,0,0.6)]"
                  : "max-w-[1280px] bg-transparent"
              }`
            : `mx-auto max-w-[1240px] rounded-xl bg-white transition-shadow duration-300 ${
                scrolled
                  ? "shadow-[0_0_0_1px_rgba(10,20,40,0.07),0_1px_2px_rgba(10,20,40,0.06),0_18px_40px_-18px_rgba(10,20,40,0.35)]"
                  : "shadow-[0_0_0_1px_rgba(10,20,40,0.06),0_1px_2px_rgba(10,20,40,0.05),0_12px_30px_-18px_rgba(10,20,40,0.28)]"
              }`
        }
        style={immersive && solid ? { backgroundColor: barColor(depth) } : undefined}
      >
        <div>
        <div className={`flex items-center gap-5 pl-4 pr-2.5 transition-all duration-300 sm:pl-6 ${scrolled ? "h-[62px]" : "h-[70px] lg:h-[78px]"}`}>
          <Link href={WB_HOME} className="flex shrink-0 items-center" aria-label="WorkBench FSM home">
            {immersive ? (
              // On the navy: the clean mark (white W and bench, orange legs)
              // beside the wordmark's lettering in white. Turning the whole
              // colored logo white would make its icon square a white block.
              <span className="flex items-center gap-2" aria-label="WorkBench FSM">
                <svg viewBox="0 0 1000 1000" className={`flex-none transition-all duration-300 ${scrolled ? "h-[28px] w-[28px]" : "h-[32px] w-[32px]"}`} aria-hidden>
                  {[
                    [MARK_W, MARK_WHITE],
                    [MARK_BAR, MARK_WHITE],
                    [MARK_LEG_LEFT, MARK_ORANGE],
                    [MARK_LEG_RIGHT, MARK_ORANGE],
                  ].map(([pts, fill]) => (
                    <polygon key={pts} points={pts} fill={fill} stroke={fill} strokeWidth={MARK_ROUND} strokeLinejoin="round" />
                  ))}
                </svg>
                <span
                  className="relative block overflow-hidden transition-all duration-300"
                  style={{ height: scrolled ? 24 : 28, width: ((scrolled ? 24 : 28) * 835) / 199 }}
                >
                  <Image
                    src="/workbench-wordmark.png"
                    alt=""
                    width={1054}
                    height={199}
                    priority
                    className="absolute top-0 h-full w-auto max-w-none brightness-0 invert"
                    style={{ left: -((scrolled ? 24 : 28) * 219) / 199 }}
                  />
                </span>
              </span>
            ) : (
              <Image
                src="/workbench-wordmark.png"
                alt="WorkBench FSM"
                width={1054}
                height={199}
                priority
                className={`w-auto transition-all duration-300 ${scrolled ? "h-[26px]" : "h-[28px] lg:h-[31px]"}`}
              />
            )}
          </Link>

          <nav className="relative ml-1 hidden h-full items-stretch lg:flex" aria-label="Primary">
            {links.map((l) => {
              const active = isActive(l);
              return (
                <div key={l.label} className="group relative flex items-stretch" onMouseLeave={() => setMenusShut(false)}>
                  <Link
                    href={l.href}
                    aria-current={active && pathname === l.href ? "page" : undefined}
                    className={`wb-navlink relative my-3 inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2.5 text-[15px] font-bold transition-colors xl:px-3 ${
                      active ? t("text-[#0B57D8]", "text-white") : t("text-gray-700 hover:text-[#0B57D8]", "text-white/80 hover:text-white")
                    }`}
                    data-active={active || undefined}
                  >
                    {l.label}
                    {l.menu && (
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform group-hover:rotate-180 ${t("text-gray-400", "text-white/50")}`} strokeWidth={2.5} aria-hidden />
                    )}
                  </Link>
                  {l.menu && (
                    <div className={`${menusShut ? "!invisible !opacity-0" : ""} invisible absolute left-0 top-full z-50 origin-top-left translate-y-1.5 scale-[0.98] pt-2 opacity-0 transition-[opacity,transform,visibility] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:scale-100 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100`}>
                      <ul className={`wb-navmenu rounded-xl bg-white p-2 ${l.wide ? "grid w-[40rem] grid-cols-2 gap-1" : "w-[19rem]"}`}>
                        {l.menu.map((m) => (
                          <li key={m.href}>
                            <Link href={m.href} className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[#F2F6FE]">
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

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <a href={WB_PHONE.href} className="group/ph hidden items-center gap-2.5 xl:flex">
              <span className={`flex h-9 w-9 items-center justify-center rounded-full ${t("bg-[#0A1428] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_4px_10px_-4px_rgba(10,20,40,0.5)]", "bg-white/12 ring-1 ring-white/15")}`}>
                <Phone className="h-[15px] w-[15px] fill-[#FF8B33] text-[#FF8B33]" strokeWidth={2} aria-hidden />
              </span>
              <span className="leading-tight">
                <span className={`block whitespace-nowrap text-[11.5px] font-semibold ${t("text-gray-500", "text-white/60")}`}>Talk to a person</span>
                <span className={`block whitespace-nowrap text-[15px] font-extrabold tabular-nums transition-colors ${t("text-gray-900 group-hover/ph:text-[#0B57D8]", "text-white group-hover/ph:text-[#FFB27A]")}`}>{WB_PHONE.display}</span>
              </span>
            </a>
            <span className={`mx-2 hidden h-8 w-px xl:block ${t("bg-gray-200", "bg-white/15")}`} aria-hidden />
            <Link href="/app/login" className={`hidden whitespace-nowrap px-2 text-[14.5px] font-bold transition-colors sm:block ${t("text-gray-700 hover:text-[#0B57D8]", "text-white/85 hover:text-white")}`}>
              Log in
            </Link>
            <Link href="/apply" className="wb-btn wb-pill wb-pill-orange wb-pill-sm">
              Get started
              <ArrowRight className="hidden h-4 w-4 sm:block" strokeWidth={2.5} />
            </Link>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={open ? "Close menu" : "Open menu"}
              className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors lg:hidden ${t("text-gray-800 hover:bg-gray-100", "text-white hover:bg-white/10")}`}
            >
              {open ? <X className="h-6 w-6" strokeWidth={2.25} /> : <Menu className="h-6 w-6" strokeWidth={2.25} />}
            </button>
          </div>
        </div>
        </div>
      </div>

      {open && (
        <nav
          className="wb-navmenu wb-drop-in mx-auto mt-2 max-h-[calc(100dvh-96px)] max-w-[1240px] overflow-y-auto rounded-xl bg-white px-5 py-2 lg:hidden"
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
