// CRM plumbing: contact edits, saved service addresses feeding job sites,
// notes, request → job conversion, and the ⌘K search. Contact detail has no
// GET route, so state assertions read the database.
import { test, expect } from "@playwright/test";
import { Api, createContact, deleteContact, runTag } from "../helpers/api";
import { db, disconnectDb } from "../helpers/db";

test.describe("contacts & CRM", () => {
  let api: Api;
  let contactId: string;

  test.beforeAll(async () => {
    api = Api.forOwnerA();
    contactId = (await createContact(api, "CRM")).id;
  });

  test.afterAll(async () => {
    if (contactId) await deleteContact(api, contactId);
    await disconnectDb();
  });

  test("profile edits land", async () => {
    await api.patch(`/api/app/contacts/${contactId}`, { lastName: "CRM-Renamed" });
    const contact = await db().contact.findUniqueOrThrow({ where: { id: contactId } });
    expect(contact.lastName).toBe("CRM-Renamed");
  });

  test("saved service address becomes the job-site snapshot", async () => {
    const { address } = await api.post(
      `/api/app/contacts/${contactId}/addresses`,
      { label: "Rental", address: "456 Harness Ln", city: "Dallas", state: "TX", zip: "75201" },
      200
    );

    const job = await api.post("/api/app/jobs", {
      contactId,
      title: "E2E property job",
      propertyId: address.id,
    });
    expect(job.address).toBe("456 Harness Ln, Dallas, TX, 75201");
    expect(job.propertyId).toBe(address.id);
  });

  test("notes: empty rejected, real ones stored trimmed", async () => {
    await api.json("POST", `/api/app/contacts/${contactId}/notes`, { body: "   " }, 400);
    const note = await api.post(`/api/app/contacts/${contactId}/notes`, {
      body: "  Gate code 4321  ",
    });
    expect(note.body).toBe("Gate code 4321");
  });

  test("request converts into a job and closes out", async () => {
    const request = await api.post("/api/app/requests", {
      contactId,
      title: "E2E gutter cleaning request",
    });
    expect(request.requestNumber).toBeGreaterThan(0);

    await api.post("/api/app/jobs", {
      contactId,
      title: "E2E job from request",
      requestId: request.id,
    });
    const after = await db().request.findUniqueOrThrow({ where: { id: request.id } });
    expect(after.status).toBe("CONVERTED");
  });

  test("search finds this run's contact", async () => {
    const res = await api.get(`/api/app/search?q=${encodeURIComponent(runTag)}`);
    expect(JSON.stringify(res)).toContain(contactId);
  });
});
