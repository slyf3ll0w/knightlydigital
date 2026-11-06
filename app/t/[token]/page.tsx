import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import DocPreview from "@/components/wb/tools/DocPreview";
import SentViewBeacon from "@/components/wb/tools/SentViewBeacon";
import { money, docTotals } from "@/lib/tool-doc";
import { loadSentDocument } from "@/lib/tool-send";
import { TOOLS, toolPath } from "@/lib/wb-tools";

/**
 * /t/<token> — the hosted copy of a document emailed from the free
 * generator (lib/tool-send.ts). What the client's "View invoice" button
 * opens: the document, a PDF, and a quiet line about where it was made.
 * Nothing is sold to the client here (David 2026-11-05: the pitch is the
 * sender's, on their tool page) — a clean invoice is the pitch. noindex;
 * robots disallows /t/.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const sent = await loadSentDocument((await params).token);
  const word = sent?.doc.kind === "estimate" ? "Estimate" : "Invoice";
  return {
    title: sent ? `${word} #${sent.doc.number} from ${sent.doc.business.name}` : "Document",
    robots: { index: false, follow: false },
  };
}

export default async function SentDocumentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sent = await loadSentDocument(token);
  if (!sent) notFound();
  const { doc } = sent;
  const isEstimate = doc.kind === "estimate";
  const word = isEstimate ? "Estimate" : "Invoice";
  const tool = TOOLS.find((t) => t.kind === doc.kind)!;
  const total = docTotals(doc).total;
  const due = doc.dueAt ? new Date(doc.dueAt + "T00:00:00") : null;
  const dueText = due && !Number.isNaN(due.getTime()) ? due.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : null;

  return (
    <main className="min-h-screen bg-[#F3F5F9] px-4 py-8 text-gray-900 sm:py-12">
      <SentViewBeacon token={token} />
      <div className="mx-auto w-full max-w-[760px]">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold text-gray-500">
              {word} #{doc.number} from
            </p>
            <h1 className="text-[22px] font-extrabold leading-tight text-gray-900 sm:text-[26px]">{doc.business.name}</h1>
            <p className="mt-1 text-[14px] text-gray-600">
              <span className="font-bold text-gray-900">{money(total)}</span>
              {dueText ? (isEstimate ? ` · good through ${dueText}` : ` · due ${dueText}`) : ""}
            </p>
          </div>
          <a href={`/t/${token}/pdf`} className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-4 py-2.5 text-[14px] font-bold text-white hover:bg-gray-800">
            <Download className="h-4 w-4" strokeWidth={2.5} />
            Download PDF
          </a>
        </header>

        <DocPreview doc={doc} logo={sent.hasLogo ? `/t/${token}/logo` : null} />

        <footer className="mt-8 space-y-2 text-center text-[12.5px] leading-relaxed text-gray-500">
          <p>
            Questions about this {word.toLowerCase()}? Reply to the email it came in, or reach {doc.business.name}
            {doc.business.phone ? ` at ${doc.business.phone}` : ""}.
          </p>
          <p>
            Made with the free {tool.noun} generator from{" "}
            <Link href={toolPath(tool)} className="font-semibold text-gray-700 underline underline-offset-2 hover:text-gray-900">
              WorkBench
            </Link>
            . Didn&apos;t expect this email?{" "}
            <Link href={`/t/${token}/report`} className="underline underline-offset-2 hover:text-gray-700">
              Report it
            </Link>
            .
          </p>
        </footer>
      </div>
    </main>
  );
}
