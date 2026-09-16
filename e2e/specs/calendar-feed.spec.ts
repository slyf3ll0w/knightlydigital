// Calendar sync, tier 1: the private .ics subscribe link. Create / rotate /
// turn off through the profile API, then read the public feed exactly the
// way a calendar app does (no cookie). A scheduled job assigned to the owner
// shows up; the other tenant's feed never sees it; a bad token is a bare 404.
import { test, expect } from "@playwright/test";
import { readState } from "../env";
import { Api, createContact, deleteContact, runTag } from "../helpers/api";

const state = readState();
const hoursFrom = (h: number) => new Date(Date.now() + h * 3_600_000);

test.describe("calendar subscribe feed", () => {
  let api: Api;
  let contactId = "";
  let jobId = "";
  let feedUrl = "";

  test.beforeAll(async () => {
    api = Api.forOwnerA(state);
    contactId = (await createContact(api, "CalFeed")).id;
  });

  test.afterAll(async () => {
    await api.raw("DELETE", "/api/app/profile/calendar-feed");
    if (contactId) await deleteContact(api, contactId);
  });

  test("no feed until the user creates one", async () => {
    await api.raw("DELETE", "/api/app/profile/calendar-feed");
    const feed = await api.get("/api/app/profile/calendar-feed");
    expect(feed.url).toBeNull();
  });

  test("create → a private .ics URL on the app origin", async () => {
    const feed = await api.post("/api/app/profile/calendar-feed");
    expect(feed.url).toMatch(/\/api\/public\/calendar\/[A-Za-z0-9_-]{40,}\.ics$/);
    expect(feed.webcalUrl).toMatch(/^webcal:\/\//);
    feedUrl = feed.url;
  });

  test("an assigned, scheduled job appears in the feed", async () => {
    const job = await api.post("/api/app/jobs", {
      contactId,
      title: `${runTag} Feed visit`,
      scheduledAt: hoursFrom(30).toISOString(),
      assigneeIds: [state.ownerA.userId],
    });
    jobId = job.id;

    // Same host as the state's baseUrl even if NEXTAUTH_URL differs (local runs)
    const path = new URL(feedUrl).pathname;
    const res = await fetch(`${state.baseUrl}${path}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    const body = await res.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain(`UID:wb-job-${jobId}@`);
    expect(body).toContain("Feed visit");
  });

  test("the other tenant's feed doesn't carry it", async () => {
    const b = Api.forOwnerB(state);
    const feedB = await b.post("/api/app/profile/calendar-feed");
    const res = await fetch(`${state.baseUrl}${new URL(feedB.url).pathname}`);
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain(`wb-job-${jobId}@`);
    await b.raw("DELETE", "/api/app/profile/calendar-feed");
  });

  test("handing the job to a subcontractor drops it from the feed", async () => {
    // The harness is a one-person company: clearing the crew would land the
    // job straight back on the owner (solo auto-assign), and a solo member's
    // feed carries unassigned scheduled jobs anyway. Outsourced is the one
    // legitimate empty crew, and outsourced jobs stay off everyone's calendar.
    await api.patch(`/api/app/jobs/${jobId}`, { assigneeIds: [], outsourced: true, outsourcedTo: "Sub Co" });
    const res = await fetch(`${state.baseUrl}${new URL(feedUrl).pathname}`);
    expect(await res.text()).not.toContain(`wb-job-${jobId}@`);
  });

  test("rotating kills the old link; turning off kills the new one; junk is a bare 404", async () => {
    const oldPath = new URL(feedUrl).pathname;
    const rotated = await api.post("/api/app/profile/calendar-feed");
    expect(rotated.url).not.toBe(feedUrl);
    expect((await fetch(`${state.baseUrl}${oldPath}`)).status).toBe(404);
    expect((await fetch(`${state.baseUrl}${new URL(rotated.url).pathname}`)).status).toBe(200);

    await api.delete("/api/app/profile/calendar-feed");
    expect((await fetch(`${state.baseUrl}${new URL(rotated.url).pathname}`)).status).toBe(404);

    const junk = await fetch(`${state.baseUrl}/api/public/calendar/not-a-real-token-at-all-000000.ics`);
    expect(junk.status).toBe(404);
    expect(await junk.text()).toBe("");
  });
});
