import type { AnnouncementBlock } from "@/lib/wb-announcements";

const CARD =
  "rounded-xl bg-white shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_18px_34px_-22px_rgba(10,20,40,0.35)]";

export const articleAnchor = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * A block list (p / h / list / steps) laid out as an article body, the same
 * way the announcement posts are: headings with anchors for the table of
 * contents, numbered steps in one solid card, titled bullets as stacked
 * solid cards, plain bullets with an orange dash. Used by the blog post page
 * (app/(wbsite)/blog/[slug]). Sits inside `.wb-prose`.
 */
export default function WBArticleBlocks({ blocks }: { blocks: AnnouncementBlock[] }) {
  return (
    <>
      {blocks.map((b, n) => {
        if (b.type === "h") {
          return (
            <h2 key={n} id={articleAnchor(b.text)} className="scroll-mt-28 !text-[1.9rem] !font-black !tracking-[-0.02em]">
              {b.text}
            </h2>
          );
        }
        if (b.type === "p") return <p key={n}>{b.text}</p>;
        if (b.type === "steps") {
          return (
            <ol key={n} className={`${CARD} !mt-6 overflow-hidden`}>
              {b.items.map((s, k) => (
                <li key={k} className="flex gap-4 border-t border-gray-100 px-5 py-4 first:border-t-0 sm:px-6">
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-md bg-[#0A1428] text-[14px] font-extrabold text-white">
                    {k + 1}
                  </span>
                  <span className="pt-0.5">{s}</span>
                </li>
              ))}
            </ol>
          );
        }
        if (b.items.every((i) => i.title)) {
          return (
            <ul key={n} className="!mt-6 space-y-4">
              {b.items.map((item, k) => (
                <li key={k} className={`${CARD} p-5 sm:p-6`}>
                  <strong className="block text-[18px] font-extrabold leading-snug">{item.title}</strong>
                  <span className="mt-1.5 block text-[16px] leading-relaxed">{item.text}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <ul key={n} className="!mt-5 space-y-3">
            {b.items.map((item, k) => (
              <li key={k} className="flex gap-3.5">
                <span className="mt-[0.8em] h-[3px] w-3.5 flex-none rounded-full bg-[#F86A0A]" aria-hidden />
                <span>
                  {item.title && <strong>{item.title} </strong>}
                  {item.text}
                </span>
              </li>
            ))}
          </ul>
        );
      })}
    </>
  );
}
