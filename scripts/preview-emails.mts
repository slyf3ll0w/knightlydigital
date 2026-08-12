/**
 * Renders sample client-facing emails from lib/email.ts to standalone HTML
 * files with fabricated data — no database needed. Open them in a browser to
 * eyeball the paper-trail templates before a client ever gets one.
 *
 *   npx tsx scripts/preview-emails.mts [outDir]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  quoteLinkEmail,
  invoiceLinkEmail,
  paymentReceiptEmail,
  paymentReminderEmail,
  bookingConfirmedEmail,
  appointmentReminderEmail,
  hubAccessEmail,
  quoteFollowUpEmail,
} from "../lib/email";

const outDir = process.argv[2] ?? ".";
mkdirSync(outDir, { recursive: true });

const brand = {
  brandColor: "#0F3D2E",
  brandColorSecondary: "#1F8A4C",
  documentColor: null,
  logoUrl: null,
};
const companyName = "Summit Lawn & Landscape";

// Same light-pinned wrapper sendEmail() adds around every template.
const wrap = (inner: string) =>
  `<!DOCTYPE html><html lang="en" style="color-scheme: light only;"><head><meta charset="utf-8" /></head><body style="margin:0;padding:0;background-color:#f3f4f6;">${inner}</body></html>`;

const samples: Record<string, { subject: string; html: string }> = {
  "quote-link": quoteLinkEmail({
    brand, companyName, quoteNumber: 42, total: 1485.0,
    viewUrl: "#", serviceNames: ["Spring cleanup & bed edging", "Mulch install — 8 yd", "Irrigation startup"],
    depositNote: "A deposit of $300.00 is due when you approve.",
  }),
  "invoice-link": invoiceLinkEmail({
    brand, companyName, invoiceNumber: 108, total: 640.0,
    payUrl: "#", serviceNames: ["Monthly maintenance — July", "Shrub trimming"],
  }),
  "receipt-paid": paymentReceiptEmail({
    brand, companyName, invoiceNumber: 108, amount: 640.0,
    methodLabel: "Visa •••• 4242", remainingBalance: 0, payUrl: "#",
  }),
  "receipt-partial-pending": paymentReceiptEmail({
    brand, companyName, invoiceNumber: 109, amount: 250.0,
    methodLabel: "Bank transfer", remainingBalance: 390.0, payUrl: "#", pending: true,
  }),
  "reminder-final-notice": paymentReminderEmail({
    brand, companyName, companyEmail: "office@summitlawn.example", invoiceNumber: 97,
    balance: 820.0, payUrl: "#", dueDate: new Date("2026-07-28"), stage: "overdue_14",
  }),
  "quote-followup": quoteFollowUpEmail({
    brand, companyName, quoteNumber: 42, total: 1485.0, viewUrl: "#",
    stage: "followup_3", validUntil: new Date("2026-09-01"),
  }),
  "booking-confirmed": bookingConfirmedEmail({
    brand, companyName, companyEmail: "office@summitlawn.example", contactFirstName: "Dana",
    serviceName: "Aeration & overseed", windowLabel: "Thu, Aug 20 · 8–10 AM",
    address: "2214 Brookhollow Dr, Allen, TX",
  }),
  "appt-reminder": appointmentReminderEmail({
    brand, companyName, companyEmail: "office@summitlawn.example", contactFirstName: "Dana",
    serviceName: "Aeration & overseed", windowLabel: "Tomorrow · 8–10 AM",
    address: "2214 Brookhollow Dr, Allen, TX", stage: "day",
  }),
  "hub-access": hubAccessEmail({
    brand, companyName, contactFirstName: "Dana", hubUrl: "#",
  }),
};

for (const [name, { subject, html }] of Object.entries(samples)) {
  writeFileSync(join(outDir, `${name}.html`), wrap(html));
  console.log(`${name}  —  ${subject}`);
}
