package com.streamflaire.hub;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import com.squareup.sdk.mobilepayments.MobilePaymentsSdk;
import com.squareup.sdk.mobilepayments.authorization.AuthorizationManager;
import com.squareup.sdk.mobilepayments.authorization.AuthorizationState;
import com.squareup.sdk.mobilepayments.authorization.AuthorizeErrorCode;
import com.squareup.sdk.mobilepayments.authorization.AuthorizedLocation;
import com.squareup.sdk.mobilepayments.core.Callback;
import com.squareup.sdk.mobilepayments.core.Result;
import com.squareup.sdk.mobilepayments.payment.AdditionalPaymentMethod;
import com.squareup.sdk.mobilepayments.payment.Card;
import com.squareup.sdk.mobilepayments.payment.CardPaymentDetails;
import com.squareup.sdk.mobilepayments.payment.CurrencyCode;
import com.squareup.sdk.mobilepayments.payment.Money;
import com.squareup.sdk.mobilepayments.payment.Payment;
import com.squareup.sdk.mobilepayments.payment.PaymentErrorCode;
import com.squareup.sdk.mobilepayments.payment.PaymentHandle;
import com.squareup.sdk.mobilepayments.payment.PaymentParameters;
import com.squareup.sdk.mobilepayments.payment.ProcessingMode;
import com.squareup.sdk.mobilepayments.payment.PromptMode;
import com.squareup.sdk.mobilepayments.payment.PromptParameters;
import com.squareup.sdk.mobilepayments.settings.Environment;

import java.util.Collections;
import java.util.List;
import java.util.UUID;

/**
 * WorkBenchTapToPay — Square's Mobile Payments SDK in the Android app, so a
 * tech can take a card by holding it to the back of the phone (Tap to Pay
 * on Android). The web page (components/TapToPayButton.tsx via
 * lib/native-tap-to-pay.ts) drives it; the method surface mirrors the iOS
 * plugin (ios/App/App/TapToPayPlugin.swift) minus the Apple ID step, which
 * Android does not have (linkAppleAccount resolves linked: true).
 *
 * The SDK is initialized at launch (HubApplication) with the application id
 * from res/values/strings.xml `square_application_id`; an empty value
 * leaves everything reporting configured: false and the page shows no
 * Tap to Pay button.
 *
 * Written against mobile-payments-sdk 2.6.1 (signatures read from the AAR
 * on 2026-10-22; compiles). Outside this file
 * (docs/plans/native-release-queue.md): minSdk 28, the Square Maven
 * repository + dependency in Gradle, the location / Bluetooth / phone-state
 * permissions in the manifest, and the application signature (package name
 * + SHA-256 of the Play signing key) registered in Square's Developer
 * Console. Plan: docs/plans/checkout-tap-to-pay-2026-10-22.md § 2.
 */
@CapacitorPlugin(
    name = "WorkBenchTapToPay",
    permissions = {
        @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION }, alias = "location")
    }
)
public class TapToPayPlugin extends Plugin {

    /** Set by HubApplication once MobilePaymentsSdk.initialize ran with a real application id. */
    static volatile boolean configured = false;

    private PaymentHandle activePayment;

    private static String environmentName() {
        try {
            Environment env = MobilePaymentsSdk.settingsManager().getSdkSettings().getSdkEnvironment();
            return env == Environment.PRODUCTION ? "production" : "sandbox";
        } catch (Throwable t) {
            return MobilePaymentsSdk.isSandboxEnvironment() ? "sandbox" : "production";
        }
    }

    /**
     * Sandbox test builds only (debug: mockreader-ui is a debugImplementation):
     * Square's floating Mock Reader button, which simulates a contactless reader
     * and lets the tester pick tap / approve / decline — the sandbox has no real
     * readers and never moves money. Reached by reflection so release builds,
     * which do not ship the class, compile and never show it; and only ever in
     * the sandbox environment, per Square's rule.
     */
    private static volatile boolean mockReaderShown = false;

    private void mockReader(boolean show) {
        if (!"sandbox".equals(environmentName())) return;
        if (show == mockReaderShown) return;
        try {
            Class<?> ui = Class.forName("com.squareup.sdk.mobilepayments.mockreader.ui.MockReaderUI");
            java.lang.reflect.Method m = ui.getMethod(show ? "show" : "hide");
            android.app.Activity activity = getActivity();
            Runnable r = () -> { try { m.invoke(null); } catch (Throwable ignored) {} };
            if (activity != null) activity.runOnUiThread(r); else r.run();
            mockReaderShown = show;
        } catch (ClassNotFoundException notDebugBuild) {
            // release build: no mock reader, nothing to do
        } catch (Throwable t) {
            android.util.Log.w("TapToPay", "Mock reader UI", t);
        }
    }

    private static boolean isAuthorized() {
        AuthorizationState state = MobilePaymentsSdk.authorizationManager().getAuthorizationState();
        return state != null && state.isAuthorized();
    }

    private static String authorizedLocationId() {
        try {
            AuthorizedLocation location = MobilePaymentsSdk.authorizationManager().getLocation();
            return location != null ? location.getLocationId() : null;
        } catch (Throwable t) {
            return null;
        }
    }

    /** Tap to Pay needs NFC and Android 9+; the SDK pairs the phone as a reader by itself. */
    private boolean deviceCapable() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return false;
        if ("sandbox".equals(environmentName())) return true; // mock reader, no NFC needed
        PackageManager pm = getContext().getPackageManager();
        return pm.hasSystemFeature(PackageManager.FEATURE_NFC);
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("platform", "android");
        r.put("appleLinked", JSObject.NULL);
        if (!configured) {
            r.put("configured", false);
            r.put("capable", false);
            r.put("authorized", false);
            r.put("locationId", JSObject.NULL);
            r.put("environment", JSObject.NULL);
            call.resolve(r);
            return;
        }
        boolean authorized = isAuthorized();
        if (authorized) mockReader(true);
        String locationId = authorized ? authorizedLocationId() : null;
        r.put("configured", true);
        r.put("capable", deviceCapable());
        r.put("authorized", authorized);
        r.put("locationId", locationId != null ? locationId : JSObject.NULL);
        r.put("environment", environmentName());
        call.resolve(r);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (getPermissionState("location") == PermissionState.GRANTED) {
            JSObject r = new JSObject();
            r.put("location", true);
            call.resolve(r);
            return;
        }
        requestPermissionForAlias("location", call, "locationPermissionCallback");
    }

    @PermissionCallback
    private void locationPermissionCallback(PluginCall call) {
        JSObject r = new JSObject();
        r.put("location", getPermissionState("location") == PermissionState.GRANTED);
        call.resolve(r);
    }

    @PluginMethod
    public void authorize(PluginCall call) {
        if (!configured) {
            call.reject("Tap to Pay is not configured in this build", "SDK_NOT_CONFIGURED");
            return;
        }
        String token = call.getString("accessToken");
        String locationId = call.getString("locationId");
        if (token == null || locationId == null) {
            call.reject("accessToken and locationId required", "USAGE_ERROR");
            return;
        }
        String wanted = call.getString("environment", "production");
        String have = environmentName();
        if (!have.equals(wanted)) {
            call.reject("This build runs Square " + have + "; the account token is " + wanted, "ENVIRONMENT_MISMATCH");
            return;
        }
        if (isAuthorized()) {
            JSObject r = new JSObject();
            r.put("ok", true);
            call.resolve(r);
            return;
        }
        AuthorizationManager manager = MobilePaymentsSdk.authorizationManager();
        manager.authorize(token, locationId, new Callback<Result<AuthorizedLocation, AuthorizeErrorCode>>() {
            @Override
            public void onResult(Result<AuthorizedLocation, AuthorizeErrorCode> result) {
                if (result.isSuccess()) {
                    mockReader(true);
                    JSObject r = new JSObject();
                    r.put("ok", true);
                    call.resolve(r);
                } else {
                    AuthorizeErrorCode code = result.errorCode();
                    String name = code == AuthorizeErrorCode.NO_NETWORK ? "NO_NETWORK" : "NOT_AUTHORIZED";
                    String message = result.errorMessage();
                    call.reject(message != null ? message : "Square could not authorize this phone", name);
                }
            }
        });
    }

    @PluginMethod
    public void deauthorize(PluginCall call) {
        if (configured && isAuthorized()) {
            mockReader(false);
            MobilePaymentsSdk.authorizationManager().deauthorize();
        }
        call.resolve();
    }

    /** Android has no Apple ID step — the page's flow is shared with iOS. */
    @PluginMethod
    public void linkAppleAccount(PluginCall call) {
        JSObject r = new JSObject();
        r.put("linked", true);
        call.resolve(r);
    }

    @PluginMethod
    public void pay(PluginCall call) {
        if (!configured) {
            call.reject("Tap to Pay is not configured in this build", "SDK_NOT_CONFIGURED");
            return;
        }
        if (!isAuthorized()) {
            call.reject("Square is not authorized on this phone", "NOT_AUTHORIZED");
            return;
        }
        if (!deviceCapable()) {
            call.reject("This phone cannot take Tap to Pay", "NOT_CAPABLE");
            return;
        }
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Location permission is required for in-person payments", "LOCATION_DENIED");
            return;
        }
        Integer cents = call.getInt("amountCents");
        if (cents == null || cents <= 0) {
            call.reject("amountCents required", "USAGE_ERROR");
            return;
        }
        if (activePayment != null) {
            call.reject("A payment is already in progress", "BUSY");
            return;
        }
        String attemptId = call.getString("paymentAttemptId", UUID.randomUUID().toString());
        String referenceId = call.getString("referenceId");
        String note = call.getString("note");

        // Builder(amount, processingMode, allowCardSurcharge, paymentAttemptId).
        // Our own surcharge is already inside the amount (the page adds the
        // company's rate), so Square's surcharge feature stays off.
        PaymentParameters.Builder builder = new PaymentParameters.Builder(
            new Money(cents.longValue(), CurrencyCode.USD),
            ProcessingMode.ONLINE_ONLY,
            false,
            attemptId
        ).autocomplete(true);
        if (referenceId != null) builder.referenceId(referenceId.length() > 40 ? referenceId.substring(0, 40) : referenceId);
        if (note != null) builder.note(note.length() > 500 ? note.substring(0, 500) : note);
        PaymentParameters params = builder.build();

        // Square's own prompt UI ("Hold card here", the result screen); no
        // keyed / cash fallbacks — those have their own buttons in WorkBench.
        List<AdditionalPaymentMethod.Type> extra = Collections.emptyList();
        PromptParameters prompt = new PromptParameters(PromptMode.DEFAULT, extra);

        activePayment = MobilePaymentsSdk.paymentManager().startPaymentActivity(params, prompt, new Callback<Result<Payment, PaymentErrorCode>>() {
            @Override
            public void onResult(Result<Payment, PaymentErrorCode> result) {
                activePayment = null;
                if (result.isSuccess()) {
                    Payment payment = result.value();
                    JSObject r = new JSObject();
                    String id = payment.isOnlinePayment() ? payment.asOnlinePayment().getId() : null;
                    r.put("paymentId", id != null ? id : "");
                    r.put("status", payment.isOnlinePayment() ? String.valueOf(payment.asOnlinePayment().getStatus()) : "COMPLETED");
                    CardPaymentDetails details = payment.getCardDetails();
                    Card card = details != null ? details.getCard() : null;
                    if (card != null) {
                        r.put("cardBrand", String.valueOf(card.getBrand()));
                        r.put("last4", card.getLastFourDigits());
                    }
                    call.resolve(r);
                } else {
                    PaymentErrorCode code = result.errorCode();
                    String name;
                    if (code == PaymentErrorCode.CANCELED) name = "CANCELED";
                    else if (code == PaymentErrorCode.NOT_AUTHORIZED) name = "NOT_AUTHORIZED";
                    else if (code == PaymentErrorCode.LOCATION_SERVICES_DISABLED) name = "LOCATION_DENIED";
                    else if (code == PaymentErrorCode.TIMEOUT) name = "NO_NETWORK";
                    else name = String.valueOf(code);
                    String message = result.errorMessage();
                    call.reject(message != null ? message : "Tap to Pay did not go through", name);
                }
            }
        });
    }
}
