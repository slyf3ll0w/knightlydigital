import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { brandHeader } from "@/lib/branding";

/**
 * Per-company web-app manifest so a client can install THEIR company's hub
 * as an app from the browser: the installed app is named after the company,
 * themed in its brand color, and opens straight into this hub. Scoped to
 * /hub/[token] so it never claims the operator app (whose manifest lives at
 * /manifest.webmanifest with scope /app).
 *
 * Icons stay the generic WorkBench set for now — installability requires
 * exact-size PNGs (192/512) and company logos are arbitrary images; a
 * logo-derived icon needs a server-side resizer we don't have yet.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const contact = await prisma.contact.findUnique({
    where: { hubToken: token },
    select: {
      company: {
        select: { name: true, brandColor: true, documentColor: true, brandColorSecondary: true },
      },
    },
  });
  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const manifest = {
    name: contact.company.name,
    short_name: contact.company.name.length > 12 ? contact.company.name.slice(0, 12).trimEnd() : contact.company.name,
    description: `Your ${contact.company.name} client portal — quotes, invoices, visits, and messages.`,
    id: `/hub/${token}`,
    start_url: `/hub/${token}`,
    scope: `/hub/${token}`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: brandHeader(contact.company),
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      // Tokens are per-client secrets; keep the manifest out of shared caches
      "Cache-Control": "private, max-age=3600",
    },
  });
}
