import { alternativeMarkdown, markdownResponse } from "@/lib/wb-markdown";
import { alternativeBySlug } from "@/lib/wb-alternatives";

/** Markdown twin of /alternatives/servicetitan for AI agents (lib/wb-markdown.ts). */
export const dynamic = "force-static";

export function GET() {
  return markdownResponse(alternativeMarkdown(alternativeBySlug("servicetitan")!), "/alternatives/servicetitan");
}
