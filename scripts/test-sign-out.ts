/**
 * Unit tests for lib/sign-out-core.ts — the retry rule under every Sign out
 * button (lib/sign-out.ts).
 *   npx tsx scripts/test-sign-out.ts
 */
import assert from "node:assert/strict";
import { attemptSignOut, SIGN_OUT_RETRY_AFTER_MS } from "../lib/sign-out-core";

const noWait = async () => {};

async function main() {
  {
    // Works first time → no pause, the URL comes straight back.
    const waited: number[] = [];
    let calls = 0;
    const url = await attemptSignOut(
      async () => {
        calls += 1;
        return "/app/login";
      },
      async (ms) => void waited.push(ms)
    );
    assert.equal(url, "/app/login");
    assert.equal(calls, 1);
    assert.deepEqual(waited, []);
  }

  {
    // Safari "Load failed" once, then fine → one pause, one retry, still out.
    const waited: number[] = [];
    let calls = 0;
    const url = await attemptSignOut(
      async () => {
        calls += 1;
        if (calls === 1) throw new TypeError("Load failed");
        return "https://workbenchfsm.com/app/login";
      },
      async (ms) => void waited.push(ms)
    );
    assert.equal(url, "https://workbenchfsm.com/app/login");
    assert.equal(calls, 2);
    assert.deepEqual(waited, [SIGN_OUT_RETRY_AFTER_MS]);
  }

  {
    // Fails twice → null (still signed in), never throws, never a third try.
    let calls = 0;
    const url = await attemptSignOut(async () => {
      calls += 1;
      throw new TypeError("Load failed");
    }, noWait);
    assert.equal(url, null);
    assert.equal(calls, 2);
  }

  {
    // The pause is configurable (and honoured).
    const waited: number[] = [];
    let calls = 0;
    await attemptSignOut(
      async () => {
        calls += 1;
        if (calls === 1) throw new Error("offline");
        return "/";
      },
      async (ms) => void waited.push(ms),
      50
    );
    assert.deepEqual(waited, [50]);
  }

  console.log("test-sign-out: all passed");
}

void main();
