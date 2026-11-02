package com.streamflaire.hub

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.json.JSONArray
import org.json.JSONObject

/** Permission aliases (the names Capacitor's permission flow keys on). */
internal const val VOIP_ALIAS_MIC = "microphone"
internal const val VOIP_ALIAS_NOTIFICATIONS = "notifications"

/**
 * WorkBenchVoip — the page's handle on the Android calling engine
 * (VoipEngine.kt). Same method surface and events as the iPhone plugin
 * (ios/App/App/VoipPlugin.swift), so components/SoftphoneNativeEngine.ts
 * drives both. The engine outlives this plugin instance (it must — a push
 * arrives with no page at all); events raised before the bridge exists are
 * queued and flushed on load().
 *
 * Permissions (2026-11-02): the page never calls getUserMedia in the app —
 * the engine owns WebRTC — so nothing in the WebView ever asks for the
 * microphone. This plugin asks, through Capacitor's own permission flow:
 *
 *   register()    on first registration per process asks for everything a
 *                 call needs and is missing: RECORD_AUDIO, and on Android 13+
 *                 POST_NOTIFICATIONS (without it the ringing CallStyle
 *                 notification — the thing that shows the call on a locked
 *                 phone — is silently dropped). Resolves { token,
 *                 microphone, notifications, fullScreenIntent }.
 *   requestMic()  RECORD_AUDIO alone, resolving { granted } with the real
 *                 outcome (it used to only read the state).
 *   answer()      asks for RECORD_AUDIO first when it is missing, then
 *                 answers — so a call picked up from the page never
 *                 connects with one-way audio for want of a prompt.
 *   permissionState()     the same three states without asking.
 *   openCallSettings()    the system screen to fix them: Android 14's
 *                 "full-screen notifications" switch (which an app that is
 *                 not the phone app has OFF by default — the call then rings
 *                 as a heads-up only), or the app's notification settings.
 *
 * Capacitor holds ONE saved permission call per plugin, so the three asks
 * are serialised here: a requestMic() that lands while register() is
 * asking waits for that flow's outcome instead of launching its own.
 */
@CapacitorPlugin(
    name = "WorkBenchVoip",
    permissions = [
        Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = VOIP_ALIAS_MIC),
        Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = VOIP_ALIAS_NOTIFICATIONS),
    ],
)
class VoipPlugin : Plugin() {

    companion object {
        private const val TAG = "voip-plugin"
        /** A denial in the last minute is not re-asked: Android 11+ makes the second "Deny" permanent. */
        private const val DENIAL_COOLDOWN_MS = 60_000L
        /** A flow whose callback never came (the activity was recreated under it) stops blocking after this. */
        private const val FLOW_TIMEOUT_MS = 120_000L
    }

    private val engine: VoipEngine by lazy { VoipEngine.get(context) }

    /** One permission request in flight per plugin (Capacitor keeps a single saved call). */
    private val lock = Any()
    private var permissionFlowBusy = false
    private var flowStartedAt = 0L
    private var askedAtRegister = false
    private var lastMicDeniedAt = 0L
    /** requestMic() calls that arrived while another flow was asking. */
    private val waitingMic = ArrayList<PluginCall>()
    /** answer() calls parked behind a running flow (callId in the call's data). */
    private val waitingAnswer = ArrayList<PluginCall>()

    override fun load() {
        super.load()
        engine.plugin = this
    }

    override fun handleOnDestroy() {
        if (engine.plugin === this) engine.plugin = null
        super.handleOnDestroy()
    }

    override fun handleOnPause() {
        super.handleOnPause()
        engine.appBackgrounded()
    }

    override fun handleOnResume() {
        super.handleOnResume()
        engine.appForegrounded()
    }

    // ── Permission state ──────────────────────────────────────────────────────

    private fun micGranted(): Boolean = getPermissionState(VOIP_ALIAS_MIC) == PermissionState.GRANTED

    /** "granted" | "denied" — below Android 13 there is no runtime permission, only the app-level switch. */
    private fun notificationsState(): String {
        val on = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getPermissionState(VOIP_ALIAS_NOTIFICATIONS) == PermissionState.GRANTED
        } else {
            try { NotificationManagerCompat.from(context).areNotificationsEnabled() } catch (_: Throwable) { true }
        }
        return if (on) "granted" else "denied"
    }

    private fun stateResult(): JSObject = JSObject()
        .put("microphone", if (micGranted()) "granted" else "denied")
        .put("notifications", notificationsState())
        .put("fullScreenIntent", engine.canUseFullScreenIntent())

    private fun registerResult(): JSObject = stateResult().put("token", engine.token)

    /** The aliases register() still has to ask for. */
    private fun missingForRegister(): List<String> {
        val need = ArrayList<String>()
        if (!micGranted()) need.add(VOIP_ALIAS_MIC)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && getPermissionState(VOIP_ALIAS_NOTIFICATIONS) != PermissionState.GRANTED) {
            need.add(VOIP_ALIAS_NOTIFICATIONS)
        }
        return need
    }

    /** Every permission flow ends here: note a denial, tell the engine, release whoever was waiting. */
    private fun afterPermissionFlow() {
        val granted = micGranted()
        val mics: List<PluginCall>
        val answers: List<PluginCall>
        synchronized(lock) {
            permissionFlowBusy = false
            if (!granted) lastMicDeniedAt = SystemClock.elapsedRealtime()
            mics = ArrayList(waitingMic)
            waitingMic.clear()
            answers = ArrayList(waitingAnswer)
            waitingAnswer.clear()
        }
        engine.micPermissionChanged(granted)
        for (c in mics) c.resolve(JSObject().put("granted", granted))
        for (c in answers) {
            val id = c.getString("callId")
            if (id != null) engine.answer(id)
            c.resolve()
        }
    }

    /** Under `lock`: a permission flow is really in flight. */
    private fun flowBusy(): Boolean {
        if (permissionFlowBusy && SystemClock.elapsedRealtime() - flowStartedAt > FLOW_TIMEOUT_MS) permissionFlowBusy = false
        return permissionFlowBusy
    }

    /** Under `lock`. */
    private fun startFlow() {
        permissionFlowBusy = true
        flowStartedAt = SystemClock.elapsedRealtime()
    }

    private fun recentlyDenied(): Boolean =
        lastMicDeniedAt > 0 && SystemClock.elapsedRealtime() - lastMicDeniedAt < DENIAL_COOLDOWN_MS

    // ── Methods ───────────────────────────────────────────────────────────────

    /**
     * The page is up with calls on: FCM token, engine registered — and, the
     * first time this process registers, the permissions a call needs.
     */
    @PluginMethod
    fun register(call: PluginCall) {
        engine.registerForPushes()
        engine.wantConnected = true
        engine.ensureConnected(null)
        val need = missingForRegister()
        val ask = synchronized(lock) {
            if (need.isEmpty() || askedAtRegister || flowBusy()) false
            else {
                askedAtRegister = true
                startFlow()
                true
            }
        }
        if (!ask) {
            engine.notePermissions(micGranted(), notificationsState())
            call.resolve(registerResult())
            return
        }
        Log.i(TAG, "register: asking for ${need.joinToString(",")}")
        requestPermissionForAliases(need.toTypedArray(), call, "registerPermissionsCallback")
    }

    @PermissionCallback
    private fun registerPermissionsCallback(call: PluginCall) {
        afterPermissionFlow()
        engine.notePermissions(micGranted(), notificationsState())
        call.resolve(registerResult())
    }

    /** RECORD_AUDIO through the system prompt; resolves with the outcome, not a guess. */
    @PluginMethod
    fun requestMic(call: PluginCall) {
        if (micGranted()) {
            call.resolve(JSObject().put("granted", true))
            return
        }
        val launch = synchronized(lock) {
            when {
                flowBusy() -> { waitingMic.add(call); false }
                recentlyDenied() -> null
                else -> { startFlow(); true }
            }
        }
        when (launch) {
            null -> call.resolve(JSObject().put("granted", false))
            true -> requestPermissionForAlias(VOIP_ALIAS_MIC, call, "micPermissionCallback")
            false -> {} // parked; resolved when the running flow ends
        }
    }

    @PermissionCallback
    private fun micPermissionCallback(call: PluginCall) {
        afterPermissionFlow()
        call.resolve(JSObject().put("granted", micGranted()))
    }

    /** Answer from the page: get the microphone first when it is missing, then answer either way. */
    @PluginMethod
    fun answer(call: PluginCall) {
        val id = call.getString("callId") ?: return call.reject("callId required")
        if (micGranted()) {
            engine.answer(id)
            call.resolve()
            return
        }
        val launch = synchronized(lock) {
            when {
                flowBusy() -> { waitingAnswer.add(call); false }
                recentlyDenied() -> null
                else -> { startFlow(); true }
            }
        }
        when (launch) {
            null -> {
                engine.answer(id) // the caller is waiting; the engine reports the missing mic
                call.resolve()
            }
            true -> requestPermissionForAlias(VOIP_ALIAS_MIC, call, "answerPermissionCallback")
            false -> {}
        }
    }

    @PermissionCallback
    private fun answerPermissionCallback(call: PluginCall) {
        afterPermissionFlow()
        call.getString("callId")?.let { engine.answer(it) }
        call.resolve()
    }

    /** { microphone, notifications, fullScreenIntent } without asking for anything. */
    @PluginMethod
    fun permissionState(call: PluginCall) {
        call.resolve(stateResult())
    }

    /**
     * The system screen that fixes calls on this phone: `screen` =
     * "fullScreen" (Android 14+ full-screen notifications switch; falls back
     * to notification settings), "notifications" (the app's notification
     * settings) or "app" (app info, where the microphone lives).
     */
    @PluginMethod
    fun openCallSettings(call: PluginCall) {
        val screen = call.getString("screen") ?: "fullScreen"
        val pkg = context.packageName
        val intents = ArrayList<Intent>()
        if (screen == "fullScreen" && Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            intents.add(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).setData(Uri.parse("package:$pkg")))
        }
        if (screen == "fullScreen" || screen == "notifications") {
            intents.add(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg))
        }
        intents.add(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).setData(Uri.parse("package:$pkg")))
        for (i in intents) {
            try {
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(i)
                call.resolve(JSObject().put("opened", true))
                return
            } catch (t: Throwable) {
                Log.w(TAG, "settings screen unavailable: ${i.action}", t)
            }
        }
        call.resolve(JSObject().put("opened", false))
    }

    @PluginMethod
    fun endCall(call: PluginCall) {
        val id = call.getString("callId") ?: return call.reject("callId required")
        engine.end(id, call.getString("reason") ?: "user")
        call.resolve()
    }

    @PluginMethod
    fun setMuted(call: PluginCall) {
        val id = call.getString("callId") ?: return call.reject("callId required")
        engine.setMuted(id, call.getBoolean("muted", true) ?: true)
        call.resolve()
    }

    @PluginMethod
    fun setHeld(call: PluginCall) {
        val id = call.getString("callId") ?: return call.reject("callId required")
        engine.setHeld(id, call.getBoolean("held", true) ?: true)
        call.resolve()
    }

    @PluginMethod
    fun sendDigits(call: PluginCall) {
        val id = call.getString("callId") ?: return call.reject("callId required")
        val digits = call.getString("digits") ?: return call.reject("digits required")
        engine.sendDigits(id, digits)
        call.resolve()
    }

    /** The page placed a call (POST /api/app/line/call, via app); the server dials this credential next. */
    @PluginMethod
    fun placeCall(call: PluginCall) {
        val id = call.getString("callId") ?: return call.reject("callId required")
        engine.placeCall(id, call.getString("label") ?: "Call", call.getString("number"))
        call.resolve()
    }

    /** Outbound: the customer is on (the page watches the row). */
    @PluginMethod
    fun reportConnected(call: PluginCall) {
        val id = call.getString("callId") ?: return call.reject("callId required")
        engine.reportConnected(id)
        call.resolve()
    }

    /** What the engine has right now — a page that just (re)loaded catches up from this. */
    @PluginMethod
    fun currentCalls(call: PluginCall) {
        bridge.activity.runOnUiThread {
            val arr = JSONArray()
            for (c in engine.snapshot()) arr.put(c)
            val r = JSObject()
            r.put("calls", arr)
            r.put("ready", engine.isReady)
            r.put("speaker", engine.speakerOn)
            r.put("microphone", if (micGranted()) "granted" else "denied")
            call.resolve(r)
        }
    }

    @PluginMethod
    fun setSpeaker(call: PluginCall) {
        val on = call.getBoolean("on", true) ?: true
        engine.setSpeaker(on)
        call.resolve(JSObject().put("on", on))
    }

    internal fun emit(event: String, data: JSONObject) {
        notifyListeners(event, JSObject.fromJSONObject(data), true)
    }
}
