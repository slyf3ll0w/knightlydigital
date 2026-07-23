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

import { recordEmailSent } from "@/lib/usage";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM ?? "WorkBench <notifications@workbenchfsm.com>";
// Bare address from FROM — sends that brand the display name still have to
// use the Resend-verified domain, only the name in front of it changes.
const FROM_ADDRESS = FROM.match(/<([^>]+)>/)?.[1] ?? FROM;
const APP_URL = process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com";

const WB_NAVY = "#0A1428";
const WB_BLUE = "#0B57D8";
const WB_ORANGE = "#F97316";
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
  hex(brand.documentColor) ?? hex(brand.brandColor) ?? WB_NAVY;

/** Button/accent color — same fallback chain as brandAccent() on the doc pages. */
const accentColor = (brand: EmailBrand) =>
  hex(brand.brandColorSecondary) ?? hex(brand.brandColor) ?? WB_BLUE;

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

export async function sendEmail({
  to,
  subject,
  html,
  replyTo,
  fromName,
  companyId,
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
}): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
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
<body style="margin:0;padding:0;background-color:#f3f4f6;color-scheme:light only;" bgcolor="#f3f4f6">
${html}
</body>
</html>`;
  // Company names are user input headed into an email header — strip anything
  // that could break out of the quoted display name.
  const cleanName = fromName?.replace(/[\r\n"<>]/g, "").trim();
  const from = cleanName ? `"${cleanName}" <${FROM_ADDRESS}>` : FROM;
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

/** "How did we do?" email with the company's Google review link, sent when a job completes. */
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
  jobTitle: string;
}): { subject: string; html: string } {
  const html = clientShell({
    brand,
    companyName,
    context: "Thanks for your business",
    inner: `
      <p style="margin:0 0 12px;color:#111827;font-size:15px;">Hi ${esc(contactFirstName)},</p>
      <p style="margin:0 0 12px;color:#374151;font-size:14px;">
        Thanks for choosing ${esc(companyName)} — we just wrapped up
        <strong>${esc(jobTitle)}</strong> and hope everything looks great.
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
      ${accentBtn(payUrl, "View &amp; Pay Invoice", brand)}`,
  });
  return { subject: `Your invoice from ${companyName} — #${invoiceNumber}`, html };
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
      ${accentBtn(viewUrl, "View &amp; Approve Quote", brand)}`,
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
