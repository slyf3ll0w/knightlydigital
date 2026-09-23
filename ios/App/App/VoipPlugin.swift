import Foundation
import Capacitor
import CallKit
import PushKit
import AVFoundation

/**
 * WorkBenchVoip — the business line ringing the iPhone when the app is
 * closed (tier 3 of docs/plans/business-line-voice-2026-09-18.md).
 *
 * Two Apple frameworks, one contract with the web side
 * (lib/native-voip.ts + components/Softphone.tsx):
 *
 *   PushKit   the server sends a VoIP push per registered device when a
 *             call comes in (lib/voip.ts). iOS launches the app for it even
 *             when it was swiped away.
 *   CallKit   EVERY VoIP push must report an incoming call synchronously
 *             inside the push handler — Apple terminates the app and then
 *             throttles its pushes when one doesn't. So the native call
 *             screen appears first, before the webview has even loaded,
 *             and the web side catches up: it registers its softphone,
 *             tells the server it is awake, receives the SIP INVITE and,
 *             if the person already tapped Answer here, answers it.
 *
 * Events to the web side (retained until the page attaches a listener, so
 * a cold start never misses them): voipToken, incomingCall, callAnswered,
 * callEnded, muteChanged, audioActivated.
 *
 * The audio session belongs to CallKit: it is configured for a voice chat
 * and activated when the system says so (didActivate), which is what lets
 * the WebRTC audio keep flowing after the phone locks or the app is
 * backgrounded ("audio" + "voip" in UIBackgroundModes).
 */
@objc(VoipPlugin)
public class VoipPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VoipPlugin"
    public let jsName = "WorkBenchVoip"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "register", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reportIncoming", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reportConnected", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endCall", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startOutgoing", returnType: CAPPluginReturnPromise),
    ]

    private let engine = VoipEngine.shared

    public override func load() {
        engine.plugin = self
    }

    @objc func register(_ call: CAPPluginCall) {
        engine.registerForPushes()
        call.resolve(["token": engine.token as Any])
    }

    /// The SIP INVITE reached the page before (or without) a push: show the
    /// system call screen for it. A call already reported (by a push) is a no-op.
    @objc func reportIncoming(_ call: CAPPluginCall) {
        guard let callId = call.getString("callId") else { return call.reject("callId required") }
        engine.reportIncoming(callId: callId, label: call.getString("label") ?? "Incoming call", number: call.getString("number"))
        call.resolve()
    }

    @objc func reportConnected(_ call: CAPPluginCall) {
        guard let callId = call.getString("callId") else { return call.reject("callId required") }
        engine.reportConnected(callId: callId)
        call.resolve()
    }

    @objc func endCall(_ call: CAPPluginCall) {
        guard let callId = call.getString("callId") else { return call.reject("callId required") }
        engine.end(callId: callId, reason: call.getString("reason") ?? "remoteEnded")
        call.resolve()
    }

    /// A call placed from the app: CallKit shows it as outgoing so the audio
    /// session and the lock-screen controls behave like a phone call.
    @objc func startOutgoing(_ call: CAPPluginCall) {
        guard let callId = call.getString("callId") else { return call.reject("callId required") }
        engine.startOutgoing(callId: callId, label: call.getString("label") ?? "Call", number: call.getString("number"))
        call.resolve()
    }

    fileprivate func emit(_ event: String, _ data: [String: Any]) {
        notifyListeners(event, data: data, retainUntilConsumed: true)
    }
}

/// Lives for the whole process — PushKit must be registered at launch and
/// keep its delegate — while plugin instances come and go with the bridge.
final class VoipEngine: NSObject, PKPushRegistryDelegate, CXProviderDelegate {
    static let shared = VoipEngine()

    weak var plugin: VoipPlugin?
    private(set) var token: String?

    private var registry: PKPushRegistry?
    private let provider: CXProvider
    private let controller = CXCallController()

    /// Our call id ↔ CallKit's UUID, for every call CallKit knows about.
    private var uuids: [String: UUID] = [:]
    private var callIds: [UUID: String] = [:]
    /// Calls reported from a push that the page has not claimed yet.
    private var unclaimed: [String: Timer] = [:]

    /// A call the page never claims (signed-out phone, page failed to load)
    /// must not ring forever: the system screen is dismissed as unanswered.
    private let unclaimedTimeoutS: TimeInterval = 45

    private override init() {
        let config = CXProviderConfiguration()
        config.supportsVideo = false
        config.maximumCallGroups = 1
        config.maximumCallsPerCallGroup = 1
        config.supportedHandleTypes = [.phoneNumber, .generic]
        config.includesCallsInRecents = true
        if let icon = UIImage(named: "AppIcon") { config.iconTemplateImageData = icon.pngData() }
        provider = CXProvider(configuration: config)
        super.init()
        provider.setDelegate(self, queue: nil)
    }

    // MARK: PushKit

    func registerForPushes() {
        if registry != nil {
            if let token = token { plugin?.emit("voipToken", ["token": token]) }
            return
        }
        let r = PKPushRegistry(queue: .main)
        r.delegate = self
        r.desiredPushTypes = [.voIP]
        registry = r
    }

    func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
        guard type == .voIP else { return }
        let hex = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
        token = hex
        plugin?.emit("voipToken", ["token": hex])
    }

    func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        guard type == .voIP else { return }
        token = nil
        plugin?.emit("voipToken", ["token": NSNull()])
    }

    func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
        guard type == .voIP else { return completion() }
        let dict = payload.dictionaryPayload
        let callId = dict["callId"] as? String ?? UUID().uuidString
        let label = dict["label"] as? String ?? "Incoming call"
        let number = dict["number"] as? String
        // Report FIRST, synchronously — the rule that keeps the app alive.
        reportIncoming(callId: callId, label: label, number: number, fromPush: true)
        plugin?.emit("incomingCall", ["callId": callId, "label": label, "number": number ?? NSNull()])
        completion()
    }

    // MARK: CallKit reports (from a push, or from the page)

    func reportIncoming(callId: String, label: String, number: String?, fromPush: Bool = false) {
        if uuids[callId] != nil { return }
        let uuid = UUID()
        uuids[callId] = uuid
        callIds[uuid] = callId
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
                self.forget(callId)
            }
        }
        if fromPush {
            unclaimed[callId]?.invalidate()
            unclaimed[callId] = Timer.scheduledTimer(withTimeInterval: unclaimedTimeoutS, repeats: false) { [weak self] _ in
                guard let self = self, self.unclaimed[callId] != nil else { return }
                self.end(callId: callId, reason: "unanswered")
            }
        }
    }

    func reportConnected(callId: String) {
        claim(callId)
        guard let uuid = uuids[callId] else { return }
        provider.reportOutgoingCall(with: uuid, connectedAt: Date())
    }

    func end(callId: String, reason: String) {
        claim(callId)
        guard let uuid = uuids[callId] else { return }
        let r: CXCallEndedReason
        switch reason {
        case "unanswered": r = .unanswered
        case "failed": r = .failed
        case "answeredElsewhere": r = .answeredElsewhere
        case "declined": r = .declinedElsewhere
        default: r = .remoteEnded
        }
        provider.reportCall(with: uuid, endedAt: Date(), reason: r)
        forget(callId)
    }

    func startOutgoing(callId: String, label: String, number: String?) {
        if uuids[callId] != nil { return }
        let uuid = UUID()
        uuids[callId] = uuid
        callIds[uuid] = callId
        let action = CXStartCallAction(call: uuid, handle: handle(label: label, number: number))
        action.contactIdentifier = label
        controller.request(CXTransaction(action: action)) { error in
            if let error = error {
                NSLog("[voip] start call failed: %@", error.localizedDescription)
                self.forget(callId)
            } else {
                self.provider.reportOutgoingCall(with: uuid, startedConnectingAt: Date())
            }
        }
    }

    private func handle(label: String, number: String?) -> CXHandle {
        if let n = number, !n.isEmpty { return CXHandle(type: .phoneNumber, value: n) }
        return CXHandle(type: .generic, value: label)
    }

    /// The page knows about this call now: stop the unclaimed watchdog.
    private func claim(_ callId: String) {
        unclaimed[callId]?.invalidate()
        unclaimed[callId] = nil
    }

    private func forget(_ callId: String) {
        claim(callId)
        if let uuid = uuids.removeValue(forKey: callId) { callIds[uuid] = nil }
    }

    // MARK: CXProviderDelegate — the person acting on the system screen

    func providerDidReset(_ provider: CXProvider) {
        for callId in uuids.keys { plugin?.emit("callEnded", ["callId": callId, "reason": "reset"]) }
        uuids.removeAll()
        callIds.removeAll()
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        guard let callId = callIds[action.callUUID] else { return action.fail() }
        claim(callId)
        configureAudioSession()
        plugin?.emit("callAnswered", ["callId": callId])
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        guard let callId = callIds[action.callUUID] else { return action.fail() }
        plugin?.emit("callEnded", ["callId": callId, "reason": "user"])
        forget(callId)
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        configureAudioSession()
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        guard let callId = callIds[action.callUUID] else { return action.fail() }
        plugin?.emit("muteChanged", ["callId": callId, "muted": action.isMuted])
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXSetHeldCallAction) {
        guard let callId = callIds[action.callUUID] else { return action.fail() }
        plugin?.emit("holdChanged", ["callId": callId, "held": action.isOnHold])
        action.fulfill()
    }

    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        plugin?.emit("audioActivated", [:])
    }

    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        plugin?.emit("audioDeactivated", [:])
    }

    private func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth, .allowBluetoothA2DP])
        } catch {
            NSLog("[voip] audio session: %@", error.localizedDescription)
        }
    }
}
