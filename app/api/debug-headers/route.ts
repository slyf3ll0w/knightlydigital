import { NextRequest, NextResponse } from "next/server";

// TEMPORARY: inspect proxy headers in production. Remove after diagnosis.
export async function GET(req: NextRequest) {
  return NextResponse.json({
    xForwardedFor: req.headers.get("x-forwarded-for"),
    xRealIp: req.headers.get("x-real-ip"),
    cfConnectingIp: req.headers.get("cf-connecting-ip"),
    via: req.headers.get("via"),
  });
}
