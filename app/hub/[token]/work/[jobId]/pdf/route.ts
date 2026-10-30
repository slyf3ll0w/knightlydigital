import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientMayOpenReport } from "@/lib/job-report";
import { jobReportPdf, pdfResponse } from "@/lib/pdf";

/**
 * GET — the client's PDF of their work completed report. The hub token is
 * the credential, same trust model as the hub page this sits under.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string; jobId: string }> }) {
  const { token, jobId } = await params;
  const contact = await prisma.contact.findUnique({ where: { hubToken: token }, select: { id: true, companyId: true } });
  if (!contact) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const job = await prisma.job.findFirst({ where: { id: jobId, contactId: contact.id, companyId: contact.companyId }, select: { status: true } });
  if (!job || !(await clientMayOpenReport(contact.companyId, job))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const pdf = await jobReportPdf({ id: jobId, contactId: contact.id });
  if (!pdf) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return pdfResponse(pdf);
}
