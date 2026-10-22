/**
 * Talking to Atlas — the pure half (no browser, no server), unit-tested in
 * scripts/test-voice-chat.ts. The browser half is lib/voice-chat-client.ts,
 * the speech endpoints are app/api/app/assistant/{speak,transcribe}.
 */

const YES = /^(yes|yeah|yep|yup|sure|ok(ay)?|confirm|do it|go ahead|send it|sounds good|please do|affirmative|correct|that's right|absolutely)\b/i;
const NO = /^(no|nope|nah|cancel|skip|don't|do not|stop that|never ?mind|leave it|not now|negative)\b/i;
const STOP = /^(stop|that's all|that is all|goodbye|bye|done|i'm done|im done|exit|quit|end|thanks,? that's all|thank you,? that's all)\b/i;

/** A spoken "yes" to the card Atlas just read out. */
export function isAffirmative(t: string): boolean {
  return YES.test(t.trim());
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
