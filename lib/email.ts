/**
 * Transactional email via Resend. Env-gated like the captcha: without
 * RESEND_API_KEY every send is a silent no-op, so the code can ship before
 * the domain is verified.
 *
 * EMAIL_FROM must use the domain verified in Resend
 * (default: notifications@streamflaire.com).
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM ?? "Streamflaire Hub <notifications@streamflaire.com>";
// Bare address from FROM — sends that brand the display name still have to
// use the Resend-verified domain, only the name in front of it changes.
const FROM_ADDRESS = FROM.match(/<([^>]+)>/)?.[1] ?? FROM;
const APP_URL = process.env.NEXTAUTH_URL ?? "https://streamflaire.com";

/** Tenant branding applied to client-facing emails — the same settings the
 *  quote/invoice/portal pages use. Pass the company row itself; only these
 *  fields are read. */
export type EmailBrand = {
  brandColor?: string | null;
  brandColorSecondary?: string | null;
  logoUrl?: string | null;
};

const BRAND_HEX = /^#[0-9a-fA-F]{6}$/;

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
}
const onColor = (bg: string) => (luminance(bg) > 160 ? "#111827" : "#ffffff");
const swap = (html: string, find: string, replace: string) => html.split(find).join(replace);

/**
 * Re-skin a template with the tenant's branding. Every client-facing template
 * shares the same header / button / footer markup, so this recolors those
 * exact inline styles and drops the logo into the header — no per-template
 * work. Colors are luminance-guarded like the app UI; without brand settings
 * the classic console look stays.
 */
function brandEmail(html: string, brand: EmailBrand): string {
  const color = BRAND_HEX.test(brand.brandColor ?? "") ? brand.brandColor! : null;
  const accent =
    (BRAND_HEX.test(brand.brandColorSecondary ?? "") ? brand.brandColorSecondary! : null) ?? color;
  let out = html;
  if (brand.logoUrl) {
    const src = brand.logoUrl.startsWith("http") ? brand.logoUrl : `${APP_URL}${brand.logoUrl}`;
    out = swap(
      out,
      `<div style="background:#0C0F0C;padding:16px 24px;">`,
      `<div style="background:#0C0F0C;padding:16px 24px;"><img src="${src}" alt="" style="display:block;max-height:44px;max-width:200px;margin:0 0 8px;" />`
    );
  }
  if (color) {
    out = swap(out, "background:#0C0F0C;padding:16px 24px;", `background:${color};padding:16px 24px;`);
    out = swap(
      out,
      "color:#22C55E;font-size:13px;font-weight:700;letter-spacing:0.5px;",
      `color:${onColor(color)};font-size:13px;font-weight:700;letter-spacing:0.5px;`
    );
  }
  if (accent) {
    out = swap(out, "background:#22C55E;color:#ffffff;", `background:${accent};color:${onColor(accent)};`);
    // Inline text links sit on white — flip too-light accents back to green
    const link = luminance(accent) > 200 ? "#16a34a" : accent;
    out = swap(out, "color:#16a34a;text-decoration:underline;", `color:${link};text-decoration:underline;`);
  }
  return out;
}

export async function sendEmail({
  to,
  subject,
  html,
  replyTo,
  fromName,
  brand,
}: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  /** Display name shown as the sender (e.g. the tenant company's name). Falls back to EMAIL_FROM. */
  fromName?: string;
  /** Tenant branding for client-facing sends — restyles the template like their quote pages. */
  brand?: EmailBrand | null;
}): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  if (brand) html = brandEmail(html, brand);
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
        ...(replyTo ? { reply_to: [replyTo] } : {}),
      }),
    });
    if (!res.ok) {
      console.error("[email] resend send failed:", res.status, await res.text());
    }
    return res.ok;
  } catch (err) {
    console.error("[email] resend send threw:", err);
    return false;
  }
}

/** All email content is user input — escape it before it goes into HTML. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f3f4f6;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
    <div style="background:#0C0F0C;padding:16px 24px;">
      <p style="margin:0;color:#22C55E;font-size:13px;font-weight:700;letter-spacing:0.5px;">NEW REQUEST</p>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 16px;color:#111827;font-size:15px;">
        A new request just came in from ${sourceLabel}.
      </p>
      <p style="margin:0 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Request #${requestNumber}</p>
      <p style="margin:0 0 16px;color:#111827;font-size:18px;font-weight:700;">${esc(title)}</p>
      <p style="margin:0 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">From</p>
      <p style="margin:0 0 2px;color:#111827;font-size:14px;font-weight:600;">${esc(contactName)}</p>
      ${contactPhone ? `<p style="margin:0 0 2px;color:#374151;font-size:14px;">${esc(contactPhone)}</p>` : ""}
      ${contactEmail ? `<p style="margin:0 0 2px;color:#374151;font-size:14px;">${esc(contactEmail)}</p>` : ""}
      ${detailRows ? `<p style="margin:16px 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Details</p>${detailRows}` : ""}
      <a href="${APP_URL}/app/requests/${requestId}"
         style="display:inline-block;margin-top:20px;background:#22C55E;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:6px;">
        View Request
      </a>
    </div>
    <div style="padding:12px 24px;border-top:1px solid #f3f4f6;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">Sent to ${esc(companyName)} by Streamflaire Hub</p>
    </div>
  </div>
</div>`;

  return { subject: `New request: ${title}`, html };
}

/** "How did we do?" email with the company's Google review link, sent when a job completes. */
export function reviewRequestEmail({
  companyName,
  contactFirstName,
  reviewLink,
  jobTitle,
}: {
  companyName: string;
  contactFirstName: string;
  reviewLink: string;
  jobTitle: string;
}): { subject: string; html: string } {
  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f3f4f6;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
    <div style="background:#0C0F0C;padding:16px 24px;">
      <p style="margin:0;color:#22C55E;font-size:13px;font-weight:700;letter-spacing:0.5px;">${esc(companyName.toUpperCase())}</p>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 12px;color:#111827;font-size:15px;">Hi ${esc(contactFirstName)},</p>
      <p style="margin:0 0 12px;color:#374151;font-size:14px;">
        Thanks for choosing ${esc(companyName)} — we just wrapped up
        <strong>${esc(jobTitle)}</strong> and hope everything looks great.
      </p>
      <p style="margin:0 0 16px;color:#374151;font-size:14px;">
        If you have a minute, a quick Google review helps our small business more than you know.
      </p>
      <a href="${esc(reviewLink)}"
         style="display:inline-block;background:#22C55E;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:6px;">
        Leave a Review
      </a>
    </div>
    <div style="padding:12px 24px;border-top:1px solid #f3f4f6;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">Sent by ${esc(companyName)} via Streamflaire Hub</p>
    </div>
  </div>
</div>`;
  return { subject: `How did we do? — ${companyName}`, html };
}

/** Signing-link email to a client when a contract is issued. */
export function contractSignEmail({
  companyName,
  contactFirstName,
  title,
  signUrl,
}: {
  companyName: string;
  contactFirstName: string;
  title: string;
  signUrl: string;
}): { subject: string; html: string } {
  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f3f4f6;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
    <div style="background:#0C0F0C;padding:16px 24px;">
      <p style="margin:0;color:#22C55E;font-size:13px;font-weight:700;letter-spacing:0.5px;">${esc(companyName.toUpperCase())}</p>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 12px;color:#111827;font-size:15px;">Hi ${esc(contactFirstName)},</p>
      <p style="margin:0 0 16px;color:#374151;font-size:14px;">
        ${esc(companyName)} sent you an agreement to review and sign:
        <strong>${esc(title)}</strong>.
      </p>
      <a href="${esc(signUrl)}"
         style="display:inline-block;background:#22C55E;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:6px;">
        Review &amp; Sign
      </a>
    </div>
    <div style="padding:12px 24px;border-top:1px solid #f3f4f6;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">Sent by ${esc(companyName)} via Streamflaire Hub</p>
    </div>
  </div>
</div>`;
  return { subject: `${companyName} sent you an agreement to sign: ${title}`, html };
}

/**
 * Client-portal access link — sent when the company shares portal access
 * from a contact page, or when a client requests a sign-in link from the
 * portal login page. The link IS the login (magic-link style).
 */
export function hubAccessEmail({
  companyName,
  contactFirstName,
  hubUrl,
}: {
  companyName: string;
  contactFirstName: string;
  hubUrl: string;
}): { subject: string; html: string } {
  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f3f4f6;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
    <div style="background:#0C0F0C;padding:16px 24px;">
      <p style="margin:0;color:#22C55E;font-size:13px;font-weight:700;letter-spacing:0.5px;">${esc(companyName.toUpperCase())}</p>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 12px;color:#111827;font-size:15px;">Hi ${esc(contactFirstName)},</p>
      <p style="margin:0 0 16px;color:#374151;font-size:14px;">
        Here's your personal link to the ${esc(companyName)} client portal — view your
        quotes and invoices, check scheduled visits, and send us new requests.
      </p>
      <a href="${esc(hubUrl)}"
         style="display:inline-block;background:#22C55E;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:6px;">
        Open Your Client Portal
      </a>
      <p style="margin:16px 0 0;color:#6b7280;font-size:12px;">
        This link is unique to you — keep it handy, or request a fresh one
        anytime from the portal sign-in page.
      </p>
    </div>
    <div style="padding:12px 24px;border-top:1px solid #f3f4f6;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">Sent by ${esc(companyName)} via Streamflaire Hub</p>
    </div>
  </div>
</div>`;
  return { subject: `Your ${companyName} client portal`, html };
}

/** Signed copy back to the client (their record of the agreement). */
export function contractSignedCopyEmail({
  companyName,
  contactFirstName,
  title,
  body,
  signatureName,
  signedAt,
  signUrl,
}: {
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
  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f3f4f6;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
    <div style="background:#0C0F0C;padding:16px 24px;">
      <p style="margin:0;color:#22C55E;font-size:13px;font-weight:700;letter-spacing:0.5px;">${esc(companyName.toUpperCase())}</p>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 12px;color:#111827;font-size:15px;">Hi ${esc(contactFirstName)},</p>
      <p style="margin:0 0 16px;color:#374151;font-size:14px;">
        Here's your copy of <strong>${esc(title)}</strong>, signed by
        <strong>${esc(signatureName)}</strong> on
        ${signedAt.toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}.
      </p>
      <div style="border:1px solid #e5e7eb;border-radius:6px;padding:16px;background:#f9fafb;">
        ${bodyHtml}
      </div>
      <a href="${esc(signUrl)}"
         style="display:inline-block;margin-top:16px;color:#16a34a;text-decoration:underline;font-size:13px;">
        View online
      </a>
    </div>
    <div style="padding:12px 24px;border-top:1px solid #f3f4f6;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">Sent by ${esc(companyName)} via Streamflaire Hub</p>
    </div>
  </div>
</div>`;
  return { subject: `Your signed copy: ${title} — ${companyName}`, html };
}

/** Payment-link email to a client whose service-request form auto-sent an invoice. */
export function invoiceLinkEmail({
  companyName,
  invoiceNumber,
  total,
  payUrl,
  serviceNames,
}: {
  companyName: string;
  invoiceNumber: number;
  total: number;
  payUrl: string;
  serviceNames: string[];
}): { subject: string; html: string } {
  const items = serviceNames
    .map((s) => `<p style="margin:0 0 4px;color:#374151;font-size:14px;">• ${esc(s)}</p>`)
    .join("");
  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f3f4f6;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
    <div style="background:#0C0F0C;padding:16px 24px;">
      <p style="margin:0;color:#22C55E;font-size:13px;font-weight:700;letter-spacing:0.5px;">${esc(companyName.toUpperCase())}</p>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 16px;color:#111827;font-size:15px;">
        Thanks for your request — here's your invoice from ${esc(companyName)}.
      </p>
      <p style="margin:0 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Invoice #${invoiceNumber}</p>
      ${items}
      <p style="margin:16px 0 0;color:#111827;font-size:20px;font-weight:700;">$${total.toFixed(2)}</p>
      <a href="${payUrl}"
         style="display:inline-block;margin-top:20px;background:#22C55E;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:6px;">
        View &amp; Pay Invoice
      </a>
    </div>
    <div style="padding:12px 24px;border-top:1px solid #f3f4f6;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">Sent by ${esc(companyName)} via Streamflaire Hub</p>
    </div>
  </div>
</div>`;
  return { subject: `Your invoice from ${companyName} — #${invoiceNumber}`, html };
}

/**
 * Quote-ready email — sent to a client when a service request comes in on a
 * "send" form (or a quote is shared), linking them to the public approval page.
 * `depositNote` surfaces a required deposit so there are no surprises at approval.
 */
export function quoteLinkEmail({
  companyName,
  quoteNumber,
  total,
  viewUrl,
  serviceNames,
  depositNote,
}: {
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
  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f3f4f6;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
    <div style="background:#0C0F0C;padding:16px 24px;">
      <p style="margin:0;color:#22C55E;font-size:13px;font-weight:700;letter-spacing:0.5px;">${esc(companyName.toUpperCase())}</p>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 16px;color:#111827;font-size:15px;">
        Thanks for your request — here's your quote from ${esc(companyName)}. Review it and approve online to get started.
      </p>
      <p style="margin:0 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Quote #${quoteNumber}</p>
      ${items}
      <p style="margin:16px 0 0;color:#111827;font-size:20px;font-weight:700;">$${total.toFixed(2)}</p>
      ${deposit}
      <a href="${viewUrl}"
         style="display:inline-block;margin-top:20px;background:#22C55E;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:6px;">
        View &amp; Approve Quote
      </a>
    </div>
    <div style="padding:12px 24px;border-top:1px solid #f3f4f6;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">Sent by ${esc(companyName)} via Streamflaire Hub</p>
    </div>
  </div>
</div>`;
  return { subject: `Your quote from ${companyName} — #${quoteNumber}`, html };
}

/** Shared shell for the online-booking client emails (received/confirmed/declined/reminder). */
function bookingShell(companyName: string, inner: string): string {
  return `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f3f4f6;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
    <div style="background:#0C0F0C;padding:16px 24px;">
      <p style="margin:0;color:#22C55E;font-size:13px;font-weight:700;letter-spacing:0.5px;">${esc(companyName.toUpperCase())}</p>
    </div>
    <div style="padding:24px;">
      ${inner}
    </div>
    <div style="padding:12px 24px;border-top:1px solid #f3f4f6;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">Sent by ${esc(companyName)} via Streamflaire Hub</p>
    </div>
  </div>
</div>`;
}

const windowBlock = (windowLabel: string, address?: string | null) => `
      <p style="margin:16px 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Arrival window</p>
      <p style="margin:0;color:#111827;font-size:17px;font-weight:700;">${esc(windowLabel)}</p>
      ${address ? `<p style="margin:6px 0 0;color:#374151;font-size:14px;">${esc(address)}</p>` : ""}`;

/** To the client right after they self-schedule: received, awaiting confirmation. */
export function bookingReceivedEmail({
  companyName,
  contactFirstName,
  serviceName,
  windowLabel,
  address,
}: {
  companyName: string;
  contactFirstName: string;
  serviceName: string;
  windowLabel: string;
  address?: string | null;
}): { subject: string; html: string } {
  const html = bookingShell(
    companyName,
    `<p style="margin:0 0 12px;color:#111827;font-size:15px;">Hi ${esc(contactFirstName)},</p>
      <p style="margin:0;color:#374151;font-size:14px;">
        Thanks for booking <strong>${esc(serviceName)}</strong> with ${esc(companyName)}.
        Your requested time is penciled in — we'll confirm it shortly and you'll get
        another email when it's locked in.
      </p>
      ${windowBlock(windowLabel, address)}`
  );
  return { subject: `Booking received — ${serviceName} with ${companyName}`, html };
}

/** To the client when the business hits Accept and Schedule. */
export function bookingConfirmedEmail({
  companyName,
  companyEmail,
  contactFirstName,
  serviceName,
  windowLabel,
  address,
}: {
  companyName: string;
  companyEmail?: string | null;
  contactFirstName: string;
  serviceName: string;
  windowLabel: string;
  address?: string | null;
}): { subject: string; html: string } {
  const html = bookingShell(
    companyName,
    `<p style="margin:0 0 12px;color:#111827;font-size:15px;">Hi ${esc(contactFirstName)},</p>
      <p style="margin:0;color:#374151;font-size:14px;">
        Good news — your <strong>${esc(serviceName)}</strong> booking with
        ${esc(companyName)} is confirmed. We'll see you then!
      </p>
      ${windowBlock(windowLabel, address)}
      ${companyEmail ? `<p style="margin:16px 0 0;color:#6b7280;font-size:13px;">Need to change the time? Reply to this email and we'll sort it out.</p>` : ""}`
  );
  return { subject: `Confirmed: ${serviceName} — ${windowLabel}`, html };
}

/** To the client when the business declines the booking. */
export function bookingDeclinedEmail({
  companyName,
  companyEmail,
  contactFirstName,
  serviceName,
  windowLabel,
}: {
  companyName: string;
  companyEmail?: string | null;
  contactFirstName: string;
  serviceName: string;
  windowLabel: string | null;
}): { subject: string; html: string } {
  const html = bookingShell(
    companyName,
    `<p style="margin:0 0 12px;color:#111827;font-size:15px;">Hi ${esc(contactFirstName)},</p>
      <p style="margin:0;color:#374151;font-size:14px;">
        Unfortunately ${esc(companyName)} couldn't make
        ${windowLabel ? `<strong>${esc(windowLabel)}</strong>` : "your requested time"} work
        for <strong>${esc(serviceName)}</strong>.
      </p>
      <p style="margin:12px 0 0;color:#374151;font-size:14px;">
        We'd still love to help —
        ${companyEmail ? "reply to this email" : "get in touch"} and we'll find a time that works.
      </p>`
  );
  return { subject: `About your ${serviceName} booking with ${companyName}`, html };
}

/** Appointment reminder to the client: the day before, and again about an hour out. */
export function appointmentReminderEmail({
  companyName,
  companyEmail,
  contactFirstName,
  serviceName,
  windowLabel,
  address,
  stage,
}: {
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
  const html = bookingShell(
    companyName,
    `<p style="margin:0 0 12px;color:#111827;font-size:15px;">Hi ${esc(contactFirstName)},</p>
      <p style="margin:0;color:#374151;font-size:14px;">${lead}</p>
      ${windowBlock(windowLabel, address)}
      ${companyEmail ? `<p style="margin:16px 0 0;color:#6b7280;font-size:13px;">Need to reschedule? Reply to this email.</p>` : ""}`
  );
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
  companyName,
  companyEmail,
  invoiceNumber,
  balance,
  payUrl,
  dueDate,
  stage,
}: {
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

  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f3f4f6;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
    <div style="background:#0C0F0C;padding:16px 24px;">
      <p style="margin:0;color:#22C55E;font-size:13px;font-weight:700;letter-spacing:0.5px;">${esc(companyName.toUpperCase())}</p>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 16px;color:#111827;font-size:15px;">${esc(copy.lead)}</p>
      <p style="margin:0 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Balance due</p>
      <p style="margin:0;color:#111827;font-size:20px;font-weight:700;">$${balance.toFixed(2)}</p>
      <a href="${payUrl}"
         style="display:inline-block;margin-top:20px;background:#22C55E;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:6px;">
        View &amp; Pay Invoice
      </a>
      ${companyEmail ? `<p style="margin:20px 0 0;color:#6b7280;font-size:13px;">Already paid or have a question? Reply to this email or reach ${esc(companyName)} at ${esc(companyEmail)}.</p>` : ""}
    </div>
    <div style="padding:12px 24px;border-top:1px solid #f3f4f6;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">Sent by ${esc(companyName)} via Streamflaire Hub</p>
    </div>
  </div>
</div>`;
  return { subject: copy.subject, html };
}

/**
 * Password reset for a Streamflaire Hub account (the business owner/staff login,
 * not a client). Hub-branded, not company-branded.
 */
export function passwordResetEmail({
  name,
  resetUrl,
}: {
  name: string;
  resetUrl: string;
}): { subject: string; html: string } {
  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f3f4f6;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
    <div style="background:#0C0F0C;padding:16px 24px;">
      <p style="margin:0;color:#22C55E;font-size:13px;font-weight:700;letter-spacing:0.5px;">STREAMFLAIRE HUB</p>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 12px;color:#111827;font-size:15px;">Hi ${esc(name)},</p>
      <p style="margin:0 0 16px;color:#374151;font-size:14px;">
        We received a request to reset your Streamflaire Hub password. Click the
        button below to choose a new one. This link expires in 1 hour and can be
        used once.
      </p>
      <a href="${esc(resetUrl)}"
         style="display:inline-block;background:#22C55E;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:6px;">
        Reset Your Password
      </a>
      <p style="margin:16px 0 0;color:#6b7280;font-size:12px;">
        If you didn't request this, you can safely ignore this email — your
        password won't change until you open the link and set a new one.
      </p>
    </div>
    <div style="padding:12px 24px;border-top:1px solid #f3f4f6;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">Streamflaire Hub</p>
    </div>
  </div>
</div>`;
  return { subject: "Reset your Streamflaire Hub password", html };
}
