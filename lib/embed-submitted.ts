/**
 * Tells the website around an embedded form that the visitor just sent it,
 * so the site can count the conversion (Google Ads, GA4, Meta…). The
 * /embed.js loader turns this message into a `workbench:submitted` DOM
 * event on the placeholder and a `workbench_form_submitted` dataLayer push.
 *
 * No visitor details ride along — the message goes to whatever page framed
 * us ("*"), so it carries only which kind of form was sent.
 *
 * A hosted (unframed) page has no parent and posts nothing.
 */
export type EmbedFormKind = "booking" | "request" | "estimate";

export function notifyEmbedSubmitted(form: EmbedFormKind) {
  try {
    if (typeof window === "undefined" || window.parent === window) return;
    window.parent.postMessage({ type: "workbench:submitted", form }, "*");
  } catch {
    // A conversion ping must never break the success screen
  }
}
