import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { notifyUsers, companyManagerIds } from "@/lib/push";

/**
 * Email-open tracking pixel for client messages (HubSpot-style, honestly
 * labeled). The message email embeds <img src="/api/public/open/[token]">;
 * mail clients that display images fetch it and we classify the hit:
 *
 * - Ignored entirely: hits within 15s of send (security scanners prefetch
 *   the moment mail is delivered) and non-mail-client user agents (bots,
 *   scanners, curl).
 * - "likely": Apple's Mail Privacy Protection proxy. It auto-loads images
 *   whether or not the person reads the email, and real Apple Mail reads go
 *   through the same proxy — genuinely indistinguishable, so we label it
 *   honestly and never push on it.
 * - "confident": a real mail client fetched images (Gmail's proxy fetches on
 *   actual open; Outlook only after the user allows images). This is the
 *   high-likelihood signal that fires the one open push — shared with the
 *   page-view path via openNotifiedAt so a message never pushes twice.
 *
 * Always answers with the GIF, whatever happens — a broken image in the
 * email is never acceptable, and unknown tokens must look identical to real
 * ones.
 */

const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

const SCANNER_UA =
  /bot|crawl|spider|scan|preview|monitor|python|curl|wget|libwww|go-http|okhttp|java|barracuda|proofpoint|mimecast|symantec|safelinks|urldefense/i;

/** Apple MPP / iCloud Private Relay egress (Apple owns all of 17.0.0.0/8),
 *  or the proxy's bare-WebKit user agent (no Safari/Chrome/Version token). */
function isAppleProxy(ip: string, ua: string): boolean {
  if (ip.startsWith("17.")) return true;
  return (
    ua.includes("AppleWebKit") &&
    !ua.includes("Safari") &&
    !ua.includes("Chrome") &&
    !ua.includes("Version/")
  );
}

function gif(): NextResponse {
  return new NextResponse(GIF, {
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(GIF.length),
      // Every display should re-fetch — a cached pixel is a missed re-open
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      Pragma: "no-cache",
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!token || token.length > 64) return gif();

    const ua = req.headers.get("user-agent") ?? "";
    if (!ua || SCANNER_UA.test(ua)) return gif();
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();

    const message = await prisma.clientMessage.findUnique({
      where: { publicToken: token },
      select: {
        id: true,
        companyId: true,
        subject: true,
        senderId: true,
        createdAt: true,
        emailOpenedAt: true,
        emailOpenKind: true,
        openNotifiedAt: true,
        contact: { select: { firstName: true, lastName: true, assignedToId: true } },
      },
    });
    if (!message) return gif();

    const now = new Date();
    // Delivery-time scanner prefetch window
    if (now.getTime() - message.createdAt.getTime() < 15_000) return gif();

    const kind = isAppleProxy(ip, ua) ? "likely" : "confident";

    // First open stamps; a later confident hit upgrades a "likely" (the
    // original timestamp stays — it was the first signal)
    if (!message.emailOpenedAt) {
      await prisma.clientMessage.update({
        where: { id: message.id },
        data: { emailOpenedAt: now, emailOpenKind: kind },
      });
    } else if (kind === "confident" && message.emailOpenKind === "likely") {
      await prisma.clientMessage.update({
        where: { id: message.id },
        data: { emailOpenKind: "confident" },
      });
    }

    // Push only on the high-likelihood signal, once per message ever
    if (kind === "confident" && !message.openNotifiedAt) {
      await prisma.clientMessage.update({
        where: { id: message.id },
        data: { openNotifiedAt: now },
      });
      const name =
        `${message.contact.firstName} ${message.contact.lastName}`.trim() || "A client";
      const ids = new Set(await companyManagerIds(message.companyId));
      for (const candidate of [message.contact.assignedToId, message.senderId]) {
        if (candidate && !ids.has(candidate)) {
          const user = await prisma.user.findFirst({
            where: { id: candidate, companyId: message.companyId, isActive: true },
            select: { id: true },
          });
          if (user) ids.add(user.id);
        }
      }
      await notifyUsers([...ids], {
        title: `${name} opened "${message.subject}"`,
        body: "Email opened just now.",
        url: `/app/messages/${message.id}`,
        tag: `doc-view-message-${message.id}`,
      });
    }
  } catch (err) {
    console.error("[open-pixel] failed:", err);
  }
  return gif();
}
