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
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
        ],
      },
      {
        // Nothing renders inside someone else's frame — the app, the console,
        // and every client-facing money page (/pay hosts a live card form).
        // The only exception is /embed below, so the matcher excludes it
        // rather than relying on header-override order.
        source: "/((?!embed/).*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
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
  // The SDK is errors-only (tracesSampleRate 0, no Replay), but its default
  // build still ships the tracing + replay code paths — ~40% of the app's
  // first-load JS on a phone. Tree-shake them out.
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
    excludeTracing: true,
    excludeReplayIframe: true,
    excludeReplayShadowDom: true,
    excludeReplayWorker: true,
  },
  // With a token: upload maps to Sentry, then strip them from the deploy so
  // they're never served publicly. Without one: skip source maps entirely.
  sourcemaps: process.env.SENTRY_AUTH_TOKEN
    ? { deleteSourcemapsAfterUpload: true }
    : { disable: true },
});
