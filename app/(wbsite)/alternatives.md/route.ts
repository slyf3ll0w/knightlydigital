import { alternativesMarkdown, markdownResponse } from "@/lib/wb-markdown";

/** Markdown twin of /alternatives for AI agents (lib/wb-markdown.ts). */
export const dynamic = "force-static";

export function GET() {
  return markdownResponse(alternativesMarkdown(), "/alternatives");
}
