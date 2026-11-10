import { markdownResponse, vsMarkdown } from "@/lib/wb-markdown";
import { VS_PAGES } from "@/lib/wb-vs";

/** Markdown twin of /vs/housecall-pro for AI agents (lib/wb-markdown.ts). */
export const dynamic = "force-static";

export function GET() {
  return markdownResponse(vsMarkdown(VS_PAGES["housecall-pro"]), "/vs/housecall-pro");
}
