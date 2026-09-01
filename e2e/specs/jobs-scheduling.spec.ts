// Jobs & scheduling: the daily-driver workflow around the money paths —
// creating and scheduling work, the close-out checklist gate, double-booking
// heads-ups, appointments, and job deletion. Job detail has no GET route, so
// state assertions read the database.
import { test, expect } from "@playwright/test";
import { readState } from "../env";
import { Api, createContact, deleteContact, runTag } from "../helpers/api";
import { db, disconnectDb } from "../helpers/db";

const state = readState();

// A fresh far-future window so conflict assertions only ever see this run's
// records (the harness company is shared across runs; cleanup removes these
// jobs with the contact either way).
const windowStart = (() => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 45 + Math.floor(Math.random() * 200));
  d.setUTCHours(15, 0, 0, 0);
  return d;
})();
const hoursFrom = (h: number) => new Date(windowStart.getTime() + h * 3600_000);

test.describe("jobs & scheduling", () => {
  let api: Api;
  let contactId: string;
  let workItemId: string;
  const serviceName = `${runTag} Tune-Up`;

  test.beforeAll(async () => {
    api = Api.forOwnerA(state);
    contactId = (await createContact(api, "Jobs")).id;
    // Price-book service with a close-out checklist — jobs selling it
    // materialize the tasks and can't close until they're handled.
    workItemId = (
      await api.post("/api/app/work-items", {
        name: serviceName,
        type: "SERVICE",
        unitPrice: 120,
        durationMinutes: 60,
        checklist: ["Inspect unit", "Photograph results"],
      })
    ).id;
  });

  test.afterAll(async () => {
    if (workItemId) {
      const res = await api.raw("DELETE", `/api/app/work-items/${workItemId}`);
      if (!res.ok) console.warn(`[e2e] cleanup: delete work item → ${res.status}`);
    }
    if (contactId) await deleteContact(api, contactId);
    await disconnectDb();
  });

  test("create + schedule guardrails", async () => {
    // A window that ends before it starts is a typo — rejected on create…
    await api.json(
      "POST",
      "/api/app/jobs",
      {
        contactId,
        title: "E2E backwards window",
        scheduledAt: hoursFrom(2).toISOString(),
        scheduledEnd: hoursFrom(1).toISOString(),
      },
      400
    );

    const job = await api.post("/api/app/jobs", {
      contactId,
      title: "E2E guardrail job",
      scheduledAt: hoursFrom(24).toISOString(),
      scheduledEnd: hoursFrom(25).toISOString(),
    });
    expect(job.jobNumber).toBeGreaterThan(0);
    expect(job.status).toBe("ACTIVE");

    // …and on reschedule.
    await api.json(
      "PATCH",
      `/api/app/jobs/${job.id}`,
      { scheduledAt: hoursFrom(26).toISOString(), scheduledEnd: hoursFrom(25).toISOString() },
      400
    );
  });

  test("close-out checklist gates completion", async () => {
    const job = await api.post("/api/app/jobs", {
      contactId,
      title: "E2E checklist job",
      lineItems: [{ name: serviceName, quantity: 1, unitPrice: 120 }],
    });

    // The service's tasks materialized on the job.
    const items = await db().jobChecklistItem.findMany({ where: { jobId: job.id } });
    expect(items).toHaveLength(2);

    // Open tasks block completion.
    const blocked = await api.raw("PATCH", `/api/app/jobs/${job.id}/status`, {
      status: "REQUIRES_INVOICING",
    });
    expect(blocked.status).toBe(400);

    // Skipping needs a reason.
    await api.json(
      "PATCH",
      `/api/app/jobs/${job.id}/checklist`,
      { itemId: items[0].id, action: "skip" },
      400
    );

    await api.patch(`/api/app/jobs/${job.id}/checklist`, { itemId: items[0].id, action: "done" });
    await api.patch(`/api/app/jobs/${job.id}/checklist`, {
      itemId: items[1].id,
      action: "skip",
      reason: "Client declined photos",
    });

    // Every task handled → the job completes and stamps completedAt.
    await api.patch(`/api/app/jobs/${job.id}/status`, { status: "REQUIRES_INVOICING" });
    const completed = await db().job.findUniqueOrThrow({ where: { id: job.id } });
    expect(completed.status).toBe("REQUIRES_INVOICING");
    expect(completed.completedAt).not.toBeNull();

    // A replayed PATCH of the same status must not move the stamp.
    await api.patch(`/api/app/jobs/${job.id}/status`, { status: "REQUIRES_INVOICING" });
    const replayed = await db().job.findUniqueOrThrow({ where: { id: job.id } });
    expect(replayed.completedAt!.getTime()).toBe(completed.completedAt!.getTime());

    // Archive stamps closedAt; a closed job's checklist is read-only.
    await api.patch(`/api/app/jobs/${job.id}/status`, { status: "ARCHIVED" });
    const archived = await db().job.findUniqueOrThrow({ where: { id: job.id } });
    expect(archived.closedAt).not.toBeNull();
    await api.json(
      "PATCH",
      `/api/app/jobs/${job.id}/checklist`,
      { itemId: items[0].id, action: "reopen" },
      400
    );

    // Reopening the job clears both stamps.
    await api.patch(`/api/app/jobs/${job.id}/status`, { status: "ACTIVE" });
    const reopened = await db().job.findUniqueOrThrow({ where: { id: job.id } });
    expect(reopened.completedAt).toBeNull();
    expect(reopened.closedAt).toBeNull();
  });

  test("double-booking heads-up on jobs and appointments", async () => {
    const first = await api.post("/api/app/jobs", {
      contactId,
      title: "E2E conflict base",
      scheduledAt: windowStart.toISOString(),
      scheduledEnd: hoursFrom(1).toISOString(),
      assigneeIds: [state.ownerA.userId],
    });
    expect(first.conflicts).toEqual([]);

    // Same tech, same window → saved anyway, but flagged.
    const second = await api.post("/api/app/jobs", {
      contactId,
      title: "E2E conflict overlap",
      scheduledAt: windowStart.toISOString(),
      scheduledEnd: hoursFrom(1).toISOString(),
      assigneeIds: [state.ownerA.userId],
    });
    expect(second.conflicts.length).toBeGreaterThanOrEqual(1);
    expect(String(second.conflicts[0])).toContain(`#${first.jobNumber}`);

    // Moving it to a free window clears the heads-up.
    const moved = await api.patch(`/api/app/jobs/${second.id}`, {
      scheduledAt: hoursFrom(3).toISOString(),
      scheduledEnd: hoursFrom(4).toISOString(),
    });
    expect(moved.conflicts).toEqual([]);

    // Appointments: in-person requires an address…
    await api.json(
      "POST",
      "/api/app/appointments",
      { contactId, type: "IN_PERSON", scheduledAt: windowStart.toISOString() },
      400
    );
    // …and booking over the tech's job raises the same heads-up.
    const appt = await api.post("/api/app/appointments", {
      contactId,
      type: "IN_PERSON",
      title: "E2E estimate",
      scheduledAt: windowStart.toISOString(),
      address: "123 E2E Way",
    });
    expect(appt.conflicts.length).toBeGreaterThanOrEqual(1);
  });

  test("job delete removes the job outright", async () => {
    const job = await api.post("/api/app/jobs", { contactId, title: "E2E throwaway job" });
    await api.delete(`/api/app/jobs/${job.id}`);
    expect(await db().job.findUnique({ where: { id: job.id } })).toBeNull();
  });
});
