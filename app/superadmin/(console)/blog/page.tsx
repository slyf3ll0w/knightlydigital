import { prisma } from "@/lib/db";
import { requireSuperadminPage } from "@/lib/superadmin";
import { claudeEnabled } from "@/lib/ai-claude";
import { getBlogSettings, postedToday, MAX_HELD } from "@/lib/blog";
import { blocksToText, blocksWordCount, queueDays, sanitizeBlocks, type BlogStatus } from "@/lib/blog-shared";
import BlogClient, { type BlogRow } from "./BlogClient";

export const dynamic = "force-dynamic";

/**
 * Console → Blog: workbenchfsm.com/blog. Settings (on/off, the hour, how
 * many posts to keep written ahead, standing notes for the writer), the
 * queue in publish order with the day each one goes up, held posts with
 * why, and what is live. lib/blog.ts does the work.
 */
export default async function ConsoleBlogPage() {
  await requireSuperadminPage();
  const now = new Date();
  const [settings, rows, today] = await Promise.all([
    getBlogSettings(),
    prisma.blogPost.findMany({ orderBy: [{ queuedAt: "asc" }], take: 400 }),
    postedToday(now),
  ]);

  const queued = rows.filter((r) => r.status === "QUEUED");
  const days = queueDays(queued.length, now, today);
  const dayOf = new Map(queued.map((r, i) => [r.id, days[i]]));

  const data: BlogRow[] = rows.map((r) => {
    const blocks = sanitizeBlocks(r.blocks);
    return {
      id: r.id,
      slug: r.slug,
      title: r.title,
      summary: r.summary,
      tag: r.tag,
      keyword: r.keyword,
      helpSlug: r.helpSlug,
      body: blocksToText(blocks),
      words: blocksWordCount(blocks),
      status: r.status as BlogStatus,
      heldReason: r.heldReason,
      goesUp: dayOf.get(r.id) ?? null,
      publishedAt: r.publishedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      editedAt: r.editedAt?.toISOString() ?? null,
      model: r.model,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
    };
  });
  data.sort((a, b) => {
    if (a.status === "PUBLISHED" && b.status === "PUBLISHED") return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
    return 0;
  });

  return (
    <BlogClient
      rows={data}
      settings={{ enabled: settings.enabled, publishHour: settings.publishHour, queueTarget: settings.queueTarget, guidance: settings.guidance ?? "" }}
      postedToday={today}
      aiReady={claudeEnabled()}
      maxHeld={MAX_HELD}
    />
  );
}
