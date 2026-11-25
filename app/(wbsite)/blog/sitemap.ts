import type { MetadataRoute } from "next";
import { listPublishedPosts } from "@/lib/blog";
import { BLOG_PATH, blogPostPath } from "@/lib/blog-shared";

const BASE = "https://workbenchfsm.com";

/**
 * /blog/sitemap.xml: the blog's own sitemap, listed in robots.txt next to
 * the main one. Kept apart from app/sitemap.ts because posts come from the
 * database (a new one goes up every day), while the main sitemap is built
 * from code and checked offline by scripts/test-wb-site.ts.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await listPublishedPosts(5000).catch(() => []);
  return [
    { url: `${BASE}${BLOG_PATH}`, lastModified: posts[0]?.publishedAt, changeFrequency: "daily", priority: 0.7 },
    ...posts.map((p) => ({ url: `${BASE}${blogPostPath(p)}`, lastModified: p.updatedAt, changeFrequency: "monthly" as const, priority: 0.6 })),
  ];
}
