import { NextRequest, NextResponse } from "next/server";
import { getSuperadmin } from "@/lib/superadmin";
import { logConsoleAction } from "@/lib/console-audit";
import { saveBlogSettings, writeOnePost } from "@/lib/blog";

export const dynamic = "force-dynamic";
// "Write one now" waits on Sonnet (a minute or two)
export const maxDuration = 300;

/**
 * Console → Blog.
 *   PATCH { enabled?, publishHour?, queueTarget?, guidance? } — settings
 *   POST  { action: "write" }                                 — Sonnet writes one post now
 */
export async function PATCH(req: NextRequest) {
  const admin = await getSuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Parameters<typeof saveBlogSettings>[0] = {};
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if ("publishHour" in body) {
    const h = Number(body.publishHour);
    if (!Number.isInteger(h) || h < 0 || h > 23) return NextResponse.json({ error: "Pick an hour from 0 to 23." }, { status: 400 });
    patch.publishHour = h;
  }
  if ("queueTarget" in body) {
    const n = Number(body.queueTarget);
    if (!Number.isInteger(n) || n < 1 || n > 30) return NextResponse.json({ error: "Keep between 1 and 30 posts written ahead." }, { status: 400 });
    patch.queueTarget = n;
  }
  if ("guidance" in body) patch.guidance = typeof body.guidance === "string" ? body.guidance.trim().slice(0, 4000) || null : null;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  const s = await saveBlogSettings(patch);
  logConsoleAction(admin, "blog-settings", { detail: JSON.stringify({ ...patch, guidance: patch.guidance === undefined ? undefined : "(edited)" }) });
  return NextResponse.json({ ok: true, settings: s });
}

export async function POST(req: NextRequest) {
  const admin = await getSuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.action !== "write") return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  const r = await writeOnePost();
  logConsoleAction(admin, "blog-write", { detail: r.ok ? `${r.status}: ${r.slug}` : r.error });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
  return NextResponse.json(r);
}
