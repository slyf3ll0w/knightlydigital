// E2E money-path suite — runs against a DEPLOYED Workbench (default: prod,
// which runs Finix in sandbox mode). See e2e/README.md for setup + safety.
import { defineConfig } from "@playwright/test";
import { loadE2eEnv } from "./e2e/env";

loadE2eEnv();

export default defineConfig({
  testDir: "./e2e/specs",
  globalSetup: "./e2e/global-setup.ts",
  // One worker, in order: the specs share two live tenant companies and the
  // public /pay route rate-limits per IP — parallelism buys nothing here.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e/report" }]],
  outputDir: "e2e/artifacts",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://workbenchfsm.com",
    // Microsoft Edge (preinstalled + signed): Windows Application Control on
    // David's machine blocks Playwright's downloaded Chromium builds. CI
    // (Linux) uses the Chromium Playwright installs.
    ...(process.env.CI ? {} : { channel: "msedge" }),
    // Traces record every request header, cookie included — and the specs
    // sign in by attaching a minted owner JWT as a cookie. CI uploads the
    // artifacts of a failed run to a PUBLIC repo, so no traces there;
    // screenshots are enough to see what broke. Locally they stay on.
    trace: process.env.CI ? "off" : "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
