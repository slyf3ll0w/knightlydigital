/**
 * The assistant's name on the marketing site, in one place (David
 * 2026-11-19: "make it so we can easily change the name in the future").
 * New site pieces read it from here instead of typing "Atlas". The app,
 * the Help Center and older marketing pages still say Atlas directly: a
 * rename means searching those too (grep -ri "atlas" app/(wbsite)
 * components/wb lib/help lib/assistant).
 */
export const ASSISTANT_NAME = "Atlas";
