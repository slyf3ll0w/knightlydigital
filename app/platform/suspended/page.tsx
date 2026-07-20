import Link from "next/link";

/**
 * Landing page for suspended companies — deliberately does NOT use
 * requirePageActor (that would redirect right back here). Static content;
 * every API call from the app already dies 401 while suspended.
 */
export default function SuspendedPage() {
  return (
    <div className="bg-paper flex min-h-screen items-center justify-center px-4">
      <div className="card-ledger w-full max-w-md p-8 text-center">
        <img src="/workbench-logo.png" alt="WorkBench" className="mx-auto mb-6 h-9 w-auto" />
        <h1 className="text-xl font-bold text-gray-900">Account suspended</h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          This WorkBench account has been suspended. Your data is intact, but access is
          paused until our team reinstates the account.
        </p>
        <p className="mt-3 text-sm text-gray-600">
          If you believe this is a mistake, contact support at{" "}
          <a href="mailto:info@streamflaire.com" className="font-medium text-[#0B57D8] underline">
            info@streamflaire.com
          </a>
          .
        </p>
        <Link
          href="/api/auth/signout"
          className="chamfer mt-6 inline-block bg-[#0A1428] px-4 py-2 text-sm font-semibold text-white"
        >
          Sign out
        </Link>
      </div>
    </div>
  );
}
