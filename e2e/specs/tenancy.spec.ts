// Cross-tenant isolation: company B's owner must never see or touch company
// A's records — the single worst class of bug for a multi-tenant money app.
import { test, expect } from "@playwright/test";
import { Api, createContact, deleteContact } from "../helpers/api";

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
  });

  test("company B cannot read company A's records", async () => {
    for (const path of [
      `/api/app/invoices/${invoiceId}`,
      `/api/app/contacts/${contactId}`,
      `/api/app/jobs/${jobId}`,
    ]) {
      const res = await apiB.raw("GET", path);
      expect([403, 404], `${path} → ${res.status}`).toContain(res.status);
    }
  });

  test("company B cannot write against company A's records", async () => {
    const payment = await apiB.raw("POST", "/api/app/payments", {
      invoiceId,
      amount: 75,
      method: "CASH",
    });
    expect([400, 403, 404]).toContain(payment.status);

    const del = await apiB.raw("DELETE", `/api/app/invoices/${invoiceId}?force=1`);
    expect([403, 404]).toContain(del.status);

    // Nothing landed: the invoice is untouched and still unpaid.
    const invoice = await apiA.get(`/api/app/invoices/${invoiceId}`);
    expect(invoice.status).toBe("DRAFT");
  });

  test("company A's records never appear in company B's lists", async () => {
    const res = await apiB.raw("GET", "/api/app/invoices");
    if (res.ok) {
      const text = await res.text();
      expect(text).not.toContain(invoiceId);
    }
  });
});
