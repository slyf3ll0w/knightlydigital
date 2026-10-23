/**
 * Atlas's voice, as the person talking to it prefers (David 2026-10-23:
 * "a way to change the voice to a male British voice"). Gemini's prebuilt
 * voices carry a character, not an accent — the accent comes from the
 * session's language code — so a pick is voice + accent. Stored per
 * browser (it's the listener's taste, not the company's), sent with each
 * live-session token and each spoken reply; the server validates against
 * these lists. ATLAS_VOICE stays the company-wide default.
 */

export type VoiceGender = "male" | "female";

export const ATLAS_VOICES: { id: string; label: string; gender: VoiceGender; blurb: string }[] = [
  { id: "Achird", label: "Achird", gender: "male", blurb: "Friendly, easy — the default" },
  { id: "Charon", label: "Charon", gender: "male", blurb: "Calm and informative" },
  { id: "Iapetus", label: "Iapetus", gender: "male", blurb: "Clear and direct" },
  { id: "Algieba", label: "Algieba", gender: "male", blurb: "Smooth, unhurried" },
  { id: "Orus", label: "Orus", gender: "male", blurb: "Firm, no-nonsense" },
  { id: "Puck", label: "Puck", gender: "male", blurb: "Upbeat" },
  { id: "Sulafat", label: "Sulafat", gender: "female", blurb: "Warm" },
  { id: "Kore", label: "Kore", gender: "female", blurb: "Firm, crisp" },
  { id: "Aoede", label: "Aoede", gender: "female", blurb: "Breezy" },
  { id: "Leda", label: "Leda", gender: "female", blurb: "Youthful, bright" },
  { id: "Zephyr", label: "Zephyr", gender: "female", blurb: "Bright, quick" },
];

export const ATLAS_ACCENTS: { code: string; label: string }[] = [
  { code: "en-US", label: "American" },
  { code: "en-GB", label: "British" },
  { code: "en-AU", label: "Australian" },
  { code: "en-IN", label: "Indian" },
];

export type VoicePick = { voice: string; accent: string };

export const DEFAULT_ACCENT = "en-US";

export function isVoiceId(v: unknown): v is string {
  return typeof v === "string" && ATLAS_VOICES.some((x) => x.id === v);
}

export function isAccentCode(v: unknown): v is string {
  return typeof v === "string" && ATLAS_ACCENTS.some((x) => x.code === v);
}

const KEY = "wb-atlas-voice-pick";

/** The listener's pick, or null for the company default. Browser only. */
export function getVoicePick(): VoicePick | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<VoicePick>;
    return { voice: isVoiceId(p.voice) ? p.voice : "", accent: isAccentCode(p.accent) ? p.accent : DEFAULT_ACCENT };
  } catch {
    return null;
  }
}

export function setVoicePick(p: VoicePick | null): void {
  try {
    if (p) localStorage.setItem(KEY, JSON.stringify(p));
    else localStorage.removeItem(KEY);
  } catch {
    /* fine */
  }
}

/** A spoken-word description of a pick, for the picker's header. */
export function describePick(p: VoicePick | null, fallbackVoice: string): string {
  const voice = ATLAS_VOICES.find((v) => v.id === (p?.voice || fallbackVoice));
  const accent = ATLAS_ACCENTS.find((a) => a.code === (p?.accent || DEFAULT_ACCENT));
  return `${voice?.label ?? p?.voice ?? fallbackVoice} · ${accent?.label ?? "American"}`;
}
