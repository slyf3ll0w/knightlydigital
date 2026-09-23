import Foundation
import UIKit
import Capacitor
import CallKit
import PushKit
import AVFoundation
import TelnyxRTC

/**
 * WorkBenchVoip — the business line on the iPhone, natively.
 *
 * The calling engine lives here, not in the web page: iOS freezes a
 * background WKWebView (no JavaScript, no sockets), so a call answered from
 * the lock screen could never be taken by web code. Instead:
 *
 *   PushKit    the server sends a VoIP push per registered device when a
 *              call comes in (lib/voip.ts). iOS launches the closed app.
 *   CallKit    every push reports an incoming call synchronously — the
 *              system call screen is what rings, and its Answer / End /
 *              Mute / Hold drive the real call.
 *   TelnyxRTC  this engine fetches a login token with the app's own session
 *              cookies (GET /api/app/line/softphone), registers, tells the
 *              server it is awake (POST …/softphone/ready), receives the SIP
 *              INVITE for the call and answers it the moment CallKit says so.
 *              Audio flows in the background under the "voip"/"audio" modes.
 *
 * The web page (components/Softphone.tsx via lib/native-voip.ts) only
 * mirrors state on its call card and forwards taps here; it never touches
 * WebRTC on iOS. Events to it (retained until it attaches, and queued here
 * until the bridge exists at all): voipToken, engineState, incomingCall,
 * callAnswered, callActive, callEnded, muteChanged, holdChanged.
 *
 * A call for another company on the same login: the ready route answers
 * `switch` with that membership, and the engine re-registers with a token
 * minted for it (`?membership=`), so the leg is dialed to the right
 * credential while the page switches companies for its own UI.
 */
@objc(VoipPlugin)
public class VoipPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VoipPlugin"
    public let jsName = "WorkBenchVoip"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "register", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestMic", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "answer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endCall", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setMuted", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setHeld", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sendDigits", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "placeCall", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reportConnected", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "currentCalls", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSpeaker", returnType: CAPPluginReturnPromise),
    ]

    private let engine = VoipEngine.shared

    public override func load() {
        engine.plugin = self
        engine.flushQueued()
    }

    /// The page is up with calls on: PushKit token, engine registered, microphone asked for once.
    @objc func register(_ call: CAPPluginCall) {
        engine.registerForPushes()
        engine.wantConnected = true
        engine.ensureConnected(membership: nil)
        call.resolve(["token": engine.token as Any])
    }

    @objc func requestMic(_ call: CAPPluginCall) {
        engine.requestMic { ok in call.resolve(["granted": ok]) }
    }

    @objc func answer(_ call: CAPPluginCall) {
        guard let callId = call.getString("callId") else { return call.reject("callId required") }
        engine.answer(callId: callId)
        call.resolve()
    }

    /// Decline (ringing) or hang up (live) — through CallKit, so the system screen agrees.
    @objc func endCall(_ call: CAPPluginCall) {
        guard let callId = call.getString("callId") else { return call.reject("callId required") }
        engine.end(callId: callId, reason: call.getString("reason") ?? "user")
        call.resolve()
    }

    @objc func setMuted(_ call: CAPPluginCall) {
        guard let callId = call.getString("callId") else { return call.reject("callId required") }
        engine.setMuted(callId: callId, muted: call.getBool("muted") ?? true)
        call.resolve()
    }

    @objc func setHeld(_ call: CAPPluginCall) {
        guard let callId = call.getString("callId") else { return call.reject("callId required") }
        engine.setHeld(callId: callId, held: call.getBool("held") ?? true)
        call.resolve()
    }

    @objc func sendDigits(_ call: CAPPluginCall) {
        guard let callId = call.getString("callId"), let digits = call.getString("digits") else { return call.reject("callId and digits required") }
        engine.sendDigits(callId: callId, digits: digits)
        call.resolve()
    }

    /// The page placed a call (POST /api/app/line/call, via app); the server dials this credential next.
    @objc func placeCall(_ call: CAPPluginCall) {
        guard let callId = call.getString("callId") else { return call.reject("callId required") }
        engine.placeCall(callId: callId, label: call.getString("label") ?? "Call", number: call.getString("number"))
        call.resolve()
    }

    /// Outbound: the customer is on (the page watches the row) — CallKit's timer starts.
    @objc func reportConnected(_ call: CAPPluginCall) {
        guard let callId = call.getString("callId") else { return call.reject("callId required") }
        engine.reportConnected(callId: callId)
        call.resolve()
    }

    /// What the engine has right now — a page that just (re)loaded catches up from this.
    @objc func currentCalls(_ call: CAPPluginCall) {
        call.resolve(["calls": engine.snapshot(), "ready": engine.isReady, "speaker": engine.speakerOn])
    }

    /// Speakerphone on or off (the earpiece is the default on a phone call).
    @objc func setSpeaker(_ call: CAPPluginCall) {
        engine.setSpeaker(call.getBool("on") ?? true)
        call.resolve(["on": engine.speakerOn])
    }

    fileprivate func emit(_ event: String, _ data: [String: Any]) {
        notifyListeners(event, data: data, retainUntilConsumed: true)
    }
}

/// Lives for the whole process — PushKit must be registered at launch and
/// keep its delegate — while plugin instances come and go with the bridge.
final class VoipEngine: NSObject {
    static let shared = VoipEngine()

    weak var plugin: VoipPlugin?
    private(set) var token: String?
    private var queued: [(String, [String: Any])] = []

    private var registry: PKPushRegistry?
    private let provider: CXProvider
    private let controller = CXCallController()

    // MARK: Telnyx client
    private var client: TxClient?
    private var clientReady = false
    private var connecting = false
    /// The membership the client is logged in as: nil = the signed-in user, else a sibling's user id.
    private var loginMembership: String?
    private var wantMembership: String?
    private var retriedLogin = false
    private var connectStartedAt: Date?
    /// The page asked for the engine (signed in, calls on): reconnect on foreground.
    var wantConnected = false
    var isReady: Bool { clientReady }
    private(set) var speakerOn = false

    func setSpeaker(_ on: Bool) {
        speakerOn = on
        if on { client?.setSpeaker() } else { client?.setEarpiece() }
        emit("speakerChanged", ["on": on])
    }

    /// The SDK runs WebRTC in manual-audio mode and switches its audio OFF
    /// when it builds a call's media (Peer.configureAudioSession). CallKit
    /// activates the audio session when Answer is tapped — which in this
    /// flow is BEFORE the INVITE arrives and the media is built — so the
    /// activation the SDK needs has already happened by the time it resets.
    /// Result: a connected call with silence both ways. Once the call is up,
    /// hand the SDK the already-active session again (the SDK's own sample
    /// does the same, 0.75 s after answering).
    private func nudgeAudio(_ why: String) {
        guard let c = client else { return }
        let session = AVAudioSession.sharedInstance()
        if c.isAudioDeviceEnabled {
            trace("audio-ok", why)
            return
        }
        if session.category != .playAndRecord {
            // CallKit has not activated a voice session yet: didActivate will.
            trace("audio-wait", "\(why) category=\(session.category.rawValue)")
            return
        }
        trace("audio-nudge", why)
        c.enableAudioSession(audioSession: session)
        if speakerOn { c.setSpeaker() }
    }

    /// Background with no call: a clean disconnect, so Telnyx forgets this
    /// socket's registration now rather than whenever it notices the socket
    /// iOS froze — a stale registration is where a leg goes to die.
    func appBackgrounded() {
        guard calls.isEmpty, let c = client else { return }
        trace("background-disconnect")
        c.delegate = nil
        c.disconnect()
        client = nil
        clientReady = false
        connecting = false
    }

    func appForegrounded() {
        if wantConnected { ensureConnected(membership: nil) }
    }

    /// Breadcrumbs to the server log (`[voip-trace]`, POST /api/public/voip-trace):
    /// the engine runs where nothing else can see it. Fire-and-forget, no
    /// cookies, short strings only.
    private static let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "?"
    func trace(_ step: String, _ detail: String = "", callId: String? = nil) {
        NSLog("[voip] %@ %@ %@", step, callId ?? "", detail)
        var req = URLRequest(url: siteOrigin.appendingPathComponent("/api/public/voip-trace"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var body: [String: Any] = ["step": step, "detail": detail, "build": VoipEngine.build]
        if let c = callId { body["callId"] = c }
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        URLSession.shared.dataTask(with: req).resume()
    }

    enum Direction { case inbound, outbound }

    /// One business-line call as this engine knows it, keyed by our Call row id.
    struct Rec {
        let callId: String
        let uuid: UUID
        var sdk: Call?
        var direction: Direction
        var label: String
        var number: String?
        /// CallKit Answer tapped before the INVITE arrived: answer it the moment it lands.
        var answered = false
        var connected = false
        var muted = false
        var held = false
        var readyPosted = false
        var membership: String?
        var switched = false
        var endedByUs = false
    }
    private var calls: [String: Rec] = [:]
    private var byUUID: [UUID: String] = [:]
    private var bySdk: [UUID: String] = [:]
    /// A pushed call the INVITE never reaches must not ring forever.
    private var unclaimed: [String: Timer] = [:]
    private let unclaimedTimeoutS: TimeInterval = 45

    private override init() {
        let config = CXProviderConfiguration()
        config.supportsVideo = false
        // Two groups of one: a second call shows as call waiting (hold & accept), like a phone.
        config.maximumCallGroups = 2
        config.maximumCallsPerCallGroup = 1
        config.supportedHandleTypes = [.phoneNumber, .generic]
        config.includesCallsInRecents = true
        if let icon = UIImage(named: "AppIcon") { config.iconTemplateImageData = icon.pngData() }
        provider = CXProvider(configuration: config)
        super.init()
        provider.setDelegate(self, queue: nil)
    }

    // MARK: Events to the page

    private func emit(_ event: String, _ data: [String: Any]) {
        if let plugin = plugin { plugin.emit(event, data) } else { queued.append((event, data)) }
    }

    func flushQueued() {
        let pending = queued
        queued.removeAll()
        for (event, data) in pending { plugin?.emit(event, data) }
    }

    private func callData(_ r: Rec) -> [String: Any] {
        [
            "callId": r.callId,
            "direction": r.direction == .inbound ? "in" : "out",
            "label": r.label,
            "number": r.number ?? NSNull(),
            "answered": r.answered,
            "connected": r.connected,
            "muted": r.muted,
            "held": r.held,
        ]
    }

    func snapshot() -> [[String: Any]] { calls.values.map(callData) }

    // MARK: PushKit

    /// Idempotent: called at launch (AppDelegate) and again whenever the web
    /// side asks for the token, which re-sends the one we already hold.
    func registerForPushes() {
        if registry != nil {
            if let token = token { emit("voipToken", ["token": token]) }
            return
        }
        let r = PKPushRegistry(queue: .main)
        r.delegate = self
        r.desiredPushTypes = [.voIP]
        registry = r
    }

    func requestMic(_ done: @escaping (Bool) -> Void) {
        AVAudioSession.sharedInstance().requestRecordPermission { ok in
            DispatchQueue.main.async { done(ok) }
        }
    }

    // MARK: Connecting to Telnyx

    /// Register with Telnyx as the signed-in person (or, for a call of another
    /// company on this login, as that membership). A fresh token every time a
    /// socket is opened — they live minutes, not hours.
    func ensureConnected(membership: String?, fresh: Bool = false) {
        // `fresh`: a socket iOS may have frozen behind our back (a push into a
        // backgrounded app) is not trusted — a leg dialed to its registration
        // dies at Telnyx with 480. Unless a call is live on it, start over.
        if fresh, let c = client, calls.values.allSatisfy({ $0.sdk == nil }) {
            trace("connect-fresh", "was=\(c.isConnected() ? "connected" : "dead") ready=\(clientReady)")
            c.delegate = nil
            c.disconnect()
            client = nil
            clientReady = false
            connecting = false
            for id in calls.keys { calls[id]?.readyPosted = false }
        }
        if let c = client, c.isConnected(), loginMembership == membership, !connecting {
            trace("connected-already", "ready=\(clientReady)")
            if clientReady { flushReady() }
            return
        }
        // A connect that never came back (the app was suspended mid-handshake)
        // must not block every later push: after 8 s it is started over.
        if connecting && wantMembership == membership, let t = connectStartedAt, Date().timeIntervalSince(t) < 8 {
            trace("connect-in-flight")
            return
        }
        connecting = true
        connectStartedAt = Date()
        wantMembership = membership
        retriedLogin = false
        trace("connect-start", "membership=\(membership ?? "-")")
        Task { @MainActor in await self.connect(membership: membership) }
    }

    @MainActor
    private func connect(membership: String?) async {
        // The phone's own credential — never the browser's (a shared one had the
        // desktop bumped off the line every time the phone registered).
        var query: [String: String] = ["device": "ios"]
        if let m = membership { query["membership"] = m }
        let cookie = await siteCookieHeader()
        trace("grant-fetch", "cookies=\(cookie.split(separator: ";").count) session=\(cookie.contains("session-token"))")
        var status = 0
        var data = Data()
        do {
            (status, data) = try await siteRequest("/api/app/line/softphone", query: query)
        } catch {
            trace("grant-offline", error.localizedDescription)
            return finishConnect(nil, error: "offline", membership: membership)
        }
        if status == 401 {
            trace("grant-401")
            return finishConnect(nil, error: "signedOut", membership: membership)
        }
        guard status == 200, let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            trace("grant-status", "\(status) \(String(data: data.prefix(120), encoding: .utf8) ?? "")")
            return finishConnect(nil, error: "server", membership: membership)
        }
        if let off = j["off"] as? String {
            trace("grant-off", off)
            return finishConnect(nil, error: "off:\(off)", membership: membership)
        }
        guard let token = j["token"] as? String, !token.isEmpty else {
            trace("grant-no-token", (j["error"] as? String) ?? "")
            return finishConnect(nil, error: (j["error"] as? String) ?? "server", membership: membership)
        }
        trace("grant-ok", "sip=\((j["sipUsername"] as? String) ?? "?")")
        finishConnect(token, error: nil, membership: membership)
    }

    private func finishConnect(_ token: String?, error: String?, membership: String?) {
        guard let token = token else {
            connecting = false
            emit("engineState", ["ready": false, "error": error ?? "server"])
            // A pushed call on a phone that cannot register: let it ring out
            // so the server's own fallback takes over, unless it is signed out —
            // then nobody here can ever take it.
            if error == "signedOut" || (error ?? "").hasPrefix("off:") {
                for id in calls.keys where calls[id]?.sdk == nil { finish(id, reason: .failed, tell: "ineligible") }
            }
            return
        }
        client?.delegate = nil
        client?.disconnect()
        clientReady = false
        let c = TxClient()
        c.delegate = self
        client = c
        loginMembership = membership
        do {
            try c.connect(txConfig: TxConfig(token: token, logLevel: .none, reconnectClient: true))
            trace("telnyx-connecting")
        } catch {
            connecting = false
            trace("telnyx-connect-throw", error.localizedDescription)
            emit("engineState", ["ready": false, "error": "connect"])
        }
    }

    // MARK: The server: "I'm awake for this call"

    private func flushReady() {
        for id in calls.keys {
            guard let r = calls[id], r.direction == .inbound, r.sdk == nil, !r.readyPosted, r.membership == loginMembership else { continue }
            postReady(id)
        }
    }

    private func postReady(_ callId: String, attempt: Int = 0) {
        guard var r = calls[callId] else { return }
        r.readyPosted = true
        calls[callId] = r
        var json: [String: Any] = ["callId": callId]
        if let m = r.membership { json["membership"] = m }
        Task { @MainActor in
            var outcome = "error"
            var switchTo: String? = nil
            if let (status, data) = try? await siteRequest("/api/app/line/softphone/ready", method: "POST", json: json) {
                if status == 401 || status == 403 {
                    outcome = "ineligible"
                } else if status == 200, let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    outcome = (j["outcome"] as? String) ?? "late"
                    switchTo = j["userId"] as? String
                }
            }
            self.trace("ready-outcome", "\(outcome) switchTo=\(switchTo ?? "-") attempt=\(attempt)", callId: callId)
            guard var r = self.calls[callId], r.sdk == nil else { return }
            switch outcome {
            case "ringing", "already":
                break
            case "switch":
                // Another company on this login owns the call: register as that membership and ask again.
                if let u = switchTo, !r.switched {
                    r.switched = true
                    r.membership = u
                    r.readyPosted = false
                    self.calls[callId] = r
                    self.ensureConnected(membership: u)
                } else {
                    self.finish(callId, reason: .failed, tell: "ineligible")
                }
            case "late", "ineligible":
                self.finish(callId, reason: .answeredElsewhere, tell: outcome)
            default:
                if attempt < 2 {
                    r.readyPosted = false
                    self.calls[callId] = r
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { self.postReady(callId, attempt: attempt + 1) }
                }
            }
        }
    }

    // MARK: Calls: creation

    private func handle(label: String, number: String?) -> CXHandle {
        if let n = number, !n.isEmpty { return CXHandle(type: .phoneNumber, value: n) }
        return CXHandle(type: .generic, value: label)
    }

    /// A call reaching the phone (from a push, or an INVITE that beat the push): the system screen rings.
    private func reportIncoming(callId: String, label: String, number: String?, sdk: Call?) {
        if var r = calls[callId] {
            if r.sdk == nil, let sdk = sdk { attach(sdk, to: &r) }
            return
        }
        let uuid = UUID()
        var r = Rec(callId: callId, uuid: uuid, sdk: nil, direction: .inbound, label: label, number: number)
        if let sdk = sdk { attach(sdk, to: &r) }
        calls[callId] = r
        byUUID[uuid] = callId
        let update = CXCallUpdate()
        update.remoteHandle = handle(label: label, number: number)
        update.localizedCallerName = label
        update.hasVideo = false
        update.supportsHolding = true
        update.supportsDTMF = true
        update.supportsGrouping = false
        update.supportsUngrouping = false
        provider.reportNewIncomingCall(with: uuid, update: update) { error in
            if let error = error {
                NSLog("[voip] reportNewIncomingCall failed: %@", error.localizedDescription)
                DispatchQueue.main.async {
                    // Busy on another call and CallKit refused a third: the server rings on elsewhere.
                    self.calls[callId]?.sdk?.hangup()
                    self.forget(callId)
                }
            }
        }
        emit("incomingCall", ["callId": callId, "label": label, "number": number ?? NSNull()])
        trace("callkit-reported", "sdk=\(sdk != nil)", callId: callId)
        if sdk == nil {
            unclaimed[callId]?.invalidate()
            unclaimed[callId] = Timer.scheduledTimer(withTimeInterval: unclaimedTimeoutS, repeats: false) { [weak self] _ in
                guard let self = self, let r = self.calls[callId], r.sdk == nil else { return }
                self.trace("unclaimed-timeout", "answered=\(r.answered)", callId: callId)
                self.finish(callId, reason: r.answered ? .failed : .unanswered, tell: r.answered ? "failed" : "unanswered")
            }
        }
    }

    /// The SIP leg for a known call arrived: from here on the SDK call is the call.
    private func attach(_ sdk: Call, to r: inout Rec) {
        r.sdk = sdk
        if let id = sdk.callInfo?.callId { bySdk[id] = r.callId }
        unclaimed[r.callId]?.invalidate()
        unclaimed[r.callId] = nil
        calls[r.callId] = r
        trace("invite-attached", "answered=\(r.answered)", callId: r.callId)
        if r.answered {
            sdk.answer()
            emit("callAnswered", ["callId": r.callId])
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.75) { self.nudgeAudio("after-attach-answer") }
        }
    }

    func placeCall(callId: String, label: String, number: String?) {
        if calls[callId] != nil { return }
        let uuid = UUID()
        calls[callId] = Rec(callId: callId, uuid: uuid, sdk: nil, direction: .outbound, label: label, number: number, answered: true)
        byUUID[uuid] = callId
        let action = CXStartCallAction(call: uuid, handle: handle(label: label, number: number))
        action.contactIdentifier = label
        controller.request(CXTransaction(action: action)) { error in
            if let error = error {
                NSLog("[voip] start call failed: %@", error.localizedDescription)
                DispatchQueue.main.async { self.forget(callId) }
            }
        }
        ensureConnected(membership: nil)
    }

    func reportConnected(callId: String) {
        guard var r = calls[callId] else { return }
        r.connected = true
        calls[callId] = r
        if r.direction == .outbound { provider.reportOutgoingCall(with: r.uuid, connectedAt: Date()) }
        emit("callActive", ["callId": callId])
    }

    // MARK: Calls: the page's taps go through CallKit, so the system screen agrees

    func answer(callId: String) {
        guard let r = calls[callId] else { return }
        request(CXAnswerCallAction(call: r.uuid))
    }

    func end(callId: String, reason: String) {
        guard let r = calls[callId] else { return }
        request(CXEndCallAction(call: r.uuid))
    }

    func setMuted(callId: String, muted: Bool) {
        guard let r = calls[callId] else { return }
        request(CXSetMutedCallAction(call: r.uuid, muted: muted))
    }

    func setHeld(callId: String, held: Bool) {
        guard let r = calls[callId] else { return }
        request(CXSetHeldCallAction(call: r.uuid, onHold: held))
    }

    func sendDigits(callId: String, digits: String) {
        calls[callId]?.sdk?.dtmf(dtmf: digits)
    }

    private func request(_ action: CXAction) {
        controller.request(CXTransaction(action: action)) { error in
            if let error = error { NSLog("[voip] %@ failed: %@", String(describing: type(of: action)), error.localizedDescription) }
        }
    }

    // MARK: Calls: ending

    /// The call is over as far as this phone is concerned: CallKit, the page, the maps.
    private func finish(_ callId: String, reason: CXCallEndedReason, tell: String) {
        guard let r = calls[callId] else { return }
        if !r.endedByUs { provider.reportCall(with: r.uuid, endedAt: Date(), reason: reason) }
        emit("callEnded", ["callId": callId, "reason": tell])
        forget(callId)
    }

    private func forget(_ callId: String) {
        unclaimed[callId]?.invalidate()
        unclaimed[callId] = nil
        if let r = calls.removeValue(forKey: callId) {
            byUUID[r.uuid] = nil
            if let id = r.sdk?.callInfo?.callId { bySdk[id] = nil }
        }
        if calls.isEmpty { speakerOn = false }
    }

    private func hold(_ r: Rec, _ on: Bool) {
        if on { r.sdk?.hold() } else { r.sdk?.unhold() }
        // The SDK's hold only quiets our leg; the other party gets hold music from the server.
        Task { @MainActor in
            _ = try? await siteRequest("/api/app/line/call", method: "PATCH", json: ["id": r.callId, "hold": on])
        }
    }
}

// MARK: - PushKit

extension VoipEngine: PKPushRegistryDelegate {
    func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
        guard type == .voIP else { return }
        let hex = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
        token = hex
        emit("voipToken", ["token": hex])
    }

    func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        guard type == .voIP else { return }
        token = nil
        emit("voipToken", ["token": NSNull()])
    }

    func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
        guard type == .voIP else { return completion() }
        let dict = payload.dictionaryPayload
        let callId = dict["callId"] as? String ?? UUID().uuidString
        let label = dict["label"] as? String ?? "Incoming call"
        let number = dict["number"] as? String
        // Report FIRST, synchronously — the rule that keeps the app alive.
        reportIncoming(callId: callId, label: label, number: number, sdk: nil)
        trace("push", "state=\(UIApplication.shared.applicationState.rawValue) client=\(client == nil ? "none" : (client!.isConnected() ? "connected" : "dead")) ready=\(clientReady)", callId: callId)
        // Then wake the engine; when it is registered it tells the server (flushReady).
        ensureConnected(membership: nil, fresh: true)
        completion()
    }
}

// MARK: - CallKit: the person acting on the system screen (or the page, via CXCallController)

extension VoipEngine: CXProviderDelegate {
    func providerDidReset(_ provider: CXProvider) {
        for id in Array(calls.keys) {
            calls[id]?.sdk?.hangup()
            emit("callEnded", ["callId": id, "reason": "reset"])
        }
        calls.removeAll()
        byUUID.removeAll()
        bySdk.removeAll()
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        guard let id = byUUID[action.callUUID], var r = calls[id] else { return action.fail() }
        r.answered = true
        calls[id] = r
        trace("callkit-answer", "sdk=\(r.sdk != nil) ready=\(clientReady)", callId: id)
        if let sdk = r.sdk {
            sdk.answer()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.75) { self.nudgeAudio("after-callkit-answer") }
        }
        // No INVITE yet (pushed call, engine still registering): attach() answers it on arrival.
        emit("callAnswered", ["callId": id])
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        guard let id = byUUID[action.callUUID], var r = calls[id] else { return action.fail() }
        r.endedByUs = true
        calls[id] = r
        // Not yet on the line: ringing, or answered on the lock screen while the
        // leg was still on its way. Either way the server must hear it, or the
        // caller sits on ringback until the leg times out.
        let ringingInbound = r.direction == .inbound && (!r.answered || r.sdk == nil)
        let dialingOutbound = r.direction == .outbound && !r.connected
        Task { @MainActor in
            // The server hears it FIRST: a leg that merely drops means "try
            // elsewhere"; Decline means voicemail, and an outbound hangup
            // before the customer is on must drop their leg too.
            if ringingInbound {
                _ = try? await siteRequest("/api/app/line/call/decline", method: "POST", json: ["id": id])
            } else if dialingOutbound {
                _ = try? await siteRequest("/api/app/line/call", query: ["id": id], method: "DELETE")
            }
        }
        trace("callkit-end", "ringing=\(ringingInbound) dialing=\(dialingOutbound)", callId: id)
        r.sdk?.hangup()
        emit("callEnded", ["callId": id, "reason": ringingInbound ? "declined" : "user"])
        forget(id)
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        guard let id = byUUID[action.callUUID], calls[id] != nil else { return action.fail() }
        provider.reportOutgoingCall(with: action.callUUID, startedConnectingAt: Date())
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        guard let id = byUUID[action.callUUID], var r = calls[id] else { return action.fail() }
        if action.isMuted { r.sdk?.muteAudio() } else { r.sdk?.unmuteAudio() }
        r.muted = action.isMuted
        calls[id] = r
        emit("muteChanged", ["callId": id, "muted": action.isMuted])
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXSetHeldCallAction) {
        guard let id = byUUID[action.callUUID], var r = calls[id] else { return action.fail() }
        hold(r, action.isOnHold)
        r.held = action.isOnHold
        calls[id] = r
        emit("holdChanged", ["callId": id, "held": action.isOnHold])
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXPlayDTMFCallAction) {
        guard let id = byUUID[action.callUUID] else { return action.fail() }
        calls[id]?.sdk?.dtmf(dtmf: action.digits)
        action.fulfill()
    }

    func provider(_ provider: CXProvider, timedOutPerforming action: CXAction) {
        action.fail()
    }

    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        trace("audio-activate", "client=\(client != nil) calls=\(calls.values.filter { $0.sdk != nil }.count)")
        client?.enableAudioSession(audioSession: audioSession)
        if speakerOn { client?.setSpeaker() }
        // Media built before this activation (the INVITE beat the tap) is
        // covered here; media built after it is covered by nudgeAudio.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { self.nudgeAudio("after-activate") }
        emit("audioActivated", [:])
    }

    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        client?.disableAudioSession(audioSession: audioSession)
        emit("audioDeactivated", [:])
    }
}

// MARK: - Telnyx

extension VoipEngine: TxClientDelegate {
    private func header(_ call: Call, _ name: String) -> String? {
        guard let h = call.inviteCustomHeaders else { return nil }
        if let v = h[name] { return v }
        let lower = name.lowercased()
        return h.first { $0.key.lowercased() == lower }?.value
    }

    func onSocketConnected() {}

    func onSocketDisconnected() {
        DispatchQueue.main.async {
            self.trace("telnyx-disconnected", "pending=\(self.calls.values.filter { $0.sdk == nil }.count)")
            self.clientReady = false
            self.emit("engineState", ["ready": false])
            // A call is waiting on this registration: come back on a fresh
            // socket and ask for the leg again (the server dials it anew).
            if self.calls.values.contains(where: { $0.sdk == nil }) {
                self.ensureConnected(membership: self.wantMembership, fresh: true)
            }
        }
    }

    func onClientError(error: Error) {
        DispatchQueue.main.async {
            self.trace("telnyx-error", error.localizedDescription)
            self.clientReady = false
            if self.connecting, !self.retriedLogin {
                // One more try with a fresh token (the old one may simply have expired).
                self.retriedLogin = true
                let m = self.wantMembership
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) { Task { @MainActor in await self.connect(membership: m) } }
                return
            }
            self.connecting = false
            self.emit("engineState", ["ready": false, "error": "telnyx"])
        }
    }

    func onClientReady() {
        DispatchQueue.main.async {
            self.trace("telnyx-ready", "pending=\(self.calls.values.filter { $0.sdk == nil }.count)")
            self.clientReady = true
            self.connecting = false
            self.emit("engineState", ["ready": true])
            // A moment for the fresh registration to be routable before the
            // server dials it — a leg dialed the same second never arrived.
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
                guard let self = self, self.clientReady else { return }
                self.flushReady()
            }
        }
    }

    func onPushDisabled(success: Bool, message: String) {}
    func onSessionUpdated(sessionId: String) {}
    func onPushCall(call: Call) {}

    func onIncomingCall(call: Call) {
        DispatchQueue.main.async {
            let ourId = self.header(call, "X-WB-Call-Id")
            let outbound = self.header(call, "X-WB-Outbound") == "1"
            self.trace("invite", "headers=\((call.inviteCustomHeaders ?? [:]).keys.sorted().joined(separator: ",")) outbound=\(outbound) known=\(ourId.map { self.calls[$0] != nil } ?? false)", callId: ourId)
            if outbound {
                // Our own outbound call's leg: pick up, the server dials the customer next.
                // A leg for a call placed from a browser also forks here — leave
                // it alone; Telnyx cancels it when that browser answers.
                guard let id = ourId, var r = self.calls[id], r.direction == .outbound else { return }
                r.sdk = call
                if let sid = call.callInfo?.callId { self.bySdk[sid] = id }
                self.calls[id] = r
                call.answer()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.75) { self.nudgeAudio("after-outbound-answer") }
                return
            }
            let id = ourId ?? "sip:\(call.callInfo?.callId.uuidString ?? UUID().uuidString)"
            let label = call.callInfo?.callerName ?? call.callInfo?.callerNumber ?? "Incoming call"
            // Known from a push: attach (and answer, if Answer was already tapped). Otherwise the INVITE beat the push: ring now.
            self.reportIncoming(callId: id, label: label, number: call.callInfo?.callerNumber, sdk: call)
        }
    }

    func onCallStateUpdated(callState: CallState, callId: UUID) {
        DispatchQueue.main.async {
            guard let id = self.bySdk[callId], var r = self.calls[id] else { return }
            self.trace("call-state", "\(callState) audio=\(self.client?.isAudioDeviceEnabled ?? false)", callId: id)
            switch callState {
            case .ACTIVE:
                self.nudgeAudio("active")
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { self.nudgeAudio("active+1s") }
                if r.direction == .inbound && !r.connected {
                    r.connected = true
                    self.calls[id] = r
                    self.emit("callActive", ["callId": id])
                } else if r.held {
                    r.held = false
                    self.calls[id] = r
                    self.emit("holdChanged", ["callId": id, "held": false])
                }
            case .HELD:
                if !r.held {
                    r.held = true
                    self.calls[id] = r
                    self.emit("holdChanged", ["callId": id, "held": true])
                }
            case .DONE, .DROPPED:
                self.finish(id, reason: .remoteEnded, tell: "remoteEnded")
            default:
                break
            }
        }
    }

    func onRemoteCallEnded(callId: UUID, reason: CallTerminationReason?) {
        DispatchQueue.main.async {
            guard let id = self.bySdk[callId] else { return }
            self.finish(id, reason: .remoteEnded, tell: "remoteEnded")
        }
    }
}
