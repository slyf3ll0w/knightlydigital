package com.streamflaire.hub;

import android.app.Application;
import android.text.TextUtils;
import android.util.Log;

import com.squareup.sdk.mobilepayments.MobilePaymentsSdk;

/**
 * Application subclass so Square's Mobile Payments SDK is initialized once,
 * at process start, the way Square asks (Application.onCreate). The
 * application id lives in res/values/strings.xml `square_application_id`
 * (production id for store builds, the sandbox id on a debug build); empty
 * = the SDK is never initialized and TapToPayPlugin reports configured:
 * false, so the web page shows no Tap to Pay button.
 */
public class HubApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        String appId = getString(R.string.square_application_id);
        if (TextUtils.isEmpty(appId)) {
            Log.i("TapToPay", "square_application_id is empty; Tap to Pay stays off in this build");
            return;
        }
        try {
            MobilePaymentsSdk.initialize(appId, this);
            TapToPayPlugin.configured = true;
        } catch (Throwable t) {
            Log.e("TapToPay", "Mobile Payments SDK failed to initialize", t);
        }
    }
}
