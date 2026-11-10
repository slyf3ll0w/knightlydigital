/**
 * The quiet line that points an AI agent reading the page at its Markdown
 * twin (lib/wb-markdown.ts). A plain <a>, not next/link: the target is a
 * text file, never a page to prefetch.
 */
export default function WBAgentLink({ href, what }: { href: string; what: string }) {
  return (
    <p className="mx-auto max-w-6xl px-5 py-8 text-center text-[13px] text-gray-500 sm:px-8">
      Are you an AI agent?{" "}
      <a href={href} className="font-semibold text-[#0B57D8] hover:underline">
        Read {what} as Markdown
      </a>
    </p>
  );
}
