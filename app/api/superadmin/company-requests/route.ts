import { NextRequest, NextResponse } from "next/server";
import { getSuperadmin } from "@/lib/superadmin";
import { CompanyRequestError, openCompanyForLogin } from "@/lib/company-requests";

/** POST — open a company straight onto an existing login (no request needed). */
export async function POST(req: NextRequest) {
  const admin = await getSuperadmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(await openCompanyForLogin(admin, body ?? {}));
  } catch (e) {
    if (e instanceof CompanyRequestError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
