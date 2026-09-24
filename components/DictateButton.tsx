"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";

/**
 * Talk instead of type. A mic button that dictates into a text box through
 * the browser's speech recognition (Chrome, Edge, Safari on iPhone/Mac —
 * nothing leaves the device except the audio the browser itself sends to
 * its speech service). Renders nothing where the browser can't do it, so
 * callers place it freely. Final phrases arrive through `onText`; the
 * caller appends them to whatever the person already typed.
 */

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export default function DictateButton({ onText, onInterim, className = "", label = "Dictate", disabled = false }: { onText: (finalText: string) => void; onInterim?: (text: string) => void; className?: string; label?: string; disabled?: boolean }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<Recognition | null>(null);

  useEffect(() => {
    setSupported(recognitionCtor() !== null);
    return () => recRef.current?.abort();
  }, []);

  function stop() {
    recRef.current?.stop();
    recRef.current = null;
    setListening(false);
    onInterim?.("");
  }

  function start() {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0]?.transcript ?? "";
        if (r.isFinal) onText(text.trim());
        else interim += text;
      }
      onInterim?.(interim.trim());
    };
    rec.onend = () => {
      // Safari ends after a pause; only flip the button if we didn't stop it ourselves
      if (recRef.current === rec) {
        recRef.current = null;
        setListening(false);
        onInterim?.("");
      }
    };
    rec.onerror = () => stop();
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      stop();
    }
  }

  if (!supported) return null;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => (listening ? stop() : start())}
      aria-pressed={listening}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium disabled:opacity-50 ${listening ? "border-red-300 bg-red-50 text-red-700" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"} ${className}`}
    >
      {listening ? (
        <>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          Listening… tap to stop
        </>
      ) : (
        <>
          <Mic size={13} /> {label}
        </>
      )}
      {listening ? <Square size={10} className="ml-0.5 fill-current" /> : null}
    </button>
  );
}
