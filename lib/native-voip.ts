"use client";

import { getCapacitor, nativePlatform } from "@/components/NativeShell";

/**
 * The iPhone app's CallKit/PushKit bridge (ios/App/App/VoipPlugin.swift),
 * reached through window.Capacitor.Plugins like every shell integration —
 * nothing here imports @capacitor/*, so the web bundle is untouched and a
 * shell built before the plugin existed simply has no bridge.
 *
 * What it does for components/Softphone.tsx:
 *   - `register()`      ask PushKit for a VoIP token; `voipToken` fires
 *                       with it (and again whenever iOS rotates it)
 *   - `incomingCall`    a VoIP push landed and CallKit is already showing
 *                       the call — the app was possibly just launched for it
 *   - `callAnswered`    the person tapped Answer on the system screen
 *   - `callEnded`       they tapped Decline / End there
 *   - `reportIncoming`  the SIP INVITE arrived first (app in the
 *                       foreground): show the system call screen for it
 *   - `reportConnected` / `endCall` / `startOutgoing` keep CallKit's idea
 *                       of the call in step with ours
 *
 * Events the plugin fires before the page attached its listener are
 * retained and replayed (a cold start for a call has the system screen up
 * seconds before this code runs).
 */

export type VoipIncoming = { callId: string; label: string; number: string | null };

type Listener<T> = (data: T) => void;

type Handle = { remove: () => void | Promise<void> };

type VoipPlugin = {
  register(): Promise<{ token?: string | null }>;
  reportIncoming(o: VoipIncoming): Promise<void>;
  reportConnected(o: { callId: string }): Promise<void>;
  endCall(o: { callId: string; reason: "remoteEnded" | "unanswered" | "failed" | "answeredElsewhere" | "declined" }): Promise<void>;
  startOutgoing(o: VoipIncoming): Promise<void>;
  addListener(event: string, cb: (data: unknown) => void): Promise<Handle> | Handle;
};

export function nativeVoip(): VoipPlugin | null {
  if (nativePlatform() !== "ios") return null;
  const p = getCapacitor()?.Plugins?.WorkBenchVoip as VoipPlugin | undefined;
  return typeof p?.register === "function" ? p : null;
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
 * it is not signed into, so it switches companies (a hard navigation) and
 * picks the call back up on the other side. Short-lived on purpose — a
 * stale entry must never resurrect a call that is long over.
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
