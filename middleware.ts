import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const role = (token?.role as string) ?? "";
    const path = req.nextUrl.pathname;

    const isSuperAdmin = role === "SUPERADMIN";
    const hasCompany = !!token?.companyId;

    // Superadmin → /superadmin only
    if (path.startsWith("/superadmin") && !isSuperAdmin) {
      return NextResponse.redirect(new URL("/app/dashboard", req.url));
    }

    // App routes require a company (except register flow)
    if (path.startsWith("/app") && !path.startsWith("/app/login") && !path.startsWith("/app/register")) {
      if (!hasCompany && !isSuperAdmin) {
        return NextResponse.redirect(new URL("/app/register", req.url));
      }
    }
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname;
        // Public pages don't need a token
        if (
          path.startsWith("/app/login") ||
          path.startsWith("/app/register") ||
          path.startsWith("/book/") ||
          path.startsWith("/pay/") ||
          path.startsWith("/quote/")
        ) {
          return true;
        }
        return !!token;
      },
    },
    pages: {
      signIn: "/app/login",
    },
  }
);

export const config = {
  matcher: [
    "/app/((?!login|register).*)",
    "/superadmin/:path*",
  ],
};
