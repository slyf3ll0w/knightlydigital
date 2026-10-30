import { NextRequest, NextResponse } from "next/server";
import { getActor, jobScope } from "@/lib/permissions";
import { galleryStateFor } from "@/lib/gallery-preview";
import { jobReportPdf, pdfResponse } from "@/lib/pdf";

/** GET — the work completed report as a PDF (staff side, job scope). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { open } = await galleryStateFor(actor.companyId);
  if (!open) return NextResponse.json({ error: "The work report is part of the Gallery plan." }, { status: 402 });
  const { id } = await params;
  const pdf = await jobReportPdf({ id, companyId: actor.companyId, ...jobScope(actor) });
  if (!pdf) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  return pdfResponse(pdf);
}
