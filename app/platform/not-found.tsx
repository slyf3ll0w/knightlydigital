import Link from "next/link";

/**
 * In-app 404 — reached when a page calls notFound() for a record that is
 * gone (deleted from another tab, by a teammate, or by an Atlas card confirmed
 * while its page was open). Rendered inside the app layout, so the sidebar
 * stays and nobody lands on the bare framework 404.
 */
export default function AppNotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="card-ledger w-full max-w-md p-8 text-center">
        <h1 className="text-xl font-bold text-gray-900">That page is gone</h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          The record you were looking at no longer exists — it may have been deleted or
          moved. Nothing else was affected.
        </p>
        <Link
          href="/app/dashboard"
          className="mt-6 inline-block rounded-full bg-[#0A1428] px-4 py-2 text-sm font-semibold text-white"
        >
          Back to the dashboard
        </Link>
      </div>
    </div>
  );
}
