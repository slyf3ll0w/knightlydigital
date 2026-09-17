import { NextResponse } from "next/server";
import { getSuperadmin } from "@/lib/superadmin";
import { syncCatalog } from "@/lib/packaging-board";

/** Pull in any feature that shipped since the board was last opened. */
export async function POST() {
  const admin = await getSuperadmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const added = await syncCatalog();
  return NextResponse.json({ success: true, added });
}
