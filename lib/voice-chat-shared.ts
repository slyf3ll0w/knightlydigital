/**
 * Talking to Atlas — the pure half (no browser, no server), unit-tested in
 * scripts/test-voice-chat.ts. The browser half is lib/voice-chat-client.ts,
 * the speech endpoints are app/api/app/assistant/{speak,transcribe}.
 */

// A bare yes is one or more of these phrases and nothing else (plus a
// "please" / "thanks" tail). Longest first so "sounds good" wins over "sounds".
const YES_PHRASES = [
  "that is right", "that's right", "let's do it", "lets do it", "yes please", "go ahead", "go for it", "sounds good",
  "please do", "send it", "do it", "i confirm", "confirmed", "confirm", "affirmative", "absolutely", "correct",
  "yes", "yeah", "yep", "yup", "sure", "okay", "ok", "perfect", "fine", "great",
];
const YES_TAILS = ["thank you", "thanks", "please"];
const NO = /^(no|nope|nah|cancel|skip|don't|do not|stop that|never ?mind|leave it|not now|negative)\b/i;
const STOP = /^(stop|that's all|that is all|goodbye|bye|done|i'm done|im done|exit|quit|end|thanks,? that's all|thank you,? that's all)\b/i;

/**
 * A spoken "yes" to the card Atlas just read out — and ONLY a yes. "Yes,
 * but change the subject" / "yes, Monday" / "yeah and also…" are
 * instructions that happen to open with a yes: they must reach the model,
 * not confirm the card as it stands (2026-11-02). So the whole utterance
 * has to be made of affirmative phrases ("yeah do it", "sure, go ahead",
 * "yes please"); any other word — a clause after a comma, "but", "and",
 * "except", a day, a name — means it isn't a bare confirmation.
 */
export function isAffirmative(t: string): boolean {
  const words = t
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^a-z' ]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0 || words.length > 8) return false;
  const phrases = words.join(" ");
  let at = 0;
  let core = 0;
  while (at < phrases.length) {
    const rest = phrases.slice(at);
    const hit = [...YES_PHRASES, ...YES_TAILS].find((p) => rest === p || rest.startsWith(`${p} `));
    if (!hit) return false;
    if (YES_PHRASES.includes(hit)) core++;
    at += hit.length + 1;
  }
  return core > 0;
}

/** The least a card needs to be picked for a spoken confirmation. */
export type ConfirmableCard = { id: string; kind: string; endpoint: string; state: string; batch?: unknown };

/**
 * Which cards a spoken "yes" applies to: the ones staged in the LATEST
 * assistant turn that still has a card waiting — not every pending card in
 * the history. Questions asked between the staging and the yes land as
 * messages without cards, so they don't hide the cards; but an older draft
 * the user already moved past ("email Sarah Friday" → "no, Monday" → "yes")
 * is never swept up with the one they just approved.
 */
export function latestPendingTurn<T extends { state: string }>(messages: { proposals?: T[] }[]): { index: number; cards: T[] } {
  for (let i = messages.length - 1; i >= 0; i--) {
    const cards = (messages[i].proposals ?? []).filter((p) => p.state === "pending");
    if (cards.length > 0) return { index: i, cards };
  }
  return { index: -1, cards: [] };
}

/**
 * Two drafts of the same kind aimed at the same record ("email Sarah",
 * "update this job") — the endpoint carries the record's id. Cards that
 * create something new (no id in the endpoint) and batch cards never
 * supersede anything: they could be aimed at anyone.
 */
export function supersedeKey(p: { kind: string; endpoint: string; batch?: unknown }): string | null {
  if (p.batch) return null;
  const path = p.endpoint.split("?")[0];
  const hasRecordId = path.split("/").some((s) => /^[a-z0-9]{20,}$/i.test(s));
  return hasRecordId ? `${p.kind}:${path}` : null;
}

/**
 * The pending cards in `older` (cards already in the chat — never the fresh
 * ones themselves; text-mode ids repeat between turns, so ids can't tell
 * them apart) that a fresh batch of cards replaces.
 */
export function supersededBy<T extends ConfirmableCard>(older: T[], fresh: ConfirmableCard[]): T[] {
  const keys = new Set(fresh.map(supersedeKey).filter((k): k is string => k !== null));
  if (keys.size === 0) return [];
  return older.filter((p) => {
    if (p.state !== "pending") return false;
    const k = supersedeKey(p);
    return k !== null && keys.has(k);
  });
}

/** A spoken "no". */
export function isNegative(t: string): boolean {
  return NO.test(t.trim());
}

/** The user is leaving voice mode. */
export function isStopPhrase(t: string): boolean {
  const s = t.trim();
  return STOP.test(s) && s.split(/\s+/).length <= 5;
}

/**
 * Atlas's written reply → what gets read aloud. Links and app paths can't
 * be spoken, bullets become sentences, markdown marks go, and a long
 * answer is cut with a pointer back to the chat.
 */
export function spokenForm(text: string, max = 900): string {
  let s = text
    .replace(/https?:\/\/\S+/g, "the link in the chat")
    .replace(/(^|\s)\/app\/[^\s)]+/g, "$1the page in the chat")
    .replace(/[*_`#>]+/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s*\n+\s*/g, ". ")
    .replace(/\.\s*\./g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (s.length > max) {
    const cut = s.slice(0, max);
    const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
    s = `${end > max * 0.5 ? cut.slice(0, end + 1) : cut}… The rest is in the chat.`;
  }
  return s;
}

export type SpokenCard = { title: string; guarded: boolean };

/**
 * What Atlas says after staging cards. Ordinary cards can be confirmed by
 * voice; money and permanent ones (guarded) need a finger on the button.
 */
export function cardsSpeech(cards: SpokenCard[]): { text: string; voiceConfirmable: boolean } {
  if (cards.length === 0) return { text: "", voiceConfirmable: false };
  const ordinary = cards.filter((c) => !c.guarded);
  const guarded = cards.filter((c) => c.guarded);
  const parts: string[] = [];
  if (ordinary.length === 1) parts.push(`Ready: ${ordinary[0].title}. Say yes to confirm, or no to leave it.`);
  else if (ordinary.length > 1) parts.push(`I've lined up ${ordinary.length} changes. Say yes to confirm them all, or no to leave them.`);
  if (guarded.length > 0) {
    parts.push(
      guarded.length === 1
        ? `One more, ${guarded[0].title}, moves money or can't be undone, so that one needs a tap in the chat.`
        : `${guarded.length} of them move money or can't be undone, so those need a tap in the chat.`
    );
  }
  return { text: parts.join(" "), voiceConfirmable: ordinary.length > 0 };
}

/** MediaRecorder MIME → the MIME Gemini lists for the same container. */
export function transcribeMime(recorderMime: string): string {
  const base = recorderMime.split(";")[0].trim().toLowerCase();
  if (base === "audio/mp4" || base === "audio/x-m4a") return "audio/m4a";
  if (base === "audio/mpeg") return "audio/mp3";
  if (base === "video/webm") return "audio/webm";
  return base || "audio/webm";
}
