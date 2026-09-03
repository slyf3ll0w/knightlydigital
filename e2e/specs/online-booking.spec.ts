// Online booking v3: one list of items (scheduled + request mode), the
// availability engine over a real company, the public pages and slot API,
// self-serve links, and the captcha gate that keeps scripted bookings out
// (a green "captcha rejected" here is proof the public POSTs can't be
// flooded by bots).
import { test, expect } from "@playwright/test";
import { readState } from "../env";
import { Api, deleteContact, runTag } from "../helpers/api";
import { db, disconnectDb } from "../helpers/db";

const state = readState();

test.describe("online booking (items)", () => {
  let api: Api;
  let phoneTypeId: string;
  let phoneTypeSlug: string;
  let serviceTypeId: string;
  let serviceTypeSlug: string;
  let messageItemId: string;
  let messageItemSlug: string;
  let workItemId: string;

  test.beforeAll(async () => {
    api = Api.forOwnerA(state);
    await api.patch(`/api/app/team/${state.ownerA.userId}`, { bookable: true });
    const phone = await api.post("/api/app/booking-types", { name: `${runTag} Phone call`, kind: "PHONE_CALL" });
    phoneTypeId = phone.id;
    phoneTypeSlug = phone.slug;
    workItemId = (
      await api.post("/api/app/work-items", {
        name: `${runTag} Bookable Service`,
        type: "SERVICE",
        unitPrice: 99,
        durationMinutes: 60,
      })
    ).id;
    const svc = await api.post("/api/app/booking-types", { name: `${runTag} Service`, kind: "SERVICE" });
    serviceTypeId = svc.id;
    serviceTypeSlug = svc.slug;
    await api.patch(`/api/app/booking-types/${serviceTypeId}`, { services: [workItemId], leadHours: 0, horizonDays: 14 });
    const msg = await api.post("/api/app/booking-types", { name: `${runTag} Contact`, kind: "MESSAGE" });
    messageItemId = msg.id;
    messageItemSlug = msg.slug;
  });

  test.afterAll(async () => {
    await api.raw("PATCH", `/api/app/team/${state.ownerA.userId}`, { bookable: false });
    for (const [label, path] of [
      ["phone item", `/api/app/booking-types/${phoneTypeId}`],
      ["service item", `/api/app/booking-types/${serviceTypeId}`],
      ["message item", `/api/app/booking-types/${messageItemId}`],
      ["work item", `/api/app/work-items/${workItemId}`],
    ] as const) {
      if (!path.endsWith("undefined")) {
        const res = await api.raw("DELETE", path);
        if (!res.ok) console.warn(`[e2e] cleanup: delete ${label} → ${res.status}`);
      }
    }
    await disconnectDb();
  });

  test("a new item starts with sane defaults and the bookable owner in its pool", async () => {
    const t = await api.get(`/api/app/booking-types/${phoneTypeId}`);
    expect(t.kind).toBe("PHONE_CALL");
    expect(t.mode).toBe("SCHEDULE");
    expect(t.confirmation).toBe("INSTANT");
    expect(t.clientCanReschedule).toBe(true);
    expect(t.showOnPage).toBe(true);
    expect(t.members.some((m: { userId: string }) => m.userId === state.ownerA.userId)).toBe(true);
    const m = await api.get(`/api/app/booking-types/${messageItemId}`);
    expect(m.mode).toBe("REQUEST"); // a message form never schedules
  });

  test("settings preview shows open times for the phone item", async () => {
    await api.patch(`/api/app/booking-types/${phoneTypeId}`, { leadHours: 0, horizonDays: 14 });
    const p = await api.get(`/api/app/booking-types/${phoneTypeId}/preview`);
    expect(p.eligible.length).toBeGreaterThan(0);
    const slots = p.days.reduce((n: number, d: { slots: unknown[] }) => n + d.slots.length, 0);
    expect(slots).toBeGreaterThan(0);
  });

  test("payment can't be turned on for a non-fixed-price service", async () => {
    const hourly = await api.post("/api/app/work-items", {
      name: `${runTag} Hourly`,
      type: "SERVICE",
      unitPrice: 95,
      priceDisplay: "HOURLY",
      durationMinutes: 60,
    });
    try {
      const res = await api.raw("PATCH", `/api/app/booking-types/${serviceTypeId}`, { services: [workItemId, hourly.id], paymentMode: "FULL" });
      expect(res.status).toBe(400);
      const t = await api.get(`/api/app/booking-types/${serviceTypeId}`);
      expect(t.paymentMode).toBe("NONE");
    } finally {
      await api.raw("DELETE", `/api/app/work-items/${hourly.id}`);
    }
  });

  test("questions save on the item and the public page renders them", async () => {
    await api.patch(`/api/app/booking-types/${messageItemId}`, {
      intake: { heading: `${runTag} Say hello`, customFields: [{ id: "budget", label: `${runTag} Budget`, type: "text", required: false }] },
    });
    const t = await api.get(`/api/app/booking-types/${messageItemId}`);
    expect(t.intake.customFields[0].label).toBe(`${runTag} Budget`);
    const page = await fetch(`${state.baseUrl}/book/${state.companyASlug}/${messageItemSlug}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain(`${runTag} Say hello`);
    expect(html).toContain(`${runTag} Budget`);
  });

  test("the booking page lists items that are on it, and hides link-only ones", async () => {
    await api.patch(`/api/app/booking-types/${messageItemId}`, { showOnPage: false });
    const page = await fetch(`${state.baseUrl}/book/${state.companyASlug}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain(`${runTag} Phone call`);
    expect(html).not.toContain(`${runTag} Say hello`);
    // link-only items still answer at their own link
    const own = await fetch(`${state.baseUrl}/book/${state.companyASlug}/${messageItemSlug}`);
    expect(own.status).toBe(200);
    await api.patch(`/api/app/booking-types/${messageItemId}`, { showOnPage: true });
  });

  test("the v2 /schedule links redirect to the item pages", async () => {
    const res = await fetch(`${state.baseUrl}/book/${state.companyASlug}/schedule/${phoneTypeSlug}`, { redirect: "manual" });
    expect([301, 308]).toContain(res.status);
    expect(res.headers.get("location")).toContain(`/book/${state.companyASlug}/${phoneTypeSlug}`);
  });

  test("public slot API: calls list exact times; in-person items need an address first", async () => {
    const call = await fetch(`${state.baseUrl}/api/public/schedule/${state.companyASlug}/${phoneTypeSlug}/slots`);
    expect(call.status).toBe(200);
    const cj = (await call.json()) as { exactTime: boolean; days: { slots: { label: string }[] }[] };
    expect(cj.exactTime).toBe(true);
    const n = cj.days.reduce((s, d) => s + d.slots.length, 0);
    expect(n).toBeGreaterThan(0);
    expect(cj.days[0].slots[0].label).not.toContain("–"); // exact start, no window

    const svc = await fetch(`${state.baseUrl}/api/public/schedule/${state.companyASlug}/${serviceTypeSlug}/slots?services=${workItemId}`);
    expect(svc.status).toBe(200);
    const sj = (await svc.json()) as { addressRequired?: boolean; days: unknown[] };
    expect(sj.addressRequired).toBe(true);
    expect(sj.days).toEqual([]);
  });

  test("public slot API: an address unlocks arrival windows for the service item", async () => {
    const address = encodeURIComponent("123 Main St, Plano, TX 75024");
    const res = await fetch(`${state.baseUrl}/api/public/schedule/${state.companyASlug}/${serviceTypeSlug}/slots?services=${workItemId}&address=${address}`);
    expect(res.status).toBe(200);
    const j = (await res.json()) as { exactTime: boolean; outOfArea: boolean; days: { slots: { label: string }[] }[] };
    expect(j.exactTime).toBe(false);
    expect(j.outOfArea).toBe(false);
    const n = j.days.reduce((s, d) => s + d.slots.length, 0);
    expect(n).toBeGreaterThan(0);
    expect(j.days[0].slots[0].label).toContain("–"); // arrival window
  });

  test("a request-mode item has no slots and its page still renders", async () => {
    await api.patch(`/api/app/booking-types/${serviceTypeId}`, { mode: "REQUEST" });
    const slots = await fetch(`${state.baseUrl}/api/public/schedule/${state.companyASlug}/${serviceTypeSlug}/slots?services=${workItemId}`);
    expect(slots.status).toBe(404);
    const page = await fetch(`${state.baseUrl}/book/${state.companyASlug}/${serviceTypeSlug}`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain(`${runTag} Bookable Service`);
    await api.patch(`/api/app/booking-types/${serviceTypeId}`, { mode: "SCHEDULE" });
  });

  test("inactive items disappear from the public surface", async () => {
    await api.patch(`/api/app/booking-types/${phoneTypeId}`, { isActive: false });
    const res = await fetch(`${state.baseUrl}/api/public/schedule/${state.companyASlug}/${phoneTypeSlug}/slots`);
    expect(res.status).toBe(404);
    const page = await fetch(`${state.baseUrl}/book/${state.companyASlug}/${phoneTypeSlug}`);
    expect(page.status).toBe(404);
    await api.patch(`/api/app/booking-types/${phoneTypeId}`, { isActive: true });
  });

  test("captcha gate rejects scripted public bookings and requests", async () => {
    const email = `e2e-${Date.now()}@example.invalid`;
    const res = await fetch(`${state.baseUrl}/api/public/schedule/${state.companyASlug}/${phoneTypeSlug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        captchaToken: "e2e-bogus-token",
        firstName: runTag,
        lastName: "CaptchaProbe",
        email,
        phone: "5550001234",
        slotStart: new Date(Date.now() + 86400000).toISOString(),
        elapsedMs: 60_000,
      }),
    });
    if (res.status !== 400) {
      const created = await db().contact.findFirst({ where: { companyId: state.ownerA.companyId, email } });
      if (created) await deleteContact(api, created.id);
      throw new Error(
        `Public booking accepted a bogus captcha token (status ${res.status}) — ` +
          "TURNSTILE_SECRET_KEY / NEXT_PUBLIC_TURNSTILE_SITE_KEY are not both set on this deployment."
      );
    }
    expect(String((await res.json()).error)).toMatch(/captcha/i);

    const req = await fetch(`${state.baseUrl}/api/public/book/${state.companyASlug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item: messageItemSlug, captchaToken: "e2e-bogus-token", firstName: runTag, lastName: "CaptchaProbe", email, message: "hi", elapsedMs: 60_000 }),
    });
    expect(req.status).toBe(400);
    expect(String((await req.json()).error)).toMatch(/captcha/i);
  });

  test("manage link 404s for an unknown token", async () => {
    const res = await fetch(`${state.baseUrl}/api/public/schedule/manage/e2e-no-such-token`);
    expect(res.status).toBe(404);
  });

  test("unknown company slug 404s", async () => {
    const res = await fetch(`${state.baseUrl}/api/public/schedule/e2e-no-such-company/anything/slots`);
    expect(res.status).toBe(404);
  });
});
