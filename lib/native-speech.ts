"use client";

import { getCapacitor, nativePlatform } from "@/components/NativeShell";

/**
 * The phone app's own ears for Talk to Atlas — the OS speech recognizer
 * wrapped by ios/App/App/SpeechPlugin.swift and
 * android/.../SpeechPlugin.java, reached through window.Capacitor.Plugins
 * like every shell integration (nothing here imports @capacitor/*, so the
 * web bundle is untouched and a shell built before the plugin existed
 * simply has no bridge — lib/voice-chat-client.ts then records the mic and
 * transcribes server-side as before).
 *
 * One listen = start() → `partial` events while they talk → `final` once →
 * `ended` last (reason "final" | "noSpeech" | "cancelled" | "error").
 * Android's recognizer ends by itself after a pause; Apple's does not, so
 * the caller watches the partials and calls stop() after a silence.
 */

export type SpeechPermission = "granted" | "denied" | "prompt";

export type NativeSpeechHandle = { remove: () => Promise<void> | void };

export type NativeSpeechEvents = {
  partial: { text: string };
  final: { text: string };
  ended: { reason: "final" | "noSpeech" | "cancelled" | "error"; message?: string };
};

export type NativeSpeechPlugin = {
  available(): Promise<{ available: boolean }>;
  checkPermissions(): Promise<{ speech: SpeechPermission }>;
  requestPermissions(): Promise<{ speech: SpeechPermission }>;
  /** Resolves once the recognizer is listening; rejects with { code, message } otherwise. */
  start(o: { language?: string }): Promise<void>;
  /** Finish now — `final` + `ended` follow. */
  stop(): Promise<void>;
  /** Throw the listen away — `ended { reason: "cancelled" }` follows, no `final`. */
  cancel(): Promise<void>;
  isListening(): Promise<{ listening: boolean }>;
  addListener<E extends keyof NativeSpeechEvents>(
    event: E,
    cb: (d: NativeSpeechEvents[E]) => void
  ): Promise<NativeSpeechHandle> | NativeSpeechHandle;
};

export function nativeSpeech(): NativeSpeechPlugin | null {
  if (!nativePlatform()) return null;
  const p = getCapacitor()?.Plugins?.WorkBenchSpeech as NativeSpeechPlugin | undefined;
  return typeof p?.start === "function" && typeof p?.addListener === "function" ? p : null;
}

/** Subscribe and get back one function that unsubscribes, whether the handle came sync or async. */
export function onNativeSpeech<E extends keyof NativeSpeechEvents>(
  p: NativeSpeechPlugin,
  event: E,
  cb: (d: NativeSpeechEvents[E]) => void
): () => void {
  let removed = false;
  let handle: NativeSpeechHandle | undefined;
  void Promise.resolve(p.addListener(event, cb)).then((h) => {
    if (removed) void h.remove();
    else handle = h;
  });
  return () => {
    removed = true;
    void handle?.remove();
  };
}

/** A thrown plugin rejection → its code (Capacitor passes `code` through) and message. */
export function nativeSpeechError(err: unknown): { code: string | null; message: string } {
  const e = err as { code?: unknown; message?: unknown; errorMessage?: unknown } | null;
  const code = typeof e?.code === "string" ? e.code : null;
  const message = typeof e?.message === "string" ? e.message : typeof e?.errorMessage === "string" ? e.errorMessage : "";
  return { code, message };
}
