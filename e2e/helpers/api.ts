// Thin fetch wrapper the API-level specs drive the deployed app with. Auth is
// the minted NextAuth session cookie from global-setup — exactly what a
// signed-in browser sends.
import { expect } from "@playwright/test";
import { readState, type E2eState } from "../env";

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

  async raw(method: string, path: string, body?: unknown): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Cookie: this.cookie,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
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
