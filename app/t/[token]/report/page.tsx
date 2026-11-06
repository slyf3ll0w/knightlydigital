import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ReportSentButton from "@/components/wb/tools/ReportSentButton";
import { loadSentDocument } from "@/lib/tool-send";

/**
 * /t/<token>/report — a recipient says the emailed document wasn't asked
 * for. The click is a POST from a button, never the page load itself, so a
 * link scanner opening the URL can't block an innocent sender.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Report this email", robots: { index: false, follow: false } };

export default async function ReportSentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sent = await loadSentDocument(token);
  if (!sent) notFound();
  const word = sent.doc.kind === "estimate" ? "estimate" : "invoice";
  return (
    <main className="min-h-screen bg-[#F3F5F9] px-4 py-12 text-gray-900">
      <div className="mx-auto w-full max-w-[520px] rounded-2xl border border-gray-200 bg-white p-6 sm:p-8">
        <h1 className="text-[22px] font-extrabold">Didn&apos;t expect this {word}?</h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-gray-600">
          {sent.doc.business.name} emailed you {word} #{sent.doc.number} through WorkBench&apos;s free generator. If you never asked them for it,
          tell us here. We will stop that address from sending through the tool and look into it.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-gray-500">
          If you do know this business and just have a question about the {word}, reply to their email instead; reporting it won&apos;t reach them.
        </p>
        <ReportSentButton token={token} already={sent.reported} />
      </div>
    </main>
  );
}
