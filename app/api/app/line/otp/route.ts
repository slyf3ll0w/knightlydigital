import { NextRequest, NextResponse } from "next/server";
import { getActor, isManager } from "@/lib/permissions";
import { LineError, lineSummary, resendRegistrationOtp, verifyRegistrationOtp } from "@/lib/business-line";
import { limit } from "@/lib/rate-limit";

/**
 * Sole-proprietor brands verify by a PIN texted to the owner's mobile.
 *   POST { pin }          → verify it (then advances the registration)
 *   POST { resend: true } → send a fresh PIN
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await limit(`line-otp:${actor.companyId}`, 10, 60 * 60_000)).ok) {
    return NextResponse.json({ error: "Too many attempts — try again in an hour." }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) as { pin?: unknown; resend?: unknown };
  try {
    if (body.resend === true) {
      await resendRegistrationOtp(actor.companyId);
    } else {
      await verifyRegistrationOtp(actor.companyId, typeof body.pin === "string" ? body.pin : "");
    }
    return NextResponse.json(await lineSummary(actor.companyId, { name: actor.name }));
  } catch (err) {
    if (err instanceof LineError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[line] otp route error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
