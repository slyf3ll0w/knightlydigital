// Quote lifecycle: draft → awaiting response → client approval on the PUBLIC
// token route (the same endpoint the /quote/[token] page posts to), with an
// optional-item opt-out recomputing the signed total → convert to a job.
// Quote detail has no GET route, so state assertions read the database.
import { test, expect } from "@playwright/test";
import { Api, createContact, deleteContact, runTag } from "../helpers/api";
import { db, disconnectDb } from "../helpers/db";

test.describe("quote lifecycle", () => {
  let api: Api;
  let contactId: string;

  test.beforeAll(async () => {
    api = Api.forOwnerA();
    contactId = (await createContact(api, "Quote")).id;
  });

  test.afterAll(async () => {
    if (contactId) await deleteContact(api, contactId);
    await disconnectDb();
  });

  test("draft → public approval with opt-out → convert to job", async () => {
    const quote = await api.post("/api/app/quotes", {
      contactId,
      title: "E2E quote flow",
      lineItems: [
        { description: "Pressure wash driveway", quantity: 1, unitPrice: 250 },
        { description: "Seal coating", quantity: 1, unitPrice: 120, isOptional: true },
      ],
    });
    expect(quote.publicToken).toBeTruthy();
    // Optional items are offered in the draft total until the client opts out.
    expect(Number(quote.total)).toBeCloseTo(370, 2);

    // Mark it awaiting response without emailing anyone (the send route emails
    // the client; status PATCH is the no-email path the assistant also uses).
    await api.patch(`/api/app/quotes/${quote.id}`, { status: "AWAITING_RESPONSE" });

    const optional = await db().quoteLineItem.findFirstOrThrow({
      where: { quoteId: quote.id, isOptional: true },
    });

    // A stranger's signature is rejected…
    await api.json(
      "POST",
      `/api/public/quote/${quote.publicToken}`,
      { action: "approve", signatureName: "Totally Someone Else", optedOutItemIds: [] },
      400
    );
    // …the client's goes through, declining the optional item.
    await api.json(
      "POST",
      `/api/public/quote/${quote.publicToken}`,
      {
        action: "approve",
        signatureName: `${runTag} Quote`,
        optedOutItemIds: [optional.id],
      },
      200
    );

    const approved = await db().quote.findUniqueOrThrow({ where: { id: quote.id } });
    expect(approved.status).toBe("APPROVED");
    expect(approved.signatureName).toBe(`${runTag} Quote`);
    // The signed total reflects the opt-out — this exact recompute is what the
    // deposit invoice and conversion bill from.
    expect(Number(approved.total)).toBeCloseTo(250, 2);

    // Approved quotes can't slide back to DRAFT (paper-trail guard).
    await api.patch(`/api/app/quotes/${quote.id}`, { status: "DRAFT" }, 400);

    // Convert → a real job carrying the work.
    const job = await api.post(`/api/app/quotes/${quote.id}/convert`);
    expect(job.id).toBeTruthy();

    // Double-convert must fail.
    await api.post(`/api/app/quotes/${quote.id}/convert`, undefined, 400);
  });
});
