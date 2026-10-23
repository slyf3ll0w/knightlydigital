"use client";

/**
 * A live voice session with Atlas (Gemini Live over a WebSocket): the mic
 * streams up as 16 kHz PCM, the reply streams back as 24 kHz PCM and plays
 * as it arrives, talking over it interrupts it, and tool calls are run on
 * our server (/api/app/assistant/live/tool) and answered into the session.
 * This is what makes it a conversation instead of a bucket brigade —
 * /api/app/assistant/live/token mints the connection.
 */

import { voiceLog } from "@/lib/voice-log";

// Ephemeral tokens connect through the *Constrained* method (verified
// 2026-10-23: BidiGenerateContent closes 1008 "unregistered caller" for a
// token; Constrained completes setup in ~300 ms).
const WS_URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";
const IN_RATE = 16000;
const OUT_RATE = 24000;

export type LiveStatus = "connecting" | "listening" | "speaking" | "working" | "ended" | "error";

export type LiveEvents = {
  onStatus: (s: LiveStatus, detail?: string) => void;
  /** Live captions: what the user is heard saying, what Atlas is saying. */
  onCaption: (role: "user" | "atlas", text: string, final: boolean) => void;
  /** A tool call to run on our server (or locally for confirm_cards); return the response object. */
  onToolCall: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  onError: (message: string) => void;
  /** Audio seconds sent / received since the last report (metering). */
  onUsage: (inSeconds: number, outSeconds: number) => void;
};

export type LiveHandle = {
  stop: () => void;
  /** Stop playback now (the user tapped to interrupt). */
  hush: () => void;
  setMuted: (m: boolean) => void;
};

type TokenReply = { token: string; model: string; setup: Record<string, unknown>; assistantName: string; error?: string };

// A tiny AudioWorklet that ships raw Float32 frames to the main thread.
const WORKLET_SRC = `
class WbMicTap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor("wb-mic-tap", WbMicTap);
`;

function downsampleToPcm16(input: Float32Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(input[i] * 32767)));
    return out;
  }
  const ratio = fromRate / toRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let n = 0;
    for (let j = start; j < end; j++) {
      sum += input[j];
      n++;
    }
    const v = n ? sum / n : 0;
    out[i] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
  }
  return out;
}

function base64FromBytes(bytes: Uint8Array): string {
  let s = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(s);
}

function bytesFromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// iOS only lets a page make sound after a tap: the drawer calls this from
// the tap that opens voice mode and the session reuses the unlocked context.
let primedOut: AudioContext | null = null;
export function primeLiveAudio(): void {
  try {
    const Ctx = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as typeof AudioContext | undefined;
    if (!Ctx) return;
    if (!primedOut || primedOut.state === "closed") primedOut = new Ctx();
    void primedOut.resume().catch(() => undefined);
  } catch {
    /* no audio */
  }
}

export async function startLiveSession(ev: LiveEvents): Promise<LiveHandle> {
  ev.onStatus("connecting");
  const t0 = Date.now();
  const since = () => `${Date.now() - t0}ms`;
  voiceLog("live: start");
  const tokenRes = await fetch("/api/app/assistant/live/token", { method: "POST" });
  const tokenData = (await tokenRes.json().catch(() => ({}))) as Partial<TokenReply>;
  if (!tokenRes.ok || !tokenData.token || !tokenData.setup) {
    voiceLog("live: token refused", `${tokenRes.status} ${tokenData.error ?? ""} ${since()}`);
    throw new Error(tokenData.error ?? "Live voice is unavailable right now.");
  }
  voiceLog("live: token ok", `${tokenData.model} ${since()}`);

  // Mic first (inside the tap's activation on iOS): echo cancellation on,
  // so the phone doesn't hear Atlas through its own speaker.
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
  } catch (err) {
    voiceLog("live: mic refused", err);
    throw err;
  }
  voiceLog("live: mic ok", since());

  const Ctx = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as typeof AudioContext;
  const inCtx = new Ctx();
  const outCtx = primedOut && primedOut.state !== "closed" ? primedOut : new Ctx();
  primedOut = null;
  await Promise.all([inCtx.resume().catch(() => undefined), outCtx.resume().catch(() => undefined)]);

  let ws: WebSocket | null = null;
  let closed = false;
  let muted = false;
  let setupDone = false;
  let inSeconds = 0;
  let outSeconds = 0;
  let nextPlayAt = 0;
  const playing = new Set<AudioBufferSourceNode>();
  let speaking = false;
  let speakTimer: ReturnType<typeof setTimeout> | null = null;

  const send = (msg: Record<string, unknown>) => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  const hush = () => {
    playing.forEach((s) => {
      try { s.stop(); } catch { /* already stopped */ }
    });
    playing.clear();
    nextPlayAt = 0;
    if (speaking) {
      speaking = false;
      ev.onStatus("listening");
    }
  };

  const playPcm = (bytes: Uint8Array) => {
    const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
    if (samples.length === 0) return;
    const buf = outCtx.createBuffer(1, samples.length, OUT_RATE);
    const data = buf.getChannelData(0);
    for (let i = 0; i < samples.length; i++) data[i] = samples[i] / 32768;
    const src = outCtx.createBufferSource();
    src.buffer = buf;
    src.connect(outCtx.destination);
    const now = outCtx.currentTime;
    const at = Math.max(now + 0.02, nextPlayAt);
    src.start(at);
    nextPlayAt = at + buf.duration;
    outSeconds += buf.duration;
    playing.add(src);
    src.onended = () => playing.delete(src);
    if (!speaking) {
      speaking = true;
      ev.onStatus("speaking");
    }
    if (speakTimer) clearTimeout(speakTimer);
    speakTimer = setTimeout(() => {
      speaking = false;
      if (!closed) ev.onStatus("listening");
    }, Math.max(50, (nextPlayAt - now) * 1000 + 150));
  };

  // Mic → worklet → 16 kHz PCM16 → base64 → session, ~100 ms per message.
  const blobUrl = URL.createObjectURL(new Blob([WORKLET_SRC], { type: "application/javascript" }));
  try {
    await inCtx.audioWorklet.addModule(blobUrl);
  } catch (err) {
    voiceLog("live: worklet failed", err);
    stream.getTracks().forEach((t) => t.stop());
    throw err;
  }
  URL.revokeObjectURL(blobUrl);
  voiceLog("live: audio ready", `in ${inCtx.sampleRate}Hz out ${outCtx.sampleRate}Hz ${since()}`);
  const source = inCtx.createMediaStreamSource(stream);
  const tap = new AudioWorkletNode(inCtx, "wb-mic-tap", { numberOfInputs: 1, numberOfOutputs: 0 });
  let pending: Int16Array[] = [];
  let pendingSamples = 0;
  const flushMic = () => {
    if (pendingSamples === 0) return;
    const merged = new Int16Array(pendingSamples);
    let o = 0;
    for (const p of pending) {
      merged.set(p, o);
      o += p.length;
    }
    pending = [];
    pendingSamples = 0;
    if (muted || !setupDone) return;
    inSeconds += merged.length / IN_RATE;
    send({ realtimeInput: { audio: { data: base64FromBytes(new Uint8Array(merged.buffer)), mimeType: `audio/pcm;rate=${IN_RATE}` } } });
  };
  tap.port.onmessage = (e: MessageEvent<Float32Array>) => {
    const pcm = downsampleToPcm16(e.data, inCtx.sampleRate, IN_RATE);
    pending.push(pcm);
    pendingSamples += pcm.length;
    if (pendingSamples >= IN_RATE / 10) flushMic();
  };
  source.connect(tap);

  const usageTimer = setInterval(() => {
    if (inSeconds + outSeconds > 0) {
      ev.onUsage(inSeconds, outSeconds);
      inSeconds = 0;
      outSeconds = 0;
    }
  }, 60_000);

  const stop = () => {
    if (closed) return;
    closed = true;
    clearInterval(usageTimer);
    if (speakTimer) clearTimeout(speakTimer);
    hush();
    try { tap.port.onmessage = null; source.disconnect(); tap.disconnect(); } catch { /* fine */ }
    stream.getTracks().forEach((t) => t.stop());
    void inCtx.close().catch(() => undefined);
    void outCtx.close().catch(() => undefined);
    try { ws?.close(); } catch { /* fine */ }
    if (inSeconds + outSeconds > 0) ev.onUsage(inSeconds, outSeconds);
    voiceLog("live: stopped", since());
    ev.onStatus("ended");
  };

  // The socket.
  ws = new WebSocket(`${WS_URL}?access_token=${encodeURIComponent(tokenData.token)}`);
  ws.onopen = () => {
    voiceLog("live: socket open", since());
    send({ setup: { model: tokenData.model, ...tokenData.setup } });
  };
  ws.onerror = () => {
    voiceLog("live: socket error", since());
    if (!closed) ev.onError("The live connection failed.");
  };
  ws.onclose = (e) => {
    if (closed) return;
    voiceLog("live: socket closed", `${e.code} ${e.reason} ${since()}`);
    const why = e.reason ? ` (${e.reason})` : "";
    if (!setupDone) ev.onError(`Couldn't start the live session${why}.`);
    stop();
  };
  let userCaption = "";
  let atlasCaption = "";
  // Per-turn timing: when the user's words last arrived → first audio back.
  let lastHeardAt = 0;
  let turnAudioLogged = false;
  ws.onmessage = async (e) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(typeof e.data === "string" ? e.data : await (e.data as Blob).text());
    } catch {
      return;
    }
    if ("setupComplete" in msg) {
      setupDone = true;
      voiceLog("live: setup complete", since());
      ev.onStatus("listening");
      return;
    }
    const sc = msg.serverContent as
      | {
          modelTurn?: { parts?: { inlineData?: { data?: string; mimeType?: string }; text?: string }[] };
          interrupted?: boolean;
          turnComplete?: boolean;
          inputTranscription?: { text?: string };
          outputTranscription?: { text?: string };
        }
      | undefined;
    if (sc) {
      if (sc.interrupted) {
        voiceLog("live: interrupted");
        hush();
        atlasCaption = "";
      }
      if (sc.inputTranscription?.text) {
        userCaption += sc.inputTranscription.text;
        lastHeardAt = Date.now();
        turnAudioLogged = false;
        ev.onCaption("user", userCaption, false);
      }
      if (sc.outputTranscription?.text) {
        atlasCaption += sc.outputTranscription.text;
        ev.onCaption("atlas", atlasCaption, false);
      }
      for (const p of sc.modelTurn?.parts ?? []) {
        if (p.inlineData?.data) {
          if (!turnAudioLogged) {
            turnAudioLogged = true;
            voiceLog("live: first audio", lastHeardAt ? `${Date.now() - lastHeardAt}ms after last words heard` : "unprompted");
          }
          playPcm(bytesFromBase64(p.inlineData.data));
        }
      }
      if (sc.turnComplete) {
        voiceLog("live: turn complete", `heard “${userCaption.slice(0, 80)}” → said “${atlasCaption.slice(0, 80)}”`);
        if (userCaption) ev.onCaption("user", userCaption, true);
        if (atlasCaption) ev.onCaption("atlas", atlasCaption, true);
        userCaption = "";
        atlasCaption = "";
      }
    }
    const tc = msg.toolCall as { functionCalls?: { id: string; name: string; args?: Record<string, unknown> }[] } | undefined;
    if (tc?.functionCalls?.length) {
      ev.onStatus("working", tc.functionCalls.map((c) => c.name).join(", "));
      const tTool = Date.now();
      const functionResponses = await Promise.all(
        tc.functionCalls.map(async (c) => {
          let response: Record<string, unknown>;
          try {
            response = await ev.onToolCall(c.name, c.args ?? {});
          } catch (err) {
            response = { error: (err as Error)?.message ?? "failed" };
          }
          return { id: c.id, name: c.name, response };
        })
      );
      voiceLog("live: tools", `${tc.functionCalls.map((c) => c.name).join(", ")} ${Date.now() - tTool}ms`);
      send({ toolResponse: { functionResponses } });
      if (!closed && !speaking) ev.onStatus("listening");
    }
    const ga = msg.goAway as { timeLeft?: string } | undefined;
    if (ga) {
      voiceLog("live: goAway", ga.timeLeft);
      ev.onStatus("listening", "The session is about to time out — tap Done and start again if it drops.");
    }
  };

  return {
    stop,
    hush,
    setMuted: (m) => {
      muted = m;
    },
  };
}
