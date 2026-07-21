import { NextRequest, NextResponse } from "next/server";
import { checkInviteCode } from "@/lib/invites";

/**
 * Pre-flight invite validation for the signup wizard, so a bad code fails on
 * step 1 instead of after the whole flow. The register endpoint re-checks and
 * atomically claims the code — this is UX only, not the gate itself.
 * Rate-limited per IP in middleware to keep it useless for brute-forcing.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const result = await checkInviteCode(body?.code);
  if (!result.ok) {
    return NextResponse.json({ valid: false, error: result.reason });
  }
  return NextResponse.json({ valid: true });
}
