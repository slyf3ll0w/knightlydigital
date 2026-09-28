import { helpCenterMarkdown } from "@/lib/help/search";

/**
 * The whole Help Center as one Markdown file (workbenchfsm.com/help/all.md)
 * for outside AI assistants and anyone who wants it offline. Listed in
 * /llms.txt. Built from the same guides as the pages.
 */
export const dynamic = "force-static";

export function GET() {
  return new Response(helpCenterMarkdown(), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
