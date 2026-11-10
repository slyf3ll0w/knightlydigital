import { alternativeMarkdown, markdownResponse } from "@/lib/wb-markdown";
import { alternativeBySlug } from "@/lib/wb-alternatives";

/** Markdown twin of /alternatives/housecall-pro for AI agents (lib/wb-markdown.ts). */
export const dynamic = "force-static";

export function GET() {
  return markdownResponse(alternativeMarkdown(alternativeBySlug("housecall-pro")!), "/alternatives/housecall-pro");
}
