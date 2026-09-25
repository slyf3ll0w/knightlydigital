import { prisma } from "@/lib/db";
import { WB_PHONE } from "@/lib/wb-site";

/**
 * Which WorkBench company receives the marketing site's "Chat with us"
 * messages. SITE_CHAT_COMPANY_ID wins when set; otherwise it is the company
 * whose business line is the platform's own toll-free number (the one on
 * the site), so "the messages go to the business line" needs no config.
 * Cached for ten minutes per server process — every marketing page asks.
 */
const TTL_MS = 10 * 60_000;
let cached: { id: string | null; at: number } | null = null;

export async function siteChatCompanyId(): Promise<string | null> {
  const env = process.env.SITE_CHAT_COMPANY_ID?.trim();
  if (env) return env;
  if (cached && Date.now() - cached.at < TTL_MS) return cached.id;
  let id: string | null = null;
  try {
    const co = await prisma.company.findUnique({ where: { lineNumber: WB_PHONE.e164 }, select: { id: true } });
    id = co?.id ?? null;
  } catch (err) {
    console.error("[site-chat] company lookup failed:", err);
  }
  cached = { id, at: Date.now() };
  return id;
}

/** The HMAC key for visitor thread tokens: the auth secret unless overridden. */
export function siteChatSecret(): string {
  return process.env.SITE_CHAT_SECRET ?? process.env.AUTH_SECRET ?? "";
}
