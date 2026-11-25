import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";
import WBCta from "@/components/wb/WBCta";
import WBHero from "@/components/wb/WBHero";
import { listPublishedPosts } from "@/lib/blog";
import { blogDate, blogPostPath, blocksWordCount } from "@/lib/blog-shared";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Blog",
  description: "Practical advice for running a home-service business: pricing jobs, getting paid, winning work, running a crew and keeping customers.",
  alternates: { canonical: "https://workbenchfsm.com/blog" },
};

const CARD =
  "rounded-xl bg-white shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_18px_34px_-22px_rgba(10,20,40,0.35)]";

const minutes = (words: number) => Math.max(1, Math.round(words / 220));

/* The blog list. Posts live in the BlogPost table (written by Claude Sonnet
   into a queue, one goes up a day: lib/blog.ts) and lay themselves out. The
   newest post leads in a large card; the rest follow in one column, so the
   list never ends on a ragged row. */
export default async function BlogPage() {
  const posts = await listPublishedPosts();
  const [latest, ...older] = posts;

  return (
    <>
      <WBHero>
        <div className="max-w-3xl">
          <h1 className="text-[2.8rem] leading-[1] tracking-[-0.04em] sm:text-[4.2rem]">
            Run a better <span className="text-[#0B57D8]">home-service business.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-gray-600 sm:text-[18px]">
            Straight answers on pricing jobs, getting paid, winning work, running a crew and keeping customers. A new post every day.
          </p>
        </div>
      </WBHero>

      <section className="bg-[#F5F7FA]">
        <div className="mx-auto max-w-4xl px-5 py-16 sm:px-8 sm:py-24">
          {!latest ? (
            <div className={`${CARD} p-8 text-center sm:p-10`}>
              <p className="text-[19px] font-extrabold text-[#0A1428]">The first post is on its way.</p>
              <p className="mt-2 text-[16px] text-gray-600">
                In the meantime, the{" "}
                <Link href="/help" className="font-bold text-[#0B57D8] hover:underline">
                  Help Center
                </Link>{" "}
                has a guide for everything in WorkBench.
              </p>
            </div>
          ) : (
            <>
              <AnimateIn>
                <article className={`${CARD} p-7 sm:p-10`}>
                  <p className="text-[15px] font-semibold text-gray-500">
                    <time dateTime={latest.publishedAt.toISOString()}>{blogDate(latest.publishedAt)}</time>
                    <span className="mx-2 text-gray-300" aria-hidden>
                      ·
                    </span>
                    <span className="text-[#F86A0A]">{latest.tag}</span>
                    <span className="mx-2 text-gray-300" aria-hidden>
                      ·
                    </span>
                    {minutes(blocksWordCount(latest.blocks))} min read
                  </p>
                  <h2 className="mt-4 text-[2rem] leading-[1.08] tracking-[-0.03em] sm:text-[2.8rem]">
                    <Link href={blogPostPath(latest)} className="hover:text-[#0B57D8]">
                      {latest.title}
                    </Link>
                  </h2>
                  <p className="mt-5 text-[18px] leading-relaxed text-gray-600">{latest.summary}</p>
                  <Link href={blogPostPath(latest)} className="wb-pill wb-pill-orange mt-8 !px-7 !py-4 !text-[16px]">
                    Read the post
                    <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.5} />
                  </Link>
                </article>
              </AnimateIn>

              {older.length > 0 && (
                <ol className="mt-8 space-y-5">
                  {older.map((p) => (
                    <li key={p.slug}>
                      <AnimateIn>
                        <article className={`${CARD} p-6 sm:p-7`}>
                          <p className="text-[14px] font-semibold text-gray-500">
                            <time dateTime={p.publishedAt.toISOString()}>{blogDate(p.publishedAt)}</time>
                            <span className="mx-2 text-gray-300" aria-hidden>
                              ·
                            </span>
                            <span className="text-[#F86A0A]">{p.tag}</span>
                          </p>
                          <h3 className="mt-2 text-[1.5rem] font-extrabold leading-snug">
                            <Link href={blogPostPath(p)} className="hover:text-[#0B57D8]">
                              {p.title}
                            </Link>
                          </h3>
                          <p className="mt-2 text-[16px] leading-relaxed text-gray-600">{p.summary}</p>
                          <Link href={blogPostPath(p)} className="mt-4 inline-flex items-center gap-1.5 text-[15px] font-bold text-[#0B57D8] hover:underline">
                            Read the post <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                          </Link>
                        </article>
                      </AnimateIn>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      </section>

      <WBCta />
    </>
  );
}
