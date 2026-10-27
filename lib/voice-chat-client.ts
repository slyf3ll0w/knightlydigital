"use client";

import { transcribeMime } from "./voice-chat-shared";
import { getVoicePick } from "./atlas-voices";
import { nativeSpeech, onNativeSpeech, nativeSpeechError, type NativeSpeechPlugin } from "./native-speech";

/**
 * Talking to Atlas — the browser half. Ears: the Web Speech API where the
 * browser has it (desktop Chrome/Edge/Safari, iPhone Safari, Android
 * Chrome); otherwise the mic is recorded and sent to
 * /api/app/assistant/transcribe. The iOS and Android app shells have no
 * usable Web Speech API (WKWebView exposes webkitSpeechRecognition but
 * refuses to run it — "not-allowed" even with the microphone allowed —
 * David, 2026-10-23; the Android WebView has no recognizer at all), so
 * shells built with the WorkBenchSpeech plugin (lib/native-speech.ts; iOS
 * build 14 / Android versionCode 6) use the PHONE's recognizer instead —
 * live words as they talk, like Safari. Older shells, and any browser whose
 * recognizer refuses while the mic itself works, fall back to recording,
 * for good. Recording stops itself after the speaker goes quiet (a small
 * level watcher), so hands-free works there too.
 *
 * Mouth: /api/app/assistant/speak (a natural voice, metered) with the
 * device's own speech synthesis as the free fallback.
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

function inNativeShell(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent.includes("StreamflaireHubShell");
}

function recorderAvailable(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function" && typeof MediaRecorder !== "undefined";
}

/** Once a browser's recognizer refuses, recording is used from then on. */
let preferRecorder = false;

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
    // The phone app's recognizer has a permission of its own (iOS: Speech
    // Recognition, asked once). Declining it is not declining the mic: the
    // recorder still works, so from then on this device records.
    const native = nativeSpeech();
    if (native && !preferRecorder) {
      try {
        const { speech } = await native.requestPermissions();
        if (speech !== "granted") preferRecorder = true;
      } catch {
        preferRecorder = true;
      }
    }
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
      return "Open your iPhone's Settings app, scroll to WorkBench, turn Microphone (and Speech Recognition) on, then come back and tap Try again.";
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

export function speechInputKind(): "browser" | "native" | "recorder" | "none" {
  if (!inNativeShell() && !preferRecorder && recognitionCtor()) return "browser";
  if (inNativeShell() && !preferRecorder && nativeSpeech()) return "native";
  if (recorderAvailable()) return "recorder";
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

/** Listen for one utterance, by whichever ear this browser has. */
export function listenOnce(ev: ListenEvents): ListenHandle {
  const kind = speechInputKind();
  if (kind === "browser") return listenWithBrowser(ev);
  if (kind === "native") return listenWithNative(nativeSpeech()!, ev);
  return listenWithRecorder(ev);
}

/** The Web Speech API. Ends itself after the speaker pauses. */
function listenWithBrowser(ev: ListenEvents): ListenHandle {
  const Ctor = recognitionCtor()!;
  const rec = new Ctor();
  rec.lang = navigator.language?.startsWith("en") ? navigator.language : "en-US";
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  let finalText = "";
  let settled = false;
  let handedOff: ListenHandle | null = null;
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
    settled = true;
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      // The recognizer is refused — but is the microphone? If it works,
      // record instead, now and from here on (WKWebView behaves like this).
      void requestMicrophone().then((state) => {
        if (state === "granted" && recorderAvailable()) {
          preferRecorder = true;
          handedOff = listenWithRecorder(ev);
        } else if (ev.onBlocked) ev.onBlocked();
        else ev.onError?.("Microphone access is blocked.");
      });
    } else if (e.error === "network") {
      ev.onError?.("Speech recognition needs a connection.");
    } else {
      ev.onError?.(`Couldn't hear that (${e.error}).`);
    }
  };
  rec.onend = () => settle(finalText);
  try {
    rec.start();
  } catch {
    ev.onError?.("Couldn't start listening.");
  }
  return {
    stop: () => {
      if (handedOff) return handedOff.stop();
      try { rec.stop(); } catch { /* already stopped */ }
    },
    cancel: () => {
      settled = true;
      if (handedOff) return handedOff.cancel();
      try { rec.abort(); } catch { /* already stopped */ }
    },
  };
}

// The phone's recognizer (lib/native-speech.ts). Android ends a listen on
// its own after a pause; Apple's never does, so a pause after the last
// change in the words ends it here — same feel on both.
const NATIVE_END_SILENCE_MS = 1200;
const NATIVE_FINAL_GRACE_MS = 2500; // after stop(): how long to wait for the final words

function listenWithNative(p: NativeSpeechPlugin, ev: ListenEvents): ListenHandle {
  let text = "";
  let settled = false;
  let stopping = false;
  let handedOff: ListenHandle | null = null;
  const timers: ReturnType<typeof setTimeout>[] = [];
  let silence: ReturnType<typeof setTimeout> | null = null;
  const offs: (() => void)[] = [];

  const cleanup = () => {
    timers.forEach(clearTimeout);
    if (silence) clearTimeout(silence);
    offs.forEach((off) => off());
  };
  const settle = (t: string) => {
    if (settled) return;
    settled = true;
    cleanup();
    ev.onFinal(t.trim());
  };
  const stop = () => {
    if (stopping || settled) return;
    stopping = true;
    if (silence) clearTimeout(silence);
    void p.stop().catch(() => undefined);
    timers.push(setTimeout(() => settle(text), NATIVE_FINAL_GRACE_MS));
  };
  const armSilence = () => {
    if (silence) clearTimeout(silence);
    silence = setTimeout(stop, NATIVE_END_SILENCE_MS);
  };

  offs.push(
    onNativeSpeech(p, "partial", ({ text: t }) => {
      if (settled || stopping) return;
      if (t && t !== text) {
        text = t;
        ev.onInterim?.(t);
        armSilence();
      }
    }),
    onNativeSpeech(p, "final", ({ text: t }) => settle(t || text)),
    onNativeSpeech(p, "ended", ({ reason, message }) => {
      if (settled) return;
      if (reason === "final" || reason === "noSpeech") settle(text);
      else if (reason === "cancelled") {
        settled = true;
        cleanup();
      } else {
        settled = true;
        cleanup();
        ev.onError?.(message || "Couldn't hear that.");
      }
    })
  );

  timers.push(setTimeout(stop, MAX_UTTERANCE_MS));
  timers.push(
    setTimeout(() => {
      if (!text) stop();
    }, NO_SPEECH_MS)
  );

  const language = navigator.language?.startsWith("en") ? navigator.language : "en-US";
  void p.start({ language }).catch((err) => {
    if (settled) return;
    const { code, message } = nativeSpeechError(err);
    settled = true;
    cleanup();
    if (code === "PERMISSION") {
      if (ev.onBlocked) ev.onBlocked();
      else ev.onError?.("Microphone access is blocked.");
      return;
    }
    // No recognizer on this phone (or it refused to start): record from here on.
    preferRecorder = true;
    if (recorderAvailable()) {
      settled = false;
      handedOff = listenWithRecorder(ev);
    } else ev.onError?.(message || "Couldn't start listening.");
  });

  return {
    stop: () => {
      if (handedOff) return handedOff.stop();
      stop();
    },
    cancel: () => {
      if (handedOff) return handedOff.cancel();
      settled = true;
      cleanup();
      void p.cancel().catch(() => undefined);
    },
  };
}

// Level watcher: RMS of the mic signal, sampled ten times a second.
const SPEECH_LEVEL = 0.018; // above = someone is talking (quiet room ≈ 0.003–0.008)
const END_SILENCE_MS = 950; // this long under the level after speech = they're done
const NO_SPEECH_MS = 7000; // nothing at all for this long = give up quietly
const MAX_UTTERANCE_MS = 20000;

/**
 * Record → stop when the speaker goes quiet (or on tap, or at the cap) →
 * POST → transcript. The tap-to-stop still works; it just isn't needed.
 */
function listenWithRecorder(ev: ListenEvents): ListenHandle {
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let audioCtx: AudioContext | null = null;
  let cancelled = false;
  let stopping = false;
  const chunks: Blob[] = [];
  const timers: ReturnType<typeof setTimeout>[] = [];
  let levelTimer: ReturnType<typeof setInterval> | null = null;

  const cleanup = () => {
    timers.forEach(clearTimeout);
    if (levelTimer) clearInterval(levelTimer);
    stream?.getTracks().forEach((t) => t.stop());
    void audioCtx?.close().catch(() => undefined);
  };
  const stopRecording = () => {
    if (stopping) return;
    stopping = true;
    if (recorder?.state === "recording") recorder.stop();
    else {
      cleanup();
      if (!cancelled) ev.onFinal("");
    }
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
    timers.push(setTimeout(stopRecording, MAX_UTTERANCE_MS));

    // Watch the level so the recording ends when they stop talking.
    try {
      const Ctx = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as typeof AudioContext | undefined;
      if (!Ctx) return;
      audioCtx = new Ctx();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const started = Date.now();
      let heardSpeech = false;
      let quietSince = 0;
      levelTimer = setInterval(() => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        const now = Date.now();
        if (rms >= SPEECH_LEVEL) {
          if (!heardSpeech) ev.onInterim?.("Listening…");
          heardSpeech = true;
          quietSince = 0;
        } else if (heardSpeech) {
          if (!quietSince) quietSince = now;
          else if (now - quietSince >= END_SILENCE_MS) stopRecording();
        } else if (now - started >= NO_SPEECH_MS) {
          stopRecording();
        }
      }, 100);
    } catch {
      /* no level watcher — the cap and the tap still end the recording */
    }
  })();

  return {
    stop: stopRecording,
    cancel: () => {
      cancelled = true;
      stopping = true;
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
/** First sentence / the rest — so the voice for the opening line is ready while the rest is still being made. */
function splitForSpeech(text: string): string[] {
  const t = text.trim();
  if (t.length < 90) return [t];
  const m = /^(.{25,}?[.!?])\s+(\S[\s\S]+)$/.exec(t);
  return m ? [m[1], m[2]] : [t];
}

export function speak(text: string, opts: { natural: boolean; cache?: boolean; signal?: AbortSignal }): SpeakHandle {
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
  const fetchVoice = async (part: string): Promise<Blob | null> => {
    try {
      const res = await fetch("/api/app/assistant/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: part, ...(opts.cache ? { cache: true } : {}), ...(getVoicePick()?.voice ? { voice: getVoicePick()!.voice } : {}) }),
        signal: opts.signal,
      });
      return res.ok ? await res.blob() : null;
    } catch {
      return null;
    }
  };
  const play = (blob: Blob) =>
    new Promise<void>((resolve) => {
      if (stopped) return resolve();
      const url = URL.createObjectURL(blob);
      audio = new Audio(url);
      audio.onended = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
    });
  const done = (async () => {
    if (!text.trim()) return;
    if (opts.natural) {
      // Both parts are requested at once; the first plays as soon as it lands.
      const parts = splitForSpeech(text).map(fetchVoice);
      const first = await parts[0];
      if (first && !stopped) {
        await play(first);
        for (const rest of parts.slice(1)) {
          const blob = await rest;
          if (blob && !stopped) await play(blob);
        }
        return;
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
