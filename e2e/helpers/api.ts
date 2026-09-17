// Thin fetch wrapper the API-level specs drive the deployed app with. Auth is
// the minted NextAuth session cookie from global-setup — exactly what a
// signed-in browser sends.
import { expect } from "@playwright/test";
import { readState, type E2eState } from "../env";

/** Statuses Railway's edge returns when the container is briefly unreachable. */
const EDGE_STATUSES = new Set([502, 503, 504]);

export class Api {
  constructor(
    private baseUrl: string,
    private cookie: string
  ) {}

  static forOwnerA(state = readState()): Api {
    return new Api(state.baseUrl, `${state.cookieName}=${state.ownerA.token}`);
  }
  static forOwnerB(state = readState()): Api {
    return new Api(state.baseUrl, `${state.cookieName}=${state.ownerB.token}`);
  }

  /** One request, retried through Railway edge blips. A 502/503/504 (or a
   *  dropped socket) from the edge means the app never saw the request —
   *  run 35228403507 failed a whole spec file on a single 502 — so every
   *  verb is retried, POSTs included: the data is throwaway and runTag-
   *  scoped, and a duplicate is far cheaper than a red gate. Real app
   *  errors (4xx, 500) surface on the first try as before. */
  async raw(method: string, path: string, body?: unknown): Promise<Response> {
    const attempts = 4;
    for (let i = 1; ; i++) {
      let res: Response | undefined;
      let err: unknown;
      try {
        res = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: {
            Cookie: this.cookie,
            ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
      } catch (e) {
        err = e;
      }
      const edgeBlip = res ? EDGE_STATUSES.has(res.status) : true;
      if (!edgeBlip) return res!;
      if (i >= attempts) {
        if (res) return res;
        throw err;
      }
      const why = res ? `${res.status}` : `${(err as Error)?.message ?? err}`;
      console.warn(`[e2e] ${method} ${path} → ${why}, retry ${i}/${attempts - 1}`);
      await new Promise((r) => setTimeout(r, 1000 * 2 ** (i - 1)));
    }
  }

  /** Request + status assertion + parsed JSON in one step. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async json<T = any>(method: string, path: string, body?: unknown, expectStatus = 200): Promise<T> {
    const res = await this.raw(method, path, body);
    const text = await res.text();
    expect(
      res.status,
      `${method} ${path} → ${res.status}: ${text.slice(0, 400)}`
    ).toBe(expectStatus);
    return text ? JSON.parse(text) : (undefined as T);
  }

  get<T = any>(path: string, expectStatus = 200) {
    return this.json<T>("GET", path, undefined, expectStatus);
  }
  post<T = any>(path: string, body?: unknown, expectStatus = 201) {
    return this.json<T>("POST", path, body, expectStatus);
  }
  patch<T = any>(path: string, body?: unknown, expectStatus = 200) {
    return this.json<T>("PATCH", path, body, expectStatus);
  }
  delete<T = any>(path: string, expectStatus = 200) {
    return this.json<T>("DELETE", path, undefined, expectStatus);
  }
}

/** Unique per-run marker so parallel/aborted runs never collide and cleanup is targeted. */
export const runTag = `E2E-${Date.now().toString(36)}`;

/** Create a throwaway contact in the calling company. Email deliberately null:
 *  processor receipts/dunning short-circuit without one, so the suite never
 *  sends real email. */
export async function createContact(api: Api, suffix: string) {
  return api.post("/api/app/contacts", {
    firstName: runTag,
    lastName: suffix,
    status: "ACTIVE",
  });
}

/** Force-delete a contact and everything hanging off it (jobs, invoices,
 *  payments, subscriptions…) — the suite's standard cleanup. */
export async function deleteContact(api: Api, contactId: string) {
  const res = await api.raw("DELETE", `/api/app/contacts/${contactId}?force=1`);
  if (!res.ok) {
    console.warn(`[e2e] cleanup: force-delete contact ${contactId} → ${res.status}`);
  }
}

export type { E2eState };
