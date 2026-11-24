/**
 * Empty and caught-up lines that vary (David 2026-11-24, "less repetitive",
 * idea 4). Where the app used to say the same sentence every time — "You're
 * all caught up", "Try a different status or search" — it deals one of a few
 * short, plain variants per visit. Each one still points at the next step.
 * No server imports: safe from server pages (dealt per request) and from
 * client components that only render after a tap (no hydration to mismatch).
 */

const LINES = {
  /** Home → Needs you has nothing waiting */
  "caught-up": [
    "You're all caught up.",
    "Nothing's waiting on you right now.",
    "All clear. New requests and replies will land here.",
    "Caught up. A good moment to follow up on an open quote.",
    "Nothing needs you this minute.",
  ],
  /** the notifications sheet with nothing new */
  "no-notifications": [
    "You're all caught up",
    "Nothing new since you last looked",
    "All quiet for now",
  ],
  /** a list filtered down to nothing — {thing} plural, {one} singular */
  "no-match": [
    "Try a different status or search, or create a new {one}.",
    "Nothing under this filter. Clear it to see every {thing}.",
    "No {thing} fit this search. Try a name, a number or a street.",
  ],
  /** the Requests inbox with nothing picked */
  "inbox-pick": [
    "Pick a request to read it here.",
    "Choose a request on the left to open it here.",
    "Select a request to see the message and what to do next.",
  ],
} as const;

export type EmptyLineKey = keyof typeof LINES;

/** One variant, at random, with {placeholders} filled in. */
export function dealLine(key: EmptyLineKey, vars: Record<string, string> = {}): string {
  const set = LINES[key];
  const line: string = set[Math.floor(Math.random() * set.length)];
  return line.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
}
