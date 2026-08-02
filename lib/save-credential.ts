/**
 * Hand the browser the credential we just authenticated with.
 *
 * Every sign-in path here is an XHR — next-auth `signIn(..., { redirect: false })`
 * or a POST to our own route — followed by a programmatic navigation, so the
 * browser never witnesses a real form submission. Chrome and Edge fall back to
 * guessing one happened, and the guess is defeated by ordinary things: the
 * show/hide eye flipping the field to type="text" before submit, a re-render
 * that swaps the form out, a reset flow that never navigates at all. A missed
 * guess means no "Save password?" prompt ever appears, which is exactly the
 * symptom reported after the move to workbenchfsm.com — correct form metadata
 * is necessary for this to work, but on its own it isn't sufficient.
 *
 * The Credential Management API asks outright instead of relying on that
 * heuristic. Safari and Firefox don't implement store(); they keep their own
 * heuristic, which the full-page navigation after sign-in already satisfies.
 */
export async function saveCredential(email: string, password: string) {
  try {
    const w = window as unknown as {
      PasswordCredential?: new (data: { id: string; password: string; name?: string }) => Credential;
    };
    if (!w.PasswordCredential || !navigator.credentials?.store) return;
    const cred = new w.PasswordCredential({ id: email, password, name: email });
    // Chrome resolves as soon as the save bubble is raised, but a browser that
    // blocked on the user's answer would hang the sign-in behind it. Losing the
    // prompt is a far smaller failure than a login that appears to freeze.
    await Promise.race([
      navigator.credentials.store(cred),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch {
    // Declined, unsupported, or blocked by policy — never block the sign-in
  }
}
