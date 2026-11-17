import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { revokeGrant, sha256 } from "@/lib/connector/oauth";

/**
 * OAuth token revocation (RFC 7009) for the Workbench connector: an app
 * that is being disconnected hands back a token and the whole connection
 * ends. Always answers 200, as the RFC asks, whether or not the token was known.
 */
export async function POST(req: NextRequest) {
  let token = "";
  try {
    if ((req.headers.get("content-type") ?? "").includes("application/json")) token = String(((await req.json()) as { token?: unknown }).token ?? "");
    else token = String((await req.formData()).get("token") ?? "");
  } catch {
    token = "";
  }
  if (token) {
    const row = await prisma.connectorToken.findUnique({ where: { tokenHash: sha256(token) }, select: { grantId: true } });
    if (row) await revokeGrant(row.grantId);
  }
  return new NextResponse(null, { status: 200, headers: { "Cache-Control": "no-store" } });
}
