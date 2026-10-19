import { test, expect } from "@playwright/test";
import { readState } from "../env";
import { Api, createContact, deleteContact, runTag } from "../helpers/api";
import { db, disconnectDb } from "../helpers/db";

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
    await disconnectDb();
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

  test("notify-on-move always lands in the portal thread, even with no phone or email", async () => {
    const job = await api.post("/api/app/jobs", {
      contactId,
      title: `${runTag} notify`,
      scheduledAt: hoursFrom(20).toISOString(),
      scheduledEnd: hoursFrom(21).toISOString(),
    });
    // Harness contacts have neither email nor phone — the portal thread is
    // the record either way (and cascades away with the contact)
    const res = await api.json("POST", "/api/app/schedule/notify-move", { kind: "job", id: job.id }, 200);
    expect(res.via).toContain("portal");
    const thread = await db().portalMessage.findMany({ where: { contactId, direction: "OUTBOUND" } });
    expect(thread.some((m) => m.body.includes(`${runTag} notify`))).toBe(true);
    await api.json("POST", "/api/app/schedule/notify-move", { kind: "job", id: "nope" }, 404);
    await api.json("POST", "/api/app/schedule/notify-move", { kind: "thing", id: job.id }, 400);
  });

  test("blocked time can carry a location", async () => {
    const block = await api.post("/api/app/time-blocks", {
      title: `${runTag} dentist`,
      startAt: hoursFrom(30).toISOString(),
      endAt: hoursFrom(31).toISOString(),
      address: "1600 Pennsylvania Ave NW, Washington, DC 20500",
    });
    expect(block.address).toContain("Pennsylvania");
    const cleared = await api.patch(`/api/app/time-blocks/${block.id}`, { address: "" });
    expect(cleared.address ?? null).toBeNull();
    await api.delete(`/api/app/time-blocks/${block.id}`);
  });

  test("a repeating block builds its days, one day can leave it, and removing it clears them", async () => {
    // Five weeks of one weekday, a couple of months out
    const startsOn = ymd(daysFrom(1));
    const weekday = new Date(`${startsOn}T12:00:00Z`).getUTCDay();
    const series = await api.post("/api/app/time-block-series", {
      title: `${runTag} lunch`,
      weekdays: [weekday],
      startTime: "12:00",
      endTime: "13:00",
      startsOn,
      endsOn: ymd(daysFrom(29)),
    });
    expect(series.id).toBeTruthy();
    expect(series.created).toBe(5);
    expect(series.weekdays).toEqual([weekday]);
    const rows = await db().timeBlock.findMany({ where: { seriesId: series.id }, orderBy: { startAt: "asc" } });
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.title === `${runTag} lunch` && !r.allDay)).toBe(true);
    // A week apart (give or take a DST hour)
    const gap = rows[1].startAt.getTime() - rows[0].startAt.getTime();
    expect(Math.abs(gap - 7 * 86400_000)).toBeLessThanOrEqual(3600_000);
    // The settings list shows it
    const listed = await api.get("/api/app/time-block-series");
    expect(listed.series.some((s: { id: string }) => s.id === series.id)).toBe(true);

    // Editing one day detaches it: it stops repeating and the series skips that day
    const second = rows[1];
    const edited = await api.patch(`/api/app/time-blocks/${second.id}`, { title: `${runTag} dentist` });
    expect(edited.detached).toBe(true);
    expect(edited.seriesId).toBeNull();
    const skipped = await db().timeBlockSeries.findUnique({ where: { id: series.id } });
    expect(skipped?.skipDates).toHaveLength(1);

    // Changing the rule rebuilds the days ahead and leaves the detached day alone
    const patched = await api.patch(`/api/app/time-block-series/${series.id}`, { startTime: "11:30", endTime: "12:30" });
    expect(patched.startMinute).toBe(11 * 60 + 30);
    const rebuilt = await db().timeBlock.findMany({ where: { seriesId: series.id }, orderBy: { startAt: "asc" } });
    expect(rebuilt).toHaveLength(4);
    const still = await db().timeBlock.findUnique({ where: { id: second.id } });
    expect(still?.title).toBe(`${runTag} dentist`);

    // Removing one day keeps the rest; removing the series takes every day with it
    await api.delete(`/api/app/time-blocks/${rebuilt[0].id}`);
    expect(await db().timeBlock.count({ where: { seriesId: series.id } })).toBe(3);
    await api.delete(`/api/app/time-block-series/${series.id}`);
    expect(await db().timeBlock.count({ where: { seriesId: series.id } })).toBe(0);
    await api.json("DELETE", `/api/app/time-block-series/${series.id}`, undefined, 404);
    await db().timeBlock.delete({ where: { id: second.id } });

    // Bad rules are refused with a plain reason
    const bad = await api.json("POST", "/api/app/time-block-series", { weekdays: [], startsOn, startTime: "09:00", endTime: "10:00" }, 400);
    expect(bad.error).toMatch(/at least one day/);
    const backwards = await api.json("POST", "/api/app/time-block-series", { weekdays: [1], startsOn, startTime: "10:00", endTime: "09:00" }, 400);
    expect(backwards.error).toMatch(/after the start/);
  });

  test("route plan carries distance, a measured flag, the company clock and the road-times state", async () => {
    const plan = await api.get(`/api/app/route-plan?date=${ymd(dayStart)}&geometry=1`);
    expect(plan.drive).toBeTruthy();
    expect(typeof plan.drive.measured).toBe("boolean");
    expect(plan.drive.km).toBeTruthy();
    expect(plan.drive.kmTotals).toBeTruthy();
    expect(typeof plan.timezone).toBe("string");
    expect(["ok", "paused", "off"]).toContain(plan.roadTimes);
    for (const s of plan.stops) {
      expect(["pending", "active", "done"]).toContain(s.progress);
      expect(typeof s.reminded).toBe("boolean");
    }
  });

  test("optimize: a hand order may carry ids the server can't route, locks hold a stop, nobody is texted by default", async () => {
    // Three mapped stops on a far-future day, one with a client window and
    // one that has (as far as the client knows) already been reminded
    const day = daysFrom(7);
    const at = (h: number) => new Date(day.getTime() + h * 3600_000).toISOString();
    const mk = (title: string, address: string, h: number, extra: Record<string, unknown> = {}) =>
      api.post("/api/app/jobs", {
        contactId,
        title: `${runTag} ${title}`,
        address,
        scheduledAt: at(h),
        scheduledEnd: at(h + 1),
        assigneeIds: [state.ownerA.userId],
        ...extra,
      });
    const a = await mk("opt A", "6000 W Plano Pkwy, Plano, TX 75093", 0);
    const b = await mk("opt B", "1000 E 15th St, Plano, TX 75074", 2, { arriveAfterMin: 13 * 60 });
    const c = await mk("opt C", "2000 E Spring Creek Pkwy, Plano, TX 75074", 4);
    try {
      // The client window landed on the job and comes back on the route stop
      const plan = await api.get(`/api/app/route-plan?date=${ymd(day)}`);
      const stopB = plan.stops.find((s: { id: string }) => s.id === b.id);
      expect(stopB).toBeTruthy();
      expect(stopB.windowStart).toBeTruthy();
      expect(stopB.windowEnd).toBeNull();

      const first = await api.raw("POST", "/api/app/route-plan/optimize", { date: ymd(day), userId: state.ownerA.userId });
      const solved = await first.json();
      if (first.status === 400) {
        // No map pins on this environment (no MAPBOX_TOKEN) — the rest needs geometry
        expect(solved.error).toContain("mapped stops");
        return;
      }
      expect(first.status).toBe(200);
      expect(solved.applied).toBe(false);
      expect(Array.isArray(solved.keep)).toBe(true);
      expect(typeof solved.movedCount).toBe("number");
      expect(solved.stops.map((s: { id: string }) => s.id).sort()).toEqual([a.id, b.id, c.id].sort());
      // B waits for its window: never proposed before 1 PM on the company clock
      const proposedB = solved.stops.find((s: { id: string }) => s.id === b.id);
      const hour = Number(new Date(proposedB.proposedStart).toLocaleTimeString("en-US", { hour: "2-digit", hour12: false, timeZone: solved.timezone }));
      expect(hour).toBeGreaterThanOrEqual(13);

      // A manual order with a stray id (a stop the server won't route) is accepted, not a 409
      const manual = await api.json("POST", "/api/app/route-plan/optimize", {
        date: ymd(day),
        userId: state.ownerA.userId,
        order: [c.id, a.id, "not-a-stop", b.id],
      }, 200);
      expect(manual.stops[0].id).toBe(c.id);

      // Lock A: it leaves the routed list and shows up as kept
      const locked = await api.json("POST", "/api/app/route-plan/optimize", { date: ymd(day), userId: state.ownerA.userId, keep: [a.id] }, 200);
      expect(locked.stops.some((s: { id: string }) => s.id === a.id)).toBe(false);
      expect(locked.pinnedStops.some((p: { id: string; locked: boolean }) => p.id === a.id && p.locked)).toBe(true);

      // Apply without notify: times move, nobody is told
      const applied = await api.json("POST", "/api/app/route-plan/optimize", {
        date: ymd(day),
        userId: state.ownerA.userId,
        order: locked.stops.map((s: { id: string }) => s.id),
        keep: [a.id],
        apply: true,
      }, 200);
      expect(applied.applied).toBe(true);
      expect(applied.notified).toBe(0);
      const after = await api.get(`/api/app/route-plan?date=${ymd(day)}`);
      const stopA = after.stops.find((s: { id: string }) => s.id === a.id);
      expect(new Date(stopA.scheduledAt).toISOString()).toBe(at(0)); // locked → untouched
    } finally {
      for (const j of [a, b, c]) await api.json("DELETE", `/api/app/jobs/${j.id}`, undefined, 200).catch(() => {});
    }
  });

  test("stops that aren't clients: a place, an errand before a job, a task with a place, lunch slotted by Optimize", async () => {
    const day = daysFrom(9);
    const at = (h: number) => new Date(day.getTime() + h * 3600_000).toISOString();
    const place = await api.post("/api/app/places", { name: `${runTag} Ferguson`, kind: "SUPPLY", address: "3100 W Plano Pkwy, Plano, TX 75075" });
    const a = await api.post("/api/app/jobs", {
      contactId, title: `${runTag} errand A`, address: "6000 W Plano Pkwy, Plano, TX 75093",
      scheduledAt: at(0), scheduledEnd: at(1), assigneeIds: [state.ownerA.userId],
    });
    const b = await api.post("/api/app/jobs", {
      contactId, title: `${runTag} errand B`, address: "2000 E Spring Creek Pkwy, Plano, TX 75074",
      scheduledAt: at(2), scheduledEnd: at(3), assigneeIds: [state.ownerA.userId],
    });
    const errand = await api.json("POST", "/api/app/route-plan/stops", {
      date: ymd(day), userId: state.ownerA.userId, kind: "errand", placeId: place.place.id, durationMinutes: 20, beforeJobId: b.id,
    }, 201);
    const task = await api.post("/api/app/tasks", {
      title: `${runTag} drop the permit`, dueDate: ymd(day), address: "1520 K Ave, Plano, TX 75074", estimatedMinutes: 15,
    });
    const taskId = task.tasks[0].id as string;
    const cleanup: string[] = [];
    try {
      const plan = await api.get(`/api/app/route-plan?date=${ymd(day)}`);
      const errandStop = plan.stops.find((s: { id: string }) => s.id === errand.id);
      expect(errandStop).toBeTruthy();
      expect(errandStop.kind).toBe("errand");
      expect(errandStop.flexible).toBe(true);
      expect(errandStop.beforeStopId).toBe(b.id);
      expect(errandStop.title).toBe(`${runTag} Ferguson`);
      const taskStop = plan.stops.find((s: { id: string }) => s.id === taskId);
      expect(taskStop).toBeTruthy();
      expect(taskStop.kind).toBe("task");
      expect(taskStop.scheduledAnytime).toBe(true);
      expect(typeof plan.breakDefault?.minutes).toBe("number");

      const first = await api.raw("POST", "/api/app/route-plan/optimize", { date: ymd(day), userId: state.ownerA.userId });
      const solved = await first.json();
      if (first.status === 400) {
        // No map pins on this environment (no MAPBOX_TOKEN) — the rest needs geometry
        expect(solved.error).toContain("mapped stops");
        return;
      }
      expect(first.status).toBe(200);
      const ids = solved.stops.map((s: { id: string }) => s.id);
      expect(ids.indexOf(errand.id)).toBeGreaterThanOrEqual(0);
      expect(ids.indexOf(errand.id)).toBeLessThan(ids.indexOf(b.id));
      // The company's automatic lunch rides the preview and is saved on apply
      expect(solved.breakAdded).toBe(true);
      expect(solved.stops.some((s: { kind: string }) => s.kind === "break")).toBe(true);
      const applied = await api.json("POST", "/api/app/route-plan/optimize", {
        date: ymd(day), userId: state.ownerA.userId, order: ids, keep: solved.keep, apply: true,
      }, 200);
      expect(applied.applied).toBe(true);
      const after = await api.get(`/api/app/route-plan?date=${ymd(day)}`);
      const lunch = after.stops.find((s: { kind: string }) => s.kind === "break");
      expect(lunch).toBeTruthy();
      cleanup.push(lunch.id);
      const placedErrand = after.stops.find((s: { id: string }) => s.id === errand.id);
      expect(placedErrand.scheduledAnytime).toBe(false);
      // Tick the errand done from the route
      const ticked = await api.json("PATCH", `/api/app/time-blocks/${errand.id}`, { done: true }, 200);
      expect(ticked.doneAt).toBeTruthy();
    } finally {
      for (const id of [errand.id, ...cleanup]) await api.json("DELETE", `/api/app/time-blocks/${id}`, undefined, 200).catch(() => {});
      await api.json("DELETE", `/api/app/tasks/${taskId}`, undefined, 200).catch(() => {});
      for (const j of [a, b]) await api.json("DELETE", `/api/app/jobs/${j.id}`, undefined, 200).catch(() => {});
      await api.json("DELETE", `/api/app/places/${place.place.id}`, undefined, 200).catch(() => {});
    }
  });

  test("tenant B sees none of it", async () => {
    const b = Api.forOwnerB(state);
    const hit = await b.get(`/api/app/schedule/palette?q=${encodeURIComponent(runTag)}`);
    expect(hit.contacts.some((c: { id: string }) => c.id === contactId)).toBe(false);
    expect(hit.jobs.length).toBe(0);
    await b.json("POST", "/api/app/schedule/shift-day", { date: ymd(daysFrom(3)), toDate: ymd(daysFrom(5)) }, 400);
  });
});
