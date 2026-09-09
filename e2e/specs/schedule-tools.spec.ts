import { test, expect } from "@playwright/test";
import { Api, createContact, deleteContact, readState, runTag } from "../helpers/api";
import { db } from "../helpers/db";

// Schedule tools: the API behind the calendar's palette, learned durations,
// "Move the day", the notify-on-move gate, and the route plan's distance
// figures. Pure API — the drag surface itself is a browser gesture the
// suite can't reproduce, but everything it calls is exercised here.

const state = readState();

// A far-future day so nothing here collides with other runs
const dayStart = (() => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 60 + Math.floor(Math.random() * 200));
  d.setUTCHours(15, 0, 0, 0);
  return d;
})();
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const hoursFrom = (h: number) => new Date(dayStart.getTime() + h * 3600_000);
const daysFrom = (n: number) => new Date(dayStart.getTime() + n * 86400_000);

test.describe("schedule tools", () => {
  let api: Api;
  let contactId: string;

  test.beforeAll(async () => {
    api = Api.forOwnerA(state);
    contactId = (await createContact(api, "Sched")).id;
  });

  test.afterAll(async () => {
    if (contactId) await deleteContact(api, contactId);
  });

  test("palette finds clients, requests, and unscheduled jobs by name", async () => {
    const job = await api.post("/api/app/jobs", { contactId, title: `${runTag} palette job` });
    const request = await api.post("/api/app/requests", { contactId, title: `${runTag} palette request` });

    const hit = await api.get(`/api/app/schedule/palette?q=${encodeURIComponent(runTag)}`);
    expect(hit.contacts.some((c: { id: string }) => c.id === contactId)).toBe(true);
    expect(hit.jobs.some((j: { job: { id: string } }) => j.job.id === job.id)).toBe(true);
    expect(hit.requests.some((r: { id: string }) => r.id === request.id)).toBe(true);
    // A client card knows it's a client, not a lead
    const me = hit.contacts.find((c: { id: string }) => c.id === contactId);
    expect(me.lead).toBe(false);

    // The empty query = the waiting lists (requests + recent clients)
    const idle = await api.get("/api/app/schedule/palette");
    expect(Array.isArray(idle.requests)).toBe(true);
    expect(Array.isArray(idle.contacts)).toBe(true);
  });

  test("duration hint learns from what was booked before", async () => {
    const title = `${runTag} Hedge trim`;
    // Nothing known yet
    const none = await api.get(`/api/app/schedule/duration-hint?title=${encodeURIComponent(title)}`);
    expect(none.minutes).toBeNull();

    // Two past bookings of 90 minutes → the hint says 90
    for (let i = 0; i < 2; i++) {
      await api.post("/api/app/jobs", {
        contactId,
        title,
        scheduledAt: hoursFrom(i * 3).toISOString(),
        scheduledEnd: hoursFrom(i * 3 + 1.5).toISOString(),
      });
    }
    const learned = await api.get(`/api/app/schedule/duration-hint?title=${encodeURIComponent(title)}`);
    expect(learned.minutes).toBe(90);
    expect(learned.source).toBe("scheduled");
  });

  test("move the day shifts every visit, keeps times, and undoes", async () => {
    const day = daysFrom(3);
    const a = await api.post("/api/app/jobs", {
      contactId,
      title: `${runTag} rain A`,
      scheduledAt: new Date(day.getTime()).toISOString(),
      scheduledEnd: new Date(day.getTime() + 3600_000).toISOString(),
      assigneeIds: [state.ownerA.userId],
    });
    const b = await api.post("/api/app/jobs", {
      contactId,
      title: `${runTag} rain B`,
      scheduledAt: new Date(day.getTime() + 2 * 3600_000).toISOString(),
      scheduledEnd: new Date(day.getTime() + 3 * 3600_000).toISOString(),
      assigneeIds: [state.ownerA.userId],
    });

    const target = daysFrom(4);
    const moved = await api.post(
      "/api/app/schedule/shift-day",
      { date: ymd(day), toDate: ymd(target), ids: [a.id, b.id] },
      200
    );
    expect(moved.moved).toBe(2);
    expect(moved.notified).toBe(0);

    const rowA = await db().job.findUnique({ where: { id: a.id } });
    const rowB = await db().job.findUnique({ where: { id: b.id } });
    // Same wall-clock time, one day later, length preserved
    expect(rowA!.scheduledAt!.getTime() - new Date(a.scheduledAt).getTime()).toBe(86400_000);
    expect(rowA!.scheduledEnd!.getTime() - rowA!.scheduledAt!.getTime()).toBe(3600_000);
    expect(rowB!.scheduledAt!.getTime() - new Date(b.scheduledAt).getTime()).toBe(86400_000);

    // Undo = the same call in reverse, scoped to what moved
    const back = await api.post(
      "/api/app/schedule/shift-day",
      { date: ymd(target), toDate: ymd(day), ids: moved.undo.map((u: { id: string }) => u.id) },
      200
    );
    expect(back.moved).toBe(2);
    const restored = await db().job.findUnique({ where: { id: a.id } });
    expect(restored!.scheduledAt!.toISOString()).toBe(new Date(a.scheduledAt).toISOString());

    // Same day → refused; empty day → refused
    await api.json("POST", "/api/app/schedule/shift-day", { date: ymd(day), toDate: ymd(day) }, 400);
    await api.json("POST", "/api/app/schedule/shift-day", { date: ymd(daysFrom(40)), toDate: ymd(daysFrom(41)) }, 400);
  });

  test("notify-on-move refuses politely when the client has no way to be reached", async () => {
    const job = await api.post("/api/app/jobs", {
      contactId,
      title: `${runTag} notify`,
      scheduledAt: hoursFrom(20).toISOString(),
      scheduledEnd: hoursFrom(21).toISOString(),
    });
    // Harness contacts have neither email nor phone — the send must not 500
    const res = await api.json("POST", "/api/app/schedule/notify-move", { kind: "job", id: job.id }, 422);
    expect(res.reason).toBe("no_contact_method");
    await api.json("POST", "/api/app/schedule/notify-move", { kind: "job", id: "nope" }, 404);
    await api.json("POST", "/api/app/schedule/notify-move", { kind: "thing", id: job.id }, 400);
  });

  test("route plan carries distance and a measured flag", async () => {
    const plan = await api.get(`/api/app/route-plan?date=${ymd(dayStart)}&geometry=1`);
    expect(plan.drive).toBeTruthy();
    expect(typeof plan.drive.measured).toBe("boolean");
    expect(plan.drive.km).toBeTruthy();
    expect(plan.drive.kmTotals).toBeTruthy();
  });

  test("tenant B sees none of it", async () => {
    const b = Api.forOwnerB(state);
    const hit = await b.get(`/api/app/schedule/palette?q=${encodeURIComponent(runTag)}`);
    expect(hit.contacts.some((c: { id: string }) => c.id === contactId)).toBe(false);
    expect(hit.jobs.length).toBe(0);
    await b.json("POST", "/api/app/schedule/shift-day", { date: ymd(daysFrom(3)), toDate: ymd(daysFrom(5)) }, 400);
  });
});
