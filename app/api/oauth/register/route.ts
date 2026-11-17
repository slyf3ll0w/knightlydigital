import { NextRequest, NextResponse } from "next/server";
import { registerClient } from "@/lib/connector/oauth";

/**
 * OAuth dynamic client registration (RFC 7591) for the Workbench connector —
 * how an older AI app introduces itself (newer ones identify by a metadata
 * URL and never call this). Open by design: registering grants nothing. A
 * person still has to approve the app on /connect, where they are shown the
 * address it will send them back to. Rate-limited per IP in middleware.ts.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "invalid_client_metadata", error_description: "Send a JSON body." }, { status: 400 });
  const client = await registerClient(body);
  if ("error" in client) return NextResponse.json({ error: "invalid_redirect_uri", error_description: client.error }, { status: 400 });
  return NextResponse.json(
    { client_id: client.clientId, client_name: client.name, redirect_uris: client.redirectUris, token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] },
    { status: 201, headers: { "Cache-Control": "no-store" } }
  );
}
