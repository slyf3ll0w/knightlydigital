import Link from "next/link";
import { requireSuperadminPage } from "@/lib/superadmin";

/**
 * Platform-owner shell in the WorkBench console look: dark rail header with
 * the brand mark on a white chamfer tile, graph-paper canvas, ledger cards.
 * Deliberately separate from any tenant's branding — this is Streamflaire's
 * own console over all of them.
 */
export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuperadminPage();
  return (
    <div className="app-ui bg-paper min-h-screen text-gray-900">
      <header className="bg-[#0A1428]">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5">
          <Link href="/superadmin" className="flex items-center gap-2.5">
            <span className="chamfer flex h-9 w-9 items-center justify-center bg-white p-1">
              <img src="/workbench-icon.png" alt="" className="h-full w-full object-contain" />
            </span>
            <span className="font-display text-sm font-bold tracking-wide text-white">
              WORKBENCH <span className="text-[#F86A0A]">PLATFORM</span>
            </span>
          </Link>
          <nav className="ml-4 flex items-center gap-4 text-sm text-blue-200/80">
            <Link href="/superadmin" className="hover:text-white">
              Profitability
            </Link>
            <Link href="/superadmin/finix" className="hover:text-white">
              Finix import
            </Link>
          </nav>
          <span className="ml-auto hidden text-xs text-blue-200/60 sm:block">{user.email}</span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
