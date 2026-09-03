import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "plus.unsplash.com" },
    ],
  },
  async rewrites() {
    return [
      { source: "/app/:path*", destination: "/platform/:path*" },
    ];
  },
  async headers() {
    return [
      {
        // Baseline security headers everywhere
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
      {
        // The app itself must never render inside someone else's frame
        source: "/app/:path*",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
      {
        // The embeddable booking form is explicitly frameable anywhere
        source: "/embed/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
      {
        // The service worker must revalidate on every check so deploys
        // (cache logic changes, VERSION bumps) roll out immediately
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
    ];
  },
};

// Sentry build plugin: readable stack traces in error reports. Source-map
// upload only runs when SENTRY_AUTH_TOKEN is set (Railway); without it the
// wrapper changes nothing about the build.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  disableLogger: true,
  // With a token: upload maps to Sentry, then strip them from the deploy so
  // they're never served publicly. Without one: skip source maps entirely.
  sourcemaps: process.env.SENTRY_AUTH_TOKEN
    ? { deleteSourcemapsAfterUpload: true }
    : { disable: true },
});
