// My Profile → Notifications (2026-11-10): the switches API, its defaults,
// and the Bell switch taking an event out of the bell list.
import { test, expect } from "@playwright/test";
import { Api, createContact, deleteContact, runTag } from "../helpers/api";

const api = Api.forOwnerA();

test.describe("notification preferences", () => {
  test.afterAll(async () => {
    // Leave owner A on the defaults for every other spec.
    await api.json("PUT", "/api/app/profile/notifications", { event: "requests", channel: "bell", enabled: true });
  });

  test("defaults, validation, and the bell switch hides new requests", async () => {
    const start = await api.get("/api/app/profile/notifications");
    expect(start.prefs.requests).toEqual({ push: true, bell: true, email: false });
    expect(Object.keys(start.prefs)).toContain("payment_problems");

    await api.json("PUT", "/api/app/profile/notifications", { event: "nope", channel: "push", enabled: false }, 400);
    await api.json("PUT", "/api/app/profile/notifications", { event: "requests", channel: "sms", enabled: false }, 400);
    await api.json("PUT", "/api/app/profile/notifications", { event: "requests", channel: "push", enabled: "no" }, 400);

    const contact = await createContact(api, "notif");
    try {
      const request = await api.post("/api/app/requests", { contactId: contact.id, title: `${runTag} bell check` });
      const href = `/app/requests/${request.id}`;

      const before = await api.get("/api/app/notifications");
      expect(before.items.some((i: { href: string }) => i.href === href)).toBe(true);

      const off = await api.json("PUT", "/api/app/profile/notifications", { event: "requests", channel: "bell", enabled: false });
      expect(off.prefs.requests.bell).toBe(false);
      expect(off.prefs.requests.push).toBe(true);

      const after = await api.get("/api/app/notifications");
      expect(after.items.some((i: { href: string }) => i.href === href)).toBe(false);

      await api.json("PUT", "/api/app/profile/notifications", { event: "requests", channel: "bell", enabled: true });
      const back = await api.get("/api/app/notifications");
      expect(back.items.some((i: { href: string }) => i.href === href)).toBe(true);
    } finally {
      await deleteContact(api, contact.id);
    }
  });
});
