import { NextResponse } from "next/server";
import { pdfResponse } from "@/lib/pdf";
import { clientIp, limit } from "@/lib/rate-limit";
import { reportError } from "@/lib/report-error";
import { docReady, sanitizeToolDoc } from "@/lib/tool-doc";
import { parseLogoDataUrl } from "@/lib/tool-drafts";
import { renderToolDocPdf, toolPdfFilename } from "@/lib/tool-pdf";

export const runtime = "nodejs";

/**
 * POST /api/public/tools/pdf — the free invoice / estimate generator's
 * download. Renders the visitor's document with the same @react-pdf
 * builders the app uses for real invoices and quotes (lib/tool-pdf.ts), so
 * the free PDF is exactly what a WorkBench document looks like. No account,
 * no record: nothing is stored. Rate-limited per IP here and in middleware
 * ("tools").
 */
export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  if (ip !== "unknown" && !(await limit(`tools-pdf:${ip}`, 60, 60 * 60_000)).ok) {
    return NextResponse.json({ error: "That's a lot of PDFs. Try again in a bit." }, { status: 429 });
  }
  let body: { doc?: unknown; logo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const doc = sanitizeToolDoc(body.doc);
  if (!doc) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const ready = docReady(doc);
  if (!ready.ok) return NextResponse.json({ error: ready.reason }, { status: 400 });
  const logo = parseLogoDataUrl(body.logo);
  try {
    const buffer = await renderToolDocPdf(doc, logo ? { data: logo.data, format: logo.format } : null);
    return pdfResponse({ buffer, filename: toolPdfFilename(doc) });
  } catch (e) {
    reportError("[tools] pdf render failed", e);
    return NextResponse.json({ error: "The PDF didn't render. Try again." }, { status: 500 });
  }
}
