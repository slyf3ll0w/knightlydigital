import type { MetadataRoute } from "next";

// WorkBench installs as an app from the browser ("Add to Home
// Screen" / "Install app"): standalone window, leaf-mark icon, opens on the
// dashboard. Scope is /app so client-facing pages (/hub, /quote, /pay)
// still open with normal browser chrome.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WorkBench",
    short_name: "WorkBench",
    description: "Free field service management — quotes, jobs, invoices, and payments.",
    start_url: "/app/dashboard",
    scope: "/app",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#0A1428",
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
