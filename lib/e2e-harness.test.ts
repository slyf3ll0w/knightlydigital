import { describe, expect, it } from "vitest";
import { isE2eHarnessEmail } from "./e2e-harness";

describe("isE2eHarnessEmail", () => {
  it("matches the harness owners", () => {
    expect(isE2eHarnessEmail("e2e-owner@workbenchfsm.com")).toBe(true);
    expect(isE2eHarnessEmail(" E2E-Owner-B@WorkBenchFSM.com ")).toBe(true);
  });
  it("leaves real people alone", () => {
    expect(isE2eHarnessEmail("owner@workbenchfsm.com")).toBe(false);
    expect(isE2eHarnessEmail("e2e-owner@gmail.com")).toBe(false);
    expect(isE2eHarnessEmail("")).toBe(false);
    expect(isE2eHarnessEmail(null)).toBe(false);
  });
});
