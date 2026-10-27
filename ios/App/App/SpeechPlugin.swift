import Foundation
import Capacitor
import Speech
import AVFoundation

/**
 * WorkBenchSpeech — the phone's own speech recognizer for Talk to Atlas.
 *
 * WKWebView exposes webkitSpeechRecognition but refuses to run it, so the
 * page used to record the microphone and ship the clip to
 * /api/app/assistant/transcribe (a second or two of lag, no words while you
 * talk). This plugin runs SFSpeechRecognizer on an AVAudioEngine tap and
 * streams the words to the page as they are recognized, like Safari does.
 * lib/native-speech.ts + lib/voice-chat-client.ts listenWithNative drive it;
 * the Android twin is android/.../SpeechPlugin.java. Same event surface:
 *
 *   available()            a recognizer exists for the device locale
 *   checkPermissions() /   speech recognition + microphone, both needed;
 *   requestPermissions()   resolves { speech: "granted" | "denied" | "prompt" }
 *   start({ language })    begins listening; resolves once audio is flowing
 *     partial { text }     the best guess so far, as the speaker talks
 *     final { text }       what was said, once (text may be "")
 *     ended { reason }     always last: "final" | "noSpeech" | "cancelled" |
 *                          "error" (+ message). Apple's recognizer does NOT
 *                          end on silence by itself — the page watches the
 *                          partials and calls stop() after a pause.
 *   stop()                 finish now, deliver what was heard
 *   cancel()               throw away, no final
 *
 * Audio session: playAndRecord so Atlas's reply (an <audio> element in the
 * page) still plays, speaker by default, Bluetooth allowed. The session is
 * never deactivated here — a business-line call (VoipPlugin) may own it.
 * Info.plist needs NSSpeechRecognitionUsageDescription + NSMicrophoneUsageDescription.
 *
 * Shape adapted from @capacitor-community/speech-recognition (MIT), which has
 * no Swift Package manifest and so cannot ride CapApp-SPM.
 */
@objc(SpeechPlugin)
public class SpeechPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SpeechPlugin"
    public let jsName = "WorkBenchSpeech"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isListening", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
    ]

    private var audioEngine: AVAudioEngine?
    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var listening = false
    private var cancelled = false
    private var done = false
    private var lastPartial = ""

    // MARK: - Availability + permissions

    @objc func available(_ call: CAPPluginCall) {
        let r = SFSpeechRecognizer(locale: Locale.current) ?? SFSpeechRecognizer()
        call.resolve(["available": r?.isAvailable ?? false])
    }

    private func permissionWord() -> String {
        switch SFSpeechRecognizer.authorizationStatus() {
        case .authorized:
            switch AVAudioSession.sharedInstance().recordPermission {
            case .granted: return "granted"
            case .denied: return "denied"
            default: return "prompt"
            }
        case .denied, .restricted: return "denied"
        case .notDetermined: return "prompt"
        @unknown default: return "prompt"
        }
    }

    @objc override public func checkPermissions(_ call: CAPPluginCall) {
        call.resolve(["speech": permissionWord()])
    }

    @objc override public func requestPermissions(_ call: CAPPluginCall) {
        SFSpeechRecognizer.requestAuthorization { status in
            guard status == .authorized else {
                DispatchQueue.main.async { call.resolve(["speech": self.permissionWord()]) }
                return
            }
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                DispatchQueue.main.async { call.resolve(["speech": granted ? "granted" : "denied"]) }
            }
        }
    }

    // MARK: - Listening

    @objc func start(_ call: CAPPluginCall) {
        guard SFSpeechRecognizer.authorizationStatus() == .authorized,
              AVAudioSession.sharedInstance().recordPermission == .granted else {
            call.reject("Microphone or speech recognition permission is not granted.", "PERMISSION")
            return
        }
        let language = call.getString("language") ?? Locale.current.identifier
        guard let rec = SFSpeechRecognizer(locale: Locale(identifier: language)) ?? SFSpeechRecognizer(), rec.isAvailable else {
            call.reject("No speech recognizer for this language.", "UNAVAILABLE")
            return
        }

        DispatchQueue.main.async {
            self.tearDown()
            self.cancelled = false
            self.done = false
            self.lastPartial = ""
            self.recognizer = rec

            let session = AVAudioSession.sharedInstance()
            do {
                try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
                try session.setActive(true, options: [])
            } catch {
                call.reject("The microphone couldn't be opened.", "AUDIO")
                return
            }

            let engine = AVAudioEngine()
            let req = SFSpeechAudioBufferRecognitionRequest()
            req.shouldReportPartialResults = true
            if #available(iOS 16.0, *) { req.addsPunctuation = true }
            self.audioEngine = engine
            self.request = req

            self.task = rec.recognitionTask(with: req) { [weak self] result, error in
                guard let self = self, !self.done else { return }
                if let result = result {
                    let text = result.bestTranscription.formattedString.trimmingCharacters(in: .whitespacesAndNewlines)
                    if result.isFinal {
                        self.finish(text: text.isEmpty ? self.lastPartial : text)
                        return
                    }
                    if !text.isEmpty && text != self.lastPartial {
                        self.lastPartial = text
                        self.notifyListeners("partial", data: ["text": text])
                    }
                }
                if let error = error {
                    if self.cancelled { return }
                    let ns = error as NSError
                    // Apple answers an ended request with "no speech detected" (kAFAssistantErrorDomain 1110)
                    // or a cancellation (216) — neither is a failure worth wording.
                    if !self.lastPartial.isEmpty {
                        self.finish(text: self.lastPartial)
                    } else if ns.code == 1110 || ns.code == 216 || ns.code == 301 || ns.code == 203 {
                        self.end(reason: "noSpeech", message: nil)
                    } else {
                        self.end(reason: "error", message: ns.localizedDescription)
                    }
                }
            }

            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
                self.request?.append(buffer)
            }
            engine.prepare()
            do {
                try engine.start()
                self.listening = true
                call.resolve()
            } catch {
                self.tearDown()
                call.reject("The microphone couldn't be opened.", "AUDIO")
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.listening {
                self.listening = false
                self.audioEngine?.stop()
                self.audioEngine?.inputNode.removeTap(onBus: 0)
                self.request?.endAudio() // the task then delivers its final result (or an error)
            }
            call.resolve()
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let was = self.listening || self.task != nil
            self.cancelled = true
            self.tearDown()
            if was { self.end(reason: "cancelled", message: nil) }
            call.resolve()
        }
    }

    @objc func isListening(_ call: CAPPluginCall) {
        call.resolve(["listening": listening])
    }

    // MARK: - Internals (main thread)

    private func finish(text: String) {
        if cancelled || done { return }
        done = true
        DispatchQueue.main.async {
            self.tearDown()
            self.notifyListeners("final", data: ["text": text])
            self.end(reason: "final", message: nil)
        }
    }

    private func end(reason: String, message: String?) {
        done = true
        DispatchQueue.main.async {
            self.tearDown()
            var data: [String: Any] = ["reason": reason]
            if let message = message { data["message"] = message }
            self.notifyListeners("ended", data: data)
        }
    }

    private func tearDown() {
        listening = false
        if let engine = audioEngine {
            if engine.isRunning { engine.stop() }
            engine.inputNode.removeTap(onBus: 0)
        }
        audioEngine = nil
        request?.endAudio()
        request = nil
        task?.cancel()
        task = nil
    }
}
