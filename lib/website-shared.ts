/**
 * Client websites — the pieces both the server module (lib/website.ts, which
 * imports Prisma) and the owner's Settings → Website client component need.
 * Pure: no Prisma, no React, so a "use client" file can import it.
 */

import type { WebsiteStatus } from "@prisma/client";

/** How the owner reads each status (the console has its own, shorter words). */
export const WEBSITE_STATUS_LABEL: Record<WebsiteStatus, string> = {
  NOT_STARTED: "Not started",
  BRIEF_SUBMITTED: "Sent to the studio",
  IN_STUDIO: "In the studio",
  REVIEW: "Ready for your review",
  LIVE: "Live",
};
