import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const role = (token?.role as string) ?? "";
    const path = req.nextUrl.pathname;

    if (path.startsWith("/admin") && role !== "ADMIN") {
      return NextResponse.redirect(new URL("/portal/dashboard", req.url));
    }

    if (path.startsWith("/portal") && !path.startsWith("/portal/login") && role === "ADMIN") {
      return NextResponse.redirect(new URL("/admin/dashboard", req.url));
    }
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: "/portal/login",
    },
  }
);

export const config = {
  matcher: ["/portal/((?!login).*)", "/admin/:path*"],
};
