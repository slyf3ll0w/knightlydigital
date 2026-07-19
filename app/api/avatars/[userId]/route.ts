import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";

/**
 * Serve a teammate's profile picture. Same-company only; when the user has
 * no photo, a generated initials SVG (matching the Avatar component's
 * gradient) is served instead. ETag'd on the upload timestamp so polling
 * UIs revalidate cheaply.
 */

function hashHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function initialsSvg(name: string | null): string {
  const seed = name?.trim() || "?";
  const hue = hashHue(seed);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 62% 48%)"/><stop offset="1" stop-color="hsl(${(hue + 50) % 360} 65% 36%)"/></linearGradient></defs><rect width="128" height="128" fill="url(#g)"/><text x="64" y="64" dy="0.36em" text-anchor="middle" fill="#fff" font-family="ui-sans-serif, system-ui, sans-serif" font-weight="600" font-size="46" letter-spacing="0.02em">${escapeXml(initials(seed))}</text></svg>`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const actor = await getActor();
  if (!actor) return new NextResponse(null, { status: 401 });

  const { userId } = await params;
  const user = await prisma.user.findFirst({
    where: { id: userId, companyId: actor.companyId },
    select: { name: true, avatarData: true, avatarMime: true, avatarUpdatedAt: true },
  });
  if (!user) return new NextResponse(null, { status: 404 });
  if (!user.avatarData || !user.avatarMime) {
    const etag = `"av-default-${hashHue(user.name?.trim() || "?")}"`;
    if (req.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag } });
    }
    return new NextResponse(initialsSvg(user.name), {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "private, max-age=300",
        ETag: etag,
      },
    });
  }

  const etag = `"av-${user.avatarUpdatedAt?.getTime() ?? 0}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }
  return new NextResponse(Buffer.from(user.avatarData), {
    headers: {
      "Content-Type": user.avatarMime,
      "Cache-Control": "private, max-age=300",
      ETag: etag,
    },
  });
}
