import { test, expect } from "@playwright/test";
import { readState } from "../env";
import { Api, deleteContact, runTag } from "../helpers/api";
import { db, disconnectDb } from "../helpers/db";

// Follow-ups (lib/follow-ups.ts): a quote that has sat for ten days with
// both automatic reminders behind it is offered, gets a draft that passes
// the checks, can be put off and brought back, and is invisible to another
// company. The rules themselves are scored in scripts/test-follow-ups.ts;
// this is the wiring: records → list → draft → skip.

const state = readState();
const DAY = 86_400_000;

type Item = { kind: string; id: string; trigger: string; channels: string[]; why: string[]; clientName: string };
type List = { items: Item[]; waiting: unknown[]; heldBack: { reason: string; count: number }[] };

test.describe("follow-ups", () => {
  let api: Api;
  let contactId: string;
  let quoteId: string;

  test.beforeAll(async () => {
    api = Api.forOwnerA(state);
    const contact = await api.post("/api/app/contacts", {
      firstName: "Followup",
      lastName: runTag,
      email: `followups-${runTag.toLowerCase()}@example.com`,
      status: "ACTIVE",
    });
    contactId = contact.id;
    const quote = await api.post("/api/app/quotes", {
      contactId,
      title: "Cedar fence",
      lineItems: [{ description: "Fence", quantity: 1, unitPrice: 4200 }],
    });
    quoteId = quote.id;
    await api.patch(`/api/app/quotes/${quoteId}`, { status: "AWAITING_RESPONSE" });
    // The app cannot send a quote into the past: age it here, and record both
    // automatic reminders as already sent so the reminder sweep leaves it alone.
    await db().quote.update({ where: { id: quoteId }, data: { sentAt: new Date(Date.now() - 10 * DAY), createdAt: new Date(Date.now() - 11 * DAY) } });
    await db().quoteReminder.createMany({
      data: [
        { quoteId, type: "followup_3", sentAt: new Date(Date.now() - 7 * DAY) },
        { quoteId, type: "followup_7", sentAt: new Date(Date.now() - 4 * DAY) },
      ],
      skipDuplicates: true,
    });
  });

  test.afterAll(async () => {
    if (contactId) await deleteContact(api, contactId);
    await disconnectDb();
  });

  const mine = (list: List) => list.items.find((i) => i.kind === "quote" && i.id === quoteId);

  test("a quiet ten-day-old quote is offered, with the facts behind it", async () => {
    const list = await api.get<List>("/api/app/follow-ups");
    const item = mine(list);
    expect(item, "the aged quote is on today's list").toBeTruthy();
    expect(item!.trigger).toBe("ripe");
    expect(item!.channels).toEqual(["email"]);
    expect(item!.why.join(" ")).toMatch(/Sent 10 days ago/);
    expect(item!.why.join(" ")).toMatch(/2 automatic reminders sent/);
    expect(Array.isArray(list.waiting)).toBe(true);
    expect(Array.isArray(list.heldBack)).toBe(true);
  });

  test("the standard draft names the client and carries the quote link, and nothing is sent", async () => {
    const draft = await api.json("POST", "/api/app/follow-ups/draft", { kind: "quote", id: quoteId, standard: true }, 200);
    expect(draft.source).toBe("standard");
    expect(draft.channel).toBe("email");
    expect(draft.subject).toBeTruthy();
    expect(draft.body).toContain("Hi Followup");
    expect(draft.body).not.toMatch(/https?:/);
    expect(draft.link.url).toMatch(/\/quote\//);
    expect(draft.send.endpoint).toBe(`/api/app/contacts/${contactId}/message`);
    // A draft is only a draft: no email row was written for this client
    expect(await db().clientMessage.count({ where: { contactId } })).toBe(0);
    // Something that is not on the list gets no draft
    await api.json("POST", "/api/app/follow-ups/draft", { kind: "quote", id: "not-a-quote" }, 409);
  });

  test("not now hides it, undo brings it back", async () => {
    await api.json("POST", "/api/app/follow-ups/skip", { kind: "quote", id: quoteId, mode: "later" }, 200);
    const hidden = await api.get<List>("/api/app/follow-ups");
    expect(mine(hidden)).toBeFalsy();
    expect(hidden.heldBack.some((h) => h.reason === "snoozed" && h.count >= 1)).toBe(true);
    await api.json("POST", "/api/app/follow-ups/skip", { kind: "quote", id: quoteId, mode: "undo" }, 200);
    expect(mine(await api.get<List>("/api/app/follow-ups"))).toBeTruthy();
    await api.json("POST", "/api/app/follow-ups/skip", { kind: "quote", id: quoteId, mode: "sideways" }, 400);
  });

  test("tenant B sees none of it and cannot touch it", async () => {
    const b = Api.forOwnerB(state);
    const list = await b.get<List>("/api/app/follow-ups");
    expect(list.items.some((i) => i.id === quoteId)).toBe(false);
    await b.json("POST", "/api/app/follow-ups/skip", { kind: "quote", id: quoteId, mode: "never" }, 404);
    await b.json("POST", "/api/app/follow-ups/draft", { kind: "quote", id: quoteId, standard: true }, 409);
    // ...and A's quote is still on A's list
    expect(mine(await api.get<List>("/api/app/follow-ups"))).toBeTruthy();
  });
});
