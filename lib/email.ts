/**
 * Transactional email via Resend. Env-gated like the captcha: without
 * RESEND_API_KEY every send is a silent no-op, so the code can ship before
 * the domain is verified.
 *
 * EMAIL_FROM must use the domain verified in Resend
 * (default: notifications@streamflaremedia.com).
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM ?? "Streamflaire Hub <notifications@streamflaremedia.com>";
const APP_URL = process.env.NEXTAUTH_URL ?? "https://streamflaire.com";

export async function sendEmail({
  to,
  subject,
  html,
  replyTo,
}: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
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
  source: "booking_form" | "client_hub";
}): { subject: string; html: string } {
  const sourceLabel = source === "client_hub" ? "your client hub" : "your booking form";
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
