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
    // Invite-code pre-flight on the signup wizard — looser than register so
    // typos don't lock people out, tight enough that guessing codes is hopeless.
    match: (p) => p.startsWith("/api/app/invite-check"),
    max: 20,
    windowMs: 60 * 60_000,
    name: "invite-check",
  },
  {
    // Superadmin sign-in codes: each POST does a bcrypt compare and may send
    // an email — keep it as tight as the login bucket.
    match: (p) => p.startsWith("/api/superadmin/login-code"),
    max: 5,
    windowMs: 15 * 60_000,
    name: "superadmin-otp",
  },
  {
    // Processor webhooks (Finix) burst on settlement days — own generous
    // bucket so they never starve behind the strict public-write limit.
    // The handler verifies by re-fetching from the Finix API, so a flood
    // can't inject state.
    match: (p) => p.startsWith("/api/public/webhooks/"),
    max: 300,
    windowMs: 60 * 60_000,
    name: "webhooks",
  },
  {
    // Public client-facing writes: booking form, quote responses, payments
    match: (p) => p.startsWith("/api/public/") || p.startsWith("/api/hub/"),
    max: 10,
    windowMs: 60 * 60_000,
    name: "public",
  },
];

// Old agency paths — everything stays on workbenchfsm.com now
const agencyMoved: Record<string, string> = {
  "/about": "/",
  "/services": "/",
  "/custom-web-design": "/",
  "/custom-software": "/",
  "/digital-marketing": "/",
  "/contact": "/apply",
  "/crm": "/",
};

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // ── WorkBench domain routing ───────────────────────────────────────────────
  // This app lives at workbenchfsm.com now: the root serves the WorkBench
  // marketing home (built at /wb), and the old Streamflaire agency pages
  // redirect to the parent-company site.
  if (path === "/") {
    return NextResponse.rewrite(new URL("/wb", req.url));
  }
  if (path === "/wb") {
    return NextResponse.redirect(new URL("/", req.url), 308);
  }
  if (path in agencyMoved) {
    return NextResponse.redirect(new URL(agencyMoved[path], req.url), 308);
  }

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
    path.startsWith("/app/reset-password") ||
    path === "/superadmin/login";
  if (isPublic) return NextResponse.next();

  const token = await getToken({ req, secret: process.env.AUTH_SECRET });

  if (!token) {
    // The console has its own front door — don't bounce platform staff
    // through the tenant login.
    const loginUrl = path.startsWith("/superadmin") ? "/superadmin/login" : "/app/login";
    return NextResponse.redirect(new URL(loginUrl, req.url));
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

  // The platform layout needs the request path to run the payment-verification
  // gate without redirect-looping on /app/activate (layouts can't see the URL).
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-wb-path", path);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/",
    "/wb",
    "/about",
    "/services",
    "/custom-web-design",
    "/custom-software",
    "/digital-marketing",
    "/contact",
    "/crm",
    "/app/:path*",
    "/superadmin/:path*",
    "/api/auth/callback/credentials",
    "/api/app/register",
    "/api/app/invite-check",
    "/api/superadmin/login-code",
    "/api/public/:path*",
    "/api/hub/:path*",
  ],
};
