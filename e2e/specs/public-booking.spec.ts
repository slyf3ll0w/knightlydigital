// Public intake surface: the self-scheduling slot engine offers real times
// once a booking form is configured, and the captcha gate keeps scripted
// submissions out (this suite included — a green "captcha rejected" here is
// proof the public form can't be flooded by bots).
import { test, expect } from "@playwright/test";
import { readState } from "../env";
import { Api, deleteContact, runTag } from "../helpers/api";
import { db, disconnectDb } from "../helpers/db";

const state = readState();

test.describe("public booking surface", () => {
  let api: Api;
  let workItemId: string;
  let formId: string;
  let formSlug: string;

  test.beforeAll(async () => {
    api = Api.forOwnerA(state);
    workItemId = (
      await api.post("/api/app/work-items", {
        name: `${runTag} Bookable Service`,
        type: "SERVICE",
        unitPrice: 99,
        durationMinutes: 60,
      })
    ).id;
    const form = await api.post("/api/app/web-forms", {
      name: `${runTag} Booking`,
      type: "BOOKING",
    });
    formId = form.id;
    formSlug = form.slug;
  });

  test.afterAll(async () => {
    // Undo the harness company's public-booking config so nothing stays
    // bookable between runs.
    await api.raw("PATCH", `/api/app/team/${state.ownerA.userId}`, { bookable: false });
    if (formId) {
      const res = await api.raw("DELETE", `/api/app/web-forms/${formId}`);
      if (!res.ok) console.warn(`[e2e] cleanup: delete web form → ${res.status}`);
    }
    if (workItemId) {
      const res = await api.raw("DELETE", `/api/app/work-items/${workItemId}`);
      if (!res.ok) console.warn(`[e2e] cleanup: delete work item → ${res.status}`);
    }
    await disconnectDb();
  });

  test("slot lookup is closed until self-scheduling is enabled", async () => {
    const res = await fetch(
      `${state.baseUrl}/api/public/booking-slots/${state.companyASlug}?form=${formSlug}&service=svc-e2e`
    );
    expect(res.status).toBe(404);
  });

  test("configured form offers real slots", async () => {
    // Turn the form into a self-scheduling one: enabled + one bookable
    // service tied to the price-book item (its durationMinutes drives the
    // slot length), and make the owner bookable.
    await api.patch(`/api/app/web-forms/${formId}`, {
      config: {
        selfSchedule: { enabled: true, leadHours: 0, horizonDays: 14 },
        services: [
          { id: "svc-e2e", name: `${runTag} Bookable Service`, price: 99, workItemId },
        ],
      },
    });
    await api.patch(`/api/app/team/${state.ownerA.userId}`, { bookable: true });

    const res = await fetch(
      `${state.baseUrl}/api/public/booking-slots/${state.companyASlug}?form=${formSlug}&service=svc-e2e`
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      zipRequired: boolean;
      outOfArea: boolean;
      days: { date: string; label: string; slots: unknown[] }[];
    };
    expect(json.outOfArea).toBe(false);
    expect(Array.isArray(json.days)).toBe(true);
    // 14 days of default business hours with one bookable, unbooked person
    // must offer at least one time.
    const slotCount = json.days.reduce((n, d) => n + d.slots.length, 0);
    expect(slotCount).toBeGreaterThan(0);
  });

  test("captcha gate rejects scripted public submissions", async () => {
    const phone = `555${Date.now().toString().slice(-7)}`;
    const res = await fetch(`${state.baseUrl}/api/public/book/${state.companyASlug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        captchaToken: "e2e-bogus-token",
        formSlug,
        firstName: runTag,
        lastName: "CaptchaProbe",
        phone,
        elapsedMs: 60_000,
      }),
    });

    if (res.status !== 400) {
      // The gate is open — clean up whatever landed before failing loudly.
      const created = await db().contact.findFirst({
        where: { companyId: state.ownerA.companyId, phone },
      });
      if (created) await deleteContact(api, created.id);
      throw new Error(
        `Public booking accepted a bogus captcha token (status ${res.status}) — ` +
          "TURNSTILE_SECRET_KEY / NEXT_PUBLIC_TURNSTILE_SITE_KEY are not both set on this deployment."
      );
    }
    const body = await res.json();
    expect(String(body.error)).toMatch(/captcha/i);
  });

  test("unknown company slug 404s", async () => {
    const res = await fetch(`${state.baseUrl}/api/public/booking-slots/e2e-no-such-company`);
    expect(res.status).toBe(404);
  });
});
