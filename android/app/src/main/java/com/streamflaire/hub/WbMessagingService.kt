package com.streamflaire.hub

import com.capacitorjs.plugins.pushnotifications.MessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * The app's one FirebaseMessagingService. It replaces the Capacitor push
 * plugin's (the manifest removes that one and registers this, which extends
 * it), so ordinary notifications keep flowing through the plugin while a
 * business-line call — the DATA message lib/voip.ts sends with
 * `type: "call"` — wakes the calling engine instead, app running or not.
 */
class WbMessagingService : MessagingService() {

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        val data = remoteMessage.data
        if (data["type"] == "call") {
            val callId = data["callId"] ?: return
            VoipEngine.get(applicationContext).onPush(
                callId,
                data["label"]?.takeIf { it.isNotBlank() } ?: "Incoming call",
                data["number"]?.takeIf { it.isNotBlank() },
                data["sentAt"]?.toLongOrNull() ?: remoteMessage.sentTime.takeIf { it > 0 },
            )
            return
        }
        super.onMessageReceived(remoteMessage)
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        VoipEngine.get(applicationContext).onNewToken(token)
    }
}
