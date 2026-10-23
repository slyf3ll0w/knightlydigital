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
  /** The model's turn ended (spoken, interrupted, or silent after tools) — record the exchange now. */
  onTurnComplete: () => void;
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
let primedSink: Sink | null = null;

/**
 * Where Atlas's voice comes out. Not the AudioContext's own destination: on
 * iPhones the echo canceller only covers sound played through a media
 * element, so Web Audio output leaks straight back into the mic and the
 * session hears Atlas talking (David's 2026-10-23 report: foreign-language
 * fragments, Atlas interrupting itself). Routing playback through a
 * MediaStreamDestination → <audio> puts it on the cancelled path. If the
 * element can't play (no gesture), the context's destination is the fallback.
 */
type Sink = { dest: MediaStreamAudioDestinationNode; el: HTMLAudioElement; failed: boolean };
function makeSink(ctx: AudioContext): Sink {
  const sink: Sink = { dest: ctx.createMediaStreamDestination(), el: document.createElement("audio"), failed: false };
  sink.el.srcObject = sink.dest.stream;
  sink.el.setAttribute("playsinline", "");
  sink.el.autoplay = true;
  sink.el.play().catch(() => {
    sink.failed = true;
  });
  return sink;
}

export function primeLiveAudio(): void {
  try {
    const Ctx = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as typeof AudioContext | undefined;
    if (!Ctx) return;
    if (!primedOut || primedOut.state === "closed") {
      primedOut = new Ctx();
      primedSink = null;
    }
    void primedOut.resume().catch(() => undefined);
    if (!primedSink) primedSink = makeSink(primedOut);
  } catch {
    /* no audio */
  }
}

/** Mic frames quieter than this never count as the user talking over Atlas. */
const GATE_FLOOR = 0.012;
/** How long after Atlas starts talking the mic only listens to learn the echo level. */
const GATE_LEARN_MS = 400;

function rmsOf(frame: Float32Array): number {
  let s = 0;
  for (let i = 0; i < frame.length; i++) s += frame[i] * frame[i];
  return Math.sqrt(s / Math.max(1, frame.length));
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
  const sink = primedSink && primedOut === outCtx ? primedSink : makeSink(outCtx);
  primedOut = null;
  primedSink = null;
  await Promise.all([inCtx.resume().catch(() => undefined), outCtx.resume().catch(() => undefined)]);
  const outNode = (): AudioNode => (sink.failed ? outCtx.destination : sink.dest);

  let ws: WebSocket | null = null;
  let closed = false;
  let muted = false;
  let setupDone = false;
  let inSeconds = 0;
  let outSeconds = 0;
  let nextPlayAt = 0;
  const playing = new Set<AudioBufferSourceNode>();
  let speaking = false;
  let speakingSince = 0;
  let speakTimer: ReturnType<typeof setTimeout> | null = null;
  // Barge-in gate state (see tap.port.onmessage).
  let echoLevel = 0;
  let gatedFrames = 0;
  let passedFrames = 0;

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
    src.connect(outNode());
    const now = outCtx.currentTime;
    const at = Math.max(now + 0.02, nextPlayAt);
    src.start(at);
    nextPlayAt = at + buf.duration;
    outSeconds += buf.duration;
    playing.add(src);
    src.onended = () => playing.delete(src);
    if (!speaking) {
      speaking = true;
      speakingSince = Date.now();
      echoLevel = 0;
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
  voiceLog("live: audio ready", `in ${inCtx.sampleRate}Hz out ${outCtx.sampleRate}Hz via ${sink.failed ? "context" : "audio element"} ${since()}`);
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
    let frame = e.data;
    // Barge-in gate: while Atlas is talking, the first GATE_LEARN_MS only
    // measure how much of its voice leaks into the mic; after that a frame
    // has to be clearly louder than that leak to count as the user talking
    // over it. Gated frames go up as silence so the session's own
    // voice-activity detector never hears Atlas and interrupts him.
    if (speaking) {
      const rms = rmsOf(frame);
      const learning = Date.now() - speakingSince < GATE_LEARN_MS;
      const gate = Math.max(GATE_FLOOR, echoLevel * 2.5);
      if (learning || rms < gate) {
        echoLevel = echoLevel === 0 ? rms : echoLevel * (learning ? 0.7 : 0.95) + rms * (learning ? 0.3 : 0.05);
        frame = new Float32Array(frame.length);
        gatedFrames++;
      } else passedFrames++;
    }
    const pcm = downsampleToPcm16(frame, inCtx.sampleRate, IN_RATE);
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
    try { sink.el.pause(); sink.el.srcObject = null; } catch { /* fine */ }
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
        // Keep what Atlas managed to say: the exchange (and any cards it
        // staged) must still land in the chat, or a "yes" after the
        // interruption finds nothing to confirm (2026-10-23 report).
        voiceLog("live: interrupted", `after “${atlasCaption.slice(0, 60)}”`);
        hush();
        if (atlasCaption) atlasCaption = `${atlasCaption.trim()} —`;
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
        if (gatedFrames + passedFrames > 0) {
          voiceLog("live: barge-in gate", `${gatedFrames} frames held, ${passedFrames} passed, echo≈${echoLevel.toFixed(3)}`);
          gatedFrames = 0;
          passedFrames = 0;
        }
        if (userCaption) ev.onCaption("user", userCaption, true);
        if (atlasCaption) ev.onCaption("atlas", atlasCaption, true);
        userCaption = "";
        atlasCaption = "";
        ev.onTurnComplete();
      }
    }
    const tc = msg.toolCall as { functionCalls?: { id: string; name: string; args?: Record<string, unknown> }[] } | undefined;
    if (tc?.functionCalls?.length) {
      ev.onStatus("working", tc.functionCalls.map((c) => c.name).join(", "));
      const tTool = Date.now();
      // In order, one at a time, with confirm/skip last: "mark it sent and
      // approve it" stages two cards and the confirm in one batch, and the
      // confirm must see the cards the earlier calls staged.
      const settles = (n: string) => n === "confirm_cards" || n === "skip_cards";
      const ordered = [...tc.functionCalls].sort((a, b) => Number(settles(a.name)) - Number(settles(b.name)));
      const functionResponses: { id: string; name: string; response: Record<string, unknown> }[] = [];
      for (const c of ordered) {
        let response: Record<string, unknown>;
        try {
          response = await ev.onToolCall(c.name, c.args ?? {});
        } catch (err) {
          response = { error: (err as Error)?.message ?? "failed" };
        }
        functionResponses.push({ id: c.id, name: c.name, response });
      }
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
