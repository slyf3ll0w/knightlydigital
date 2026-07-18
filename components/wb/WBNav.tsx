"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * WorkBench marketing nav. The home is built at /wb; middleware rewrites
 * the site root to it, so all links point at "/".
 */
export const WB_HOME = "/";

const links = [
  { href: WB_HOME, label: "Product" },
  { href: "/pricing", label: "Pricing" },
];

export default function WBNav() {
  const pathname = usePathname();

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
          <Link href={WB_HOME} className="flex items-center gap-3" aria-label="WorkBench home">
            <Image
              src="/workbench-logo.png"
              alt="WorkBench"
              width={1714}
              height={285}
              priority
              className="h-7 w-auto"
            />
            <span className="mt-1 hidden text-[10.5px] font-semibold uppercase tracking-[0.14em] text-gray-400 md:block">
              by Streamflaire
            </span>
          </Link>
          <nav className="hidden items-center gap-8 sm:flex">
            {links.map((l) => {
              const active = pathname === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
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
            <Link
              href="/app/login"
              className="text-[14px] font-semibold text-gray-600 transition-colors hover:text-gray-900"
            >
              Log in
            </Link>
            <Link
              href="/apply"
              className="wb-btn-tool rounded-lg bg-[#0B57D8] px-5 py-2.5 text-[14px] font-bold text-white"
            >
              Apply for access
            </Link>
          </nav>
          {/* Mobile: log in + the essential action */}
          <div className="flex items-center gap-4 sm:hidden">
            <Link
              href="/app/login"
              className="text-[13px] font-semibold text-gray-600"
            >
              Log in
            </Link>
            <Link
              href="/apply"
              className="wb-btn-tool rounded-lg bg-[#0B57D8] px-4 py-2 text-[13px] font-bold text-white"
            >
              Apply
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
