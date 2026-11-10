import { markdownResponse, pricingMarkdown } from "@/lib/wb-markdown";

/** Markdown twin of /pricing for AI agents (lib/wb-markdown.ts). */
export const dynamic = "force-static";

export function GET() {
  return markdownResponse(pricingMarkdown(), "/pricing");
}
