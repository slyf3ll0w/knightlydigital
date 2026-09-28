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

  test("a texted number is a hidden placeholder until the thread's Save card names them", async () => {
    // Needs a business line: the e2e company may have none, in which case the route refuses (409) and that is the whole test.
    const res = await api.raw("POST", "/api/app/messages/new-number", { phone: "(214) 555-0199" });
    if (res.status === 409) {
      expect((await res.json()).error).toMatch(/business line/);
      return;
    }
    expect(res.status).toBe(201);
    const { contactId: id } = (await res.json()) as { contactId: string };
    try {
      let row = await db().contact.findUniqueOrThrow({ where: { id } });
      expect(row.placeholder).toBe(true);
      expect(row.status).toBe("ACTIVE");
      expect(row.pipelineStageId).toBeNull();
      expect(row.phoneDigits).toBe("2145550199");
      // Hidden from the picker feed
      const feed = (await api.get("/api/app/contacts")) as { id: string }[];
      expect(feed.map((c) => c.id)).not.toContain(id);
      // Same number again → same thread
      const again = await api.post("/api/app/messages/new-number", { phone: "2145550199" }, 200);
      expect(again.contactId).toBe(id);
      // Save needs a name
      await api.json("PATCH", `/api/app/contacts/${id}`, { placeholder: false, kind: "CLIENT", status: "LEAD" }, 400);
      // Save as a lead → on the board, visible, named
      await api.patch(`/api/app/contacts/${id}`, {
        firstName: runTag,
        lastName: "Texted-Lead",
        kind: "CLIENT",
        status: "LEAD",
        placeholder: false,
      });
      row = await db().contact.findUniqueOrThrow({ where: { id } });
      expect(row.placeholder).toBe(false);
      expect(row.status).toBe("LEAD");
      expect(row.firstName).toBe(runTag);
    } finally {
      await deleteContact(api, id);
    }
  });

  test("a business contact is never a lead and becomes a client with their first job", async () => {
    // kind CONTACT wins over a LEAD status: ACTIVE, off the Leads board
    const created = await api.post("/api/app/contacts", {
      firstName: runTag,
      lastName: "CRM-Contact",
      kind: "CONTACT",
      status: "LEAD",
    });
    try {
      let row = await db().contact.findUniqueOrThrow({ where: { id: created.id } });
      expect(row.kind).toBe("CONTACT");
      expect(row.status).toBe("ACTIVE");
      expect(row.pipelineStageId).toBeNull();

      // The Contacts tab lists them; the default Clients list does not (server-rendered pages read the DB the same way)
      const contactsTab = await db().contact.findMany({
        where: { companyId: row.companyId, kind: "CONTACT", status: { not: "ARCHIVED" } },
        select: { id: true },
      });
      expect(contactsTab.map((c) => c.id)).toContain(created.id);

      // Messaging a contact works before they are a client (the New-message picker lands here)
      const sent = await api.post(`/api/app/messages/${created.id}`, { body: "Hi from the e2e suite" }, 201);
      expect(sent.message.direction).toBe("OUTBOUND");

      // First job → client
      await api.post("/api/app/jobs", { contactId: created.id, title: "E2E first job for a contact" });
      row = await db().contact.findUniqueOrThrow({ where: { id: created.id } });
      expect(row.kind).toBe("CLIENT");
      expect(row.status).toBe("ACTIVE");
    } finally {
      await deleteContact(api, created.id);
    }
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
