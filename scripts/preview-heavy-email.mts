/**
 * Renders the heavy invoice email (invoiceLinkEmail → heavyClientShell) for
 * several brand colors on the fake Brightwire Electric, to standalone HTML
 * files plus the plain-text part each send would carry. No database.
 *
 *   DATABASE_URL=postgresql://u:p@localhost:5432/unused npx tsx scripts/preview-heavy-email.mts [outDir] [logoFileUrl]
 *
 * logoFileUrl (optional, e.g. file:///C:/tmp/logo.svg) is swapped in for the
 * logo on the "-logo" variants so the band's logo tile can be seen offline.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { invoiceLinkEmail, htmlToText } from "../lib/email";

const outDir = process.argv[2] ?? ".";
const logoFile = process.argv[3] ?? null;
mkdirSync(outDir, { recursive: true });

const BRANDS: Record<string, { brandColor: string | null; brandColorSecondary: string | null }> = {
  navy: { brandColor: "#0A1428", brandColorSecondary: "#F86808" },
  orange: { brandColor: "#F97316", brandColorSecondary: null },
  yellow: { brandColor: "#FDE047", brandColorSecondary: null },
  default: { brandColor: null, brandColorSecondary: null },
};
const FAKE_LOGO = "https://example.invalid/brightwire-logo.svg";

// The same light-pinned wrapper sendEmail() adds around every template.
const wrap = (inner: string) =>
  `<!DOCTYPE html><html lang="en" style="color-scheme: light only;"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body style="margin:0;padding:0;background-color:#ffffff;">${inner}</body></html>`;

for (const [key, colors] of Object.entries(BRANDS)) {
  for (const withLogo of [false, true]) {
    const { subject, html } = invoiceLinkEmail({
      brand: { ...colors, documentColor: null, logoUrl: withLogo ? FAKE_LOGO : null, phone: "(469) 555-0142" },
      companyName: "Brightwire Electric",
      contactFirstName: "Maria",
      invoiceNumber: 2210,
      total: 1842.5,
      payUrl: "https://workbenchfsm.com/pay/preview",
      serviceNames: ["Panel upgrade, 200A", "City permit and inspection", "Whole-home surge protector"],
      dueDate: new Date("2026-12-04T12:00:00Z"),
      reportUrl: withLogo ? "https://workbenchfsm.com/hub/preview/work/1" : null,
    });
    const name = `invoice-heavy-${key}${withLogo ? "-logo" : ""}`;
    const page = wrap(html).replace(FAKE_LOGO, logoFile ?? FAKE_LOGO);
    writeFileSync(join(outDir, `${name}.html`), page);
    writeFileSync(join(outDir, `${name}.txt`), `Subject: ${subject}\n\n${htmlToText(html)}\n`);
    console.log(`wrote ${name}.html / .txt — ${subject}`);
  }
}
