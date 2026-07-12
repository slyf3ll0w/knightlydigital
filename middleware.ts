import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { limit, clientIp } from "@/lib/rate-limit";

// Per-IP limits on abuse-prone endpoints: { max requests, window }
const rateLimits: { match: (path: string) => boolean; max: number; windowMs: number; name: string }[] = [
  {
    // Login attempts (NextAuth credentials callback)
    match: (p) => p.startsWith("/api/auth/callback/credentials"),
    max: 5,
    windowMs: 15 * 60_000,
    name: "login",
  },
  {
    match: (p) => p.startsWith("/api/app/register"),
    max: 3,
    windowMs: 60 * 60_000,
    name: "register",
  },
  {
    // Public client-facing writes: booking form, quote responses, payments
    match: (p) => p.startsWith("/api/public/") || p.startsWith("/api/hub/"),
    max: 10,
    windowMs: 60 * 60_000,
    name: "public",
  },
];

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // ── Rate limiting (POST-like methods only) ─────────────────────────────────
  if (req.method !== "GET" && req.method !== "HEAD") {
    for (const rule of rateLimits) {
      if (rule.match(path)) {
        const result = limit(`${rule.name}:${clientIp(req.headers)}`, rule.max, rule.windowMs);
        if (!result.ok) {
          return NextResponse.json(
            { error: "Too many requests. Please try again later." },
            { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } }
          );
        }
        break;
      }
    }
  }

  // ── Auth for the app ───────────────────────────────────────────────────────
  if (!path.startsWith("/app") && !path.startsWith("/superadmin")) {
    return NextResponse.next();
  }

  // Public app routes — no auth needed
  const isPublic =
    path.startsWith("/app/login") ||
    path.startsWith("/app/register") ||
    path.startsWith("/app/forgot-password") ||
    path.startsWith("/app/reset-password");
  if (isPublic) return NextResponse.next();

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
  matcher: [
    "/app/:path*",
    "/superadmin/:path*",
    "/api/auth/callback/credentials",
    "/api/app/register",
    "/api/public/:path*",
    "/api/hub/:path*",
  ],
};
