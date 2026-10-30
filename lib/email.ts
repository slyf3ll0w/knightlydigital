import { reportError } from "@/lib/report-error";
/**
 * Transactional email via Resend. Env-gated like the captcha: without
 * RESEND_API_KEY every send is a silent no-op, so the code can ship before
 * the domain is verified.
 *
 * EMAIL_FROM must use the domain verified in Resend
 * (default: notifications@workbenchfsm.com).
 *
 * Every template is a plain letter (David 2026-10-24: the old card-on-gray
 * shells with caps labels, colored rules and rubber stamps read as AI
 * generated). White page, left-aligned text, short plain sentences, at most
 * one button, a sign-off. No headings, no badges, no em dashes in the copy.
 *
 * - clientShell() — client-facing (quotes, invoices, bookings, contracts,
 *                   portal). The company's logo when it has one, the
 *                   message, then "Thanks, <company>" + phone and a quiet
 *                   "Sent with WorkBench". The button and links use the
 *                   company's accent (brandAccent semantics).
 * - wbShell()     — platform emails (notifications to businesses, invites,
 *                   password resets, console codes). Same letter, signed by
 *                   WorkBench, WorkBench blue button.
 */

import { prisma } from "@/lib/db";
import { recordEmailSent } from "@/lib/usage";
import { emailDomainsEnabled } from "@/lib/email-domains";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM ?? "WorkBench <notifications@workbenchfsm.com>";
// Bare address from FROM — sends that brand the display name still have to
// use the Resend-verified domain, only the name in front of it changes.
const FROM_ADDRESS = FROM.match(/<([^>]+)>/)?.[1] ?? FROM;
// Trailing slash stripped: NEXTAUTH_URL set to "https://x.com/" would mint
// "https://x.com//quote/…" links — double slashes read as URL obfuscation to
// phishing filters (Yahoo PH01 bounced exactly this).
const APP_URL = (process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com").replace(/\/+$/, "");


const WB_BLUE = "#0B57D8";
const WB_ORANGE = "#F86808"; // the logo's Bench orange
const FONT = "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif";

// Letter palette: one text color, one quiet gray, one hairline.
const TEXT = "#1F2937";
const QUIET = "#6B7280";
const HAIR = "#E5E7EB";

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
  /** Client-document color — kept in the type so callers' selects compile; not painted. */
  documentColor?: string | null;
  logoUrl?: string | null;
  /** Company phone, printed under the sign-off when present. */
  phone?: string | null;
};

const BRAND_HEX = /^#[0-9a-fA-F]{6}$/;
const hex = (v: string | null | undefined) => (BRAND_HEX.test(v ?? "") ? v! : null);

function luminance(h: string): number {
  const n = parseInt(h.slice(1), 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
}
const onColor = (bg: string) => (luminance(bg) > 160 ? "#111827" : "#ffffff");

/** Button/accent color — same fallback chain as brandAccent() on the doc pages. */
const accentColor = (brand: EmailBrand) =>
  hex(brand.brandColorSecondary) ?? hex(brand.brandColor) ?? WB_ORANGE;

/** Inline text links sit on white — flip too-light accents back to blue. */
const linkColor = (brand: EmailBrand) => {
  const a = accentColor(brand);
  return luminance(a) > 200 ? WB_BLUE : a;
};

const absUrl = (u: string) => (u.startsWith("http") ? u : `${APP_URL}${u}`);

/** "$1,485.00" — same formatting as the documents' money() (lib/statuses). */
const usd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** All email content is user input — escape it before it goes into HTML. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Multi-line user text (messages, notes) → escaped HTML with line breaks. */
const multiline = (s: string) => esc(s).replace(/\r\n/g, "\n").replace(/\n/g, "<br />");

/* ------------------------------------------------------------------ */
/* Letter pieces                                                       */
/* ------------------------------------------------------------------ */

/** A paragraph of the letter. `html` is trusted markup — escape user input first. */
const p = (html: string) =>
  `<p style="margin:0 0 14px;color:${TEXT};font-size:15px;line-height:1.6;font-family:${FONT};">${html}</p>`;

/** Smaller gray aside (a PDF link, "reply to this email"). */
const aside = (html: string) =>
  `<p style="margin:0 0 14px;color:${QUIET};font-size:13px;line-height:1.5;font-family:${FONT};">${html}</p>`;

const hello = (firstName?: string | null) => p(firstName?.trim() ? `Hi ${esc(firstName.trim())},` : "Hello,");

/** A plain link in the body copy. */
const link = (href: string, label: string, color: string) =>
  `<a href="${esc(href)}" style="color:${color};text-decoration:underline;">${label}</a>`;

/**
 * Facts set apart from the sentences: "label  value" lines, the way someone
 * would line them up in a typed email. Values are trusted markup.
 */
function facts(rows: { label: string; value: string }[]): string {
  if (rows.length === 0) return "";
  const tr = rows
    .map(
      (r) =>
        `<tr><td style="padding:3px 16px 3px 0;color:${QUIET};font-size:14px;font-family:${FONT};vertical-align:top;white-space:nowrap;">${esc(r.label)}</td><td style="padding:3px 0;color:${TEXT};font-size:14px;font-family:${FONT};vertical-align:top;">${r.value}</td></tr>`
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border-collapse:collapse;">${tr}</table>`;
}

/**
 * What's on the quote/invoice: the item names, then the total on its own
 * line under a hairline. `after` rows (remaining balance, deposit) follow it.
 */
function ledger(
  names: string[],
  total: { label: string; amount: number },
  after: { label: string; amount: number }[] = []
): string {
  const cell = `font-size:14px;font-family:${FONT};`;
  const items = names
    .map((n) => `<tr><td colspan="2" style="padding:4px 0;color:${TEXT};${cell}">${esc(n)}</td></tr>`)
    .join("");
  const totalRow = `<tr>
      <td style="padding:${names.length ? "8px" : "0"} 0 0;${names.length ? `border-top:1px solid ${HAIR};` : ""}color:${TEXT};font-size:15px;font-weight:600;font-family:${FONT};">${esc(total.label)}</td>
      <td style="padding:${names.length ? "8px" : "0"} 0 0;${names.length ? `border-top:1px solid ${HAIR};` : ""}color:${TEXT};font-size:15px;font-weight:600;font-family:${FONT};text-align:right;white-space:nowrap;">${usd(total.amount)}</td>
    </tr>`;
  const afterRows = after
    .map(
      (r) =>
        `<tr><td style="padding:4px 0 0;color:${QUIET};${cell}">${esc(r.label)}</td><td style="padding:4px 0 0;color:${QUIET};${cell}text-align:right;white-space:nowrap;">${usd(r.amount)}</td></tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;margin:0 0 18px;border-collapse:collapse;">${items}${totalRow}${afterRows}</table>`;
}

/** The one button in a client email, in the company's accent. */
function button(href: string, label: string, brand: EmailBrand): string {
  const a = accentColor(brand);
  return `<p style="margin:4px 0 20px;"><a href="${esc(href)}" style="display:inline-block;background:${a};color:${onColor(a)};text-decoration:none;font-size:15px;font-weight:600;font-family:${FONT};padding:11px 20px;border-radius:6px;">${label}</a></p>`;
}

/**
 * Client-facing letter. Logo (when the company has one), the message, the
 * sign-off with the company name and phone, then a quiet "Sent with
 * WorkBench". Nothing else: no header band, no labels, no stamps.
 */
function clientShell({
  brand,
  companyName,
  inner,
  signoff = "Thanks,",
}: {
  brand: EmailBrand;
  companyName: string;
  inner: string;
  /** First line of the sign-off; "" drops it (the name still signs). */
  signoff?: string;
}): string {
  const logo = brand.logoUrl
    ? `<img src="${esc(absUrl(brand.logoUrl))}" alt="${esc(companyName)}" style="display:block;max-height:40px;max-width:180px;margin:0 0 24px;border:0;" />`
    : "";
  const sign = [signoff ? esc(signoff) : "", esc(companyName), brand.phone ? esc(brand.phone) : ""].filter(Boolean).join("<br />");
  return `
<div style="background:#ffffff;padding:28px 20px;font-family:${FONT};">
  <div style="max-width:560px;">
    ${logo}
    ${inner}
    <p style="margin:6px 0 0;color:${TEXT};font-size:15px;line-height:1.6;font-family:${FONT};">${sign}</p>
    <p style="margin:36px 0 0;color:#9CA3AF;font-size:12px;font-family:${FONT};">Sent with <a href="https://workbenchfsm.com" style="color:#9CA3AF;text-decoration:underline;">WorkBench</a></p>
  </div>
</div>`;
}

/** WorkBench-blue button for platform emails. */
const wbBtn = (href: string, label: string) =>
  `<p style="margin:4px 0 20px;"><a href="${esc(href)}" style="display:inline-block;background:${WB_BLUE};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;font-family:${FONT};padding:11px 20px;border-radius:6px;">${label}</a></p>`;

/** A one-time code, big enough to read and copy. */
const wbCode = (code: string, letterSpacing: number) =>
  `<p style="margin:0 0 18px;color:${TEXT};font-size:26px;font-weight:700;letter-spacing:${letterSpacing}px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">${esc(code)}</p>`;

/**
 * Platform letter — the WorkBench wordmark, the message, a quiet footer
 * (who it was sent to and why, then workbenchfsm.com).
 */
function wbShell({
  inner,
  footNote,
}: {
  inner: string;
  /** Optional extra footer line (e.g. which company this was sent to). */
  footNote?: string;
}): string {
  return `
<div style="background:#ffffff;padding:28px 20px;font-family:${FONT};">
  <div style="max-width:560px;">
    <img src="${APP_URL}/workbench-logo-email.png" alt="WorkBench" width="144" height="24" style="display:block;height:24px;width:144px;margin:0 0 24px;border:0;" />
    ${inner}
    <p style="margin:36px 0 0;color:#9CA3AF;font-size:12px;line-height:1.5;font-family:${FONT};">${footNote ? `${footNote}<br />` : ""}WorkBench · <a href="https://workbenchfsm.com" style="color:#9CA3AF;text-decoration:underline;">workbenchfsm.com</a></p>
  </div>
</div>`;
}

const longDate = (d: Date) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
const longDateTime = (d: Date) =>
  d.toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

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
      // Table cells become column-ish gaps, rows become lines (the paper
      // shell's header/ledger/items tables all flatten to sane text this way)
      .replace(/<\/t[dh]>/gi, "  ")
      .replace(/<\/(p|div|h[1-6]|tr|table)>/gi, "\n")
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
 *  importing the payments stack — this file must stay import-cycle-free).
 *  Exported so sweeps that CLAIM a one-shot send (reminder stages) can check
 *  before claiming — a claim whose send is blocked is a reminder lost forever. */
export async function companyEmailBlocked(companyId: string): Promise<boolean> {
  if (process.env.PAYMENT_PROCESSOR !== "finix") return false;
  // Payments onboarding closed (lib/payments-gate.ts, 2026-09-30): accounts are
  // fully usable and only *charging* is held — a company that signed up
  // without an invite still has to be able to email a quote. The approval
  // hold on email applies only while the underwriting gate is open. (Env read
  // inlined: this module must stay import-cycle-free.)
  if (process.env.PAYMENTS_ONBOARDING_OPEN !== "1") return false;
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
  pageBackground = "#ffffff",
  attachments,
}: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  /** File attachments (base64 content) — .ics calendar invites, PDFs. */
  attachments?: { filename: string; content: string }[];
  /** Display name shown as the sender (e.g. the tenant company's name). Falls back to EMAIL_FROM. */
  fromName?: string;
  /** Tenant to meter this send against (lib/usage.ts). Omitted → counted as
   *  platform overhead (password resets, portal logins). */
  companyId?: string | null;
  /** Canvas behind the template. Every template is a white letter now;
   *  kept for callers that still pass it. */
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
      // Dozens of request handlers await this send inline — never let a
      // slow mail API hold the request open indefinitely
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        text,
        ...(replyTo ? { reply_to: [replyTo] } : {}),
        ...(attachments && attachments.length ? { attachments } : {}),
      }),
    });
    if (!res.ok) {
      reportError("[email] resend send failed:", res.status, await res.text());
    } else {
      recordEmailSent(companyId);
    }
    return res.ok;
  } catch (err) {
    reportError("[email] resend send threw:", err);
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
    source === "client_hub" ? "your client portal" : source === "webhook" ? "your lead integration" : "your booking form";
  const html = wbShell({
    footNote: `Sent to ${esc(companyName)}`,
    inner: `
      ${p(`${esc(contactName)} sent request #${requestNumber} through ${sourceLabel}: <strong>${esc(title)}</strong>`)}
      ${facts([
        ...(contactPhone ? [{ label: "Phone", value: esc(contactPhone) }] : []),
        ...(contactEmail ? [{ label: "Email", value: esc(contactEmail) }] : []),
      ])}
      ${details?.trim() ? p(multiline(details.trim())) : ""}
      ${wbBtn(`${APP_URL}/app/requests/${requestId}`, "Open the request")}`,
  });
  return { subject: `New request from ${contactName}: ${title}`, html };
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
  const html = wbShell({
    footNote: `Sent to ${esc(companyName)}`,
    inner: `
      ${p(`${esc(signerName)} signed <strong>${esc(title)}</strong> on ${longDateTime(signedAt)}.`)}
      ${wbBtn(`${APP_URL}/app/contracts/${contractId}`, "Open the contract")}`,
  });
  return { subject: `${signerName} signed ${title}`, html };
}

/**
 * Password reset for a WorkBench account (the business owner/staff login,
 * not a client). Hub-branded, not company-branded.
 */
export function passwordResetEmail({
  name,
  resetUrl,
  hasPassword = true,
}: {
  name: string;
  resetUrl: string;
  /** False for a Google-only login: the link sets its first password. */
  hasPassword?: boolean;
}): { subject: string; html: string } {
  const html = wbShell({
    inner: hasPassword
      ? `
      ${hello(name)}
      ${p("Use the button below to choose a new WorkBench password. The link works once and expires in an hour.")}
      ${wbBtn(resetUrl, "Choose a new password")}
      ${aside("If you didn't ask for this, ignore this email. Your password stays the same.")}`
      : `
      ${hello(name)}
      ${p("You sign in to WorkBench with Google, so there's no password on your login yet. Use the button below to set one, and you can sign in either way. The link works once and expires in an hour.")}
      ${wbBtn(resetUrl, "Set a password")}
      ${aside("If you didn't ask for this, ignore this email. Signing in with Google keeps working.")}`,
  });
  return {
    subject: hasPassword ? "Reset your WorkBench password" : "Set a password for your WorkBench login",
    html,
  };
}

/**
 * Texting registration outcome for a company's owners (lib/business-line.ts
 * notifies on every status change the carriers make while nobody is looking):
 * approved, sent back with a reason they can fix in Settings, or sent back on
 * the platform's side of the paperwork. Platform-branded — the sender is
 * WorkBench, not the tenant.
 */
export function lineRegistrationEmail({
  companyName,
  lineNumber,
  outcome,
  reason,
}: {
  companyName: string;
  lineNumber: string | null;
  outcome: "active" | "rejected" | "campaign_rejected";
  reason: string | null;
}): { subject: string; html: string } {
  const settings = `${APP_URL}/app/settings?s=phone`;
  const number = lineNumber ? ` from ${esc(lineNumber)}` : "";
  if (outcome === "active") {
    return {
      subject: `Texting is on for ${companyName}`,
      html: wbShell({
        inner: `
      ${p(`The carriers approved ${esc(companyName)} for texting. Appointment reminders, invoice links and your replies now go out${number} under your business name.`)}
      ${p("There's nothing to switch on.")}
      ${wbBtn(settings, "Open Phone & texting")}`,
      }),
    };
  }
  if (outcome === "campaign_rejected") {
    return {
      subject: `Texting for ${companyName} was sent back`,
      html: wbShell({
        inner: `
      ${p(`The carriers sent back the texting application for ${esc(companyName)}. This part of the paperwork is ours, not yours, and we're already working it out with them.`)}
      ${p("You don't need to change anything. Calls and voicemail keep working in the meantime.")}
      ${wbBtn(settings, "See the status")}`,
      }),
    };
  }
  return {
    subject: `Texting for ${companyName} needs a fix`,
    html: wbShell({
      inner: `
      ${p(`The carrier registry didn't approve texting for ${esc(companyName)}. Their reason:`)}
      ${p(`<em>${esc(reason ?? "They didn't give one. Open Settings for details.")}</em>`)}
      ${p(`Fix what they named and resubmit from Settings. We re-file corrected registrations right away, and calls and voicemail keep working until then. ${link(`${APP_URL}/texting-registration`, "What the registry checks", WB_BLUE)}.`)}
      ${wbBtn(settings, "Fix and resubmit")}`,
    }),
  };
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
  const html = wbShell({
    inner: `
      ${hello(name)}
      ${p(`${esc(companyName)} added you to their team on WorkBench as ${esc(roleLabel)}. You sign in the same way as before. To switch companies, tap your profile picture.`)}
      ${wbBtn(`${APP_URL}/app/dashboard`, "Open WorkBench")}
      ${aside(`Not expecting this? Ask ${esc(companyName)} to remove you, or reply to this email.`)}`,
  });
  return { subject: `${companyName} added you to their team on WorkBench`, html };
}

/**
 * Security notice: a third-party sign-in (Google, Apple) was just connected
 * to an EXISTING login. Goes to the account's own address — the one person
 * who can tell whether they did it.
 */
export function signInMethodLinkedEmail({
  provider,
  providerEmail,
}: {
  provider: string;
  providerEmail: string | null;
}): { subject: string; html: string } {
  const html = wbShell({
    inner: `
      ${hello()}
      ${p(`Sign in with ${esc(provider)} was just connected to your WorkBench login${providerEmail ? ` (${esc(providerEmail)})` : ""}. That ${esc(provider)} account can now open WorkBench without a password.`)}
      ${wbBtn(`${APP_URL}/app/settings/profile`, "Review sign-in methods")}
      ${aside("If this wasn't you, disconnect it under Settings, My Profile, Connected sign-ins, then change your password and reply to this email.")}`,
  });
  return { subject: `Sign in with ${provider} was connected to your WorkBench login`, html };
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
    inner: `
      ${hello(name)}
      ${p(`Someone asked to change the WorkBench sign-in email to ${esc(newEmail)}. Confirm below and you'll sign in with this address from now on. The link works once and expires in an hour.`)}
      ${wbBtn(verifyUrl, "Confirm this email")}
      ${aside("If this wasn't you, ignore this email. Nothing changes, and the old address keeps working.")}`,
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
    inner: `
      ${hello(name)}
      ${p(`Someone asked to change your WorkBench sign-in email to ${esc(newEmail)}. Nothing changes until that address confirms it, so you keep signing in here for now.`)}
      ${aside("If you didn't ask for this, change your password now and reply to this email. Whoever asked was signed in as you.")}`,
  });
  return { subject: "Someone asked to change your WorkBench email", html };
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
  const rows: [string, string | null][] = [
    ["Business", companyName],
    ["Contact", name],
    ["Email", email],
    ["Phone", phone],
    ["Trade", industry],
    ["Team size", teamSize],
    ["Location", [city, state].filter(Boolean).join(", ") || null],
    ["Takes payment today", paymentsToday],
    ["Monthly volume", monthlyVolume],
    ["Years in business", yearsInBusiness],
    ["Structure", entityType],
    ["Website", website],
  ];
  const html = wbShell({
    inner: `
      ${p(`${esc(companyName)} applied for WorkBench access.`)}
      ${facts(rows.filter((r): r is [string, string] => Boolean(r[1])).map(([label, v]) => ({ label, value: esc(v) })))}
      ${message?.trim() ? p(multiline(message.trim())) : ""}
      ${wbBtn(`${APP_URL}/superadmin/applications`, "Review the application")}`,
  });
  return { subject: `New WorkBench application: ${companyName}`, html };
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
    inner: `
      ${p(`${kind} from ${esc(userName)} (${esc(userEmail)}) at ${esc(companyName)}: <strong>${esc(title)}</strong>`)}
      ${p(multiline(details))}
      ${pageUrl ? aside(`Page: ${esc(pageUrl)}`) : ""}
      ${wbBtn(`${APP_URL}/superadmin/feedback`, "Open feedback")}`,
  });
  return { subject: `${kind}: ${title}`, html };
}

/** Platform notification — someone sent the marketing site's contact form. */
export function newContactSubmissionEmail({
  name,
  email,
  phone,
  businessName,
  message,
}: {
  name: string;
  email: string;
  phone: string | null;
  businessName: string | null;
  message: string;
}): { subject: string; html: string } {
  const html = wbShell({
    inner: `
      ${p(`${esc(name)} wrote in through the website contact form.`)}
      ${facts([
        ...(businessName ? [{ label: "Business", value: esc(businessName) }] : []),
        { label: "Email", value: esc(email) },
        ...(phone ? [{ label: "Phone", value: esc(phone) }] : []),
      ])}
      ${p(multiline(message))}
      ${wbBtn(`${APP_URL}/superadmin/contact`, "Open in the console")}`,
  });
  return { subject: `Website contact: ${name}${businessName ? ` (${businessName})` : ""}`, html };
}

/** Invite code delivery — sent on application approval or a direct invite. */
export function inviteCodeEmail({
  name,
  code,
}: {
  name: string | null;
  code: string;
}): { subject: string; html: string } {
  const signupUrl = `${APP_URL}/invite?code=${encodeURIComponent(code)}`;
  const html = wbShell({
    inner: `
      ${hello(name)}
      ${p("You're approved for WorkBench. Here's your invite code. It works once and is tied to your business.")}
      ${wbCode(code, 2)}
      ${wbBtn(signupUrl, "Create your account")}
      ${aside("The button fills in the code for you. If you weren't expecting this, you can ignore it.")}`,
  });
  return { subject: "Your WorkBench invite code", html };
}

/** Self-serve onboarding: the application was approved — the account they're
 *  already using is theirs for keeps (the pending banner goes away). */
export function applicationApprovedEmail({
  name,
  companyName,
}: {
  name: string | null;
  companyName: string;
}): { subject: string; html: string } {
  const html = wbShell({
    inner: `
      ${hello(name)}
      ${p(`We reviewed your application and ${esc(companyName)} is approved. The pending notice is gone and everything else stays as it is.`)}
      ${wbBtn(`${APP_URL}/app/dashboard`, "Open WorkBench")}
      ${aside("Questions? Reply to this email.")}`,
  });
  return { subject: `${companyName} is approved on WorkBench`, html };
}

/** Platform-console sign-in code — the email second factor for superadmins. */
export function superadminLoginCodeEmail({ code }: { code: string }): {
  subject: string;
  html: string;
} {
  const html = wbShell({
    inner: `
      ${p("Your platform console sign-in code. It works once and expires in 10 minutes.")}
      ${wbCode(code, 6)}
      ${aside("If you didn't just try to sign in, someone has your password. Change it now.")}`,
  });
  return { subject: "Your WorkBench console sign-in code", html };
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
  const how = via === "sms" ? "by text" : via === "web" ? "from the website chat" : "from their client portal";
  const html = wbShell({
    footNote: `Sent to ${esc(companyName)}`,
    inner: `
      ${p(`${esc(contactName)} wrote ${how}:`)}
      <p style="margin:0 0 16px;padding:0 0 0 12px;border-left:2px solid ${HAIR};color:${TEXT};font-size:15px;line-height:1.6;font-family:${FONT};">${multiline(messageBody)}</p>
      ${wbBtn(`${APP_URL}/app/messages/thread/${contactId}`, "Reply")}`,
  });
  return { subject: `New message from ${contactName}`, html };
}

/**
 * Task reminder to the assignee — the email twin of the "Reminder: …" push,
 * sent only when push can't reach them (lib/tasks.ts reminderEmailWanted).
 */
export function taskReminderEmail({
  companyName,
  title,
  dueText,
  highPriority,
  notes,
  taskUrl,
}: {
  companyName: string;
  title: string;
  /** "Due Today · 3:00 PM" or null for a task with no date. */
  dueText: string | null;
  highPriority: boolean;
  notes?: string | null;
  /** In-app path (/app/tasks?task=…); made absolute here. */
  taskUrl: string;
}): { subject: string; html: string } {
  const html = wbShell({
    inner: `
      ${p(`Reminder${highPriority ? " (high priority)" : ""}: <strong>${esc(title)}</strong>`)}
      ${dueText ? p(esc(dueText)) : ""}
      ${notes?.trim() ? aside(multiline(notes.trim())) : ""}
      ${wbBtn(absUrl(taskUrl), "Open the task")}`,
    footNote: `Sent to you at ${esc(companyName)} because WorkBench notifications are off on all your devices. Turn them on under Settings, My Profile.`,
  });
  return { subject: `${highPriority ? "Reminder (high priority)" : "Reminder"}: ${title}${dueText ? `, ${dueText}` : ""}`, html };
}

/**
 * To the company inbox when a customer books, moves or cancels online —
 * the team-side twin of the client emails below.
 */
export function bookingTeamNoticeEmail({
  companyName,
  event,
  serviceName,
  contactName,
  windowLabel,
  previousLabel,
  assigneeName,
  detailUrl,
  paidNote,
}: {
  companyName: string;
  event: "booked" | "rescheduled" | "cancelled" | "needs_approval";
  serviceName: string;
  contactName: string;
  windowLabel: string;
  previousLabel?: string | null;
  assigneeName?: string | null;
  detailUrl: string;
  paidNote?: string | null;
}): { subject: string; html: string } {
  const verb =
    event === "booked" ? "booked" : event === "rescheduled" ? "moved" : event === "cancelled" ? "cancelled" : "asked to book";
  const html = wbShell({
    footNote: `Sent to ${esc(companyName)}`,
    inner: `
      ${p(`${esc(contactName)} ${verb} <strong>${esc(serviceName)}</strong> online${event === "needs_approval" ? ". It's waiting for you to accept or decline." : "."}`)}
      ${facts([
        { label: event === "cancelled" ? "Was" : "When", value: esc(windowLabel) },
        ...(previousLabel ? [{ label: "Before", value: esc(previousLabel) }] : []),
        ...(assigneeName ? [{ label: "With", value: esc(assigneeName) }] : []),
        ...(paidNote ? [{ label: "Payment", value: esc(paidNote) }] : []),
      ])}
      ${wbBtn(detailUrl, event === "needs_approval" ? "Accept or decline" : "Open the booking")}`,
  });
  const label =
    event === "needs_approval" ? "Booking to approve" : event === "cancelled" ? "Cancelled" : event === "rescheduled" ? "Moved" : "New booking";
  return { subject: `${label}: ${serviceName} for ${contactName}, ${windowLabel}`, html };
}

/* ------------------------------------------------------------------ */
/* Client-facing emails (signed by the company)                        */
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
    inner: `
      ${hello(contactFirstName)}
      ${p(jobTitle ? `Thanks for having us out for ${esc(jobTitle)}. We hope it all looks right.` : `Thanks for choosing ${esc(companyName)}. We hope everything looks right.`)}
      ${p("If you have a minute, a Google review would mean a lot to us. It's how most of our new customers find us.")}
      ${button(reviewLink, "Leave a review", brand)}
      ${aside("If anything isn't right, reply to this email and we'll come fix it.")}`,
  });
  return { subject: `How did we do, ${contactFirstName}?`, html };
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
    inner: `
      ${hello(contactFirstName)}
      ${p(`Here's the agreement for you to look over and sign: <strong>${esc(title)}</strong>.`)}
      ${button(signUrl, "Review and sign", brand)}
      ${aside("Questions about anything in it? Reply to this email.")}`,
  });
  return { subject: `Agreement to sign: ${title}`, html };
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
    inner: `
      ${hello(contactFirstName)}
      ${p("Here's your link to your client portal with us. You can see your quotes and invoices, check upcoming visits, and send us a new request.")}
      ${button(hubUrl, "Open your client portal", brand)}
      ${aside("The link is just for you. Keep this email, or ask for a new link from the sign-in page any time.")}`,
  });
  return { subject: `Your client portal with ${companyName}`, html };
}

/**
 * One-off message to a client (composed on the contact page). Deliberately
 * looks like a person wrote it in their mail app — plain white, no brand
 * header, no auto-greeting (the sender writes their own). The signature block
 * is the only footer. Tracking stays: the pixel (classified/filtered by
 * /api/public/open) plus a whisper-quiet "view online" link whose page beacon
 * is the certain open signal.
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
  const logo = logoUrl
    ? `<img src="${esc(absUrl(logoUrl))}" alt="" style="display:block;margin-top:14px;max-height:44px;max-width:180px;" />`
    : "";
  const html = `
<div style="font-family:${FONT};background:#ffffff;padding:24px 20px;">
  <div style="max-width:640px;">
    <p style="margin:0;color:#111827;font-size:15px;line-height:1.65;">${multiline(messageBody)}</p>
    <p style="margin:24px 0 0;color:#374151;font-size:14px;line-height:1.6;">${multiline(signature)}</p>
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
 * where they can reply.
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
  const html = clientShell({
    brand,
    companyName,
    signoff: "",
    inner: `
      ${hello(contactFirstName)}
      ${p(multiline(messageBody))}
      ${button(messagesUrl, "Reply", brand)}`,
  });
  return { subject: `New message from ${companyName}`, html };
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
    .map((line) => `<p style="margin:0 0 8px;color:#374151;font-size:13px;line-height:1.5;font-family:${FONT};">${esc(line) || "&nbsp;"}</p>`)
    .join("");
  const html = clientShell({
    brand,
    companyName,
    inner: `
      ${hello(contactFirstName)}
      ${p(`Here's your copy of <strong>${esc(title)}</strong>, signed by ${esc(signatureName)} on ${longDateTime(signedAt)}. You can also ${link(signUrl, "view it online", linkColor(brand))}.`)}
      <div style="margin:0 0 20px;padding:16px 0 8px;border-top:1px solid ${HAIR};border-bottom:1px solid ${HAIR};">
        ${bodyHtml}
      </div>`,
  });
  return { subject: `Your signed copy of ${title}`, html };
}

/**
 * Invoice email with the client's link. `payable` false (the company can't
 * take online payments — lib/payments-gate.ts canChargeOnline) turns the
 * button into a plain View: the page behind it has no pay form either.
 */
export function invoiceLinkEmail({
  brand,
  companyName,
  contactFirstName,
  invoiceNumber,
  total,
  payUrl,
  serviceNames,
  payable = true,
  reportUrl = null,
}: {
  brand: EmailBrand;
  companyName: string;
  contactFirstName?: string | null;
  invoiceNumber: number;
  total: number;
  payUrl: string;
  serviceNames: string[];
  payable?: boolean;
  /** "Include the work report" on the invoice send: the job's report link (Gallery plan). */
  reportUrl?: string | null;
}): { subject: string; html: string } {
  const html = clientShell({
    brand,
    companyName,
    inner: `
      ${hello(contactFirstName)}
      ${p(`Here's invoice ${invoiceNumber}.`)}
      ${ledger(serviceNames, { label: "Total", amount: total })}
      ${button(payUrl, payable ? "Pay invoice" : "View invoice", brand)}
      ${reportUrl ? aside(`${link(reportUrl, "See the work report", linkColor(brand))} — photos and the checklist from the visit.`) : ""}
      ${aside(`Need a copy for your records? ${link(`${payUrl}/pdf`, "Download the PDF", QUIET)}.`)}`,
  });
  return { subject: `Invoice ${invoiceNumber} from ${companyName}`, html };
}

/**
 * Work completed report (Gallery plan, phase B) — "we're done, here's what
 * we did": the crew's note, a one-line summary of what the report holds,
 * and the button to the client's hub page. The PDF sits under the same
 * link. `summary` comes from reportSummaryLine (lib/photos-shared).
 */
export function jobReportEmail({
  brand,
  companyName,
  contactFirstName,
  jobTitle,
  reportUrl,
  summary,
  note,
}: {
  brand: EmailBrand;
  companyName: string;
  contactFirstName?: string | null;
  jobTitle: string;
  reportUrl: string;
  summary: string;
  note?: string | null;
}): { subject: string; html: string } {
  const html = clientShell({
    brand,
    companyName,
    inner: `
      ${hello(contactFirstName)}
      ${p(`We've finished <strong>${esc(jobTitle)}</strong>.${summary ? ` Here's your report, with ${esc(summary)}.` : " Here's your report."}`)}
      ${note?.trim() ? p(multiline(note.trim())) : ""}
      ${button(reportUrl, "See the report", brand)}
      ${aside(`Want a copy for your records? ${link(`${reportUrl}/pdf`, "Download the PDF", QUIET)}.`)}`,
  });
  return { subject: `Work completed: ${jobTitle}`, html };
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
  contactFirstName,
  invoiceNumber,
  total,
  cardLabel,
  payUrl,
  updateCardUrl,
}: {
  brand: EmailBrand;
  companyName: string;
  contactFirstName?: string | null;
  invoiceNumber: number;
  total: number;
  cardLabel: string | null;
  payUrl: string;
  updateCardUrl: string;
}): { subject: string; html: string } {
  const html = clientShell({
    brand,
    companyName,
    inner: `
      ${hello(contactFirstName)}
      ${p(`The automatic payment for invoice ${invoiceNumber} didn't go through${cardLabel ? `. ${esc(cardLabel)} was declined` : ""}. Usually that just means the card expired or was replaced.`)}
      ${ledger([], { label: "Amount due", amount: total })}
      ${button(updateCardUrl, "Update your card", brand)}
      ${aside(`We'll try again once the card is updated. You can also ${link(payUrl, "pay this invoice now", QUIET)}.`)}`,
  });
  return { subject: `Your payment for invoice ${invoiceNumber} didn't go through`, html };
}

/**
 * Card-expiry heads-up for clients on autopay — sent once per card, ~30 days
 * before (or after) the card on file expires, so recurring charges don't
 * start bouncing.
 */
export function cardExpiringEmail({
  brand,
  companyName,
  contactFirstName,
  cardLabel,
  expired,
  updateCardUrl,
}: {
  brand: EmailBrand;
  companyName: string;
  contactFirstName?: string | null;
  cardLabel: string;
  expired: boolean;
  updateCardUrl: string;
}): { subject: string; html: string } {
  const html = clientShell({
    brand,
    companyName,
    inner: `
      ${hello(contactFirstName)}
      ${p(`The card we have on file for your automatic payments (${esc(cardLabel)}) ${expired ? "has expired" : "expires soon"}. If you update it now, your next payment will go through as usual.`)}
      ${button(updateCardUrl, "Update your card", brand)}`,
  });
  return {
    subject: expired ? `Your card on file with ${companyName} has expired` : `Your card on file with ${companyName} expires soon`,
    html,
  };
}

/**
 * Quote follow-up — a light nudge a few days after a quote went out with no
 * response. Two stages (3 and 7 days); this is sales, not dunning. Stops the
 * moment the quote is approved, changed, or expires.
 */
export function quoteFollowUpEmail({
  brand,
  companyName,
  contactFirstName,
  quoteNumber,
  total,
  viewUrl,
  stage,
  validUntil,
}: {
  brand: EmailBrand;
  companyName: string;
  contactFirstName?: string | null;
  quoteNumber: number;
  total: number;
  viewUrl: string;
  stage: "followup_3" | "followup_7";
  validUntil?: Date | null;
}): { subject: string; html: string } {
  const opener =
    stage === "followup_3"
      ? `Following up on quote ${quoteNumber} we sent over. Let us know if you have any questions, or approve it online when you're ready.`
      : `Quote ${quoteNumber} is still open. If something should change, reply and we'll adjust it.`;
  const html = clientShell({
    brand,
    companyName,
    inner: `
      ${hello(contactFirstName)}
      ${p(opener)}
      ${ledger([], { label: "Quote total", amount: total })}
      ${validUntil ? p(`The price is good through ${longDate(validUntil)}.`) : ""}
      ${button(viewUrl, "View quote", brand)}`,
  });
  return { subject: `Following up on quote ${quoteNumber}`, html };
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
  contactFirstName,
  invoiceNumber,
  amount,
  surcharge = 0,
  methodLabel,
  remainingBalance,
  payUrl,
  pending,
}: {
  brand: EmailBrand;
  companyName: string;
  contactFirstName?: string | null;
  invoiceNumber: number;
  amount: number;
  /** The card surcharge included in `amount` (0 = none) — shown as its own line. */
  surcharge?: number;
  methodLabel: string;
  remainingBalance: number;
  payUrl: string;
  pending?: boolean;
}): { subject: string; html: string } {
  const settled = !pending && remainingBalance <= 0;
  const lead = pending
    ? `We got your bank payment of ${usd(amount)} for invoice ${invoiceNumber}. Bank payments take a few business days to clear.`
    : settled
      ? `We got your payment of ${usd(amount)}. Invoice ${invoiceNumber} is paid in full.`
      : `We got your payment of ${usd(amount)} for invoice ${invoiceNumber}.`;
  const html = clientShell({
    brand,
    companyName,
    inner: `
      ${hello(contactFirstName)}
      ${p(lead)}
      ${facts([
        { label: pending ? "Processing" : "Paid", value: usd(amount) },
        ...(surcharge > 0 ? [{ label: "Includes card surcharge", value: usd(surcharge) }] : []),
        { label: "Method", value: esc(methodLabel) },
        ...(remainingBalance > 0 ? [{ label: "Still owed", value: usd(remainingBalance) }] : []),
      ])}
      ${aside(`${link(`${payUrl}/pdf`, "Download the invoice", QUIET)}${remainingBalance > 0 ? ` or ${link(payUrl, "pay the rest", QUIET)}` : ""}.`)}`,
  });
  return {
    subject: pending ? `Payment received for invoice ${invoiceNumber} (processing)` : `Receipt for invoice ${invoiceNumber}`,
    html,
  };
}

/**
 * A gift card's number, sent to the recipient (or the buyer) the moment the
 * card is loaded — lib/gift-cards.ts activateGiftCardForInvoice. The number
 * IS the card: it is read out at checkout, typed on the pay page, or shown
 * to staff. Plain letter, no artwork.
 */
export function giftCardEmail({
  brand,
  companyName,
  recipientName,
  gan,
  amount,
  message,
}: {
  brand: EmailBrand;
  companyName: string;
  recipientName?: string | null;
  gan: string;
  amount: number;
  message?: string | null;
}): { subject: string; html: string } {
  const digits = gan.replace(/\D/g, "");
  const shown = digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim() || gan;
  const html = clientShell({
    brand,
    companyName,
    inner: `
      ${hello(recipientName)}
      ${p(`Here's your ${esc(companyName)} gift card for ${usd(amount)}.`)}
      ${facts([
        { label: "Card number", value: `<span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:16px;letter-spacing:1px;">${esc(shown)}</span>` },
        { label: "Balance", value: usd(amount) },
      ])}
      ${message?.trim() ? p(`<em>${multiline(message.trim())}</em>`) : ""}
      ${aside("To use it, give the number when you pay an invoice — online, choose Gift card and type it in. Any balance left stays on the card.")}`,
  });
  return { subject: `Your ${companyName} gift card (${usd(amount)})`, html };
}

/**
 * Quote-ready email — sent to a client when a service request comes in on a
 * "send" form (or a quote is shared), linking them to the public approval page.
 * `depositNote` surfaces a required deposit so there are no surprises at approval.
 */
export function quoteLinkEmail({
  brand,
  companyName,
  contactFirstName,
  quoteNumber,
  total,
  viewUrl,
  serviceNames,
  depositNote,
}: {
  brand: EmailBrand;
  companyName: string;
  contactFirstName?: string | null;
  quoteNumber: number;
  total: number;
  viewUrl: string;
  serviceNames: string[];
  depositNote?: string;
}): { subject: string; html: string } {
  const html = clientShell({
    brand,
    companyName,
    inner: `
      ${hello(contactFirstName)}
      ${p(`Here's quote ${quoteNumber}. You can approve it online and we'll get you on the schedule.`)}
      ${ledger(serviceNames, { label: "Total", amount: total })}
      ${depositNote ? p(esc(depositNote)) : ""}
      ${button(viewUrl, "View quote", brand)}
      ${aside(`Questions or changes? Reply to this email. ${link(`${viewUrl}/pdf`, "Download the PDF", QUIET)}.`)}`,
  });
  return { subject: `Quote ${quoteNumber} from ${companyName}`, html };
}

/** Extra rows a booking confirmation may carry: how we'll meet, self-serve links. */
export type BookingExtras = {
  /** Calls promise an exact time — the label reads "When" instead of "Arrival". */
  exactTime?: boolean;
  /** VIDEO_CALL: the join link. */
  meetingLink?: string | null;
  /** PHONE_CALL: the number we'll call. */
  phone?: string | null;
  /** Who's coming / calling. */
  withName?: string | null;
  /** Self-serve reschedule/cancel page (when the booking type allows it). */
  manageUrl?: string | null;
  /** "Paid $150.00" / "Deposit of $50.00 paid" line for paid bookings. */
  paidNote?: string | null;
  /** The owner's note for this booking type (directions, what to have ready). */
  note?: string | null;
};

/** When / where / with whom, lined up — the facts every booking email carries. */
function bookingFacts(windowLabel: string, address: string | null | undefined, x: BookingExtras, whenLabel?: string): string {
  return facts([
    { label: whenLabel ?? (x.exactTime ? "When" : "Arriving"), value: `<strong>${esc(windowLabel)}</strong>` },
    ...(address ? [{ label: "Where", value: esc(address) }] : []),
    ...(x.withName ? [{ label: "With", value: esc(x.withName) }] : []),
    ...(x.phone ? [{ label: "We'll call", value: esc(x.phone) }] : []),
    ...(x.meetingLink ? [{ label: "Join", value: link(x.meetingLink, esc(x.meetingLink), "#0369A1") }] : []),
  ]);
}

/** The owner's note, the paid line, and how to change the time. */
function bookingAfter(x: BookingExtras, brand: EmailBrand, canReply: boolean): string {
  const parts: string[] = [];
  if (x.note?.trim()) parts.push(p(multiline(x.note.trim())));
  if (x.paidNote) parts.push(p(esc(x.paidNote)));
  if (x.manageUrl) parts.push(aside(`Need to change it? ${link(x.manageUrl, "Reschedule or cancel", linkColor(brand))}.`));
  else if (canReply) parts.push(aside("Need a different time? Reply to this email."));
  return parts.join("");
}

/** To the client right after they self-schedule: received, awaiting confirmation. */
export function bookingReceivedEmail({
  brand,
  companyName,
  contactFirstName,
  serviceName,
  windowLabel,
  address,
  extras = {},
}: {
  brand: EmailBrand;
  companyName: string;
  contactFirstName: string;
  serviceName: string;
  windowLabel: string;
  address?: string | null;
  extras?: BookingExtras;
}): { subject: string; html: string } {
  const html = clientShell({
    brand,
    companyName,
    inner: `
      ${hello(contactFirstName)}
      ${p(`Thanks for booking ${esc(serviceName)}. We've got the time you picked and will confirm it soon. You'll get another email once it's set.`)}
      ${bookingFacts(windowLabel, address, extras, "Requested")}
      ${bookingAfter({ ...extras, manageUrl: null }, brand, false)}`,
  });
  return { subject: `We got your booking request: ${serviceName}`, html };
}

/** To the client when a booking is confirmed — instantly, or on Accept and Schedule. */
export function bookingConfirmedEmail({
  brand,
  companyName,
  companyEmail,
  contactFirstName,
  serviceName,
  windowLabel,
  address,
  extras = {},
}: {
  brand: EmailBrand;
  companyName: string;
  companyEmail?: string | null;
  contactFirstName: string;
  serviceName: string;
  windowLabel: string;
  address?: string | null;
  extras?: BookingExtras;
}): { subject: string; html: string } {
  const html = clientShell({
    brand,
    companyName,
    inner: `
      ${hello(contactFirstName)}
      ${p(`You're booked for ${esc(serviceName)}. ${extras.exactTime ? "Talk to you then." : "See you then."}`)}
      ${bookingFacts(windowLabel, address, extras)}
      ${bookingAfter(extras, brand, Boolean(companyEmail))}`,
  });
  return { subject: `Confirmed: ${serviceName}, ${windowLabel}`, html };
}

/** To the client after they move their own booking (self-serve reschedule). */
export function bookingRescheduledEmail({
  brand,
  companyName,
  companyEmail,
  contactFirstName,
  serviceName,
  windowLabel,
  previousLabel,
  address,
  extras = {},
}: {
  brand: EmailBrand;
  companyName: string;
  companyEmail?: string | null;
  contactFirstName: string;
  serviceName: string;
  windowLabel: string;
  previousLabel: string | null;
  address?: string | null;
  extras?: BookingExtras;
}): { subject: string; html: string } {
  const html = clientShell({
    brand,
    companyName,
    inner: `
      ${hello(contactFirstName)}
      ${p(`Your ${esc(serviceName)} has moved${previousLabel ? ` from ${esc(previousLabel)}` : ""}. Here's the new time.`)}
      ${bookingFacts(windowLabel, address, extras)}
      ${bookingAfter(extras, brand, Boolean(companyEmail))}`,
  });
  return { subject: `New time for ${serviceName}: ${windowLabel}`, html };
}

/** To the client after they cancel their own booking. */
export function bookingCancelledEmail({
  brand,
  companyName,
  companyEmail,
  contactFirstName,
  serviceName,
  windowLabel,
  rebookUrl,
}: {
  brand: EmailBrand;
  companyName: string;
  companyEmail?: string | null;
  contactFirstName: string;
  serviceName: string;
  windowLabel: string;
  rebookUrl?: string | null;
}): { subject: string; html: string } {
  const html = clientShell({
    brand,
    companyName,
    signoff: "",
    inner: `
      ${hello(contactFirstName)}
      ${p(`Your ${esc(serviceName)} on ${esc(windowLabel)} is cancelled.`)}
      ${rebookUrl ? button(rebookUrl, "Book another time", brand) : ""}
      ${companyEmail ? aside("Changed your mind? Reply to this email and we'll put you back on the schedule.") : ""}`,
  });
  return { subject: `Cancelled: ${serviceName}, ${windowLabel}`, html };
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
    signoff: "Sorry about that,",
    inner: `
      ${hello(contactFirstName)}
      ${p(`We can't make ${windowLabel ? esc(windowLabel) : "the time you asked for"} work for ${esc(serviceName)}.`)}
      ${p(`We'd still like to help. ${companyEmail ? "Reply to this email" : "Get in touch"} and we'll find a time that works.`)}`,
  });
  return { subject: `About your ${serviceName} booking`, html };
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
  kind = "VISIT",
  phone = null,
  meetingLink = null,
}: {
  brand: EmailBrand;
  companyName: string;
  companyEmail?: string | null;
  contactFirstName: string;
  serviceName: string;
  windowLabel: string;
  address?: string | null;
  stage: "day" | "hour";
  /** How you meet: calls say "we'll call you", video carries the link, only a visit "arrives". Default VISIT. */
  kind?: "PHONE_CALL" | "VIDEO_CALL" | "IN_PERSON" | "VISIT";
  /** PHONE_CALL: the number the business will call. */
  phone?: string | null;
  /** VIDEO_CALL: the join link. */
  meetingLink?: string | null;
}): { subject: string; html: string } {
  const noun = kind === "PHONE_CALL" ? "call" : kind === "VIDEO_CALL" ? "video call" : "visit";
  const what = new RegExp(`\\b${noun}\\b`, "i").test(serviceName) ? serviceName : `${serviceName} ${noun}`;
  const visit = kind === "IN_PERSON" || kind === "VISIT";
  const lead =
    stage === "day"
      ? `A reminder about your ${esc(what)}.`
      : kind === "PHONE_CALL"
        ? `We'll be calling you soon for your ${esc(what)}.`
        : kind === "VIDEO_CALL"
          ? `Your ${esc(what)} starts soon.`
          : `We're on our way soon for your ${esc(what)}.`;
  const html = clientShell({
    brand,
    companyName,
    signoff: "",
    inner: `
      ${hello(contactFirstName)}
      ${p(lead)}
      ${bookingFacts(windowLabel, visit ? address : null, { exactTime: !visit, phone: kind === "PHONE_CALL" ? phone : null, meetingLink: kind === "VIDEO_CALL" ? meetingLink : null })}
      ${companyEmail ? aside("Need a different time? Reply to this email.") : ""}`,
  });
  const soon = kind === "PHONE_CALL" ? "We'll call you soon" : kind === "VIDEO_CALL" ? "Starting soon" : "On our way soon";
  return {
    subject: stage === "day" ? `Reminder: ${what}, ${windowLabel}` : `${soon}: ${what}, ${windowLabel}`,
    html,
  };
}

/**
 * Payment reminder / dunning email. Tone firms up by stage: a plain reminder
 * on the due date through a final notice at two weeks overdue.
 */
export function paymentReminderEmail({
  brand,
  companyName,
  companyEmail,
  contactFirstName,
  invoiceNumber,
  balance,
  payUrl,
  dueDate,
  stage,
  payable = true,
}: {
  brand: EmailBrand;
  companyName: string;
  companyEmail?: string | null;
  contactFirstName?: string | null;
  invoiceNumber: number;
  balance: number;
  payUrl: string;
  dueDate: Date;
  stage: "due" | "overdue_3" | "overdue_7" | "overdue_14";
  /** False when the company can't take online payments — the button just views. */
  payable?: boolean;
}): { subject: string; html: string } {
  const due = longDate(dueDate);
  const copy = {
    due: {
      subject: `Invoice ${invoiceNumber} is due today`,
      lead: `A reminder that invoice ${invoiceNumber} is due today, ${due}.`,
    },
    overdue_3: {
      subject: `Invoice ${invoiceNumber} is past due`,
      lead: `Invoice ${invoiceNumber} was due on ${due} and hasn't been paid yet.`,
    },
    overdue_7: {
      subject: `Second notice: invoice ${invoiceNumber}`,
      lead: `Invoice ${invoiceNumber} has been past due since ${due}. Please take care of it when you can.`,
    },
    overdue_14: {
      subject: `Final notice: invoice ${invoiceNumber}`,
      lead: `Invoice ${invoiceNumber} has been past due since ${due}. This is our last reminder.`,
    },
  }[stage];
  const html = clientShell({
    brand,
    companyName,
    inner: `
      ${hello(contactFirstName)}
      ${p(esc(copy.lead))}
      ${ledger([], { label: "Balance due", amount: balance })}
      ${button(payUrl, payable ? "Pay invoice" : "View invoice", brand)}
      ${companyEmail ? aside("Already paid, or have a question? Reply to this email.") : ""}`,
  });
  return { subject: copy.subject, html };
}
