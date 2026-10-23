import Foundation
import UIKit
import Capacitor
import CoreLocation
import SquareMobilePaymentsSDK
#if DEBUG
import MockReaderUI
#endif

/**
 * WorkBenchTapToPay — Square's Mobile Payments SDK in the iPhone app, so a
 * tech can take a card by holding it to the back of the phone (Tap to Pay
 * on iPhone). The web page (components/TapToPayButton.tsx via
 * lib/native-tap-to-pay.ts) drives it:
 *
 *   status()              configured / capable / authorized / Apple ID linked
 *   requestPermissions()  location "while using" — Square requires it for
 *                         every in-person payment
 *   authorize(...)        the seller's OAuth token + location id from
 *                         GET /api/app/square/mobile-token; the SDK keeps it
 *   linkAppleAccount()    Apple's Tap to Pay terms sheet, once per phone
 *   pay(...)              Square's own prompt UI; resolves with the Square
 *                         payment id, which the page hands to
 *                         POST /api/app/invoices/[id]/tap-payment
 *   deauthorize()         sign-out / company switch
 *
 * The SDK is initialized at launch (AppDelegate) with the application id
 * from Info.plist `SquareApplicationID`; an empty value leaves everything
 * reporting `configured: false` and the page shows no Tap to Pay button.
 *
 * Requirements that live outside this file (docs/plans/native-release-queue.md):
 * the Tap to Pay entitlement (com.apple.developer.proximity-reader.payment.acceptance),
 * the SquareMobilePaymentsSDK package + its `setup` run-script build phase,
 * the application signature registered in Square's Developer Console, and
 * iOS 16.0 as the deployment target (the package floor). API names below were
 * checked against SquareMobilePaymentsSDK 2.6.0's generated header
 * (SquareMobilePaymentsSDK-Swift.h) on 2026-10-22 — not yet compiled on a Mac.
 * Plan: docs/plans/checkout-tap-to-pay-2026-10-22.md § 2.
 */
@objc(TapToPayPlugin)
public class TapToPayPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "TapToPayPlugin"
    public let jsName = "WorkBenchTapToPay"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deauthorize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "linkAppleAccount", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pay", returnType: CAPPluginReturnPromise),
    ]

    /// Set by AppDelegate once `MobilePaymentsSDK.initialize` ran with a real application id.
    static var configured = false

    private let locationManager = CLLocationManager()
    private var locationWaiters: [(Bool) -> Void] = []
    private var activePayment: PaymentHandle?
    private var paymentDelegate: PaymentDelegateBox?
#if DEBUG
    /// Sandbox test builds: Square's floating mock reader (the sandbox has no real
    /// readers and never moves money). Shown after a sandbox authorize, hidden on
    /// deauthorize. MockReaderUI is linked for every configuration (SPM has no
    /// per-configuration products) but only Debug imports and uses it, and only
    /// in the sandbox environment, per Square's rule.
    private var mockReaderUI: MockReaderUI?
#endif

    private var isSandbox: Bool {
        if case .production = sdk.settingsManager.sdkSettings.environment { return false }
        return true
    }

    private func mockReader(show: Bool) {
#if DEBUG
        guard isSandbox else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            if show {
                if self.mockReaderUI == nil { self.mockReaderUI = try? MockReaderUI(for: self.sdk) }
                try? self.mockReaderUI?.present()
            } else {
                self.mockReaderUI?.dismiss()
            }
        }
#endif
    }

    public override func load() {
        locationManager.delegate = self
    }

    private var sdk: MobilePaymentsSDK { MobilePaymentsSDK.shared }

    // MARK: status

    @objc func status(_ call: CAPPluginCall) {
        guard TapToPayPlugin.configured else {
            call.resolve([
                "platform": "ios", "configured": false, "capable": false, "authorized": false,
                "locationId": NSNull(), "appleLinked": NSNull(), "environment": NSNull(),
            ])
            return
        }
        let authorized = sdk.authorizationManager.state == .authorized
        let locationId = sdk.authorizationManager.location?.id
        let environment: String = {
            switch sdk.settingsManager.sdkSettings.environment {
            case .production: return "production"
            default: return "sandbox"
            }
        }()
        let settings = sdk.readerManager.tapToPaySettings
        // Sandbox test build: the mock reader stands in for the phone's NFC and
        // Apple's Tap to Pay terms, so neither gate applies.
        if isSandbox {
            if authorized { mockReader(show: true) }
            call.resolve([
                "platform": "ios", "configured": true, "capable": true, "authorized": authorized,
                "locationId": locationId ?? NSNull(), "appleLinked": true, "environment": environment,
            ])
            return
        }
        let capable = settings.isDeviceCapable
        // Only ask about the Apple ID once the seller is authorized; the
        // SDK answers false (not an error) before that.
        guard capable, authorized else {
            call.resolve([
                "platform": "ios", "configured": true, "capable": capable, "authorized": authorized,
                "locationId": locationId ?? NSNull(), "appleLinked": NSNull(), "environment": environment,
            ])
            return
        }
        settings.isAppleAccountLinked { linked, _ in
            call.resolve([
                "platform": "ios", "configured": true, "capable": true, "authorized": true,
                "locationId": locationId ?? NSNull(), "appleLinked": linked, "environment": environment,
            ])
        }
    }

    // MARK: permissions

    @objc func requestPermissions(_ call: CAPPluginCall) {
        let current = locationManager.authorizationStatus
        switch current {
        case .authorizedWhenInUse, .authorizedAlways:
            call.resolve(["location": true])
        case .notDetermined:
            locationWaiters.append { ok in call.resolve(["location": ok]) }
            locationManager.requestWhenInUseAuthorization()
        default:
            call.resolve(["location": false])
        }
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let s = manager.authorizationStatus
        guard s != .notDetermined else { return }
        let ok = s == .authorizedWhenInUse || s == .authorizedAlways
        let waiters = locationWaiters
        locationWaiters = []
        waiters.forEach { $0(ok) }
    }

    // MARK: authorization

    @objc func authorize(_ call: CAPPluginCall) {
        guard TapToPayPlugin.configured else { return call.reject("Tap to Pay is not configured in this build", "SDK_NOT_CONFIGURED") }
        guard let token = call.getString("accessToken"), let locationId = call.getString("locationId") else {
            return call.reject("accessToken and locationId required", "USAGE_ERROR")
        }
        let wanted = call.getString("environment") ?? "production"
        let have: String = {
            switch sdk.settingsManager.sdkSettings.environment {
            case .production: return "production"
            default: return "sandbox"
            }
        }()
        // A sandbox token on a production build (or the reverse) can never
        // authorize — say so instead of letting the SDK time out.
        guard wanted == have else {
            return call.reject("This build runs Square \(have); the account token is \(wanted)", "ENVIRONMENT_MISMATCH")
        }
        if sdk.authorizationManager.state == .authorized {
            call.resolve(["ok": true])
            return
        }
        sdk.authorizationManager.authorize(withAccessToken: token, locationID: locationId) { error in
            if let error = error {
                call.reject(error.localizedDescription, "NOT_AUTHORIZED", error)
            } else {
                self.mockReader(show: true)
                call.resolve(["ok": true])
            }
        }
    }

    @objc func deauthorize(_ call: CAPPluginCall) {
        guard TapToPayPlugin.configured, sdk.authorizationManager.state == .authorized else {
            call.resolve()
            return
        }
        mockReader(show: false)
        sdk.authorizationManager.deauthorize { call.resolve() }
    }

    // MARK: Apple ID (Tap to Pay on iPhone terms)

    @objc func linkAppleAccount(_ call: CAPPluginCall) {
        guard TapToPayPlugin.configured else { return call.reject("Tap to Pay is not configured in this build", "SDK_NOT_CONFIGURED") }
        if isSandbox { return call.resolve(["linked": true]) } // mock reader: no Apple terms sheet
        let settings = sdk.readerManager.tapToPaySettings
        settings.isAppleAccountLinked { linked, _ in
            if linked {
                call.resolve(["linked": true])
                return
            }
            DispatchQueue.main.async {
                settings.linkAppleAccount { error in
                    if let error = error {
                        call.reject(error.localizedDescription, "APPLE_NOT_LINKED", error)
                    } else {
                        call.resolve(["linked": true])
                    }
                }
            }
        }
    }

    // MARK: payment

    @objc func pay(_ call: CAPPluginCall) {
        guard TapToPayPlugin.configured else { return call.reject("Tap to Pay is not configured in this build", "SDK_NOT_CONFIGURED") }
        guard sdk.authorizationManager.state == .authorized else { return call.reject("Square is not authorized on this phone", "NOT_AUTHORIZED") }
        guard let cents = call.getInt("amountCents"), cents > 0 else { return call.reject("amountCents required", "USAGE_ERROR") }
        guard activePayment == nil else { return call.reject("A payment is already in progress", "BUSY") }
        let attemptId = call.getString("paymentAttemptId") ?? UUID().uuidString
        // USD only — the server records in dollars and every seller is US.
        guard (call.getString("currency") ?? "USD").uppercased() == "USD" else {
            return call.reject("Only USD payments are supported", "USAGE_ERROR")
        }

        let parameters = PaymentParameters(
            paymentAttemptID: attemptId,
            amountMoney: Money(amount: UInt(cents), currency: .USD),
            processingMode: .onlineOnly
        )
        if let referenceId = call.getString("referenceId") { parameters.referenceID = String(referenceId.prefix(40)) }
        if let note = call.getString("note") { parameters.note = String(note.prefix(500)) }

        // Square's own prompt UI ("Hold card here", the result screen).
        let prompt = PromptParameters(mode: .default, additionalMethods: .all)

        DispatchQueue.main.async { [weak self] in
            guard let self = self, let presenter = self.bridge?.viewController else {
                call.reject("No view controller to present from", "USAGE_ERROR")
                return
            }
            let box = PaymentDelegateBox(
                onFinish: { [weak self] payment in
                    self?.activePayment = nil
                    self?.paymentDelegate = nil
                    var result: [String: Any] = ["paymentId": payment.id ?? "", "status": "COMPLETED"]
                    if let online = payment as? OnlinePayment, let card = online.cardDetails?.card {
                        result["cardBrand"] = "\(card.cardBrand)"
                        result["last4"] = card.last4 ?? ""
                    }
                    call.resolve(result)
                },
                onFail: { [weak self] error in
                    self?.activePayment = nil
                    self?.paymentDelegate = nil
                    let code = (error as NSError).code
                    let name = PaymentDelegateBox.codeName(for: error)
                    call.reject("\(error.localizedDescription) (\(code))", name, error)
                },
                onCancel: { [weak self] in
                    self?.activePayment = nil
                    self?.paymentDelegate = nil
                    call.reject("Cancelled", "CANCELED")
                }
            )
            self.paymentDelegate = box
            self.activePayment = self.sdk.paymentManager.startPayment(parameters, promptParameters: prompt, from: presenter, delegate: box)
        }
    }
}

/// The SDK's delegate is a class protocol; this keeps the callbacks per payment.
final class PaymentDelegateBox: NSObject, PaymentManagerDelegate {
    private let onFinish: (Payment) -> Void
    private let onFail: (Error) -> Void
    private let onCancel: () -> Void

    init(onFinish: @escaping (Payment) -> Void, onFail: @escaping (Error) -> Void, onCancel: @escaping () -> Void) {
        self.onFinish = onFinish
        self.onFail = onFail
        self.onCancel = onCancel
    }

    func paymentManager(_ paymentManager: PaymentManager, didFinish payment: Payment) {
        onFinish(payment)
    }

    func paymentManager(_ paymentManager: PaymentManager, didFail payment: Payment, withError error: Error) {
        onFail(error)
    }

    func paymentManager(_ paymentManager: PaymentManager, didCancel payment: Payment) {
        onCancel()
    }

    /// The page words these (lib/tap-to-pay-shared.ts tapToPayFailureText);
    /// anything unknown falls through to Square's own description.
    static func codeName(for error: Error) -> String {
        let text = error.localizedDescription.lowercased()
        if text.contains("declin") { return "DECLINED" }
        if text.contains("network") || text.contains("offline") { return "NO_NETWORK" }
        if text.contains("location") { return "LOCATION_DENIED" }
        if text.contains("not authorized") || text.contains("unauthorized") { return "NOT_AUTHORIZED" }
        return "PAYMENT_FAILED"
    }
}
