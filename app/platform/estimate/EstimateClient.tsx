"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Calculator, Sparkles } from "lucide-react";
import PageTitle from "@/components/PageTitle";
import { EstimatorRunnerPanel, type RunnerEstimator } from "@/components/EstimatorRunner";
import { useAssistant } from "@/components/AssistantContext";
import { SECTION_HUES, hueInk } from "@/lib/section-colors";

export default function EstimateClient({ tools, manager }: { tools: RunnerEstimator[]; manager: boolean }) {
  const router = useRouter();
  const atlas = useAssistant();
  return (
    <div className="mx-auto max-w-2xl p-4 lg:p-8">
      <div className="flex items-center gap-3">
        <Link href="/app/quotes" className="hidden shrink-0 text-gray-400 hover:text-gray-600 lg:block">
          <ArrowLeft size={18} />
        </Link>
        <PageTitle section="quotes" icon={Calculator}>
          Estimate
        </PageTitle>
      </div>
      <p className="mb-5 mt-2 text-sm text-gray-500 lg:ml-8">Answer a tool&apos;s questions, show the number, then turn it into a quote in one tap. Plain math — no Atlas tokens.</p>

      <div className="card-ledger p-5">
        {tools.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-8 text-center">
            <span className="chip-tool flex h-11 w-11 items-center justify-center rounded-[12px]" style={{ backgroundColor: SECTION_HUES.quotes, color: hueInk(SECTION_HUES.quotes) }} aria-hidden>
              <Calculator size={20} strokeWidth={2.25} />
            </span>
            <p className="mt-3.5 text-sm font-semibold text-gray-900">No estimate tools yet</p>
            <p className="mt-1 max-w-sm text-sm text-gray-500">
              {manager ? `Tell ${atlas.name} how you price a kind of job and it builds one.` : "Ask a manager to set one up — then this page prices jobs in a few taps."}
            </p>
            {manager && atlas.available && (
              <button type="button" onClick={atlas.open} className="btn-primary mt-5 inline-flex">
                <Sparkles size={15} />
                Build one with {atlas.name}
              </button>
            )}
            {manager && (
              <Link href="/app/settings/estimators" className="mt-3 text-xs font-medium text-gray-600 underline-offset-2 hover:underline">
                Estimate tool settings
              </Link>
            )}
          </div>
        ) : (
          <EstimatorRunnerPanel estimators={tools} onClose={() => router.back()} closeLabel="Back" />
        )}
      </div>
    </div>
  );
}
