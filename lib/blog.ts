import { Prisma, type BlogPost, type BlogSettings } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { TRADES } from "@/lib/wb-trades";
import { writeBlogPost } from "@/lib/blog-writer";
import {
  BLOG_PATH,
  BLOG_TOPICS,
  blogClock,
  blogPostPath,
  postDue,
  postProblems,
  sanitizeBlocks,
  slugify,
  type BlogBlock,
  type BlogStatus,
} from "@/lib/blog-shared";

/**
 * The blog at workbenchfsm.com/blog, server half (David 2026-11-25). Every
 * write to BlogPost / BlogSettings goes through here.
 *
 *   hourly cron ─ runBlogPublish: once the day's hour has come (Chicago),
 *                 and nothing went up today, the oldest QUEUED post goes up
 *               ─ runBlogWrite: while fewer than queueTarget posts wait,
 *                 Sonnet writes ONE more (one per tick bounds time and cost)
 *   Console → Blog: settings, the queue, edit / pull / post next / publish now
 *
 * A written post that fails postProblems (a WorkBench price, a real
 * customer's name, too short...) is saved as HELD: it never goes up on its
 * own, and a person can fix it and put it in the queue. Held posts don't
 * count toward the queue, and writing stops while MAX_HELD are waiting, so a
 * bad run of drafts can't keep spending.
 */

export const MAX_HELD = 5;
const SETTINGS_ID = "default";

export type PublicPost = {
  slug: string;
  title: string;
  summary: string;
  tag: string;
  blocks: BlogBlock[];
  helpSlug: string | null;
  publishedAt: Date;
  updatedAt: Date;
};

export async function getBlogSettings(): Promise<BlogSettings> {
  return prisma.blogSettings.upsert({ where: { id: SETTINGS_ID }, create: { id: SETTINGS_ID }, update: {} });
}

export async function saveBlogSettings(patch: Partial<Pick<BlogSettings, "enabled" | "publishHour" | "queueTarget" | "guidance">>): Promise<BlogSettings> {
  return prisma.blogSettings.upsert({ where: { id: SETTINGS_ID }, create: { id: SETTINGS_ID, ...patch }, update: patch });
}

function toPublic(p: BlogPost): PublicPost {
  return {
    slug: p.slug,
    title: p.title,
    summary: p.summary,
    tag: p.tag,
    blocks: sanitizeBlocks(p.blocks),
    helpSlug: p.helpSlug,
    publishedAt: p.publishedAt ?? p.createdAt,
    updatedAt: p.editedAt ?? p.publishedAt ?? p.createdAt,
  };
}

/** Published posts, newest first. */
export async function listPublishedPosts(take = 200): Promise<PublicPost[]> {
  const rows = await prisma.blogPost.findMany({ where: { status: "PUBLISHED" }, orderBy: { publishedAt: "desc" }, take });
  return rows.map(toPublic);
}

/** A published post by slug, or any post when `preview` (Console preview, superadmin only). */
export async function findPost(slug: string, preview = false): Promise<(PublicPost & { status: BlogStatus }) | null> {
  const row = await prisma.blogPost.findUnique({ where: { slug } });
  if (!row || (!preview && row.status !== "PUBLISHED")) return null;
  return { ...toPublic(row), status: row.status as BlogStatus };
}

/** The published posts on either side of one (for the older / newer links). */
export async function neighborPosts(publishedAt: Date): Promise<{ older: PublicPost | null; newer: PublicPost | null }> {
  const [older, newer] = await Promise.all([
    prisma.blogPost.findFirst({ where: { status: "PUBLISHED", publishedAt: { lt: publishedAt } }, orderBy: { publishedAt: "desc" } }),
    prisma.blogPost.findFirst({ where: { status: "PUBLISHED", publishedAt: { gt: publishedAt } }, orderBy: { publishedAt: "asc" } }),
  ]);
  return { older: older ? toPublic(older) : null, newer: newer ? toPublic(newer) : null };
}

function refreshPages(slug?: string) {
  try {
    revalidatePath(BLOG_PATH);
    if (slug) revalidatePath(blogPostPath({ slug }));
  } catch {
    // outside a request (a script): nothing cached to refresh
  }
}

/** A slug no other post has: the wanted one, else -2, -3... */
async function freeSlug(wanted: string, exceptId?: string): Promise<string> {
  const base = slugify(wanted) || "post";
  for (let n = 1; n < 50; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const hit = await prisma.blogPost.findUnique({ where: { slug }, select: { id: true } });
    if (!hit || hit.id === exceptId) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

// ── Publishing ──────────────────────────────────────────────────────────────

async function lastPublishedAt(): Promise<Date | null> {
  const last = await prisma.blogPost.findFirst({ where: { status: "PUBLISHED" }, orderBy: { publishedAt: "desc" }, select: { publishedAt: true } });
  return last?.publishedAt ?? null;
}

/** Put one post up now. The status check in the WHERE makes it safe against a racing cron tick. */
export async function publishPost(id: string, now: Date = new Date()): Promise<boolean> {
  const r = await prisma.blogPost.updateMany({ where: { id, status: "QUEUED" }, data: { status: "PUBLISHED", publishedAt: now } });
  if (r.count === 1) {
    const p = await prisma.blogPost.findUnique({ where: { id }, select: { slug: true } });
    refreshPages(p?.slug);
  }
  return r.count === 1;
}

/** Cron: the day's post, when it is due. */
export async function runBlogPublish(now: Date): Promise<{ published: string | null; reason?: string }> {
  const s = await getBlogSettings();
  if (!s.enabled) return { published: null, reason: "off" };
  if (!postDue(now, s.publishHour, await lastPublishedAt())) return { published: null, reason: "not due" };
  const next = await prisma.blogPost.findFirst({ where: { status: "QUEUED" }, orderBy: { queuedAt: "asc" }, select: { id: true, slug: true } });
  if (!next) return { published: null, reason: "queue empty" };
  return { published: (await publishPost(next.id, now)) ? next.slug : null };
}

// ── Writing ─────────────────────────────────────────────────────────────────

export type WriteResult = { ok: true; id: string; slug: string; status: BlogStatus; problems: string[] } | { ok: false; error: string };

/** Sonnet writes one post into the queue (or HELD when it fails a check). */
export async function writeOnePost(): Promise<WriteResult> {
  const [settings, total, used] = await Promise.all([
    getBlogSettings(),
    prisma.blogPost.count(),
    prisma.blogPost.findMany({ where: { status: { not: "PULLED" } }, orderBy: { createdAt: "desc" }, take: 300, select: { title: true } }),
  ]);
  // Rotate the category and the trade on different cycles so the pairs vary.
  const topic = BLOG_TOPICS[total % BLOG_TOPICS.length];
  const tradeSlot = total % (TRADES.length + 2);
  const trade = tradeSlot < TRADES.length ? TRADES[tradeSlot].name : null;

  const r = await writeBlogPost({ topic, trade, usedTitles: used.map((u) => u.title), guidance: settings.guidance });
  if (!r.ok) return r;
  const p = r.post;
  const problems = postProblems(p);
  const status: BlogStatus = problems.length ? "HELD" : "QUEUED";
  try {
    const row = await prisma.blogPost.create({
      data: {
        slug: await freeSlug(p.slug),
        title: p.title,
        summary: p.summary,
        tag: topic,
        keyword: p.keyword,
        blocks: p.blocks as unknown as Prisma.InputJsonValue,
        helpSlug: p.helpSlug,
        status,
        heldReason: problems.length ? problems.join(" ") : null,
        source: "sonnet",
        model: p.model,
        tokensIn: p.tokensIn,
        tokensOut: p.tokensOut,
      },
      select: { id: true, slug: true },
    });
    return { ok: true, id: row.id, slug: row.slug, status, problems };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { ok: false, error: "Slug collision; the next run tries again." };
    throw err;
  }
}

/** Cron: top the queue up by one post when it is short. */
export async function runBlogWrite(): Promise<{ wrote: string | null; reason?: string; error?: string }> {
  const s = await getBlogSettings();
  if (!s.enabled) return { wrote: null, reason: "off" };
  const [queued, held] = await Promise.all([prisma.blogPost.count({ where: { status: "QUEUED" } }), prisma.blogPost.count({ where: { status: "HELD" } })]);
  if (queued >= s.queueTarget) return { wrote: null, reason: "queue full" };
  if (held >= MAX_HELD) return { wrote: null, reason: `${held} held posts waiting for review` };
  const r = await writeOnePost();
  // A failed write is not a cron failure: the next tick tries again.
  return r.ok ? { wrote: r.slug, ...(r.status === "HELD" ? { reason: "held" } : {}) } : { wrote: null, error: r.error };
}

// ── Console edits ───────────────────────────────────────────────────────────

export type PostEdit = { title?: string; summary?: string; tag?: string; blocks?: BlogBlock[]; slug?: string };

/** Save an edit. A HELD post that now passes the checks can be queued by the caller. */
export async function editPost(id: string, edit: PostEdit): Promise<{ ok: true; problems: string[] } | { ok: false; error: string }> {
  const row = await prisma.blogPost.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "Post not found." };
  const next = {
    title: edit.title?.trim() || row.title,
    summary: edit.summary?.trim() || row.summary,
    tag: edit.tag?.trim() || row.tag,
    blocks: edit.blocks ?? sanitizeBlocks(row.blocks),
  };
  if (next.blocks.length === 0) return { ok: false, error: "The post has no body." };
  // A live post keeps its address (links and search results point at it).
  const slug = edit.slug && row.status !== "PUBLISHED" ? await freeSlug(edit.slug, id) : row.slug;
  const problems = postProblems(next);
  await prisma.blogPost.update({
    where: { id },
    data: {
      ...next,
      blocks: next.blocks as unknown as Prisma.InputJsonValue,
      slug,
      editedAt: new Date(),
      heldReason: row.status === "HELD" ? problems.join(" ") || null : row.heldReason,
    },
  });
  if (row.status === "PUBLISHED") refreshPages(slug);
  return { ok: true, problems };
}

/** Move a post between states by hand. */
export async function setPostStatus(id: string, to: "QUEUED" | "PULLED", opts: { front?: boolean } = {}): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await prisma.blogPost.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "Post not found." };
  if (to === "QUEUED") {
    const problems = postProblems({ title: row.title, summary: row.summary, blocks: sanitizeBlocks(row.blocks) });
    if (problems.length) return { ok: false, error: `Fix this first: ${problems.join(" ")}` };
  }
  let queuedAt = row.queuedAt;
  if (to === "QUEUED") {
    if (opts.front) {
      const first = await prisma.blogPost.findFirst({ where: { status: "QUEUED", id: { not: id } }, orderBy: { queuedAt: "asc" }, select: { queuedAt: true } });
      queuedAt = new Date((first?.queuedAt ?? new Date()).getTime() - 1000);
    } else if (row.status !== "QUEUED") {
      queuedAt = new Date(); // back of the line
    }
  }
  await prisma.blogPost.update({
    where: { id },
    data: { status: to, queuedAt, heldReason: to === "QUEUED" ? null : row.heldReason, ...(row.status === "PUBLISHED" ? { publishedAt: null } : {}) },
  });
  if (row.status === "PUBLISHED") refreshPages(row.slug);
  return { ok: true };
}

export async function deletePost(id: string): Promise<void> {
  const row = await prisma.blogPost.delete({ where: { id }, select: { slug: true, status: true } }).catch(() => null);
  if (row?.status === "PUBLISHED") refreshPages(row.slug);
}

/** Whether today's post (Chicago) is already up. */
export async function postedToday(now: Date = new Date()): Promise<boolean> {
  const last = await lastPublishedAt();
  return last !== null && blogClock(last).day === blogClock(now).day;
}
