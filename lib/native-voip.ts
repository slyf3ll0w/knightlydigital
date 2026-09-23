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
