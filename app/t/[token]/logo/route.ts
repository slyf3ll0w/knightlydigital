import { NextResponse } from "next/server";
import { sentLogo } from "@/lib/tool-send";

/** GET /t/<token>/logo — the sender's logo for the hosted page and the email. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const logo = await sentLogo((await params).token);
  if (!logo) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(logo.data), {
    headers: { "Content-Type": logo.mime, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
  });
}
