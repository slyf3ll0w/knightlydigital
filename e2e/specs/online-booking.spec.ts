// Online booking v2: booking types, the availability engine over a real
// company, the public slot API, self-serve links, and the captcha gate that
// keeps scripted bookings out (a green "captcha rejected" here is proof the
// public booking POST can't be flooded by bots).
import { test, expect } from "@playwright/test";
import { readState } from "../env";
import { Api, deleteContact, runTag } from "../helpers/api";
import { db, disconnectDb } from "../helpers/db";

const state = readState();

test.describe("online booking (booking types)", () => {
  let api: Api;
  let phoneTypeId: string;
  let phoneTypeSlug: string;
  let serviceTypeId: string;
  let serviceTypeSlug: string;
  let workItemId: string;
  let formId: string;
  let formSlug: string;

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
    const form = await api.post("/api/app/web-forms", { name: `${runTag} Booking`, type: "BOOKING" });
    formId = form.id;
    formSlug = form.slug;
  });

  test.afterAll(async () => {
    await api.raw("PATCH", `/api/app/team/${state.ownerA.userId}`, { bookable: false });
    for (const [label, path] of [
      ["form", `/api/app/web-forms/${formId}`],
      ["phone type", `/api/app/booking-types/${phoneTypeId}`],
      ["service type", `/api/app/booking-types/${serviceTypeId}`],
      ["work item", `/api/app/work-items/${workItemId}`],
    ] as const) {
      if (!path.endsWith("undefined")) {
        const res = await api.raw("DELETE", path);
        if (!res.ok) console.warn(`[e2e] cleanup: delete ${label} → ${res.status}`);
      }
    }
    await disconnectDb();
  });

  test("a new type starts with sane defaults and the bookable owner in its pool", async () => {
    const t = await api.get(`/api/app/booking-types/${phoneTypeId}`);
    expect(t.kind).toBe("PHONE_CALL");
    expect(t.confirmation).toBe("INSTANT");
    expect(t.clientCanReschedule).toBe(true);
    expect(t.members.some((m: { userId: string }) => m.userId === state.ownerA.userId)).toBe(true);
  });

  test("settings preview shows open times for the phone type", async () => {
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
      // Pool/services untouched by the rejected patch
      const t = await api.get(`/api/app/booking-types/${serviceTypeId}`);
      expect(t.paymentMode).toBe("NONE");
    } finally {
      await api.raw("DELETE", `/api/app/work-items/${hourly.id}`);
    }
  });

  test("public slot API: calls list exact times; in-person types need an address first", async () => {
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

  test("public slot API: an address unlocks arrival windows for the service type", async () => {
    const address = encodeURIComponent("123 Main St, Plano, TX 75024");
    const res = await fetch(
      `${state.baseUrl}/api/public/schedule/${state.companyASlug}/${serviceTypeSlug}/slots?services=${workItemId}&address=${address}`
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { exactTime: boolean; outOfArea: boolean; days: { slots: { label: string }[] }[] };
    expect(j.exactTime).toBe(false);
    expect(j.outOfArea).toBe(false);
    const n = j.days.reduce((s, d) => s + d.slots.length, 0);
    expect(n).toBeGreaterThan(0);
    expect(j.days[0].slots[0].label).toContain("–"); // arrival window
  });

  test("inactive types disappear from the public surface", async () => {
    await api.patch(`/api/app/booking-types/${phoneTypeId}`, { isActive: false });
    const res = await fetch(`${state.baseUrl}/api/public/schedule/${state.companyASlug}/${phoneTypeSlug}/slots`);
    expect(res.status).toBe(404);
    await api.patch(`/api/app/booking-types/${phoneTypeId}`, { isActive: true });
  });

  test("classic form offers a booking type inline once pointed at one", async () => {
    await api.patch(`/api/app/web-forms/${formId}`, {
      config: { selfSchedule: { enabled: true, bookingTypeIds: [phoneTypeId] } },
    });
    const page = await fetch(`${state.baseUrl}/book/${state.companyASlug}/${formSlug}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain(`${runTag} Phone call`);
  });

  test("captcha gate rejects scripted public bookings", async () => {
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
    const body = await res.json();
    expect(String(body.error)).toMatch(/captcha/i);
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
