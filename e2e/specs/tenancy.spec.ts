// Cross-tenant isolation: company B's owner must never see or touch company
// A's records — the single worst class of bug for a multi-tenant money app.
// Detail routes expose PATCH/DELETE (no GET — pages read server-side), so
// read isolation is proven on the list GETs and write isolation on the
// mutation routes; final integrity is confirmed straight from the database.
import { test, expect } from "@playwright/test";
import { Api, createContact, deleteContact } from "../helpers/api";
import { db, disconnectDb } from "../helpers/db";

test.describe("tenant isolation", () => {
  let apiA: Api;
  let apiB: Api;
  let contactId: string;
  let invoiceId: string;
  let jobId: string;

  test.beforeAll(async () => {
    apiA = Api.forOwnerA();
    apiB = Api.forOwnerB();
    contactId = (await createContact(apiA, "Tenancy")).id;
    invoiceId = (
      await apiA.post("/api/app/invoices", {
        contactId,
        lineItems: [{ description: "Isolation check", quantity: 1, unitPrice: 75 }],
      })
    ).id;
    jobId = (
      await apiA.post("/api/app/jobs", { contactId, title: "E2E tenancy job" })
    ).id;
  });

  test.afterAll(async () => {
    if (contactId) await deleteContact(apiA, contactId);
    await disconnectDb();
  });

  test("company A's records never appear in company B's lists", async () => {
    for (const path of ["/api/app/contacts", "/api/app/jobs", "/api/app/subscriptions"]) {
      const res = await apiB.raw("GET", path);
      expect(res.status, `GET ${path}`).toBe(200);
      const text = await res.text();
      expect(text, `${path} leaked company A ids`).not.toContain(contactId);
      expect(text).not.toContain(invoiceId);
      expect(text).not.toContain(jobId);
    }
  });

  test("company B cannot write against company A's records", async () => {
    const attempts: Array<[string, string, unknown]> = [
      ["POST", "/api/app/payments", { invoiceId, amount: 75, method: "CASH" }],
      ["PATCH", `/api/app/invoices/${invoiceId}`, { subject: "hijacked" }],
      ["DELETE", `/api/app/invoices/${invoiceId}?force=1`, undefined],
      ["PATCH", `/api/app/contacts/${contactId}`, { firstName: "Hijacked" }],
      ["PATCH", `/api/app/jobs/${jobId}/status`, { status: "ARCHIVED" }],
      ["DELETE", `/api/app/contacts/${contactId}?force=1`, undefined],
    ];
    for (const [method, path, body] of attempts) {
      const res = await apiB.raw(method, path, body);
      expect([400, 403, 404], `${method} ${path} → ${res.status}`).toContain(res.status);
    }

    // Nothing landed: company A's records are untouched.
    const invoice = await db().invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.status).toBe("DRAFT");
    expect(invoice.subject).not.toBe("hijacked");
    expect(await db().payment.count({ where: { invoiceId } })).toBe(0);
    const contact = await db().contact.findUniqueOrThrow({ where: { id: contactId } });
    expect(contact.firstName).not.toBe("Hijacked");
  });
});
