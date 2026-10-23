"use client";

import { transcribeMime } from "./voice-chat-shared";

/**
 * Talking to Atlas — the browser half. Ears: the Web Speech API where the
 * browser has it (desktop Chrome/Edge/Safari, iPhone Safari, Android
 * Chrome); otherwise (the iOS/Android app shells' webviews) the mic is
 * recorded and sent to /api/app/assistant/transcribe. Mouth:
 * /api/app/assistant/speak (a natural voice, metered) with the device's
 * own speech synthesis as the free fallback.
 */

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type MicState = "granted" | "denied" | "unavailable";

/**
 * Ask for the microphone — call this INSIDE the tap that opens voice mode
 * (iOS and Safari only allow the prompt from a user gesture). The browser
 * shows its own Allow / Block prompt the first time; after that the answer
 * is remembered per site, and a remembered Block is what "blocked" means.
 */
export async function requestMicrophone(): Promise<MicState> {
  if (typeof navigator === "undefined" || typeof navigator.mediaDevices?.getUserMedia !== "function") return "unavailable";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return "granted";
  } catch (err) {
    const name = (err as { name?: string })?.name ?? "";
    if (name === "NotFoundError" || name === "OverconstrainedError") return "unavailable";
    return "denied";
  }
}

export type MicPlatform = "ios-app" | "android-app" | "ios-safari" | "android-chrome" | "safari" | "firefox" | "chrome";

export function micPlatform(): MicPlatform {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const shell = ua.includes("StreamflaireHubShell");
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Mac") && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  if (shell) return ios ? "ios-app" : "android-app";
  if (ios) return "ios-safari";
  if (android) return "android-chrome";
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\//.test(ua)) return "safari";
  return "chrome";
}

/** How to unblock the microphone on this device, in one or two plain sentences. */
export function micInstructions(platform: MicPlatform = micPlatform()): string {
  switch (platform) {
    case "ios-app":
      return "Open your iPhone's Settings app, scroll to WorkBench, turn Microphone on, then come back and tap Try again.";
    case "android-app":
      return "Open your phone's Settings → Apps → WorkBench → Permissions → Microphone → Allow, then come back and tap Try again.";
    case "ios-safari":
      return "Tap the AA (or ···) button in Safari's address bar → Website Settings → Microphone → Allow, then tap Try again.";
    case "android-chrome":
      return "Tap the lock icon next to the address bar → Permissions → Microphone → Allow, then tap Try again.";
    case "safari":
      return "In the Safari menu choose Settings for workbenchfsm.com → Microphone → Allow, then click Try again.";
    case "firefox":
      return "Click the microphone icon in the address bar, clear the block, then click Try again and choose Allow.";
    default:
      return "Click the icon at the left of the address bar (the lock or the sliders) → Microphone → Allow, then click Try again.";
  }
}

export function speechInputKind(): "browser" | "recorder" | "none" {
  if (recognitionCtor()) return "browser";
  if (typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function" && typeof MediaRecorder !== "undefined") return "recorder";
  return "none";
}

export type ListenHandle = { stop: () => void; cancel: () => void };

export type ListenEvents = {
  onInterim?: (text: string) => void;
  /** Final transcript ("" when nothing was heard). */
  onFinal: (text: string) => void;
  onError?: (message: string) => void;
  /** The browser refused the microphone — the overlay shows how to unblock it. */
  onBlocked?: () => void;
};

/**
 * Listen for one utterance. Browser recognition ends itself after the
 * speaker pauses; the recorder path records until `stop()` or 12 s, then
 * transcribes server-side.
 */
export function listenOnce(ev: ListenEvents): ListenHandle {
  const Ctor = recognitionCtor();
  if (Ctor) {
    const rec = new Ctor();
    rec.lang = navigator.language?.startsWith("en") ? navigator.language : "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let finalText = "";
    let settled = false;
    const settle = (text: string) => {
      if (settled) return;
      settled = true;
      ev.onFinal(text.trim());
    };
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      ev.onInterim?.((finalText + interim).trim());
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return; // onend settles with ""
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        if (ev.onBlocked) ev.onBlocked();
        else ev.onError?.("Microphone access is blocked.");
      } else if (e.error === "network") {
        ev.onError?.("Speech recognition needs a connection.");
      } else {
        ev.onError?.(`Couldn't hear that (${e.error}).`);
      }
      settled = true;
    };
    rec.onend = () => settle(finalText);
    try {
      rec.start();
    } catch {
      ev.onError?.("Couldn't start listening.");
    }
    return {
      stop: () => {
        try { rec.stop(); } catch { /* already stopped */ }
      },
      cancel: () => {
        settled = true;
        try { rec.abort(); } catch { /* already stopped */ }
      },
    };
  }

  // Recorder fallback (webviews). Record → POST → transcript.
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let cancelled = false;
  const chunks: Blob[] = [];
  const timer = setTimeout(() => recorder?.state === "recording" && recorder.stop(), 12_000);
  const cleanup = () => {
    clearTimeout(timer);
    stream?.getTracks().forEach((t) => t.stop());
  };
  void (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      if (ev.onBlocked) ev.onBlocked();
      else ev.onError?.("Microphone access is blocked.");
      return;
    }
    if (cancelled) return cleanup();
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    recorder.onstop = async () => {
      cleanup();
      if (cancelled) return;
      const blob = new Blob(chunks, { type: recorder?.mimeType || mime || "audio/webm" });
      if (blob.size < 2000) return ev.onFinal("");
      ev.onInterim?.("…");
      try {
        const res = await fetch("/api/app/assistant/transcribe", {
          method: "POST",
          headers: { "Content-Type": transcribeMime(blob.type) },
          body: blob,
        });
        const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
        if (!res.ok) return ev.onError?.(data.error ?? "Couldn't transcribe that.");
        ev.onFinal((data.text ?? "").trim());
      } catch {
        ev.onError?.("Couldn't reach the transcriber.");
      }
    };
    recorder.start(250);
  })();
  return {
    stop: () => {
      if (recorder?.state === "recording") recorder.stop();
      else if (!recorder) {
        cancelled = true;
        cleanup();
        ev.onFinal("");
      }
    },
    cancel: () => {
      cancelled = true;
      if (recorder?.state === "recording") recorder.stop();
      cleanup();
    },
  };
}

export type SpeakHandle = { stop: () => void; done: Promise<void> };

/**
 * Say something. `natural` = the server voice (metered, fetched as WAV);
 * on any failure, or when natural is off, the device voice speaks instead.
 * Resolves when the audio ends or is stopped.
 */
export function speak(text: string, opts: { natural: boolean; signal?: AbortSignal }): SpeakHandle {
  let stopped = false;
  let audio: HTMLAudioElement | null = null;
  const stopDevice = () => {
    try { window.speechSynthesis?.cancel(); } catch { /* unsupported */ }
  };
  const device = () =>
    new Promise<void>((resolve) => {
      if (stopped || typeof window === "undefined" || !window.speechSynthesis || !text.trim()) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.rate = 1.02;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    });
  const done = (async () => {
    if (!text.trim()) return;
    if (opts.natural) {
      try {
        const res = await fetch("/api/app/assistant/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: opts.signal,
        });
        if (res.ok && !stopped) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          await new Promise<void>((resolve) => {
            audio = new Audio(url);
            audio.onended = () => resolve();
            audio.onerror = () => resolve();
            audio.play().catch(() => resolve());
          });
          URL.revokeObjectURL(url);
          return;
        }
      } catch {
        /* fall through to the device voice */
      }
    }
    await device();
  })();
  return {
    done,
    stop: () => {
      stopped = true;
      if (audio) {
        audio.pause();
        audio.src = "";
      }
      stopDevice();
    },
  };
}

/** iOS unlocks audio playback on a user gesture — call from the tap that opens voice mode. */
export function primeAudio(): void {
  try {
    const a = new Audio();
    a.muted = true;
    void a.play().catch(() => undefined);
    window.speechSynthesis?.getVoices();
  } catch {
    /* not available */
  }
}
