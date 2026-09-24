"use client";

import { getCapacitor, nativePlatform } from "@/components/NativeShell";

/**
 * The iPhone app's calling engine (ios/App/App/VoipPlugin.swift: PushKit +
 * CallKit + the Telnyx iOS SDK), reached through window.Capacitor.Plugins
 * like every shell integration — nothing here imports @capacitor/*, so the
 * web bundle is untouched and a shell built before the plugin existed simply
 * has no bridge.
 *
 * On iOS the page never touches WebRTC: iOS freezes a background WKWebView,
 * so a call answered from the lock screen can only be taken by native code.
 * components/SoftphoneNativeEngine.ts mirrors the engine's state on the call
 * card and forwards taps here. Every tap goes through CallKit on the native
 * side, so the system call screen and the card always agree.
 *
 * Events (retained until the page attaches a listener; a cold start for a
 * call has the system screen up seconds before this code runs):
 *   voipToken      the PushKit token (and again whenever iOS rotates it)
 *   engineState    { ready, error? } — registered with Telnyx, or why not
 *   incomingCall   a call is ringing on the system screen
 *   callAnswered   Answer tapped (there, or here via answer())
 *   callActive     audio is up (inbound: the SIP leg answered; outbound:
 *                  the page reported the customer on via reportConnected)
 *   callEnded      { reason } — over, whoever ended it
 *   muteChanged / holdChanged
 */

export type VoipIncoming = { callId: string; label: string; number: string | null };
export type VoipCallSnapshot = VoipIncoming & { direction: "in" | "out"; answered: boolean; connected: boolean; muted: boolean; held: boolean };

type Listener<T> = (data: T) => void;

type Handle = { remove: () => void | Promise<void> };

export type VoipPlugin = {
  /** The page is up with calls on: PushKit token, engine registered (a fresh token each socket). */
  register(): Promise<{ token?: string | null }>;
  /** iOS's one-time microphone prompt, now rather than on the first Answer. */
  requestMic(): Promise<{ granted: boolean }>;
  answer(o: { callId: string }): Promise<void>;
  /** Decline (ringing → voicemail) or hang up (live); the engine tells the server first. */
  endCall(o: { callId: string; reason?: string }): Promise<void>;
  setMuted(o: { callId: string; muted: boolean }): Promise<void>;
  setHeld(o: { callId: string; held: boolean }): Promise<void>;
  sendDigits(o: { callId: string; digits: string }): Promise<void>;
  /** After POST /api/app/line/call (via app): the engine takes the SIP leg the server dials next. */
  placeCall(o: VoipIncoming): Promise<void>;
  /** Outbound: the row says the customer is on. */
  reportConnected(o: { callId: string }): Promise<void>;
  /** What the engine holds right now — a page that just (re)loaded catches up from this. */
  currentCalls(): Promise<{ calls: VoipCallSnapshot[]; ready: boolean; speaker?: boolean }>;
  /** Speakerphone on or off. */
  setSpeaker(o: { on: boolean }): Promise<{ on: boolean }>;
  addListener(event: string, cb: (data: unknown) => void): Promise<Handle> | Handle;
};

export function nativeVoip(): VoipPlugin | null {
  if (nativePlatform() !== "ios") return null;
  const p = getCapacitor()?.Plugins?.WorkBenchVoip as VoipPlugin | undefined;
  // `answer` arrived with the native engine (1.3 build 8); an older shell's
  // bridge only forwarded PushKit and is of no use to the page.
  return typeof p?.register === "function" && typeof p?.answer === "function" ? p : null;
}

/** Subscribe and get back an unsubscribe; tolerant of both plugin handle shapes. */
export function onVoip<T>(p: VoipPlugin, event: string, cb: Listener<T>): () => void {
  let handle: Handle | null = null;
  let removed = false;
  void Promise.resolve(p.addListener(event, (d) => cb(d as T))).then((h) => {
    if (removed) void h.remove();
    else handle = h;
  });
  return () => {
    removed = true;
    void handle?.remove();
  };
}

const TOKEN_KEY = "wb-voip-token";

export function rememberVoipToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export function rememberedVoipToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * A pushed call that outlives a page reload: the app was rung for a company
 * it is not signed into, so the page switches companies (a hard navigation)
 * for its own UI while the native engine keeps the call. Short-lived on
 * purpose — a stale entry must never resurrect a call that is long over.
 */
export type PendingVoipCall = { callId: string; label: string; number: string | null; answered: boolean; at: number };

const PENDING_KEY = "wb-voip-pending";
const PENDING_TTL_MS = 40_000;

export function stashPendingVoipCall(p: PendingVoipCall): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(p));
  } catch {}
}

export function takePendingVoipCall(): PendingVoipCall | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    localStorage.removeItem(PENDING_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PendingVoipCall;
    if (!p?.callId || typeof p.at !== "number" || Date.now() - p.at > PENDING_TTL_MS) return null;
    return p;
  } catch {
    return null;
  }
}
