"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import Link from "next/link";

/**
 * In-app error boundary. A render error on any /app page used to fall all
 * the way through to app/global-error.tsx — a bare, un-themed "Try again"
 * page with no shell around it, which read as the old branding (David
 * 2026-10-02: "takes to the retry page which is the old branding"). This
 * one renders INSIDE the app layout, so the sidebar / tab bar and the
 * company's design system stay, styled like app/platform/not-found.tsx.
 * global-error remains the last resort for a crash in the root layout.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="card-ledger w-full max-w-md p-8 text-center">
        <h1 className="text-xl font-bold text-gray-900">Something went wrong</h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          This page hit an error. Nothing you saved was lost — try again, or head back to the
          dashboard. We&apos;ve been notified.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <button type="button" onClick={reset} className="btn-primary rounded-full px-4 py-2 text-sm font-semibold">
            Try again
          </button>
          <Link href="/app/dashboard" className="rounded-full bg-[#0A1428] px-4 py-2 text-sm font-semibold text-white">
            Back to the dashboard
          </Link>
        </div>
        {error.digest && <p className="mt-4 text-[11px] text-gray-400">Reference {error.digest}</p>}
      </div>
    </div>
  );
}
