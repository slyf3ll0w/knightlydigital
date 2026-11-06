import { NextResponse } from "next/server";
import { pdfResponse } from "@/lib/pdf";
import { clientIp, limit } from "@/lib/rate-limit";
import { reportError } from "@/lib/report-error";
import { renderToolDocPdf, toolPdfFilename } from "@/lib/tool-pdf";
import { loadSentDocument, sentLogo } from "@/lib/tool-send";

export const runtime = "nodejs";

/** GET /t/<token>/pdf — the emailed document as a PDF, rendered from the stored JSON on request. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const ip = clientIp(req.headers);
  if (ip !== "unknown" && !(await limit(`tools-sent-pdf:${ip}`, 30, 60 * 60_000)).ok) {
    return NextResponse.json({ error: "That's a lot of PDFs. Try again in a bit." }, { status: 429 });
  }
  const { token } = await params;
  const sent = await loadSentDocument(token);
  if (!sent) return new NextResponse("Not found", { status: 404 });
  const logo = sent.hasLogo ? await sentLogo(token) : null;
  try {
    const buffer = await renderToolDocPdf(sent.doc, logo ? { data: logo.data, format: logo.mime === "image/png" ? "png" : "jpg" } : null);
    return pdfResponse({ buffer, filename: toolPdfFilename(sent.doc) });
  } catch (e) {
    reportError("[tools] sent pdf render failed", e);
    return NextResponse.json({ error: "The PDF didn't render. Try again." }, { status: 500 });
  }
}
