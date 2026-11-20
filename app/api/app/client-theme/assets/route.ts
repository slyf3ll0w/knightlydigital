import { NextRequest, NextResponse } from "next/server";
import { checkFeature } from "@/lib/plan-gate";
import { getActor, isManager } from "@/lib/permissions";
import { reportError } from "@/lib/report-error";
import { THEME_ASSET, ThemeAssetError, deleteThemeAsset, listThemeAssets, saveThemeAsset } from "@/lib/client-theme-assets";

/**
 * Page designer photos (docs/plans/ai-portal-designer-2026-11-20.md, phase 5).
 * Managers only, Pro (page_designer).
 * GET — this company's photos, newest first, each with `inUse`.
 * POST multipart `file` — check, re-encode to WebP, store; answers the photo.
 * DELETE ?id= — remove a photo the published look and the draft don't use.
 */

async function guard() {
  const actor = await getActor();
  if (!actor) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  const gate = await checkFeature(actor.companyId, "page_designer");
  if (!gate.ok) return { error: gate.response } as const;
  if (!isManager(actor.role)) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;
  return { actor } as const;
}

function fail(err: unknown, what: string) {
  if (err instanceof ThemeAssetError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  reportError(`[theme-assets] ${what} failed:`, err);
  return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
}

export async function GET() {
  const g = await guard();
  if ("error" in g) return g.error;
  try {
    const assets = await listThemeAssets(g.actor.companyId);
    return NextResponse.json({ assets, max: THEME_ASSET.maxPerCompany });
  } catch (err) {
    return fail(err, "list");
  }
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Pick a photo to upload." }, { status: 400 });
  if (file.size > THEME_ASSET.maxInputBytes) return NextResponse.json({ error: "That photo is too big. Keep it under 15 MB.", code: "TOO_BIG" }, { status: 413 });
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const asset = await saveThemeAsset(g.actor.companyId, bytes, file.type);
    return NextResponse.json({ ...asset, inUse: null }, { status: 201 });
  } catch (err) {
    return fail(err, "upload");
  }
}

export async function DELETE(req: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Which photo?" }, { status: 400 });
  try {
    await deleteThemeAsset(g.actor.companyId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err, "delete");
  }
}
