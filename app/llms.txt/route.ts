import { llmsTxt } from "@/lib/llms";

/** /llms.txt for AI assistants, generated from the plan constants and the Help Center (lib/llms.ts). */
export const dynamic = "force-static";

export function GET() {
  return new Response(llmsTxt(), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
