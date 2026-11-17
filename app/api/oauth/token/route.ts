import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, refreshTokens } from "@/lib/connector/oauth";

/**
 * The Workbench connector's token endpoint (lib/connector/oauth.ts): an app
 * swaps the one-time code from /connect for tokens, or a refresh token for a
 * new pair. Form-encoded, as OAuth requires (JSON is accepted too). No
 * client secret — the PKCE verifier is the proof. Rate-limited per IP in
 * middleware.ts.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    if ((req.headers.get("content-type") ?? "").includes("application/json")) body = (await req.json()) as Record<string, unknown>;
    else body = Object.fromEntries((await req.formData()).entries());
  } catch {
    body = {};
  }
  const out =
    body.grant_type === "authorization_code"
      ? await exchangeCode(body)
      : body.grant_type === "refresh_token"
        ? await refreshTokens(body)
        : ({ error: "unsupported_grant_type", error_description: "Use authorization_code or refresh_token." } as const);
  const headers = { "Cache-Control": "no-store", Pragma: "no-cache" };
  if ("error" in out) return NextResponse.json(out, { status: 400, headers });
  return NextResponse.json(out, { headers });
}
