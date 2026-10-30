import { prisma } from "@/lib/db";

/**
 * Gallery preview switch (David 2026-10-30): the Gallery plan's photo work
 * (phase A onward — estimate photos on quotes, the new grid + viewer with
 * stages and client visibility) shows up ONLY for test accounts
 * (Company.isTest) until he calls it ready. Live accounts keep the job
 * photo uploader exactly as it was. `GALLERY_OPEN=1` on Railway opens it
 * to everyone; the plan gate (lib/plans.ts "gallery") then decides who
 * may use the Gallery-plan parts.
 */
export function galleryPreviewOpen(
  company: { isTest?: boolean | null },
  env: Record<string, string | undefined> = process.env
): boolean {
  if (env.GALLERY_OPEN === "1") return true;
  return Boolean(company.isTest);
}

export async function galleryPreviewFor(companyId: string): Promise<boolean> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { isTest: true } });
  return company ? galleryPreviewOpen(company) : false;
}
