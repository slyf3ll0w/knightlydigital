"use client";

import { getCapacitor, nativePlatform } from "@/components/NativeShell";

/**
 * The phone app's calling engine — ios/App/App/VoipPlugin.swift (PushKit +
 * CallKit + the Telnyx iOS SDK) or android/.../VoipPlugin.kt (an FCM data
 * push + a foreground call service + the Telnyx Android SDK) — reached
 * through window.Capacitor.Plugins like every shell integration: nothing
 * here imports @capacitor/*, so the web bundle is untouched and a shell
 * built before the plugin existed simply has no bridge.
 *
 * In the apps the page never touches WebRTC: iOS freezes a background
 * WKWebView and Android kills a backgrounded one, so a call answered from
 * the lock screen can only be taken by native code.
 * components/SoftphoneNativeEngine.ts mirrors the engine's state on the call
 * card and forwards taps here. Every tap goes through the system call
 * screen on the native side, so it and the card always agree.
 *
 * Events (retained until the page attaches a listener; a cold start for a
 * call has the system screen up seconds before this code runs):
 *   voipToken      the PushKit token on iOS, the FCM token on Android (and
 *                  again whenever the OS rotates it)
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

export type VoipDevice = "ios" | "android";

export function nativeVoip(): VoipPlugin | null {
  if (!nativePlatform()) return null;
  const p = getCapacitor()?.Plugins?.WorkBenchVoip as VoipPlugin | undefined;
  // `answer` arrived with the native engine (1.3 build 8); an older shell's
  // bridge only forwarded PushKit and is of no use to the page.
  return typeof p?.register === "function" && typeof p?.answer === "function" ? p : null;
}

/** Which phone the engine runs on — its credential, its push platform. */
export function voipDevice(): VoipDevice {
  return nativePlatform() === "android" ? "android" : "ios";
}

/** The PushSubscription platform the engine's token registers under (lib/voip.ts VOIP_PLATFORMS). */
export function voipPushPlatform(device: VoipDevice = voipDevice()): "ios-voip" | "android-voip" {
  return device === "android" ? "android-voip" : "ios-voip";
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
const TOKEN_PLATFORM_KEY = "wb-voip-platform";

export function rememberVoipToken(token: string | null, platform: "ios-voip" | "android-voip" = voipPushPlatform()): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(TOKEN_PLATFORM_KEY, platform);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_PLATFORM_KEY);
    }
  } catch {}
}

export function rememberedVoipToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** The platform the remembered token was registered under (an older iPhone build stored no platform). */
export function rememberedVoipPlatform(): "ios-voip" | "android-voip" {
  try {
    return localStorage.getItem(TOKEN_PLATFORM_KEY) === "android-voip" ? "android-voip" : "ios-voip";
  } catch {
    return "ios-voip";
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
