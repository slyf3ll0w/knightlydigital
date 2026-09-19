import { NextRequest, NextResponse } from "next/server";
import { refreshByVerificationId } from "@/lib/business-line";

/**
 * Telnyx toll-free verification webhook — set as `webhookUrl` on every
 * verification request we file (lib/business-line.ts). Like the 10DLC one,
 * the payload is never trusted: it only names a request id, which we then
 * re-read from Telnyx. Rate-limited by the 30 s debounce in
 * refreshByVerificationId.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ received: true });
  }
  const id = extractId(body);
  if (id) {
    try {
      await refreshByVerificationId(id);
    } catch (err) {
      console.error("[telnyx tollfree] refresh failed:", err);
    }
  }
  return NextResponse.json({ received: true });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractId(body: unknown): string | null {
  let found: string | null = null;
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number) => {
    if (found || !v || typeof v !== "object" || depth > 4 || seen.has(v)) return;
    seen.add(v);
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const key = k.toLowerCase();
      if (typeof val === "string" && UUID_RE.test(val) && (key === "verificationrequestid" || key === "verification_request_id" || key === "id")) {
        found = val;
        return;
      }
      if (val && typeof val === "object") walk(val, depth + 1);
    }
  };
  walk(body, 0);
  return found;
}
