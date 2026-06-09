import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Public app routes — no auth needed
  const isPublic =
    path.startsWith("/app/login") ||
    path.startsWith("/app/register") ||
    path.startsWith("/book/") ||
    path.startsWith("/pay/") ||
    path.startsWith("/quote/");

  if (isPublic) return NextResponse.next();

  // All other /app/* and /superadmin/* routes require a valid token
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });

  if (!token) {
    return NextResponse.redirect(new URL("/app/login", req.url));
  }

  const role = (token.role as string) ?? "";
  const isSuperAdmin = role === "SUPERADMIN";
  const hasCompany = !!token.companyId;

  // Non-superadmin users without a company go to register
  if (path.startsWith("/app") && !hasCompany && !isSuperAdmin) {
    return NextResponse.redirect(new URL("/app/register", req.url));
  }

  // Only superadmins can access /superadmin/*
  if (path.startsWith("/superadmin") && !isSuperAdmin) {
    return NextResponse.redirect(new URL("/app/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/superadmin/:path*"],
};
