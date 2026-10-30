// Photos (Gallery plan, phase A): one photo row across the lifecycle. A job
// photo is stamped with who / when / where and defaults to client-visible
// only when it is an AFTER shot; a quote's estimate photos ride onto the job
// when the quote converts; the serving route is tenant-scoped; the older
// per-job routes still work. The job and quote pages have no GET route for
// photos, so state assertions read the database.
// Phase B: before/after pairs (PATCH pairWith, the upload's pairWith) and
// the work completed report (note, staff PDF, the client's hub page + PDF +
// photo route, the send).
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

  test("before/after pairs and the work completed report", async () => {
    const job = await api.post("/api/app/jobs", { contactId, title: `${runTag} report job` });
    const shoot = async (fields: Record<string, Field>) => {
      const res = await upload(state.ownerA.token, "/api/app/photos", { file: png, jobId: job.id, ...fields });
      expect(res.status).toBe(201);
      return res.json();
    };
    const before = await shoot({ type: "BEFORE", takenAt: new Date(Date.now() - 60_000).toISOString() });
    const during = await shoot({ type: "DURING" });

    // "Match this angle": an After uploaded with pairWith lands already paired; the answer carries the Before too.
    const after = await shoot({ type: "AFTER", pairWith: before.id });
    expect(after.pairId).toBeTruthy();
    expect(after.also.map((p: { id: string }) => p.id)).toEqual([before.id]);
    expect(after.also[0].pairId).toBe(after.pairId);

    // Pair rules: one before-ish + one after, same job, not already taken.
    const after2 = await shoot({ type: "AFTER" });
    await api.json("PATCH", `/api/app/photos/${after2.id}`, { pairWith: during.id }, 400);
    await api.json("PATCH", `/api/app/photos/${after2.id}`, { pairWith: before.id }, 400); // before is taken
    const loneBefore = await shoot({ type: "BEFORE" });
    const paired2 = await api.json("PATCH", `/api/app/photos/${loneBefore.id}`, { pairWith: after2.id });
    expect(paired2.pairId).toBeTruthy();
    expect(paired2.also[0].id).toBe(after2.id);
    // Unpair clears both halves.
    const unpaired = await api.json("PATCH", `/api/app/photos/${after2.id}`, { pairWith: null });
    expect(unpaired.pairId).toBeNull();
    expect(unpaired.also[0].id).toBe(loneBefore.id);
    expect(unpaired.also[0].pairId).toBeNull();
    // Tenant B can't pair our photos.
    await Api.forOwnerB(state).json("PATCH", `/api/app/photos/${after2.id}`, { pairWith: loneBefore.id }, 404);

    // The report covers finished work: nothing to send while the job is open.
    const early = await api.raw("POST", `/api/app/jobs/${job.id}/report`, { email: true, text: false });
    expect(early.status).toBe(400);

    // Complete the job, write the note, read the staff PDF.
    await api.patch(`/api/app/jobs/${job.id}/status`, { status: "REQUIRES_INVOICING" });
    const noted = await api.patch(`/api/app/jobs/${job.id}/report`, { note: "  Panel replaced and every circuit tested.  " });
    expect(noted.note).toBe("Panel replaced and every circuit tested.");
    const staffPdf = await fetch(`${state.baseUrl}/api/app/jobs/${job.id}/report/pdf`, { headers: { Cookie: `${state.cookieName}=${state.ownerA.token}` } });
    expect(staffPdf.status).toBe(200);
    expect(staffPdf.headers.get("content-type")).toContain("application/pdf");
    expect((await staffPdf.arrayBuffer()).byteLength).toBeGreaterThan(1000);

    // The client's side: the hub page, its PDF, and only the photos they may see.
    const { hubToken } = await db().contact.findUniqueOrThrow({ where: { id: contactId }, select: { hubToken: true } });
    const page = await fetch(`${state.baseUrl}/hub/${hubToken}/work/${job.id}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain(`${runTag} report job`);
    expect(html).toContain("Panel replaced and every circuit tested.");
    const hubPdf = await fetch(`${state.baseUrl}/hub/${hubToken}/work/${job.id}/pdf`);
    expect(hubPdf.status).toBe(200);
    expect(hubPdf.headers.get("content-type")).toContain("application/pdf");
    const hubPhoto = (id: string) => fetch(`${state.baseUrl}/hub/${hubToken}/photos/${id}`, { redirect: "manual" });
    expect([200, 302]).toContain((await hubPhoto(after.id)).status); // After: shown by default
    expect([200, 302]).toContain((await hubPhoto(before.id)).status); // the Before of a shown pair
    expect((await hubPhoto(during.id)).status).toBe(404); // hidden
    expect((await hubPhoto(loneBefore.id)).status).toBe(404); // loose Before, hidden
    // A stranger's token sees nothing.
    expect((await fetch(`${state.baseUrl}/hub/not-a-token/work/${job.id}`)).status).toBe(404);

    // Send: the e2e contact deliberately has no email or phone (the suite never
    // sends real mail), so the send is refused with a plain reason — and the
    // note typed into the sheet is kept for the next try.
    const sent = await api.raw("POST", `/api/app/jobs/${job.id}/report`, { email: true, text: true, note: "Thanks again!" });
    expect(sent.status).toBe(400);
    expect(((await sent.json()) as { error: string }).error).toContain("no email or textable phone");
    const row = await db().job.findUniqueOrThrow({ where: { id: job.id }, select: { reportNote: true, reportSentAt: true } });
    expect(row.reportNote).toBe("Thanks again!");
    expect(row.reportSentAt).toBeNull();
  });
});
