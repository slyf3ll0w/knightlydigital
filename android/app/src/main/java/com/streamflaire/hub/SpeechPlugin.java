package com.streamflaire.hub;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.util.ArrayList;
import java.util.Locale;

/**
 * WorkBenchSpeech — the phone's own speech recognizer for Talk to Atlas.
 *
 * The Android WebView has no Web Speech API, so without this the page
 * records the microphone and ships the clip to /api/app/assistant/transcribe
 * (a second or two of lag, no words while you talk). This plugin runs
 * Android's SpeechRecognizer (Google's service on Play phones) and streams
 * the words to the page as they are recognized, like Chrome does on the web.
 * lib/native-speech.ts + lib/voice-chat-client.ts listenWithNative drive it;
 * the iOS twin is ios/App/App/SpeechPlugin.swift.
 *
 *   available()            the device has a recognition service (needs the
 *                          <queries> block in the manifest on Android 11+)
 *   requestPermissions()   RECORD_AUDIO (alias "speech") — Capacitor's own
 *                          permission flow, resolves { speech: "granted" | ... }
 *   start({ language })    begins listening; resolves once the recognizer
 *                          accepted the request. Words arrive as events:
 *     partial { text }     the best guess so far, as the speaker talks
 *     final { text }       what was said, once (text may be "")
 *     ended { reason }     always last: "final" | "noSpeech" | "cancelled" |
 *                          "error" (+ message). Android ends a listen by
 *                          itself after a pause; stop() ends it early.
 *   stop()                 finish now, deliver what was heard
 *   cancel()               throw away, no final
 *
 * Shape adapted from @capacitor-community/speech-recognition (MIT), with
 * errors delivered as events rather than on an already-resolved promise.
 */
@CapacitorPlugin(
    name = "WorkBenchSpeech",
    permissions = {
        @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "speech")
    }
)
public class SpeechPlugin extends Plugin {

    private SpeechRecognizer recognizer;
    private boolean listening = false;
    private boolean cancelled = false;
    private String lastPartial = "";

    private boolean recognitionAvailable() {
        try {
            return SpeechRecognizer.isRecognitionAvailable(getContext());
        } catch (Exception e) {
            return false;
        }
    }

    @PluginMethod
    public void available(PluginCall call) {
        JSObject r = new JSObject();
        r.put("available", recognitionAvailable());
        call.resolve(r);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (!recognitionAvailable()) {
            call.reject("No speech recognition service on this phone.", "UNAVAILABLE");
            return;
        }
        if (getPermissionState("speech") != com.getcapacitor.PermissionState.GRANTED) {
            call.reject("Microphone permission is not granted.", "PERMISSION");
            return;
        }
        String language = call.getString("language", Locale.getDefault().toLanguageTag());

        final Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getContext().getPackageName());
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        // Dictation mode keeps the recognizer open across short pauses instead
        // of ending at the first breath; the page still ends a turn by silence.
        intent.putExtra("android.speech.extra.DICTATION_MODE", true);

        getActivity().runOnUiThread(() -> {
            try {
                tearDown();
                recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
                recognizer.setRecognitionListener(new Listener());
                cancelled = false;
                lastPartial = "";
                listening = true;
                recognizer.startListening(intent);
                call.resolve();
            } catch (Exception e) {
                listening = false;
                call.reject(e.getMessage() != null ? e.getMessage() : "Couldn't start listening.", "START");
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (recognizer != null && listening) {
                try {
                    recognizer.stopListening();
                } catch (Exception ignored) {}
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            boolean was = listening;
            cancelled = true;
            tearDown();
            if (was) ended("cancelled", null);
            call.resolve();
        });
    }

    @PluginMethod
    public void isListening(PluginCall call) {
        JSObject r = new JSObject();
        r.put("listening", listening);
        call.resolve(r);
    }

    @Override
    protected void handleOnDestroy() {
        tearDown();
        super.handleOnDestroy();
    }

    /** Main thread only. */
    private void tearDown() {
        listening = false;
        if (recognizer != null) {
            try {
                recognizer.cancel();
            } catch (Exception ignored) {}
            try {
                recognizer.destroy();
            } catch (Exception ignored) {}
            recognizer = null;
        }
    }

    private void ended(String reason, String message) {
        JSObject r = new JSObject();
        r.put("reason", reason);
        if (message != null) r.put("message", message);
        notifyListeners("ended", r);
    }

    private static String firstMatch(Bundle b) {
        if (b == null) return "";
        ArrayList<String> m = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        return (m == null || m.isEmpty() || m.get(0) == null) ? "" : m.get(0);
    }

    private class Listener implements RecognitionListener {
        @Override public void onReadyForSpeech(Bundle params) {}
        @Override public void onBeginningOfSpeech() {}
        @Override public void onRmsChanged(float rmsdB) {}
        @Override public void onBufferReceived(byte[] buffer) {}
        @Override public void onEndOfSpeech() {}
        @Override public void onEvent(int eventType, Bundle params) {}

        @Override
        public void onPartialResults(Bundle partialResults) {
            String text = firstMatch(partialResults).trim();
            if (text.isEmpty() || text.equals(lastPartial)) return;
            lastPartial = text;
            JSObject r = new JSObject();
            r.put("text", text);
            notifyListeners("partial", r);
        }

        @Override
        public void onResults(Bundle results) {
            if (cancelled) return;
            listening = false;
            String text = firstMatch(results).trim();
            if (text.isEmpty()) text = lastPartial;
            JSObject r = new JSObject();
            r.put("text", text);
            notifyListeners("final", r);
            ended("final", null);
        }

        @Override
        public void onError(int error) {
            if (cancelled) return;
            listening = false;
            switch (error) {
                case SpeechRecognizer.ERROR_NO_MATCH:
                case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                    // Heard nothing usable. If words were streaming, hand those over
                    // (the service sometimes times out right after the last partial).
                    if (!lastPartial.isEmpty()) {
                        JSObject r = new JSObject();
                        r.put("text", lastPartial);
                        notifyListeners("final", r);
                        ended("final", null);
                    } else {
                        ended("noSpeech", null);
                    }
                    return;
                case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                    ended("error", "Microphone permission is not granted.");
                    return;
                case SpeechRecognizer.ERROR_NETWORK:
                case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                    ended("error", "Speech recognition needs a connection.");
                    return;
                case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                    ended("error", "The phone's speech recognizer is busy.");
                    return;
                case SpeechRecognizer.ERROR_AUDIO:
                    ended("error", "The microphone couldn't be opened.");
                    return;
                default:
                    ended("error", "Couldn't hear that (" + error + ").");
            }
        }
    }
}
