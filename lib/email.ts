/**
 * Transactional email via Resend. Env-gated like the captcha: without
 * RESEND_API_KEY every send is a silent no-op, so the code can ship before
 * the domain is verified.
 *
 * EMAIL_FROM must use the domain verified in Resend
 * (default: notifications@workbenchfsm.com).
 *
 * Two shells, two audiences:
 * - wbShell()     — platform emails (notifications to businesses, invites,
 *                   password resets, console codes). WorkBench-branded: the
 *                   color wordmark on white, navy→blue rule, orange stamp
 *                   dash, and the app's "tool" button look.
 * - clientShell() — client-facing emails (quotes, invoices, bookings,
 *                   contracts, portal). Mirrors the public quote/invoice
 *                   document header: documentColor surface, company logo,
 *                   bold company name, context line. Buttons use the same
 *                   accent as the document pages (brandAccent semantics).
 */

import { prisma } from "@/lib/db";
import { recordEmailSent } from "@/lib/usage";
import { emailDomainsEnabled } from "@/lib/email-domains";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM ?? "WorkBench <notifications@workbenchfsm.com>";
// Bare address from FROM — sends that brand the display name still have to
// use the Resend-verified domain, only the name in front of it changes.
const FROM_ADDRESS = FROM.match(/<([^>]+)>/)?.[1] ?? FROM;
const APP_URL = process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com";

const WB_NAVY = "#0A1428";
const WB_BLUE = "#0B57D8";
const WB_ORANGE = "#F86808"; // the logo's Bench orange
const FONT = "-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";

/** Whether Resend is configured — without it every sendEmail is a no-op. */
export function emailEnabled(): boolean {
  return Boolean(RESEND_API_KEY);
}

/** Tenant branding applied to client-facing emails — the same settings the
 *  quote/invoice/portal pages use. Pass the company row itself; only these
 *  fields are read. */
export type EmailBrand = {
  brandColor?: string | null;
  brandColorSecondary?: string | null;
  /** Client-document color — preferred over brandColor when set */
  documentColor?: string | null;
  logoUrl?: string | null;
};

const BRAND_HEX = /^#[0-9a-fA-F]{6}$/;
const hex = (v: string | null | undefined) => (BRAND_HEX.test(v ?? "") ? v! : null);

function luminance(h: string): number {
  const n = parseInt(h.slice(1), 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
}
const onColor = (bg: string) => (luminance(bg) > 160 ? "#111827" : "#ffffff");

/** Header surface for client emails — same fallback chain as brandHeader(). */
const headerColor = (brand: EmailBrand) =>
  hex(brand.documentColor) ?? hex(brand.brandColor) ?? "#FFFFFF";

/** Button/accent color — same fallback chain as brandAccent() on the doc pages. */
const accentColor = (brand: EmailBrand) =>
  hex(brand.brandColorSecondary) ?? hex(brand.brandColor) ?? WB_ORANGE;

/** Inline text links sit on white — flip too-light accents back to blue. */
const linkColor = (brand: EmailBrand) => {
  const a = accentColor(brand);
  return luminance(a) > 200 ? WB_BLUE : a;
};

const absUrl = (u: string) => (u.startsWith("http") ? u : `${APP_URL}${u}`);

/** All email content is user input — escape it before it goes into HTML. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ------------------------------------------------------------------ */
/* Shared building blocks                                              */
/* ------------------------------------------------------------------ */

/** Small-caps field label (matches the document pages' field labels). */
const fieldLabel = (label: string, topMargin = 16) =>
  `<p style="margin:${topMargin}px 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">${label}</p>`;

/** Big money numeral with its label — the statement look. */
const moneyBlock = (label: string, amount: number) =>
  `${fieldLabel(label)}<p style="margin:0;color:#111827;font-size:26px;font-weight:700;">$${amount.toFixed(2)}</p>`;

/** Accent CTA button for client emails — same accent as the document pages. */
function accentBtn(href: string, label: string, brand: EmailBrand): string {
  const a = accentColor(brand);
  return `<a href="${esc(href)}"
         style="display:inline-block;margin-top:20px;background:${a};color:${onColor(a)};text-decoration:none;font-size:14px;font-weight:600;padding:11px 22px;border-radius:8px;">${label}</a>`;
}

/**
 * Client-facing shell — mirrors the public quote/invoice document header:
 * brand-colored surface, company logo, bold company name, and a context line
 * ("Quote #12", "Appointment reminder"). Footer credits the company with a
 * quiet "Powered by WorkBench".
 */
function clientShell({
  brand,
  companyName,
  context,
  inner,
}: {
  brand: EmailBrand;
  companyName: string;
  context?: string;
  inner: string;
}): string {
  const bg = headerColor(brand);
  const fg = onColor(bg);
  const logo = brand.logoUrl
    ? `<img src="${esc(absUrl(brand.logoUrl))}" alt="" style="display:block;max-height:52px;max-width:240px;margin:0 0 12px;" />`
    : "";
  return `
<div style="font-family:${FONT};background:#f3f4f6;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
    <div style="background:${bg};padding:22px 28px;">
      ${logo}
      <p style="margin:0;color:${fg};font-size:19px;font-weight:700;line-height:1.3;">${esc(companyName)}</p>
      ${context ? `<p style="margin:3px 0 0;color:${fg};opacity:0.72;font-size:13px;">${esc(context)}</p>` : ""}
    </div>
    <div style="padding:26px 28px;">
      ${inner}
    </div>
    <div style="padding:14px 28px;border-top:1px solid #f3f4f6;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">Sent by ${esc(companyName)} · Powered by <a href="https://workbenchfsm.com" style="color:#9ca3af;text-decoration:underline;">WorkBench</a></p>
    </div>
  </div>
</div>`;
}

/** "Tool" CTA button for platform emails — the app's btn-tool look. */
const wbBtn = (href: string, label: string) =>
  `<a href="${esc(href)}"
         style="display:inline-block;margin-top:20px;background:${WB_BLUE};border:1.5px solid ${WB_NAVY};box-shadow:2px 2px 0 ${WB_NAVY};color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:11px 22px;border-radius:10px;">${label}</a>`;

/** Code box (invite codes, sign-in codes) — tool-outlined monospace stamp. */
const wbCodeBox = (code: string, fontSize: number, letterSpacing: number) =>
  `<p style="margin:0 0 16px;padding:16px 20px;background:#f9fafb;border:1.5px solid ${WB_NAVY};box-shadow:2px 2px 0 ${WB_NAVY};border-radius:10px;color:${WB_NAVY};font-size:${fontSize}px;font-weight:700;letter-spacing:${letterSpacing}px;font-family:ui-monospace,Menlo,monospace;text-align:center;">${esc(code)}</p>`;

/**
 * Platform shell — WorkBench-branded. Color wordmark on white, a navy→blue
 * rule under the header, an orange stamp dash over the label (the app's
 * card-tool accent dash), and a double-rule footer.
 */
function wbShell({
  label,
  inner,
  footNote,
}: {
  label: string;
  inner: string;
  /** Optional extra footer line (e.g. which company this was sent to). */
  footNote?: string;
}): string {
  return `
<div style="font-family:${FONT};background:#f3f4f6;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
    <div style="padding:20px 28px 16px;">
      <img src="${APP_URL}/workbench-logo-email.png" alt="WorkBench" width="180" height="30" style="display:block;height:30px;width:180px;" />
    </div>
    <div style="height:3px;font-size:3px;line-height:3px;background:${WB_NAVY};background:linear-gradient(90deg,${WB_NAVY},${WB_BLUE});">&nbsp;</div>
    <div style="padding:24px 28px;">
      <div style="width:22px;height:3px;font-size:3px;line-height:3px;background:${WB_ORANGE};">&nbsp;</div>
      <p style="margin:6px 0 18px;color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;">${label}</p>
      ${inner}
    </div>
    <div style="padding:14px 28px;border-top:3px double #e5e7eb;">
      ${footNote ? `<p style="margin:0 0 2px;color:#9ca3af;font-size:12px;">${footNote}</p>` : ""}
      <p style="margin:0;color:#9ca3af;font-size:12px;">WorkBench — field service management · <a href="https://workbenchfsm.com" style="color:#9ca3af;text-decoration:underline;">workbenchfsm.com</a></p>
    </div>
  </div>
</div>`;
}

/* ------------------------------------------------------------------ */
/* Send                                                                */
/* ------------------------------------------------------------------ */

/**
 * Plain-text alternative derived from the template HTML. HTML-only email
 * scores badly with phishing filters (Yahoo PH01 especially); every send
 * carries a text part so the multipart looks like legitimate mail.
 * Tuned to this file's markup — not a general HTML-to-text converter.
 */
function htmlToText(html: string): string {
  return (
    html
      // Links become "label: url" so the text part carries the same CTAs
      .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => {
        const text = label.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        return text ? `${text}: ${href}` : href;
      })
      .replace(/<\/(p|div|h[1-6])>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // Collapse the indentation and blank-line noise left by the markup
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/** Company email is off until Finix approval (mirrors lib/preview.ts without
 *  importing the payments stack — this file must stay import-cycle-free). */
async function companyEmailBlocked(companyId: string): Promise<boolean> {
  if (process.env.PAYMENT_PROCESSOR !== "finix") return false;
  try {
    const c = await prisma.company.findUnique({
      where: { id: companyId },
      select: { paymentsWaived: true, finixOnboardingState: true },
    });
    if (!c || c.paymentsWaived) return false;
    return c.finixOnboardingState !== "APPROVED";
  } catch {
    return false;
  }
}

export async function sendEmail({
  to,
  subject,
  html,
  replyTo,
  fromName,
  companyId,
  pageBackground = "#f3f4f6",
}: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  /** Display name shown as the sender (e.g. the tenant company's name). Falls back to EMAIL_FROM. */
  fromName?: string;
  /** Tenant to meter this send against (lib/usage.ts). Omitted → counted as
   *  platform overhead (password resets, portal logins). */
  companyId?: string | null;
  /** Canvas behind the template — "#ffffff" for the plain personal-email
   *  look (client messages), default gray for the card-on-canvas shells. */
  pageBackground?: string;
}): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  // Preview accounts (pre-Finix-approval) send no company email, period —
  // this backstop covers every caller that carries a companyId (crons,
  // subscriptions, agreements, portal logins) beyond the route-level 403s.
  // Platform sends (no companyId: password resets, invites, feedback) and
  // approved/waived companies pass straight through.
  if (companyId && (await companyEmailBlocked(companyId))) return false;
  const text = htmlToText(html);
  // Templates are bare <div>s with light backgrounds and near-black inline
  // text. Without an explicit light-only color-scheme, dark-mode email
  // clients (Outlook especially) darken the white card but keep the inline
  // text — black on black. The shell pins every send to light.
  html = `<!DOCTYPE html>
<html lang="en" style="color-scheme: light only; supported-color-schemes: light;">
<head>
<meta charset="utf-8" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light" />
</head>
<body style="margin:0;padding:0;background-color:${pageBackground};color-scheme:light only;" bgcolor="${pageBackground}">
${html}
</body>
</html>`;
  // Company names are user input headed into an email header — strip anything
  // that could break out of the quoted display name.
  const cleanName = fromName?.replace(/[\r\n"<>]/g, "").trim();
  // Custom sending domain: a company with a VERIFIED domain (Settings → Email
  // domain, lib/email-domains.ts) sends from its own address; every other
  // state — pending DNS, failed, feature off — falls back to the platform
  // address so a half-verified domain can never bounce a client email.
  let fromAddress = FROM_ADDRESS;
  if (companyId && emailDomainsEnabled()) {
    try {
      const custom = await prisma.company.findUnique({
        where: { id: companyId },
        select: { emailDomain: true, emailDomainStatus: true, emailFromLocal: true },
      });
      if (custom?.emailDomain && custom.emailDomainStatus === "verified") {
        fromAddress = `${custom.emailFromLocal || "notifications"}@${custom.emailDomain}`;
      }
    } catch {
      /* platform address fallback */
    }
  }
  const from = cleanName ? `"${cleanName}" <${fromAddress}>` : fromAddress === FROM_ADDRESS ? FROM : fromAddress;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        text,
        ...(replyTo ? { reply_to: [replyTo] } : {}),
      }),
    });
    if (!res.ok) {
      console.error("[email] resend send failed:", res.status, await res.text());
    } else {
      recordEmailSent(companyId);
    }
    return res.ok;
  } catch (err) {
    console.error("[email] resend send threw:", err);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Platform emails (WorkBench-branded)                                 */
/* ------------------------------------------------------------------ */

/** "You have a new request" notification to the company's inbox. */
export function newRequestEmail({
  companyName,
  requestId,
  requestNumber,
  title,
  details,
  contactName,
  contactPhone,
  contactEmail,
  source,
}: {
  companyName: string;
  requestId: string;
  requestNumber: number;
  title: string;
  details: string | null;
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  source: "booking_form" | "client_hub" | "webhook";
}): { subject: string; html: string } {
  const sourceLabel =
    source === "client_hub"
      ? "your client hub"
      : source === "webhook"
        ? "your lead integration"
        : "your booking form";
  const detailRows = (details ?? "")
    .split("\n")
    .filter(Boolean)
    .map((line) => `<p style="margin:0 0 4px;color:#374151;font-size:14px;">${esc(line)}</p>`)
    .join("");

  const html = wbShell({
    label: `New request · #${requestNumber}`,
    footNote: `Sent to ${esc(companyName)} by WorkBench`,
    inner: `
      <p style="margin:0 0 16px;color:#111827;font-size:15px;">
        A new request just came in from ${sourceLabel}.
      </p>
      <p style="margin:0 0 16px;color:#111827;font-size:20px;font-weight:700;">${esc(title)}</p>
      ${fieldLabel("From", 0)}
      <p style="margin:0 0 2px;color:#111827;font-size:14px;font-weight:600;">${esc(contactName)}</p>
      ${contactPhone ? `<p style="margin:0 0 2px;color:#374151;font-size:14px;">${esc(contactPhone)}</p>` : ""}
      ${contactEmail ? `<p style="margin:0 0 2px;color:#374151;font-size:14px;">${esc(contactEmail)}</p>` : ""}
      ${detailRows ? `${fieldLabel("Details")}${detailRows}` : ""}
      ${wbBtn(`${APP_URL}/app/requests/${requestId}`, "View Request")}`,
  });

  return { subject: `New request: ${title}`, html };
}

/** Heads-up to the company when a client signs a contract. */
export function contractSignedNotifyEmail({
  companyName,
  contractId,
  title,
  signerName,
  signedAt,
}: {
  companyName: string;
  contractId: string;
  title: string;
  signerName: string;
  signedAt: Date;
}): { subject: string; html: string } {
  const when = signedAt.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const html = wbShell({
    label: "Contract signed",
    footNote: `Sent to ${esc(companyName)} by WorkBench`,
    inner: `
      <p style="margin:0 0 16px;color:#111827;font-size:15px;">
        <strong>${esc(signerName)}</strong> signed
        <strong>${esc(title)}</strong> on ${when}.
      </p>
      ${wbBtn(`${APP_URL}/app/contracts/${contractId}`, "View Contract")}`,
  });
  return { subject: `Contract signed: ${title}`, html };
}

/**
 * Password reset for a WorkBench account (the business owner/staff login,
 * not a client). Hub-branded, not company-branded.
 */
export function passwordResetEmail({
  name,
  resetUrl,
}: {
  name: string;
  resetUrl: string;
}): { subject: string; html: string } {
  const html = wbShell({
    label: "Password reset",
    inner: `
      <p style="margin:0 0 12px;color:#111827;font-size:15px;">Hi ${esc(name)},</p>
      <p style="margin:0 0 16px;color:#374151;font-size:14px;">
        We received a request to reset your WorkBench password. Click the
        button below to choose a new one. This link expires in 1 hour and can be
        used once.
      </p>
      ${wbBtn(resetUrl, "Reset Your Password")}
      <p style="margin:16px 0 0;color:#6b7280;font-size:12px;">
        If you didn't request this, you can safely ignore this email — your
        password won't change until you open the link and set a new one.
      </p>`,
  });
  return { subject: "Reset your WorkBench password", html };
}

/**
 * Heads-up when an existing WorkBench login gets added to another company's
 * team (multi-company accounts). Nothing to accept — the membership is live;
 * they switch companies from their profile picture. Hub-branded.
 */
export function teamAddedEmail({
  name,
  companyName,
  roleLabel,
}: {
  name: string;
  companyName: string;
  roleLabel: string;
}): { subject: string; html: string } {
  const base = process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com";
  const html = wbShell({
    label: "Team update",
    inner: `
      <p style="margin:0 0 12px;color:#111827;font-size:15px;">Hi ${esc(name)},</p>
      <p style="margin:0 0 16px;color:#374151;font-size:14px;">
        <strong>${esc(companyName)}</strong> just added you to their team on
        WorkBench as <strong>${esc(roleLabel)}</strong>. Your sign-in stays the
        same — after signing in, tap your profile picture to switch between
        your companies.
      </p>
      ${wbBtn(`${base}/app/dashboard`, "Open WorkBench")}
      <p style="margin:16px 0 0;color:#6b7280;font-size:12px;">
        Not expecting this? Ask ${esc(companyName)} to remove you from their
        team, or contact support.
      </p>`,
  });
  return { subject: `${companyName} added you to their team on WorkBench`, html };
}

/**
 * Confirm a new sign-in address. Goes TO the new address — clicking the link
 * is what proves the person asking actually owns that inbox.
 */
export function emailChangeVerifyEmail({
  name,
  newEmail,
  verifyUrl,
}: {
  name: string;
  newEmail: string;
  verifyUrl: string;
}): { subject: string; html: string } {
  const html = wbShell({
    label: "Confirm your email",
    inner: `
      <p style="margin:0 0 12px;color:#111827;font-size:15px;">Hi ${esc(name)},</p>
      <p style="margin:0 0 16px;color:#374151;font-size:14px;">
        Someone asked to change the WorkBench sign-in email to
        <strong>${esc(newEmail)}</strong>. Confirm below and this becomes the
        address you sign in with. The link expires in 1 hour and works once.
      </p>
      ${wbBtn(verifyUrl, "Confirm This Email")}
      <p style="margin:16px 0 0;color:#6b7280;font-size:12px;">
        If this wasn't you, ignore this email — nothing changes until the link
        is opened, and the old address keeps working.
      </p>`,
  });
  return { subject: "Confirm your new WorkBench email", html };
}

/**
 * Heads-up to the address being moved AWAY from. The old inbox is the one
 * that would notice a takeover, so it gets told before anything happens.
 */
export function emailChangeNoticeEmail({
  name,
  newEmail,
}: {
  name: string;
  newEmail: string;
}): { subject: string; html: string } {
  const html = wbShell({
    label: "Email change requested",
    inner: `
      <p style="margin:0 0 12px;color:#111827;font-size:15px;">Hi ${esc(name)},</p>
      <p style="margin:0 0 16px;color:#374151;font-size:14px;">
        A request was made to change your WorkBench sign-in email to
        <strong>${esc(newEmail)}</strong>. It only takes effect once that
        address confirms it — until then you keep signing in here.
      </p>
      <p style="margin:0;color:#6b7280;font-size:12px;">
        Didn't ask for this? Change your password now and contact us — whoever
        made the request was signed in as you.
      </p>`,
  });
  return { subject: "Someone requested an email change on your WorkBench account", html };
}

/** "New access application" notification to the WorkBench admin inbox. */
export function newApplicationEmail({
  name,
  email,
  phone,
  companyName,
  industry,
  teamSize,
  city,
  state,
  paymentsToday,
  monthlyVolume,
  yearsInBusiness,
  entityType,
  website,
  message,
}: {
  name: string;
  email: string;
  phone: string | null;
  companyName: string;
  industry: string | null;
  teamSize: string | null;
  city: string | null;
  state: string | null;
  paymentsToday: string | null;
  monthlyVolume: string | null;
  yearsInBusiness: string | null;
  entityType: string | null;
  website: string | null;
  message: string | null;
}): { subject: string; html: string } {
  const row = (label: string, value: string | null) =>
    value
      ? `${fieldLabel(label, 0)}<p style="margin:0 0 12px;color:#111827;font-size:14px;">${esc(value)}</p>`
      : "";

  const html = wbShell({
    label: "New application",
    inner: `
      <p style="margin:0 0 16px;color:#111827;font-size:15px;">
        A new company applied for WorkBench access.
      </p>
      ${row("Business", companyName)}
      ${row("Contact", name)}
      ${row("Email", email)}
      ${row("Phone", phone)}
      ${row("Trade", industry)}
      ${row("Team size", teamSize)}
      ${row("Location", [city, state].filter(Boolean).join(", ") || null)}
      ${row("Takes payment today", paymentsToday)}
      ${row("Monthly volume", monthlyVolume)}
      ${row("Years in business", yearsInBusiness)}
      ${row("Structure", entityType)}
      ${row("Website", website)}
      ${row("Notes", message)}
      ${wbBtn(`${APP_URL}/superadmin/applications`, "Review Application")}`,
  });
  return { subject: `New WorkBench application — ${companyName}`, html };
}

/** Platform notification — a tenant filed a bug report or suggestion. */
export function newFeedbackEmail({
  type,
  title,
  details,
  pageUrl,
  userName,
  userEmail,
  companyName,
}: {
  type: "BUG" | "SUGGESTION";
  title: string;
  details: string;
  pageUrl: string | null;
  userName: string;
  userEmail: string;
  companyName: string;
}): { subject: string; html: string } {
  const kind = type === "BUG" ? "Bug report" : "Suggestion";
  const html = wbShell({
    label: `New ${kind.toLowerCase()}`,
    inner: `
      ${fieldLabel(kind, 0)}<p style="margin:0 0 12px;color:#111827;font-size:15px;font-weight:700;">${esc(title)}</p>
      ${fieldLabel("Details")}<p style="margin:0 0 12px;color:#111827;font-size:14px;white-space:pre-line;">${esc(details)}</p>
      ${fieldLabel("From")}<p style="margin:0 0 12px;color:#111827;font-size:14px;">${esc(userName)} (${esc(userEmail)}) · ${esc(companyName)}</p>
      ${pageUrl ? `${fieldLabel("Page")}<p style="margin:0 0 12px;color:#111827;font-size:14px;">${esc(pageUrl)}</p>` : ""}
      ${wbBtn(`${APP_URL}/superadmin/feedback`, "Review Feedback")}`,
  });
  return { subject: `WorkBench ${kind.toLowerCase()} — ${title}`, html };
}

/** Invite code delivery — sent on application approval or a direct invite. */
export function inviteCodeEmail({
  name,
  code,
}: {
  name: string | null;
  code: string;
}): { subject: string; html: string } {
  const signupUrl = `${APP_URL}/app/register?code=${encodeURIComponent(code)}`;
  const html = wbShell({
    label: "You're in",
    inner: `
      <p style="margin:0 0 12px;color:#111827;font-size:15px;">Hi ${esc(name || "there")},</p>
      <p style="margin:0 0 16px;color:#374151;font-size:14px;">
        Your WorkBench access has been approved. Use the invite code below to
        create your account — it's single-use and tied to your business.
      </p>
      ${wbCodeBox(code, 20, 2)}
      ${wbBtn(signupUrl, "Create Your Account")}
      <p style="margin:16px 0 0;color:#6b7280;font-size:12px;">
        The button pre-fills your code. If you weren't expecting this email,
        you can ignore it.
      </p>`,
  });
  return { subject: "You're in — your WorkBench invite code", html };
}

/** Platform-console sign-in code — the email second factor for superadmins. */
export function superadminLoginCodeEmail({ code }: { code: string }): {
  subject: string;
  html: string;
} {
  const html = wbShell({
    label: "Platform console",
    inner: `
      <p style="margin:0 0 16px;color:#374151;font-size:14px;">
        Here's your sign-in code for the WorkBench platform console. It expires
        in 10 minutes and works once.
      </p>
      ${wbCodeBox(code, 24, 6)}
      <p style="margin:16px 0 0;color:#6b7280;font-size:12px;">
        If you didn't just try to sign in, someone else has your password —
        change it now.
      </p>`,
  });
  return { subject: "Your WorkBench console sign-in code", html };
}

/* ------------------------------------------------------------------ */
/* Client-facing emails (company-branded like the documents)           */
/* ------------------------------------------------------------------ */

/**
 * "How did we do?" email with the company's Google review link. Sent when a
 * job completes, and when an invoice with no job behind it is paid off — that
 * second case has no work to name, so the copy drops the job line.
 */
export function reviewRequestEmail({
  brand,
  companyName,
  contactFirstName,
  reviewLink,
  jobTitle,
}: {
  brand: EmailBrand;
  companyName: string;
  contactFirstName: string;
  reviewLink: string;
  jobTitle?: string | null;
}): { subject: string; html: string } {
  const html = clientShell({
    brand,
    companyName,
    context: "Thanks for your business",
    inner: `
      <p style="margin:0 0 12px;color:#111827;font-size:15px;">Hi ${esc(contactFirstName)},</p>
      <p style="margin:0 0 12px;color:#374151;font-size:14px;">
        ${
          jobTitle
            ? `Thanks for choosing ${esc(companyName)} — we just wrapped up
        <strong>${esc(jobTitle)}</strong> and hope everything looks great.`
            : `Thanks for choosing ${esc(companyName)} — we hope everything looks great.`
        }
      </p>
      <p style="margin:0;color:#374151;font-size:14px;">
        If you have a minute, a quick Google review helps our small business more than you know.
      </p>
      ${accentBtn(reviewLink, "Leave a Review", brand)}`,
  });
  return { subject: `How did we do? — ${companyName}`, html };
}

/** Signing-link email to a client when a contract is issued. */
export function contractSignEmail({
  brand,
  companyName,
  contactFirstName,
  title,
  signUrl,
}: {
  brand: EmailBrand;
  companyName: string;
  contactFirstName: string;
  title: string;
  signUrl: string;
}): { subject: string; html: string } {
  const html = clientShell({
    brand,
    companyName,
    context: "Agreement",
    inner: `
      <p style="margin:0 0 12px;color:#111827;font-size:15px;">Hi ${esc(contactFirstName)},</p>
      <p style="margin:0;color:#374151;font-size:14px;">
        ${esc(companyName)} sent you an agreement to review and sign:
        <strong>${esc(title)}</strong>.
      </p>
      ${accentBtn(signUrl, "Review &amp; Sign", brand)}`,
  });
  return { subject: `${companyName} sent you an agreement to sign: ${title}`, html };
}

/**
 * Client-portal access link — sent when the company shares portal access
 * from a contact page, or when a client requests a sign-in link from the
 * portal login page. The link IS the login (magic-link style).
 */
export function hubAccessEmail({
  brand,
  companyName,
  contactFirstName,
  hubUrl,
}: {
  brand: EmailBrand;
  companyName: string;
  contactFirstName: string;
  hubUrl: string;
}): { subject: string; html: string } {
  const html = clientShell({
    brand,
    companyName,
    context: "Client portal",
    inner: `
      <p style="margin:0 0 12px;color:#111827;font-size:15px;">Hi ${esc(contactFirstName)},</p>
      <p style="margin:0;color:#374151;font-size:14px;">
        Here's your personal link to the ${esc(companyName)} client portal — view your
        quotes and invoices, check scheduled visits, and send us new requests.
      </p>
      ${accentBtn(hubUrl, "Open Your Client Portal", brand)}
      <p style="margin:16px 0 0;color:#6b7280;font-size:12px;">
        This link is unique to you — keep it handy, or request a fresh one
        anytime from the portal sign-in page.
      </p>`,
  });
  return { subject: `Your ${companyName} client portal`, html };
}

/**
 * One-off message to a client (composed on the contact page). Deliberately
 * looks like a person wrote it in their mail app — plain white, no brand
 * header, no card chrome, no auto-greeting (the sender writes their own).
 * The signature block is the only footer. Tracking stays: the pixel
 * (classified/filtered by /api/public/open) plus a whisper-quiet "view
 * online" link whose page beacon is the certain open signal.
 */
export function clientMessageEmail({
  messageSubject,
  messageBody,
  signature,
  logoUrl,
  readUrl,
  pixelUrl,
}: {
  messageSubject: string;
  messageBody: string;
  /** Plain-text signature (sender's own, or the generated default) */
  signature: string;
  /** Company logo shown under the signature; null/undefined = text only */
  logoUrl?: string | null;
  readUrl: string;
  pixelUrl: string;
}): { subject: string; html: string } {
  const toHtml = (s: string) => esc(s).replace(/\r\n/g, "\n").replace(/\n/g, "<br />");
  const logo = logoUrl
    ? `<img src="${esc(absUrl(logoUrl))}" alt="" style="display:block;margin-top:14px;max-height:44px;max-width:180px;" />`
    : "";
  const html = `
<div style="font-family:${FONT};background:#ffffff;padding:24px 20px;">
  <div style="max-width:640px;">
    <p style="margin:0;color:#111827;font-size:15px;line-height:1.65;">${toHtml(messageBody)}</p>
    <p style="margin:24px 0 0;color:#374151;font-size:14px;line-height:1.6;">${toHtml(signature)}</p>
    ${logo}
    <p style="margin:32px 0 0;color:#b3b8c0;font-size:11px;">
      <a href="${esc(readUrl)}" style="color:#b3b8c0;text-decoration:underline;">View this message online</a>
    </p>
    <img src="${esc(pixelUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;" />
  </div>
</div>`;
  return { subject: messageSubject, html };
}

/**
 * "You have a new message" ping to a CLIENT — portal messaging thread. The
 * body rides along (it's their message), with a button into the hub thread
 * where they can reply. Company-branded like the other client-facing mail.
 */
export function portalMessageEmail({
  brand,
  companyName,
  contactFirstName,
  messageBody,
  messagesUrl,
}: {
  brand: EmailBrand;
  companyName: string;
  contactFirstName: string;
  messageBody: string;
  messagesUrl: string;
}): { subject: string; html: string } {
  const toHtml = (s: string) => esc(s).replace(/\r\n/g, "\n").replace(/\n/g, "<br />");
  const html = clientShell({
    brand,
    companyName,
    context: "New message",
    inner: `
      <p style="margin:0 0 12px;color:#111827;font-size:15px;">Hi ${esc(contactFirstName)},</p>
      <p style="margin:0 0 12px;color:#374151;font-size:14px;">${esc(companyName)} sent you a message:</p>
      <div style="margin:0 0 4px;padding:12px 14px;background:#f9fafb;border-left:3px solid #d1d5db;border-radius:0 8px 8px 0;">
        <p style="margin:0;color:#111827;font-size:14px;line-height:1.6;">${toHtml(messageBody)}</p>
      </div>
      ${accentBtn(messagesUrl, "Reply in Your Portal", brand)}
      <p style="margin:16px 0 0;color:#6b7280;font-size:12px;">
        Your conversation history lives in your client portal — the button
        above takes you straight to it.
      </p>`,
  });
  return { subject: `New message from ${companyName}`, html };
}

/**
 * "A client messaged you" ping to the COMPANY inbox — sent for the first
 * unread message in a thread (rapid follow-ups collapse into it).
 */
export function portalMessageTeamEmail({
  companyName,
  contactId,
  contactName,
  messageBody,
  via,
}: {
  companyName: string;
  contactId: string;
  contactName: string;
  messageBody: string;
  via: string;
}): { subject: string; html: string } {
  const toHtml = (s: string) => esc(s).replace(/\r\n/g, "\n").replace(/\n/g, "<br />");
  const html = wbShell({
    label: "New client message",
    footNote: `Sent to ${esc(companyName)} by WorkBench`,
    inner: `
      <p style="margin:0 0 16px;color:#111827;font-size:15px;">
        ${esc(contactName)} sent you a message${via === "sms" ? " by text" : " from their client portal"}.
      </p>
      <div style="margin:0 0 4px;padding:12px 14px;background:#f9fafb;border-left:3px solid #d1d5db;border-radius:0 8px 8px 0;">
        <p style="margin:0;color:#111827;font-size:14px;line-height:1.6;">${toHtml(messageBody)}</p>
      </div>
      ${wbBtn(`${APP_URL}/app/messages/thread/${contactId}`, "Open Conversation")}`,
  });
  return { subject: `New message from ${contactName}`, html };
}

/** Signed copy back to the client (their record of the agreement). */
export function contractSignedCopyEmail({
  brand,
  companyName,
  contactFirstName,
  title,
  body,
  signatureName,
  signedAt,
  signUrl,
}: {
  brand: EmailBrand;
  companyName: string;
  contactFirstName: string;
  title: string;
  body: string;
  signatureName: string;
  signedAt: Date;
  signUrl: string;
}): { subject: string; html: string } {
  const bodyHtml = body
    .split("\n")
    .map((line) => `<p style="margin:0 0 8px;color:#374151;font-size:13px;">${esc(line) || "&nbsp;"}</p>`)
    .join("");
  const html = clientShell({
    brand,
    companyName,
    context: "Signed agreement",
    inner: `
      <p style="margin:0 0 12px;color:#111827;font-size:15px;">Hi ${esc(contactFirstName)},</p>
      <p style="margin:0 0 16px;color:#374151;font-size:14px;">
        Here's your copy of <strong>${esc(title)}</strong>, signed by
        <strong>${esc(signatureName)}</strong> on
        ${signedAt.toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}.
      </p>
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;background:#f9fafb;">
        ${bodyHtml}
      </div>
      <a href="${esc(signUrl)}"
         style="display:inline-block;margin-top:16px;color:${linkColor(brand)};text-decoration:underline;font-size:13px;">
        View online
      </a>`,
  });
  return { subject: `Your signed copy: ${title} — ${companyName}`, html };
}

/** Payment-link email to a client whose service-request form auto-sent an invoice. */
export function invoiceLinkEmail({
  brand,
  companyName,
  invoiceNumber,
  total,
  payUrl,
  serviceNames,
}: {
  brand: EmailBrand;
  companyName: string;
  invoiceNumber: number;
  total: number;
  payUrl: string;
  serviceNames: string[];
}): { subject: string; html: string } {
  const items = serviceNames
    .map((s) => `<p style="margin:0 0 4px;color:#374151;font-size:14px;">• ${esc(s)}</p>`)
    .join("");
  const html = clientShell({
    brand,
    companyName,
    context: `Invoice #${invoiceNumber}`,
    inner: `
      <p style="margin:0 0 16px;color:#111827;font-size:15px;">
        Thanks for your request — here's your invoice from ${esc(companyName)}.
      </p>
      ${items}
      ${moneyBlock("Total", total)}
      ${accentBtn(payUrl, "View &amp; Pay Invoice", brand)}
      <p style="margin:12px 0 0;color:#6b7280;font-size:12px;">
        Prefer a copy for your records? <a href="${payUrl}/pdf" style="color:#6b7280;">Download the PDF</a>.
      </p>`,
  });
  return { subject: `Your invoice from ${companyName} — #${invoiceNumber}`, html };
}

/**
 * Autopay dunning — the client's card on file was declined on a recurring
 * invoice. Sent once, on the first failure (retries stay silent); the primary
 * action is fixing the card in the hub, with the pay link as the manual
 * fallback. Tone stays matter-of-fact — cards decline for boring reasons.
 */
export function autopayFailedEmail({
  brand,
  companyName,
  invoiceNumber,
  total,
  cardLabel,
  payUrl,
  updateCardUrl,
}: {
  brand: EmailBrand;
  companyName: string;
  invoiceNumber: number;
  total: number;
  cardLabel: string | null;
  payUrl: string;
  updateCardUrl: string;
}): { subject: string; html: string } {
  const html = clientShell({
    brand,
    companyName,
    context: `Invoice #${invoiceNumber}`,
    inner: `
      <p style="margin:0 0 16px;color:#111827;font-size:15px;">
        The automatic payment for your invoice from ${esc(companyName)} didn't go
        through${cardLabel ? ` — ${esc(cardLabel)} was declined` : ""}. This usually
        just means the card expired or was replaced.
      </p>
      ${moneyBlock("Amount due", total)}
      ${accentBtn(updateCardUrl, "Update Card on File", brand)}
      <p style="margin:16px 0 0;color:#374151;font-size:14px;">
        We'll automatically try again once your card is updated. Prefer to pay this
        one directly? <a href="${payUrl}" style="color:#374151;">Pay the invoice online</a>.
      </p>`,
  });
  return {
    subject: `Payment didn't go through — invoice #${invoiceNumber} from ${companyName}`,
    html,
  };
}

/**
 * Card-expiry heads-up for clients on autopay — sent once per card, ~30 days
 * before (or after) the card on file expires, so recurring charges don't
 * start bouncing.
 */
export function cardExpiringEmail({
  brand,
  companyName,
  cardLabel,
  expired,
  updateCardUrl,
}: {
  brand: EmailBrand;
  companyName: string;
  cardLabel: string;
  expired: boolean;
  updateCardUrl: string;
}): { subject: string; html: string } {
  const html = clientShell({
    brand,
    companyName,
    context: "Card on file",
    inner: `
      <p style="margin:0 0 16px;color:#111827;font-size:15px;">
        The card you keep on file with ${esc(companyName)} for automatic payments
        (${esc(cardLabel)}) ${expired ? "has expired" : "expires soon"}. Updating it
        now keeps your service billing running without interruption.
      </p>
      ${accentBtn(updateCardUrl, "Update Card on File", brand)}`,
  });
  return {
    subject: expired
      ? `Your card on file with ${companyName} has expired`
      : `Your card on file with ${companyName} expires soon`,
    html,
  };
}

/**
 * Quote follow-up — a friendly nudge a few days after a quote went out with no
 * response. Two stages (3 and 7 days); tone stays light — this is sales, not
 * dunning. Stops the moment the quote is approved, changed, or expires.
 */
export function quoteFollowUpEmail({
  brand,
  companyName,
  quoteNumber,
  total,
  viewUrl,
  stage,
  validUntil,
}: {
  brand: EmailBrand;
  companyName: string;
  quoteNumber: number;
  total: number;
  viewUrl: string;
  stage: "followup_3" | "followup_7";
  validUntil?: Date | null;
}): { subject: string; html: string } {
  const opener =
    stage === "followup_3"
      ? `Just checking in — here's the quote from ${esc(companyName)} in case it got buried. Review and approve online whenever you're ready.`
      : `Your quote from ${esc(companyName)} is still open. If anything looks off, reply and we'll adjust it — otherwise you can approve online in a minute.`;
  const expiryNote = validUntil
    ? `<p style="margin:10px 0 0;color:#b45309;font-size:13px;">This quote is valid until ${validUntil.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.</p>`
    : "";
  const html = clientShell({
    brand,
    companyName,
    context: `Quote #${quoteNumber}`,
    inner: `
      <p style="margin:0 0 16px;color:#111827;font-size:15px;">${opener}</p>
      ${moneyBlock("Quote total", total)}
      ${expiryNote}
      ${accentBtn(viewUrl, "Review &amp; Approve Quote", brand)}
      <p style="margin:12px 0 0;color:#6b7280;font-size:12px;">
        Questions or changes? Just reply to this email.
      </p>`,
  });
  return {
    subject:
      stage === "followup_3"
        ? `Still thinking it over? Your quote from ${companyName} — #${quoteNumber}`
        : `Your quote from ${companyName} is still open — #${quoteNumber}`,
    html,
  };
}

/**
 * Payment receipt — to the client right after a payment lands on their invoice.
 * Covers online card/ACH payments, card-on-file charges, subscription
 * auto-charges, and (opt-in) manually recorded payments. `pending` softens the
 * copy for ACH debits that haven't settled yet.
 */
export function paymentReceiptEmail({
  brand,
  companyName,
  invoiceNumber,
  amount,
  methodLabel,
  remainingBalance,
  payUrl,
  pending,
}: {
  brand: EmailBrand;
  companyName: string;
  invoiceNumber: number;
  amount: number;
  methodLabel: string;
  remainingBalance: number;
  payUrl: string;
  pending?: boolean;
}): { subject: string; html: string } {
  const balanceNote =
    remainingBalance > 0
      ? `<p style="margin:12px 0 0;color:#374151;font-size:14px;">Remaining balance: <strong>$${remainingBalance.toFixed(2)}</strong></p>`
      : `<p style="margin:12px 0 0;color:#15803d;font-size:14px;font-weight:600;">This invoice is paid in full — thank you!</p>`;
  const html = clientShell({
    brand,
    companyName,
    context: `Receipt — Invoice #${invoiceNumber}`,
    inner: `
      <p style="margin:0 0 16px;color:#111827;font-size:15px;">
        ${
          pending
            ? `Your bank payment to ${esc(companyName)} is processing — this is your confirmation. It usually clears within a few business days.`
            : `Thank you! Here's your receipt from ${esc(companyName)}.`
        }
      </p>
      ${moneyBlock(pending ? "Amount processing" : "Amount paid", amount)}
      <p style="margin:8px 0 0;color:#6b7280;font-size:13px;">${esc(methodLabel)} · Invoice #${invoiceNumber}</p>
      ${balanceNote}
      <p style="margin:16px 0 0;color:#6b7280;font-size:12px;">
        Need a copy for your records? <a href="${payUrl}/pdf" style="color:#6b7280;">Download the invoice PDF</a>${remainingBalance > 0 ? ` or <a href="${payUrl}" style="color:#6b7280;">pay the remaining balance</a>` : ""}.
      </p>`,
  });
  return {
    subject: pending
      ? `Payment processing — $${amount.toFixed(2)} to ${companyName}`
      : `Receipt from ${companyName} — $${amount.toFixed(2)}`,
    html,
  };
}

/**
 * Quote-ready email — sent to a client when a service request comes in on a
 * "send" form (or a quote is shared), linking them to the public approval page.
 * `depositNote` surfaces a required deposit so there are no surprises at approval.
 */
export function quoteLinkEmail({
  brand,
  companyName,
  quoteNumber,
  total,
  viewUrl,
  serviceNames,
  depositNote,
}: {
  brand: EmailBrand;
  companyName: string;
  quoteNumber: number;
  total: number;
  viewUrl: string;
  serviceNames: string[];
  depositNote?: string;
}): { subject: string; html: string } {
  const items = serviceNames
    .map((s) => `<p style="margin:0 0 4px;color:#374151;font-size:14px;">• ${esc(s)}</p>`)
    .join("");
  const deposit = depositNote
    ? `<p style="margin:8px 0 0;color:#6b7280;font-size:13px;">${esc(depositNote)}</p>`
    : "";
  const html = clientShell({
    brand,
    companyName,
    context: `Quote #${quoteNumber}`,
    inner: `
      <p style="margin:0 0 16px;color:#111827;font-size:15px;">
        Thanks for your request — here's your quote from ${esc(companyName)}. Review it and approve online to get started.
      </p>
      ${items}
      ${moneyBlock("Total", total)}
      ${deposit}
      ${accentBtn(viewUrl, "View &amp; Approve Quote", brand)}
      <p style="margin:12px 0 0;color:#6b7280;font-size:12px;">
        Prefer a copy for your records? <a href="${viewUrl}/pdf" style="color:#6b7280;">Download the PDF</a>.
      </p>`,
  });
  return { subject: `Your quote from ${companyName} — #${quoteNumber}`, html };
}

const windowBlock = (windowLabel: string, address?: string | null) => `
      ${fieldLabel("Arrival window")}
      <p style="margin:0;color:#111827;font-size:18px;font-weight:700;">${esc(windowLabel)}</p>
      ${address ? `<p style="margin:6px 0 0;color:#374151;font-size:14px;">${esc(address)}</p>` : ""}`;

/** To the client right after they self-schedule: received, awaiting confirmation. */
export function bookingReceivedEmail({
  brand,
  companyName,
  contactFirstName,
  serviceName,
  windowLabel,
  address,
}: {
  brand: EmailBrand;
  companyName: string;
  contactFirstName: string;
  serviceName: string;
  windowLabel: string;
  address?: string | null;
}): { subject: string; html: string } {
  const html = clientShell({
    brand,
    companyName,
    context: "Booking received",
    inner: `<p style="margin:0 0 12px;color:#111827;font-size:15px;">Hi ${esc(contactFirstName)},</p>
      <p style="margin:0;color:#374151;font-size:14px;">
        Thanks for booking <strong>${esc(serviceName)}</strong> with ${esc(companyName)}.
        Your requested time is penciled in — we'll confirm it shortly and you'll get
        another email when it's locked in.
      </p>
      ${windowBlock(windowLabel, address)}`,
  });
  return { subject: `Booking received — ${serviceName} with ${companyName}`, html };
}

/** To the client when the business hits Accept and Schedule. */
export function bookingConfirmedEmail({
  brand,
  companyName,
  companyEmail,
  contactFirstName,
  serviceName,
  windowLabel,
  address,
}: {
  brand: EmailBrand;
  companyName: string;
  companyEmail?: string | null;
  contactFirstName: string;
  serviceName: string;
  windowLabel: string;
  address?: string | null;
}): { subject: string; html: string } {
  const html = clientShell({
    brand,
    companyName,
    context: "Booking confirmed",
    inner: `<p style="margin:0 0 12px;color:#111827;font-size:15px;">Hi ${esc(contactFirstName)},</p>
      <p style="margin:0;color:#374151;font-size:14px;">
        Good news — your <strong>${esc(serviceName)}</strong> booking with
        ${esc(companyName)} is confirmed. We'll see you then!
      </p>
      ${windowBlock(windowLabel, address)}
      ${companyEmail ? `<p style="margin:16px 0 0;color:#6b7280;font-size:13px;">Need to change the time? Reply to this email and we'll sort it out.</p>` : ""}`,
  });
  return { subject: `Confirmed: ${serviceName} — ${windowLabel}`, html };
}

/** To the client when the business declines the booking. */
export function bookingDeclinedEmail({
  brand,
  companyName,
  companyEmail,
  contactFirstName,
  serviceName,
  windowLabel,
}: {
  brand: EmailBrand;
  companyName: string;
  companyEmail?: string | null;
  contactFirstName: string;
  serviceName: string;
  windowLabel: string | null;
}): { subject: string; html: string } {
  const html = clientShell({
    brand,
    companyName,
    context: "Booking update",
    inner: `<p style="margin:0 0 12px;color:#111827;font-size:15px;">Hi ${esc(contactFirstName)},</p>
      <p style="margin:0;color:#374151;font-size:14px;">
        Unfortunately ${esc(companyName)} couldn't make
        ${windowLabel ? `<strong>${esc(windowLabel)}</strong>` : "your requested time"} work
        for <strong>${esc(serviceName)}</strong>.
      </p>
      <p style="margin:12px 0 0;color:#374151;font-size:14px;">
        We'd still love to help —
        ${companyEmail ? "reply to this email" : "get in touch"} and we'll find a time that works.
      </p>`,
  });
  return { subject: `About your ${serviceName} booking with ${companyName}`, html };
}

/** Appointment reminder to the client: the day before, and again about an hour out. */
export function appointmentReminderEmail({
  brand,
  companyName,
  companyEmail,
  contactFirstName,
  serviceName,
  windowLabel,
  address,
  stage,
}: {
  brand: EmailBrand;
  companyName: string;
  companyEmail?: string | null;
  contactFirstName: string;
  serviceName: string;
  windowLabel: string;
  address?: string | null;
  stage: "day" | "hour";
}): { subject: string; html: string } {
  const lead =
    stage === "day"
      ? `A quick reminder about your upcoming <strong>${esc(serviceName)}</strong> appointment with ${esc(companyName)}.`
      : `${esc(companyName)} will arrive soon for your <strong>${esc(serviceName)}</strong> appointment.`;
  const html = clientShell({
    brand,
    companyName,
    context: "Appointment reminder",
    inner: `<p style="margin:0 0 12px;color:#111827;font-size:15px;">Hi ${esc(contactFirstName)},</p>
      <p style="margin:0;color:#374151;font-size:14px;">${lead}</p>
      ${windowBlock(windowLabel, address)}
      ${companyEmail ? `<p style="margin:16px 0 0;color:#6b7280;font-size:13px;">Need to reschedule? Reply to this email.</p>` : ""}`,
  });
  return {
    subject:
      stage === "day"
        ? `Reminder: ${serviceName} — ${windowLabel}`
        : `We're on our way soon: ${serviceName} — ${windowLabel}`,
    html,
  };
}

/**
 * Payment reminder / dunning email. Tone escalates by stage: a friendly nudge
 * on the due date through a firmer final notice at two weeks overdue.
 */
export function paymentReminderEmail({
  brand,
  companyName,
  companyEmail,
  invoiceNumber,
  balance,
  payUrl,
  dueDate,
  stage,
}: {
  brand: EmailBrand;
  companyName: string;
  companyEmail?: string | null;
  invoiceNumber: number;
  balance: number;
  payUrl: string;
  dueDate: Date;
  stage: "due" | "overdue_3" | "overdue_7" | "overdue_14";
}): { subject: string; html: string } {
  const due = dueDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const copy = {
    due: {
      subject: `Payment reminder — invoice #${invoiceNumber} from ${companyName}`,
      lead: `This is a friendly reminder that invoice #${invoiceNumber} is due today (${due}).`,
    },
    overdue_3: {
      subject: `Past due — invoice #${invoiceNumber} from ${companyName}`,
      lead: `Invoice #${invoiceNumber} was due on ${due} and is now a few days past due.`,
    },
    overdue_7: {
      subject: `Second notice — invoice #${invoiceNumber} from ${companyName}`,
      lead: `Invoice #${invoiceNumber} has been past due since ${due}. Please arrange payment when you can.`,
    },
    overdue_14: {
      subject: `Final notice — invoice #${invoiceNumber} from ${companyName}`,
      lead: `Invoice #${invoiceNumber} has been past due since ${due}. This is a final reminder before follow-up.`,
    },
  }[stage];

  const html = clientShell({
    brand,
    companyName,
    context: `Invoice #${invoiceNumber}`,
    inner: `
      <p style="margin:0 0 16px;color:#111827;font-size:15px;">${esc(copy.lead)}</p>
      ${moneyBlock("Balance due", balance)}
      ${accentBtn(payUrl, "View &amp; Pay Invoice", brand)}
      ${companyEmail ? `<p style="margin:20px 0 0;color:#6b7280;font-size:13px;">Already paid or have a question? Reply to this email or reach ${esc(companyName)} at ${esc(companyEmail)}.</p>` : ""}`,
  });
  return { subject: copy.subject, html };
}
