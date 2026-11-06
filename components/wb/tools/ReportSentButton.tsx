"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

/** The one button on /t/<token>/report: POSTs the report, then says so. */
export default function ReportSentButton({ token, already }: { token: string; already: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "done">(already ? "done" : "idle");
  async function report() {
    setState("busy");
    try {
      await fetch("/api/public/tools/email/view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, report: true }),
      });
    } catch {
      /* the page still says done; the next try is idempotent */
    }
    setState("done");
  }
  if (state === "done") {
    return (
      <p role="status" className="mt-5 rounded-xl bg-green-50 px-4 py-3 text-[14px] font-semibold text-green-800">
        Thanks. That sender can no longer email through the free tool.
      </p>
    );
  }
  return (
    <button type="button" onClick={() => void report()} disabled={state === "busy"} className="mt-5 inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-[14px] font-bold text-white hover:bg-gray-800 disabled:opacity-60">
      {state === "busy" && <Loader2 className="h-4 w-4 animate-spin" />}I didn&apos;t ask for this
    </button>
  );
}
