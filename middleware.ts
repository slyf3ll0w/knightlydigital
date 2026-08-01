import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { limit, clientIp } from "@/lib/rate-limit";
import { SUPERADMIN_COOKIE, verifySuperadminSessionToken } from "@/lib/superadmin-session";

// Per-IP limits on abuse-prone endpoints: { max requests, window }
// `methods` narrows the rule (default: every non-GET/HEAD method).
const rateLimits: { match: (path: string) => boolean; max: number; windowMs: number; name: string; methods?: string[] }[] = [
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
    // Superadmin sign-in: code issue + session mint both do a bcrypt compare
    // (and may send an email) — keep them as tight as the login bucket.
    // POST-only so signing OUT (DELETE /session) never burns login attempts.
    match: (p) => p.startsWith("/api/superadmin/login-code") || p.startsWith("/api/superadmin/session"),
    max: 5,
    windowMs: 15 * 60_000,
    name: "superadmin-otp",
    methods: ["POST"],
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
    // The document view beacon fires on every open of a quote/invoice/
    // contract/hub/message page. It MUST NOT share a bucket with the actions
    // those same pages perform — a client who reloads their invoice a few
    // times would otherwise burn the allowance the Pay button needs.
    match: (p) => p === "/api/public/viewed",
    max: 120,
    windowMs: 60 * 60_000,
    name: "view-beacon",
  },
  {
    // Paying an invoice: room for a mistyped card, a retry, and a whole
    // office behind one NAT'd IP — tight enough that a leaked pay link is
    // still useless for card testing.
    match: (p) => p.startsWith("/api/public/pay/"),
    max: 20,
    windowMs: 60 * 60_000,
    name: "pay",
  },
  {
    // Responding to a document we sent them (approve, request changes, sign)
    // and the client hub's own actions — ordinary client behavior that can
    // legitimately repeat within a session.
    match: (p) =>
      p.startsWith("/api/public/quote/") ||
      p.startsWith("/api/public/contract/") ||
      p.startsWith("/api/hub/"),
    max: 30,
    windowMs: 60 * 60_000,
    name: "client-docs",
  },
  {
    // Endpoints that email an address the caller supplies — the tightest
    // bucket, so neither can be used to mailbomb a client or probe accounts.
    match: (p) =>
      p.startsWith("/api/public/portal-login") ||
      p.startsWith("/api/public/forgot-password") ||
      // Signed-in, but it still emails an address the caller typed — same
      // bucket so it can't be used to mailbomb someone or probe for accounts.
      p.startsWith("/api/app/profile/email"),
    max: 5,
    windowMs: 60 * 60_000,
    name: "magic-link",
  },
  {
    // Cold inbound from strangers: booking forms, lead webhooks, applications
    match: (p) => p.startsWith("/api/public/"),
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

  // The well-known change-password URL (w3c/webappsec-change-password-url).
  // Chrome, Safari and iOS Passwords deep-link here when they flag a weak or
  // breached credential; a 404 dead-ends that flow. Lives in middleware
  // because Next's router skips dot-directories under app/.
  if (path === "/.well-known/change-password") {
    return NextResponse.redirect(new URL("/app/settings/profile", req.url), 302);
  }

  // ── Rate limiting (POST-like methods only) ─────────────────────────────────
  if (req.method !== "GET" && req.method !== "HEAD") {
    for (const rule of rateLimits) {
      if (rule.match(path) && (!rule.methods || rule.methods.includes(req.method))) {
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

  // ── Platform console (own cookie session, separate from NextAuth) ─────────
  // The console never looks at the tenant session and vice versa, so staff
  // can be signed into both simultaneously. Only the direct /superadmin URL
  // reaches it — nothing on the marketing site or tenant app links here.
  if (path.startsWith("/superadmin")) {
    const saToken = req.cookies.get(SUPERADMIN_COOKIE)?.value;
    const saUser = saToken ? await verifySuperadminSessionToken(saToken) : null;
    if (path === "/superadmin/login") {
      return saUser
        ? NextResponse.redirect(new URL("/superadmin", req.url))
        : NextResponse.next();
    }
    if (!saUser) return NextResponse.redirect(new URL("/superadmin/login", req.url));
    return NextResponse.next();
  }

  // ── Auth for the app ───────────────────────────────────────────────────────
  if (!path.startsWith("/app")) {
    return NextResponse.next();
  }

  // Public app routes — no auth needed
  const isPublic =
    path.startsWith("/app/login") ||
    path.startsWith("/app/register") ||
    path.startsWith("/app/forgot-password") ||
    path.startsWith("/app/reset-password") ||
    // The confirm link is opened from whatever mail app holds the NEW
    // address — often another device, never carrying the app session.
    path.startsWith("/app/verify-email");
  if (isPublic) return NextResponse.next();

  const token = await getToken({ req, secret: process.env.AUTH_SECRET });

  if (!token) {
    return NextResponse.redirect(new URL("/app/login", req.url));
  }

  // Users without a company go to register
  if (!token.companyId) {
    return NextResponse.redirect(new URL("/app/register", req.url));
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
    "/.well-known/change-password",
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
    "/api/app/profile/email",
    "/api/superadmin/login-code",
    "/api/superadmin/session",
    "/api/public/:path*",
    "/api/hub/:path*",
  ],
};
