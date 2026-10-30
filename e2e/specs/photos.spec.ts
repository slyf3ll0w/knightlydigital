// Photos (Gallery plan, phase A): one photo row across the lifecycle. A job
// photo is stamped with who / when / where and defaults to client-visible
// only when it is an AFTER shot; a quote's estimate photos ride onto the job
// when the quote converts; the serving route is tenant-scoped; the older
// per-job routes still work. The job and quote pages have no GET route for
// photos, so state assertions read the database.
import { test, expect } from "@playwright/test";
import { readState } from "../env";
import { Api, createContact, deleteContact, runTag } from "../helpers/api";
import { db, disconnectDb } from "../helpers/db";

const state = readState();

// A 1×1 PNG — enough for the upload path; the browser normally sends a 1600 px JPEG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

type Field = string | { file: Buffer; type: string; name: string };

async function upload(token: string, path: string, fields: Record<string, Field>): Promise<Response> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === "string") form.append(k, v);
    else form.append(k, new Blob([new Uint8Array(v.file)], { type: v.type }), v.name);
  }
  return fetch(`${state.baseUrl}${path}`, {
    method: "POST",
    headers: { Cookie: `${state.cookieName}=${token}` },
    body: form,
  });
}

const png = { file: PNG, type: "image/png", name: "shot.png" };

test.describe("photos", () => {
  let api: Api;
  let contactId: string;

  test.beforeAll(async () => {
    api = Api.forOwnerA(state);
    contactId = (await createContact(api, "Photos")).id;
  });

  test.afterAll(async () => {
    if (contactId) await deleteContact(api, contactId);
    await disconnectDb();
  });

  test("job photo: stamps, defaults, edits, scope, delete", async () => {
    const job = await api.post("/api/app/jobs", { contactId, title: `${runTag} photo job` });

    // An AFTER shot taken just now, located, with the phone's idempotency key.
    const clientKey = `e2e-${Date.now().toString(36)}-after`;
    const res = await upload(state.ownerA.token, "/api/app/photos", {
      file: png,
      jobId: job.id,
      type: "AFTER",
      takenAt: new Date().toISOString(),
      lat: "32.9612",
      lng: "-96.6598",
      accuracy: "12",
      clientKey,
    });
    expect(res.status).toBe(201);
    const photo = await res.json();
    expect(photo.stage).toBe("AFTER");
    expect(photo.clientVisible).toBe(true); // After shows finished work → visible by default
    expect(photo.lat).toBeCloseTo(32.9612, 3);
    expect(photo.by).toBe("E2E Owner");
    expect(photo.jobId).toBe(job.id);

    // The same clientKey again (a retry after a dropped response) is the same row, not a twin.
    const again = await upload(state.ownerA.token, "/api/app/photos", { file: png, jobId: job.id, type: "AFTER", clientKey });
    expect(again.status).toBe(200);
    expect((await again.json()).id).toBe(photo.id);

    // Every row carries its owners directly — no job join needed.
    const row = await db().jobPhoto.findUniqueOrThrow({ where: { id: photo.id } });
    expect(row.companyId).toBe(state.ownerA.companyId);
    expect(row.contactId).toBe(contactId);
    expect(row.userId).toBe(state.ownerA.userId);

    // Caption, stage and client visibility are editable; Estimate is not a job stage.
    const edited = await api.json("PATCH", `/api/app/photos/${photo.id}`, { caption: "  Panel closed up  ", type: "BEFORE", clientVisible: false });
    expect(edited.caption).toBe("Panel closed up");
    expect(edited.stage).toBe("BEFORE");
    expect(edited.clientVisible).toBe(false);
    await api.json("PATCH", `/api/app/photos/${photo.id}`, { type: "ESTIMATE" }, 400);

    // Serving: a signed-in member gets the bytes (or the R2 redirect); nobody else does.
    const mine = await fetch(`${state.baseUrl}/api/job-photos/${photo.id}`, {
      headers: { Cookie: `${state.cookieName}=${state.ownerA.token}` },
    });
    expect(mine.ok).toBe(true);
    const anon = await fetch(`${state.baseUrl}/api/job-photos/${photo.id}`, { redirect: "manual" });
    expect(anon.status).toBe(401);
    const other = await fetch(`${state.baseUrl}/api/job-photos/${photo.id}`, {
      headers: { Cookie: `${state.cookieName}=${state.ownerB.token}` },
      redirect: "manual",
    });
    expect(other.status).toBe(404);
    // …and tenant B cannot edit it either.
    const b = Api.forOwnerB(state);
    await b.json("PATCH", `/api/app/photos/${photo.id}`, { caption: "mine now" }, 404);

    // The older per-job routes still work and land on the same rows.
    const legacy = await upload(state.ownerA.token, `/api/app/jobs/${job.id}/photos`, { file: png, type: "GENERAL" });
    expect(legacy.status).toBe(201);
    const legacyPhoto = await legacy.json();
    expect(legacyPhoto.stage).toBe("GENERAL");
    expect(legacyPhoto.clientVisible).toBe(false);
    // The per-job PATCH is pinned to its job: the wrong job id is a 404.
    await api.json("PATCH", `/api/app/jobs/not-this-job/photos/${legacyPhoto.id}`, { caption: "x" }, 404);
    await api.json("PATCH", `/api/app/jobs/${job.id}/photos/${legacyPhoto.id}`, { caption: "Left as found" });

    await api.json("DELETE", `/api/app/photos/${photo.id}`);
    expect(await db().jobPhoto.findUnique({ where: { id: photo.id } })).toBeNull();
    await api.json("DELETE", `/api/app/jobs/${job.id}/photos/${legacyPhoto.id}`);
    expect(await db().jobPhoto.count({ where: { jobId: job.id } })).toBe(0);
  });

  test("quote photos are estimate photos and ride onto the job on convert", async () => {
    const quote = await api.post("/api/app/quotes", {
      contactId,
      title: `${runTag} photo quote`,
      lineItems: [{ description: "Replace panel", quantity: 1, unitPrice: 300 }],
    });

    // Whatever stage the caller asks for, a photo on a quote is an Estimate photo, hidden from the client.
    const res = await upload(state.ownerA.token, "/api/app/photos", { file: png, quoteId: quote.id, type: "AFTER" });
    expect(res.status).toBe(201);
    const estimate = await res.json();
    expect(estimate.stage).toBe("ESTIMATE");
    expect(estimate.clientVisible).toBe(false);
    expect(estimate.quoteId).toBe(quote.id);
    expect(estimate.jobId).toBeNull();

    // Techs don't work quotes; a bogus quote is not found.
    const missing = await upload(state.ownerA.token, "/api/app/photos", { file: png, quoteId: "nope" });
    expect(missing.status).toBe(404);

    // Approve and convert → the estimate photo is now the job's before set.
    await api.patch(`/api/app/quotes/${quote.id}`, { status: "AWAITING_RESPONSE" });
    await api.json("POST", `/api/public/quote/${quote.publicToken}`, { action: "approve", signatureName: `${runTag} Photos`, optedOutItemIds: [] }, 200);
    const job = await api.post(`/api/app/quotes/${quote.id}/convert`);
    expect(job.id).toBeTruthy();

    const carried = await db().jobPhoto.findUniqueOrThrow({ where: { id: estimate.id } });
    expect(carried.jobId).toBe(job.id);
    expect(carried.quoteId).toBe(quote.id);
    expect(carried.type).toBe("ESTIMATE");

    // A photo added to the quote after conversion belongs to its job too.
    const later = await upload(state.ownerA.token, "/api/app/photos", { file: png, quoteId: quote.id });
    expect(later.status).toBe(201);
    expect((await later.json()).jobId).toBe(job.id);
    expect(await db().jobPhoto.count({ where: { jobId: job.id } })).toBe(2);
  });
});
