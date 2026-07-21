"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, X } from "lucide-react";
import { postJson } from "@/lib/safe-fetch";

/**
 * One-time nudge for new accounts: signup seeded a starter price book from
 * their industry — point them at it. Dismissing stamps Company.setupWizardAt
 * so it stays gone on every device.
 */
export default function DashboardSetupCard() {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);

  async function dismiss() {
    setHidden(true); // optimistic — worst case it reappears next visit
    await postJson("/api/app/setup/dismiss");
    router.refresh();
  }

  if (hidden) return null;
  return (
    <div className="anim-fade-up card-ledger relative mb-8 flex flex-wrap items-center gap-4 border-green-600/25 bg-green-50/40 p-5">
      <button
        type="button"
        onClick={dismiss}
        className="absolute right-3 top-3 text-gray-300 hover:text-gray-500"
        aria-label="Dismiss price book suggestion"
      >
        <X size={15} />
      </button>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100">
        <BookOpen size={19} className="text-green-700" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900">Your price book is ready</p>
        <p className="text-xs text-gray-500">
          We pre-loaded services for your industry. Set your prices once and quotes, jobs, and
          invoices fill themselves in.
        </p>
      </div>
      <Link
        href="/app/settings/products"
        className="flex shrink-0 items-center gap-1.5 rounded-full bg-green-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-600"
      >
        Review prices <ArrowRight size={14} />
      </Link>
    </div>
  );
}
