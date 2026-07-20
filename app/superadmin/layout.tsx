import Link from "next/link";
import { requireSuperadminPage } from "@/lib/superadmin";

/**
 * Platform-owner shell — deliberately plain and separate from the tenant app:
 * a thin top bar, no tenant branding, no sidebar. Everything under /superadmin
 * is Streamflaire-internal.
 */
export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuperadminPage();
  return (
    <div className="min-h-screen bg-stone-950 text-stone-100">
      <header className="border-b border-stone-800 bg-stone-900">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
          <span className="text-sm font-bold tracking-wide text-white">
            WORKBENCH <span className="text-orange-500">PLATFORM</span>
          </span>
          <nav className="flex items-center gap-4 text-sm text-stone-300">
            <Link href="/superadmin" className="hover:text-white">
              Profitability
            </Link>
            <Link href="/superadmin/finix" className="hover:text-white">
              Finix import
            </Link>
          </nav>
          <span className="ml-auto text-xs text-stone-500">{user.email}</span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
