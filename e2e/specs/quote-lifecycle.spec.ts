// Quote lifecycle: draft → awaiting response → client approval on the PUBLIC
// token route (the same endpoint the /quote/[token] page posts to) → convert
// to a job. Also the status guard on approved quotes.
import { test, expect } from "@playwright/test";
import { Api, createContact, deleteContact, runTag } from "../helpers/api";

test.describe("quote lifecycle", () => {
  let api: Api;
  let contactId: string;

  test.beforeAll(async () => {
    api = Api.forOwnerA();
    contactId = (await createContact(api, "Quote")).id;
  });

  test.afterAll(async () => {
    if (contactId) await deleteContact(api, contactId);
  });

  test("draft → public approval → convert to job", async () => {
    const quote = await api.post("/api/app/quotes", {
      contactId,
      title: "E2E quote flow",
      lineItems: [
        { description: "Pressure wash driveway", quantity: 1, unitPrice: 250 },
        { description: "Seal coating", quantity: 1, unitPrice: 120, isOptional: true },
      ],
    });
    expect(quote.publicToken).toBeTruthy();
    expect(Number(quote.total)).toBeCloseTo(250, 2); // optional items don't bill until accepted

    // Mark it awaiting response without emailing anyone (the send route emails
    // the client; status PATCH is the no-email path the assistant also uses).
    await api.patch(`/api/app/quotes/${quote.id}`, { status: "AWAITING_RESPONSE" });

    // Client approves on the public token route — signature must match the
    // contact's name; a stranger's signature is rejected first.
    await api.json(
      "POST",
      `/api/public/quote/${quote.publicToken}`,
      { action: "approve", signatureName: "Totally Someone Else", optedOutItemIds: [] },
      400
    );
    await api.json(
      "POST",
      `/api/public/quote/${quote.publicToken}`,
      { action: "approve", signatureName: `${runTag} Quote`, optedOutItemIds: [] },
      200
    );

    const approved = await api.get(`/api/app/quotes/${quote.id}`);
    expect(approved.status).toBe("APPROVED");

    // Approved quotes can't slide back to DRAFT (paper-trail guard).
    await api.patch(`/api/app/quotes/${quote.id}`, { status: "DRAFT" }, 400);

    // Convert → a real job carrying the work.
    const job = await api.post(`/api/app/quotes/${quote.id}/convert`);
    expect(job.id).toBeTruthy();

    // Double-convert must fail.
    await api.post(`/api/app/quotes/${quote.id}/convert`, undefined, 400);
  });
});
