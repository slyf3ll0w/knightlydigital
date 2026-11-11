import { NextRequest, NextResponse } from "next/server";
import { getSuperadmin } from "@/lib/superadmin";
import { CompanyRequestError, approveCompanyRequest, declineCompanyRequest } from "@/lib/company-requests";

/** PATCH { action: "approve" } opens the company; { action: "decline", reason? } closes the request. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getSuperadmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    if (body?.action === "approve") return NextResponse.json(await approveCompanyRequest(admin, id));
    if (body?.action === "decline") return NextResponse.json(await declineCompanyRequest(admin, id, body.reason));
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    if (e instanceof CompanyRequestError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
