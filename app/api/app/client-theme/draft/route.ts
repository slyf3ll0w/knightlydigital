import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { themeSpecGuide } from "@/lib/client-theme-spec";
import { discardDraft, getThemeState, saveDraft, themeRowJson, themeStateJson } from "@/lib/client-theme-store";
import { themeActor, themeBookingItems, themeErrorResponse, themePreviewPaths } from "@/lib/client-theme-route";

/**
 * Settings → Brand & client pages → Client pages, the draft (AI page designer,
 * docs/plans/ai-portal-designer-2026-11-20.md). Owners/admins on Pro.
 *
 * GET    — published look, the draft, history, the allowed values (guide),
 *          this company's booking items and where to preview the draft.
 * PUT    — { patch, note?, replace? }: merged over the draft (or the
 *          published look) and checked; pieces that fail a rule come back in
 *          `problems` and are left out. Clients never see a draft.
 * DELETE — throw the draft away (the published look is untouched).
 */

async function previewFor(companyId: string, draft: { previewToken: string | null } | null) {
  const [company, items] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { slug: true } }),
    themeBookingItems(companyId),
  ]);
  const form = items.find((i) => i.isActive && i.showOnPage) ?? items.find((i) => i.isActive) ?? null;
  return { items, preview: themePreviewPaths(draft, company?.slug ?? "", form?.slug ?? null) };
}

export async function GET() {
  const who = await themeActor();
  if ("error" in who) return who.error;
  const state = themeStateJson(await getThemeState(who.actor.companyId));
  const { items, preview } = await previewFor(who.actor.companyId, state.draft);
  return NextResponse.json({ ...state, guide: themeSpecGuide(), items, preview });
}

export async function PUT(req: NextRequest) {
  const who = await themeActor();
  if ("error" in who) return who.error;
  const body = (await req.json().catch(() => null)) as { patch?: unknown; spec?: unknown; note?: unknown; replace?: unknown } | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Send { patch } as JSON." }, { status: 400 });
  const replace = body.replace === true;
  const patch = replace ? (body.spec ?? body.patch) : (body.patch ?? {});
  const note = typeof body.note === "string" ? body.note : body.note === null ? null : undefined;
  try {
    const saved = await saveDraft(who.actor.companyId, patch, { note, source: "app", userId: who.actor.id, replace });
    const draft = themeRowJson(saved.draft);
    const { preview } = await previewFor(who.actor.companyId, draft);
    return NextResponse.json({ draft, problems: saved.problems, ignored: saved.ignored, previewPath: saved.previewPath, preview });
  } catch (err) {
    return themeErrorResponse(err, "save draft");
  }
}

export async function DELETE() {
  const who = await themeActor();
  if ("error" in who) return who.error;
  try {
    await discardDraft(who.actor.companyId);
    return NextResponse.json({ success: true });
  } catch (err) {
    return themeErrorResponse(err, "discard draft");
  }
}
