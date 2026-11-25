import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSuperadmin } from "@/lib/superadmin";
import { logConsoleAction } from "@/lib/console-audit";
import { deletePost, editPost, publishPost, setPostStatus } from "@/lib/blog";
import { textToBlocks } from "@/lib/blog-shared";

/**
 * Console → Blog, one post.
 *   PATCH { title?, summary?, tag?, slug?, body? }   — save an edit (body is the plain-text format in lib/blog-shared.ts)
 *   PATCH { action: "queue" | "next" | "pull" | "publish" }
 *   DELETE                                          — gone for good (only posts that never went up)
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getSuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const row = await prisma.blogPost.findUnique({ where: { id }, select: { id: true, slug: true, status: true } });
  if (!row) return NextResponse.json({ error: "Post not found." }, { status: 404 });

  if (typeof body.action === "string") {
    let r: { ok: true } | { ok: false; error: string };
    switch (body.action) {
      case "queue":
        r = await setPostStatus(id, "QUEUED");
        break;
      case "next":
        r = await setPostStatus(id, "QUEUED", { front: true });
        break;
      case "pull":
        r = await setPostStatus(id, "PULLED");
        break;
      case "publish": {
        if (row.status !== "QUEUED") {
          const q = await setPostStatus(id, "QUEUED");
          if (!q.ok) return NextResponse.json({ error: q.error }, { status: 409 });
        }
        r = (await publishPost(id)) ? { ok: true } : { ok: false, error: "It was already published or moved." };
        break;
      }
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
    logConsoleAction(admin, `blog-${body.action}`, { detail: r.ok ? row.slug : `${row.slug}: ${r.error}` });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

  const str = (k: string, max: number) => (typeof body[k] === "string" ? (body[k] as string).trim().slice(0, max) : undefined);
  const r = await editPost(id, {
    title: str("title", 140),
    summary: str("summary", 400),
    tag: str("tag", 60),
    slug: str("slug", 80),
    blocks: typeof body.body === "string" ? textToBlocks(body.body.slice(0, 60_000)) : undefined,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  logConsoleAction(admin, "blog-edit", { detail: row.slug });
  return NextResponse.json(r);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getSuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const row = await prisma.blogPost.findUnique({ where: { id }, select: { slug: true, publishedAt: true, status: true } });
  if (!row) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  if (row.status === "PUBLISHED") return NextResponse.json({ error: "Take it off the site first (Pull), then delete it." }, { status: 409 });
  await deletePost(id);
  logConsoleAction(admin, "blog-delete", { detail: row.slug });
  return NextResponse.json({ ok: true });
}
