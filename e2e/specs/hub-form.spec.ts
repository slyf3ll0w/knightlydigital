// Client hub form: by default the hub's "Get work done" is the plain title +
// details form; the business can point it at one booking item instead. In the
// hub the client is on file, so the item skips their fields and the public
// submit takes the hub token in place of a captcha — tenant-scoped, and the
// request never enters the Leads pipeline.
import { test, expect } from "@playwright/test";
import { readState } from "../env";
import { Api, createContact, deleteContact, runTag } from "../helpers/api";
import { db, disconnectDb } from "../helpers/db";

const state = readState();

test.describe("client hub form", () => {
  let api: Api;
  let itemId = "";
  let itemSlug = "";
  let contactId = "";
  let hubToken = "";

  test.beforeAll(async () => {
    api = Api.forOwnerA(state);
    const item = await api.post("/api/app/booking-types", { name: `${runTag} Hub contact`, kind: "MESSAGE" });
    itemId = item.id;
    itemSlug = item.slug;
    contactId = (await createContact(api, "HubForm")).id;
    hubToken = (await db().contact.findUniqueOrThrow({ where: { id: contactId }, select: { hubToken: true } })).hubToken;
  });

  test.afterAll(async () => {
    await api.raw("PATCH", "/api/app/settings", { hubBookingTypeId: null });
    if (itemId) {
      const res = await api.raw("DELETE", `/api/app/booking-types/${itemId}`);
      if (!res.ok) console.warn(`[e2e] cleanup: delete hub item → ${res.status}`);
    }
    if (contactId) await deleteContact(api, contactId);
    await disconnectDb();
  });

  test("by default the hub shows the plain request form", async () => {
    const res = await fetch(`${state.baseUrl}/hub/${hubToken}/requests/new`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("What do you need done?");
  });

  test("the setting only accepts one of the company's own items", async () => {
    await api.patch("/api/app/settings", { hubBookingTypeId: "not-an-item" });
    const co = await db().company.findUniqueOrThrow({ where: { id: state.ownerA.companyId }, select: { hubBookingTypeId: true } });
    expect(co.hubBookingTypeId).toBeNull();
  });

  test("a chosen item renders in the hub with the client on file, and submits by hub token", async () => {
    await api.patch("/api/app/settings", { hubBookingTypeId: itemId });
    const page = await fetch(`${state.baseUrl}/hub/${hubToken}/requests/new`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain(`${runTag} Hub contact`);
    expect(html).not.toContain("First name");

    const res = await fetch(`${state.baseUrl}/api/public/book/${state.companyASlug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The contact has no phone and the default contact form requires one, so the hub asks — like a real client would answer
      body: JSON.stringify({ item: itemSlug, hubToken, email: "hub-e2e@example.invalid", phone: "5550001234", message: "Hub e2e message", elapsedMs: 60_000 }),
    });
    expect(res.status, await res.clone().text()).toBe(201);

    const request = await db().request.findFirst({ where: { contactId, source: "client_hub" }, orderBy: { createdAt: "desc" } });
    expect(request?.bookingTypeId).toBe(itemId);
    expect(request?.details).toContain("Hub e2e message");
    // The contact had no email; the form's answer filled it in
    const contact = await db().contact.findUniqueOrThrow({ where: { id: contactId }, select: { email: true } });
    expect(contact.email).toBe("hub-e2e@example.invalid");
  });

  test("a hub token from another company is just an anonymous visitor (captcha applies)", async () => {
    const companyB = await db().company.findUniqueOrThrow({ where: { id: state.ownerB.companyId }, select: { slug: true } });
    const res = await fetch(`${state.baseUrl}/api/public/book/${companyB.slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item: itemSlug, hubToken, message: "cross-tenant probe", elapsedMs: 60_000 }),
    });
    // Company B doesn't have this item — but the point is it never got past the captcha gate
    expect([400, 404]).toContain(res.status);
    const again = await db().request.count({ where: { contactId, source: "client_hub" } });
    expect(again).toBe(1);
  });

  test("deleting the chosen item puts the hub back on the plain form", async () => {
    await api.delete(`/api/app/booking-types/${itemId}`);
    itemId = "";
    const co = await db().company.findUniqueOrThrow({ where: { id: state.ownerA.companyId }, select: { hubBookingTypeId: true } });
    expect(co.hubBookingTypeId).toBeNull();
    expect(await (await fetch(`${state.baseUrl}/hub/${hubToken}/requests/new`)).text()).toContain("What do you need done?");
  });
});
