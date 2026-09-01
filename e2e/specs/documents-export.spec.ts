// Client-facing documents and "your data is yours" exports: invoice, quote,
// and statement PDFs render as real PDFs; CSV exports carry this run's
// records with the right headers; unknown exports 404.
import { test, expect } from "@playwright/test";
import { Api, createContact, deleteContact, runTag } from "../helpers/api";
import { disconnectDb } from "../helpers/db";

async function expectPdf(res: Response, label: string) {
  expect(res.status, `${label} → ${res.status}`).toBe(200);
  expect(res.headers.get("content-type") ?? "").toContain("application/pdf");
  const bytes = Buffer.from(await res.arrayBuffer());
  expect(bytes.subarray(0, 4).toString("latin1"), `${label} magic bytes`).toBe("%PDF");
  expect(bytes.length).toBeGreaterThan(1000);
}

test.describe("documents & export", () => {
  let api: Api;
  let contactId: string;
  let invoiceId: string;
  let quoteId: string;

  test.beforeAll(async () => {
    api = Api.forOwnerA();
    contactId = (await createContact(api, "Docs")).id;
    invoiceId = (
      await api.post("/api/app/invoices", {
        contactId,
        subject: `${runTag} PDF invoice`,
        lineItems: [{ description: "Document check", quantity: 1, unitPrice: 150 }],
      })
    ).id;
    quoteId = (
      await api.post("/api/app/quotes", {
        contactId,
        title: `${runTag} PDF quote`,
        lineItems: [{ description: "Document check", quantity: 1, unitPrice: 150 }],
      })
    ).id;
    await api.post("/api/app/jobs", { contactId, title: `${runTag} Export job` });
  });

  test.afterAll(async () => {
    if (contactId) await deleteContact(api, contactId);
    await disconnectDb();
  });

  test("invoice, quote, and statement PDFs render", async () => {
    await expectPdf(await api.raw("GET", `/api/app/invoices/${invoiceId}/pdf`), "invoice PDF");
    await expectPdf(await api.raw("GET", `/api/app/quotes/${quoteId}/pdf`), "quote PDF");
    await expectPdf(
      await api.raw("GET", `/api/app/contacts/${contactId}/statement-pdf`),
      "statement PDF"
    );
  });

  test("CSV exports carry this run's records", async () => {
    const cases: Array<{ entity: string; header: string; expectTag: boolean }> = [
      { entity: "clients", header: "First name", expectTag: true },
      { entity: "invoices", header: "Invoice #", expectTag: true },
      { entity: "jobs", header: "Job #", expectTag: true },
      // Timesheets may legitimately be empty — the header still proves the route.
      { entity: "timesheets", header: "Team member", expectTag: false },
    ];
    for (const c of cases) {
      const res = await api.raw("GET", `/api/app/export/${c.entity}`);
      expect(res.status, `export ${c.entity} → ${res.status}`).toBe(200);
      expect(res.headers.get("content-type") ?? "").toContain("text/csv");
      const csv = await res.text();
      expect(csv.split("\n")[0], `${c.entity} header row`).toContain(c.header);
      if (c.expectTag) expect(csv, `${c.entity} should include this run's rows`).toContain(runTag);
    }
  });

  test("unknown export 404s", async () => {
    const res = await api.raw("GET", "/api/app/export/passwords");
    expect(res.status).toBe(404);
  });
});
