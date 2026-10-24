/**
 * Renders sample emails from lib/email.ts to standalone HTML files with
 * fabricated data — no database needed. Open them in a browser to eyeball
 * the letter templates before a client ever gets one. The company is the
 * fictional demo (never a real client — see the marketing rule).
 *
 *   DATABASE_URL=postgresql://u:p@localhost:5432/unused npx tsx scripts/preview-emails.mts [outDir]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  quoteLinkEmail,
  invoiceLinkEmail,
  paymentReceiptEmail,
  paymentReminderEmail,
  bookingConfirmedEmail,
  bookingCancelledEmail,
  appointmentReminderEmail,
  hubAccessEmail,
  quoteFollowUpEmail,
  reviewRequestEmail,
  newRequestEmail,
  passwordResetEmail,
} from "../lib/email";

const outDir = process.argv[2] ?? ".";
mkdirSync(outDir, { recursive: true });

const brand = {
  brandColor: "#12355B",
  brandColorSecondary: "#C2410C",
  documentColor: null,
  logoUrl: null,
  phone: "(469) 555-0182",
};
const companyName = "Harlow Heating & Air";
const companyEmail = "office@harlowair.example";

// Same light-pinned wrapper sendEmail() adds around every template.
const wrap = (inner: string) =>
  `<!DOCTYPE html><html lang="en" style="color-scheme: light only;"><head><meta charset="utf-8" /></head><body style="margin:0;padding:0;background-color:#ffffff;">${inner}</body></html>`;

const samples: Record<string, { subject: string; html: string }> = {
  "quote-link": quoteLinkEmail({
    brand, companyName, contactFirstName: "Dana", quoteNumber: 42, total: 1485.0,
    viewUrl: "#", serviceNames: ["Furnace tune-up", "Replace blower capacitor", "Duct sealing, main trunk"],
    depositNote: "A deposit of $300.00 is due when you approve.",
  }),
  "invoice-link": invoiceLinkEmail({
    brand, companyName, contactFirstName: "Dana", invoiceNumber: 108, total: 640.0,
    payUrl: "#", serviceNames: ["AC maintenance, July", "Condensate line flush"],
  }),
  "receipt-paid": paymentReceiptEmail({
    brand, companyName, contactFirstName: "Dana", invoiceNumber: 108, amount: 640.0,
    methodLabel: "Visa •••• 4242", remainingBalance: 0, payUrl: "#",
  }),
  "receipt-partial-pending": paymentReceiptEmail({
    brand, companyName, contactFirstName: "Dana", invoiceNumber: 109, amount: 250.0,
    methodLabel: "Bank transfer", remainingBalance: 390.0, payUrl: "#", pending: true,
  }),
  "reminder-final-notice": paymentReminderEmail({
    brand, companyName, companyEmail, contactFirstName: "Dana", invoiceNumber: 97,
    balance: 820.0, payUrl: "#", dueDate: new Date("2026-07-28"), stage: "overdue_14",
  }),
  "quote-followup": quoteFollowUpEmail({
    brand, companyName, contactFirstName: "Dana", quoteNumber: 42, total: 1485.0, viewUrl: "#",
    stage: "followup_3", validUntil: new Date("2026-09-01"),
  }),
  "booking-confirmed": bookingConfirmedEmail({
    brand, companyName, companyEmail, contactFirstName: "Dana",
    serviceName: "Furnace tune-up", windowLabel: "Thu, Aug 20 · 8–10 AM",
    address: "2214 Brookhollow Dr, Allen, TX", extras: { withName: "Marcus", manageUrl: "#" },
  }),
  "booking-cancelled": bookingCancelledEmail({
    brand, companyName, companyEmail, contactFirstName: "Dana",
    serviceName: "Furnace tune-up", windowLabel: "Thu, Aug 20 · 8–10 AM", rebookUrl: "#",
  }),
  "appt-reminder": appointmentReminderEmail({
    brand, companyName, companyEmail, contactFirstName: "Dana",
    serviceName: "Furnace tune-up", windowLabel: "Tomorrow · 8–10 AM",
    address: "2214 Brookhollow Dr, Allen, TX", stage: "day",
  }),
  "hub-access": hubAccessEmail({
    brand, companyName, contactFirstName: "Dana", hubUrl: "#",
  }),
  "review-request": reviewRequestEmail({
    brand, companyName, contactFirstName: "Dana", reviewLink: "#", jobTitle: "your furnace tune-up",
  }),
  "team-new-request": newRequestEmail({
    companyName, requestId: "x", requestNumber: 214, title: "AC not cooling upstairs",
    details: "Upstairs is 82 even with the thermostat at 72.\nUnit is about 12 years old.",
    contactName: "Dana Whitfield", contactPhone: "(214) 555-0147", contactEmail: "dana@example.com", source: "booking_form",
  }),
  "team-password-reset": passwordResetEmail({ name: "Marcus", resetUrl: "#" }),
};

for (const [name, { subject, html }] of Object.entries(samples)) {
  writeFileSync(join(outDir, `${name}.html`), wrap(html));
  console.log(`${name}  |  ${subject}`);
}
