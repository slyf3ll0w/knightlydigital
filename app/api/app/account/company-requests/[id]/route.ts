import { NextRequest, NextResponse } from "next/server";
import { getActor } from "@/lib/permissions";
import { CompanyRequestError, cancelCompanyRequest } from "@/lib/company-requests";

/** DELETE — take back a request support hasn't answered yet. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    await cancelCompanyRequest(actor.id, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CompanyRequestError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
