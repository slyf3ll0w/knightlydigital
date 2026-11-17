import { NextRequest, NextResponse } from "next/server";
import { callerFromBearer, issuer } from "@/lib/connector/oauth";
import { handleRpc, type RpcRequest } from "@/lib/connector/server";

/**
 * The Workbench connector endpoint — the address a person adds to Claude or
 * ChatGPT (docs/plans/workbench-connector-2026-11-17.md). One JSON-RPC
 * message per POST, answered with one JSON object.
 *
 * No browser session exists here: the caller is whoever approved the
 * connection on /connect, proven by the bearer token on every request
 * (lib/connector/oauth.ts). No token, or one that has ended, gets a 401 that
 * points the app at the sign-in documents, which is how an app discovers
 * that it has to send the person through /connect.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function unauthorized() {
  return NextResponse.json(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Sign in to Workbench to use this connector." } },
    { status: 401, headers: { "WWW-Authenticate": `Bearer resource_metadata="${issuer()}/.well-known/oauth-protected-resource/api/mcp"` } }
  );
}

export async function POST(req: NextRequest) {
  const caller = await callerFromBearer(req.headers.get("authorization"));
  if (!caller) return unauthorized();
  let msg: unknown;
  try {
    msg = await req.json();
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }
  // one message per request (batches left the protocol in 2025-06-18)
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Send one JSON-RPC message per request." } }, { status: 400 });
  }
  const reply = await handleRpc(caller, msg as RpcRequest, req.headers.get("mcp-protocol-version"));
  if (reply.body === null) return new NextResponse(null, { status: reply.status });
  return NextResponse.json(reply.body, { status: reply.status, headers: { "Cache-Control": "no-store" } });
}

// No streams and no sessions to open or close.
export async function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
export async function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
