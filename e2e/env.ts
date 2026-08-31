// Loads e2e/.env.e2e (gitignored) into process.env. The suite runs against a
// DEPLOYED Workbench (E2E_BASE_URL) with secrets pulled from Railway by hand —
// see e2e/README.md. Values already present in process.env win, so CI or a
// one-off shell override works naturally.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// cwd-relative (not __dirname) so this file works both from Playwright's CJS
// transpile and tsx ESM scripts — every entry point runs from the repo root.
const E2E_DIR = path.resolve(process.cwd(), "e2e");

export function loadE2eEnv(): void {
  // e2e/.env.e2e wins; the repo's .env.local backfills anything missing (the
  // FINIX_* sandbox creds live there already — no need to duplicate them).
  for (const file of [
    path.join(E2E_DIR, ".env.e2e"),
    path.resolve(E2E_DIR, "..", ".env.local"),
  ]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, key, value] = m;
      if (!process.env[key] && value) process.env[key] = value;
    }
  }
}

export interface E2eState {
  baseUrl: string;
  /** Cookie name + minted NextAuth JWTs for each test company's owner. */
  cookieName: string;
  ownerA: { token: string; userId: string; companyId: string };
  ownerB: { token: string; userId: string; companyId: string };
  companyASlug: string;
  /** Card specs only run when the deployed processor is finix in SANDBOX mode
   *  and company A has an APPROVED sandbox merchant. Never against live money. */
  cardTestsEnabled: boolean;
  finix: { applicationId: string; username: string; password: string } | null;
}

export const STATE_FILE = path.join(E2E_DIR, ".state.json");

export function readState(): E2eState {
  return JSON.parse(readFileSync(STATE_FILE, "utf8"));
}

export const COMPANY_A_SLUG = process.env.E2E_COMPANY_A_SLUG ?? "e2e-harness";
export const COMPANY_B_SLUG = process.env.E2E_COMPANY_B_SLUG ?? "e2e-tenant-b";
export const OWNER_A_EMAIL = "e2e-owner@workbenchfsm.com";
export const OWNER_B_EMAIL = "e2e-tenant-b@workbenchfsm.com";
