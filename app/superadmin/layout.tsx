import Image from "next/image";
import Link from "next/link";
import { requireSuperadminPage } from "@/lib/superadmin";

/**
 * Platform-owner shell in the WorkBench MARKETING site's language (WBNav's
 * cousin): the blue→orange brand keel, white header with the wordmark and a
 * "Platform console" tag, orange-underline nav links, rounded white cards on
 * a plain canvas. Deliberately not the tenant app's dark-rail console look.
 */
export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuperadminPage();
  return (
    <div className="wb-site min-h-screen bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-xl">
        {/* brand keel — blue into orange, like the wordmark */}
        <div
          className="h-[3px]"
          style={{ background: "linear-gradient(90deg, #0B57D8 0%, #0B57D8 55%, #F86A0A 100%)" }}
          aria-hidden
        />
        <div className="border-b border-gray-200">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
            <Link href="/superadmin" className="flex items-center gap-3" aria-label="Platform console">
              <Image
                src="/workbench-logo.png"
                alt="WorkBench"
                width={1714}
                height={285}
                priority
                className="h-7 w-auto"
              />
              <span className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-gray-400">
                Platform console
              </span>
            </Link>
            <nav className="flex items-center gap-8">
              <Link
                href="/superadmin"
                className="wb-navlink text-[14px] font-semibold text-gray-600 transition-colors hover:text-gray-900"
              >
                Profitability
              </Link>
              <Link
                href="/superadmin/finix"
                className="wb-navlink text-[14px] font-semibold text-gray-600 transition-colors hover:text-gray-900"
              >
                Finix import
              </Link>
              <span className="hidden text-[12px] font-medium text-gray-400 md:block">
                {user.email}
              </span>
            </nav>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">{children}</main>
    </div>
  );
}
