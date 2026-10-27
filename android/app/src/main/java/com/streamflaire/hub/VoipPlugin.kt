package com.streamflaire.hub

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONArray
import org.json.JSONObject

/**
 * WorkBenchVoip — the page's handle on the Android calling engine
 * (VoipEngine.kt). Same method surface and events as the iPhone plugin
 * (ios/App/App/VoipPlugin.swift), so components/SoftphoneNativeEngine.ts
 * drives both. The engine outlives this plugin instance (it must — a push
 * arrives with no page at all); events raised before the bridge exists are
 * queued and flushed on load().
 */
@CapacitorPlugin(name = "WorkBenchVoip")
class VoipPlugin : Plugin() {

    private val engine: VoipEngine by lazy { VoipEngine.get(context) }

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

    /** The page is up with calls on: FCM token, engine registered. */
    @PluginMethod
    fun register(call: PluginCall) {
        engine.registerForPushes()
        engine.wantConnected = true
        engine.ensureConnected(null)
        call.resolve(JSObject().put("token", engine.token))
    }

    /** The microphone permission is RECORD_AUDIO, already granted to the webview for calls; nothing native to ask. */
    @PluginMethod
    fun requestMic(call: PluginCall) {
        val granted = androidx.core.content.ContextCompat.checkSelfPermission(context, android.Manifest.permission.RECORD_AUDIO) ==
            android.content.pm.PackageManager.PERMISSION_GRANTED
        call.resolve(JSObject().put("granted", granted))
    }

    @PluginMethod
    fun answer(call: PluginCall) {
        val id = call.getString("callId") ?: return call.reject("callId required")
        engine.answer(id)
        call.resolve()
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
