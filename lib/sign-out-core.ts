/**
 * The retry rule behind lib/sign-out.ts, kept free of browser and next-auth
 * imports so scripts/test-sign-out.ts can run it under plain node.
 *
 * `run` performs one sign-out request and resolves with where to go next.
 * A thrown error is a request that never got an answer — Safari's
 * "TypeError: Load failed", a radio still waking up, a cut connection. One
 * more try after a short pause covers the phone-just-woke-up case; a second
 * failure means the person is still signed in, and the caller must say so
 * rather than pretend.
 */
export const SIGN_OUT_RETRY_AFTER_MS = 800;

export async function attemptSignOut(
  run: () => Promise<string>,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  retryAfterMs = SIGN_OUT_RETRY_AFTER_MS
): Promise<string | null> {
  try {
    return await run();
  } catch {
    /* fall through to the one retry */
  }
  await wait(retryAfterMs);
  try {
    return await run();
  } catch {
    return null;
  }
}
