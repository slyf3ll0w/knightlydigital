import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager, type Actor } from "@/lib/permissions";
import { checkFeature } from "@/lib/plan-gate";
import { reportError } from "@/lib/report-error";
import { ThemeError, type ThemeRowJson } from "@/lib/client-theme-store";
import { themePreviewLinks } from "@/lib/client-theme-requests";

/**
 * Shared by the Settings → Client pages routes (app/api/app/client-theme/*):
 * who may call them and how a refusal is shaped. Owners and admins only, and
 * the company must be on Pro (page_designer, 402 PLAN_REQUIRED otherwise).
 */
export async function themeActor(): Promise<{ actor: Actor } | { error: NextResponse }> {
  const actor = await getActor();
  if (!actor) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!isManager(actor.role)) return { error: NextResponse.json({ error: "Only owners and admins can change your client pages." }, { status: 403 }) };
  const gate = await checkFeature(actor.companyId, "page_designer");
  if (!gate.ok) return { error: gate.response };
  return { actor };
}

export function themeErrorResponse(err: unknown, where: string): NextResponse {
  if (err instanceof ThemeError) {
    return NextResponse.json({ error: err.message, code: err.code, problems: err.problems }, { status: err.status });
  }
  reportError(`[client-theme] ${where} failed`, err);
  return NextResponse.json({ error: "That didn't save. Try again in a moment." }, { status: 500 });
}

/** The company's booking items as the designer lists them (order, show/hide, words). */
export async function themeBookingItems(companyId: string) {
  const [items, company] = await Promise.all([
    prisma.bookingType.findMany({
      where: { companyId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, slug: true, description: true, isActive: true, showOnPage: true },
    }),
    prisma.company.findUnique({ where: { id: companyId }, select: { hubBookingTypeId: true } }),
  ]);
  return items.map((i) => ({ ...i, hubForm: i.id === company?.hubBookingTypeId }));
}

export type ThemeBookingItem = Awaited<ReturnType<typeof themeBookingItems>>[number];

/** Where a draft can be looked at: fixture portal + login, the real booking page and one form in owner preview. */
export function themePreviewPaths(draft: Pick<ThemeRowJson, "previewToken"> | null, slug: string, formSlug: string | null) {
  return themePreviewLinks(draft?.previewToken, slug, formSlug);
}
