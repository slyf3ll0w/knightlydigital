// More than one leads board (lib/pipeline.ts, ticket #p6pp98): a board gets
// its own columns, a lead moves between boards, a lead source can send new
// leads to a board, and deleting a board hands its leads back to the main
// one. Also blocked numbers (lib/blocked-numbers.ts), which share the day.
import { test, expect } from "@playwright/test";
import { Api, deleteContact, runTag } from "../helpers/api";
import { db, disconnectDb } from "../helpers/db";
import { readState } from "../env";

test.describe("leads boards", () => {
  let api: Api;
  let boardId = "";
  const contacts: string[] = [];
  const boardName = `${runTag} board`;
  const source = `${runTag} source`;

  test.beforeAll(() => {
    api = Api.forOwnerA();
  });

  test.afterAll(async () => {
    for (const id of contacts) await deleteContact(api, id);
    if (boardId) await api.raw("DELETE", `/api/app/pipeline/boards/${boardId}`);
    await disconnectDb();
  });

  test("a new board has its own columns and takes leads by move and by source", async () => {
    const companyId = readState().ownerA.companyId;
    const created = await api.post("/api/app/pipeline/boards", { name: boardName });
    boardId = created.board.id;
    await api.json("POST", "/api/app/pipeline/boards", { name: boardName }, 400); // same name again

    const own = await db().pipelineStage.findMany({ where: { companyId, boardId }, orderBy: { sortOrder: "asc" } });
    expect(own.length).toBeGreaterThan(1);
    const mainFirst = await db().pipelineStage.findFirstOrThrow({ where: { companyId, boardId: null, isConverted: false }, orderBy: { sortOrder: "asc" } });

    // One board's stages: its own columns, then the shared Converted section
    const listed = (await api.get(`/api/app/pipeline/stages?board=${boardId}`)) as { id: string; isConverted: boolean }[];
    expect(listed.filter((s) => !s.isConverted).map((s) => s.id)).toEqual(own.map((s) => s.id));
    expect(listed.filter((s) => s.isConverted)).toHaveLength(1);

    // The same stage name is fine on another board, refused twice on one
    await api.post("/api/app/pipeline/stages", { name: `${runTag} col`, boardId });
    await api.json("POST", "/api/app/pipeline/stages", { name: `${runTag} col`, boardId }, 400);

    // A plain new lead lands on the main board; moving it puts it on the new one
    const lead = await api.post("/api/app/contacts", { firstName: runTag, lastName: "Board-Lead", status: "LEAD" });
    contacts.push(lead.id);
    expect((await db().contact.findUniqueOrThrow({ where: { id: lead.id } })).pipelineStageId).toBe(mainFirst.id);
    await api.patch(`/api/app/contacts/${lead.id}/stage`, { stageId: own[0].id });
    expect((await db().contact.findUniqueOrThrow({ where: { id: lead.id } })).pipelineStageId).toBe(own[0].id);

    // A lead source sent to this board: the next new lead with it lands here
    await api.patch(`/api/app/pipeline/boards/${boardId}`, { sources: [source] });
    const routed = await api.post("/api/app/contacts", { firstName: runTag, lastName: "Routed-Lead", status: "LEAD", leadSource: source });
    contacts.push(routed.id);
    expect((await db().contact.findUniqueOrThrow({ where: { id: routed.id } })).pipelineStageId).toBe(own[0].id);

    // The Leads page shows a tab per board and the board's own cards
    const boards = (await api.get("/api/app/pipeline/boards")) as { boards: { id: string | null; name: string; open: number }[] };
    expect(boards.boards[0].id).toBeNull();
    expect(boards.boards.find((b) => b.id === boardId)?.open).toBeGreaterThanOrEqual(2);

    // Deleting the board hands its leads to the main board's first column
    const gone = await api.delete(`/api/app/pipeline/boards/${boardId}`);
    expect(gone.moved).toBeGreaterThanOrEqual(2);
    expect((await db().contact.findUniqueOrThrow({ where: { id: lead.id } })).pipelineStageId).toBe(mainFirst.id);
    expect(await db().pipelineStage.count({ where: { companyId, boardId } })).toBe(0);
    boardId = "";
  });

  test("the Leads page draws the board tabs", async ({ page, context }) => {
    const state = readState();
    const made = await api.post("/api/app/pipeline/boards", { name: `${boardName} 2` });
    boardId = made.board.id;
    await context.addCookies([{ name: state.cookieName, value: state.ownerA.token, url: state.baseUrl, secure: state.baseUrl.startsWith("https"), httpOnly: true }]);
    await page.goto(`${state.baseUrl}/app/leads?board=${boardId}`);
    const tabs = page.locator("[data-lead-boards]");
    await expect(tabs).toBeVisible({ timeout: 20_000 });
    await expect(tabs.getByRole("link", { name: /Main board/ })).toBeVisible();
    await expect(tabs.locator('a[aria-current="page"]')).toContainText(`${boardName} 2`);
    await api.delete(`/api/app/pipeline/boards/${boardId}`);
    boardId = "";
  });
});

test.describe("blocked numbers", () => {
  test("block, list, unblock", async () => {
    const api = Api.forOwnerA();
    const phone = "(214) 555-0142";
    await api.raw("DELETE", `/api/app/blocked-numbers?phone=${encodeURIComponent(phone)}`);
    await api.json("POST", "/api/app/blocked-numbers", { phone: "12" }, 400);
    const made = await api.post("/api/app/blocked-numbers", { phone, label: runTag });
    expect(made.blocked.digits).toBe("2145550142");
    const listed = (await api.get(`/api/app/blocked-numbers?phone=2145550142`)) as { isBlocked: boolean; blocked: { digits: string }[] };
    expect(listed.isBlocked).toBe(true);
    await api.post("/api/app/blocked-numbers", { phone }); // again: still one row
    expect((await api.get("/api/app/blocked-numbers")).blocked.filter((b: { digits: string }) => b.digits === "2145550142")).toHaveLength(1);
    const gone = await api.delete(`/api/app/blocked-numbers?phone=${encodeURIComponent(phone)}`);
    expect(gone.wasBlocked).toBe(true);
    expect((await api.get(`/api/app/blocked-numbers?phone=${encodeURIComponent(phone)}`)).isBlocked).toBe(false);
  });
});
