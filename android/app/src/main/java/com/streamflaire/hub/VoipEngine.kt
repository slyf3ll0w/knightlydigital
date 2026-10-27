package com.streamflaire.hub

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.CookieManager
import com.getcapacitor.CapConfig
import com.google.firebase.messaging.FirebaseMessaging
import com.telnyx.webrtc.sdk.Call
import com.telnyx.webrtc.sdk.TelnyxClient
import com.telnyx.webrtc.sdk.TokenConfig
import com.telnyx.webrtc.sdk.model.AudioDevice
import com.telnyx.webrtc.sdk.model.CallState
import com.telnyx.webrtc.sdk.model.LogLevel
import com.telnyx.webrtc.sdk.model.SocketMethod
import com.telnyx.webrtc.sdk.model.SocketStatus
import com.telnyx.webrtc.sdk.model.TxServerConfiguration
import com.telnyx.webrtc.sdk.verto.receive.ByeResponse
import com.telnyx.webrtc.sdk.verto.receive.InviteResponse
import com.telnyx.webrtc.sdk.verto.receive.ReceivedMessageBody
import com.telnyx.webrtc.sdk.verto.receive.SocketResponse
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.UUID

/**
 * WorkBenchVoip — the business line on the Android phone, natively. The
 * twin of ios/App/App/VoipPlugin.swift's VoipEngine; same states, same
 * events, same server routes, so components/SoftphoneNativeEngine.ts
 * drives both without knowing which phone it is on.
 *
 * Android kills a backgrounded WebView's page (and freezes its sockets)
 * long before a call comes in, so the engine lives here, in the process:
 *
 *   FCM        lib/voip.ts sends a high-priority DATA message per
 *              registered phone when a call comes in (type "call").
 *              WbMessagingService hands it here, app running or not.
 *   CallService  a foreground service (type phoneCall) shows the incoming
 *              call: a full-screen IncomingCallActivity over the lock
 *              screen, a CallStyle notification with Answer / Decline,
 *              the ringtone and vibration. While on a call it keeps the
 *              process alive with an ongoing-call notification.
 *   Telnyx     this engine fetches a login token with the app's own
 *              session cookies (GET /api/app/line/softphone?device=android),
 *              registers, tells the server it is awake
 *              (POST …/softphone/ready { device: "android" }), receives the
 *              SIP INVITE for the call and answers it the moment Answer was
 *              (or is) tapped.
 *
 * The web page (components/Softphone.tsx via lib/native-voip.ts) only
 * mirrors state on its call card and forwards taps here; it never touches
 * WebRTC in the app. Events to it (queued until the bridge exists):
 * voipToken, engineState, incomingCall, callAnswered, callActive,
 * callEnded, muteChanged, holdChanged, speakerChanged.
 *
 * A call for another company on the same login: the ready route answers
 * `switch` with that membership, and the engine re-registers with a token
 * minted for it (`?membership=`), so the leg is dialed to the right
 * credential while the page switches companies for its own UI.
 *
 * Main-thread confined: every public entry hops to the main looper.
 */
class VoipEngine private constructor(private val app: Context) {

    companion object {
        private const val TAG = "voip"
        private const val UNCLAIMED_TIMEOUT_MS = 45_000L
        private const val CONNECT_RETRY_WINDOW_MS = 8_000L

        @Volatile
        private var instance: VoipEngine? = null

        fun get(context: Context): VoipEngine =
            instance ?: synchronized(this) {
                instance ?: VoipEngine(context.applicationContext).also { instance = it }
            }
    }

    /** Anyone native that wants the same events the page gets (IncomingCallActivity). */
    fun interface Listener {
        fun onEvent(event: String, data: JSONObject)
    }

    enum class Direction { INBOUND, OUTBOUND }

    /** One business-line call as this engine knows it, keyed by our Call row id. */
    class Rec(val callId: String, val direction: Direction, var label: String, var number: String?) {
        var sdk: Call? = null
        /** Answer tapped before the INVITE arrived: answer it the moment it lands. */
        var answered = false
        var connected = false
        var muted = false
        var held = false
        var readyPosted = false
        var membership: String? = null
        var switched = false
        var endedByUs = false
        var stateJob: Job? = null
        var unclaimed: Runnable? = null
    }

    private val main = Handler(Looper.getMainLooper())
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    var plugin: VoipPlugin? = null
        set(value) {
            field = value
            if (value != null) flushQueued()
        }
    private val queued = ArrayList<Pair<String, JSONObject>>()
    private val listeners = LinkedHashSet<Listener>()

    var token: String? = null
        private set

    // Telnyx client
    private var client: TelnyxClient? = null
    private var socketJob: Job? = null
    private var clientReady = false
    private var connecting = false
    /** The membership the client is logged in as: null = the signed-in user, else a sibling's user id. */
    private var loginMembership: String? = null
    private var wantMembership: String? = null
    private var retriedLogin = false
    private var connectStartedAt = 0L
    /** The page asked for the engine (signed in, calls on): reconnect on foreground. */
    var wantConnected = false
    val isReady: Boolean get() = clientReady
    var speakerOn = false
        private set

    private val calls = LinkedHashMap<String, Rec>()
    private val bySdk = HashMap<UUID, String>()

    private val origin: String by lazy {
        val url = try { CapConfig.loadDefault(app).serverUrl } catch (_: Throwable) { null }
        try {
            val u = URL(url ?: "https://workbenchfsm.com")
            "${u.protocol}://${u.host}${if (u.port > 0 && u.port != u.defaultPort) ":${u.port}" else ""}"
        } catch (_: Throwable) {
            "https://workbenchfsm.com"
        }
    }

    private val build: String by lazy {
        try {
            val info = app.packageManager.getPackageInfo(app.packageName, 0)
            "android-${info.versionName}-${info.longVersionCode}"
        } catch (_: Throwable) {
            "android-?"
        }
    }

    // ── Events ────────────────────────────────────────────────────────────────

    fun addListener(l: Listener) = main.post { listeners.add(l) }
    fun removeListener(l: Listener) = main.post { listeners.remove(l) }

    private fun emit(event: String, data: JSONObject) {
        for (l in listeners.toList()) try { l.onEvent(event, data) } catch (t: Throwable) { Log.w(TAG, "listener failed", t) }
        val p = plugin
        if (p != null) p.emit(event, data) else queued.add(event to data)
    }

    private fun emit(event: String, vararg pairs: Pair<String, Any?>): Unit = emit(event, JSONObject().apply {
        for ((k, v) in pairs) put(k, v ?: JSONObject.NULL)
    })

    private fun flushQueued() {
        val pending = ArrayList(queued)
        queued.clear()
        val p = plugin ?: return
        for ((event, data) in pending) p.emit(event, data)
    }

    private fun callData(r: Rec) = JSONObject().apply {
        put("callId", r.callId)
        put("direction", if (r.direction == Direction.INBOUND) "in" else "out")
        put("label", r.label)
        put("number", r.number ?: JSONObject.NULL)
        put("answered", r.answered)
        put("connected", r.connected)
        put("muted", r.muted)
        put("held", r.held)
    }

    fun snapshot(): List<JSONObject> = calls.values.map(::callData)

    fun current(callId: String): Rec? = calls[callId]

    /** Breadcrumbs to the server log (`[voip-trace]`, POST /api/public/voip-trace): the engine runs where nothing else can see it. */
    fun trace(step: String, detail: String = "", callId: String? = null) {
        Log.i(TAG, "$step ${callId ?: ""} $detail")
        scope.launch(Dispatchers.IO) {
            try {
                val body = JSONObject().put("step", step).put("detail", detail).put("build", build)
                if (callId != null) body.put("callId", callId)
                rawRequest("/api/public/voip-trace", method = "POST", json = body, cookies = false)
            } catch (_: Throwable) {}
        }
    }

    // ── The FCM token ─────────────────────────────────────────────────────────

    /** Idempotent: called when the page registers; re-sends the token we already hold. */
    fun registerForPushes() = main.post {
        token?.let { emit("voipToken", "token" to it) }
        try {
            FirebaseMessaging.getInstance().token.addOnSuccessListener { t ->
                main.post {
                    if (t != null && t != token) {
                        token = t
                        emit("voipToken", "token" to t)
                    }
                }
            }
        } catch (t: Throwable) {
            Log.w(TAG, "FCM token unavailable", t)
        }
    }

    fun onNewToken(t: String) = main.post {
        token = t
        emit("voipToken", "token" to t)
    }

    // ── A push ────────────────────────────────────────────────────────────────

    /** WbMessagingService: a call is coming in (the data message from lib/voip.ts). */
    fun onPush(callId: String, label: String, number: String?, sentAt: Long?) = main.post {
        val age = if (sentAt != null && sentAt > 0) System.currentTimeMillis() - sentAt else -1
        trace("push", "age=${age}ms client=${if (client == null) "none" else if (client?.isSocketConnected() == true) "connected" else "dead"} ready=$clientReady", callId)
        // A message that sat in FCM past the wake window would ring for a call long over.
        if (age > 60_000) {
            trace("push-stale", "age=${age}ms", callId)
            return@post
        }
        reportIncoming(callId, label, number, null)
        ensureConnected(null, fresh = true)
    }

    // ── Connecting to Telnyx ──────────────────────────────────────────────────

    /**
     * Register with Telnyx as the signed-in person (or, for a call of another
     * company on this login, as that membership). A fresh token every time a
     * socket is opened — they live minutes, not hours.
     */
    fun ensureConnected(membership: String?, fresh: Boolean = false) = main.post { ensureConnectedNow(membership, fresh) }

    private fun ensureConnectedNow(membership: String?, fresh: Boolean) {
        val c = client
        // `fresh`: a socket Android may have frozen behind our back (a push into
        // a backgrounded app) is not trusted. Unless a call is live on it, start over.
        if (fresh && c != null && calls.values.all { it.sdk == null }) {
            trace("connect-fresh", "was=${if (c.isSocketConnected()) "connected" else "dead"} ready=$clientReady")
            dropClient()
            for (r in calls.values) r.readyPosted = false
        }
        val cc = client
        if (cc != null && cc.isSocketConnected() && loginMembership == membership && !connecting) {
            trace("connected-already", "ready=$clientReady")
            if (clientReady) flushReady()
            return
        }
        if (connecting && wantMembership == membership && System.currentTimeMillis() - connectStartedAt < CONNECT_RETRY_WINDOW_MS) {
            trace("connect-in-flight")
            return
        }
        connecting = true
        connectStartedAt = System.currentTimeMillis()
        wantMembership = membership
        retriedLogin = false
        trace("connect-start", "membership=${membership ?: "-"}")
        scope.launch { connect(membership) }
    }

    private fun dropClient() {
        socketJob?.cancel()
        socketJob = null
        try { client?.disconnect() } catch (_: Throwable) {}
        client = null
        clientReady = false
        connecting = false
    }

    private suspend fun connect(membership: String?) {
        // The phone's own credential — never the browser's (a shared one had the
        // desktop bumped off the line every time the phone registered).
        val query = HashMap<String, String>().apply {
            put("device", "android")
            if (membership != null) put("membership", membership)
        }
        val cookie = cookieHeader()
        trace("grant-fetch", "cookies=${cookie.split(";").count { it.isNotBlank() }} session=${cookie.contains("session-token")}")
        val (status, body) = try {
            siteRequest("/api/app/line/softphone", query = query)
        } catch (t: Throwable) {
            trace("grant-offline", t.message ?: "")
            return finishConnect(null, "offline", membership)
        }
        if (status == 401) {
            trace("grant-401")
            return finishConnect(null, "signedOut", membership)
        }
        val j = try { JSONObject(body) } catch (_: Throwable) { null }
        if (status != 200 || j == null) {
            trace("grant-status", "$status ${body.take(120)}")
            return finishConnect(null, "server", membership)
        }
        j.optString("off", "").takeIf { it.isNotEmpty() }?.let {
            trace("grant-off", it)
            return finishConnect(null, "off:$it", membership)
        }
        val tok = j.optString("token", "")
        if (tok.isEmpty()) {
            val err = j.optString("error", "server")
            trace("grant-no-token", err)
            return finishConnect(null, err, membership)
        }
        trace("grant-ok", "sip=${j.optString("sipUsername", "?")}")
        finishConnect(tok, null, membership)
    }

    private fun finishConnect(tok: String?, error: String?, membership: String?) {
        if (tok == null) {
            connecting = false
            emit("engineState", "ready" to false, "error" to (error ?: "server"))
            // A pushed call on a phone that cannot register: let it ring out so the
            // server's own fallback takes over, unless it is signed out — then
            // nobody here can ever take it.
            if (error == "signedOut" || (error ?: "").startsWith("off:")) {
                for (id in calls.keys.toList()) if (calls[id]?.sdk == null) finish(id, "ineligible")
            }
            return
        }
        dropClient()
        val c = TelnyxClient(app)
        client = c
        loginMembership = membership
        socketJob = scope.launch {
            c.socketResponseFlow.collect { r -> if (client === c) onSocket(c, r) }
        }
        try {
            c.connect(
                providedServerConfig = TxServerConfiguration(),
                tokenConfig = TokenConfig(
                    sipToken = tok,
                    sipCallerIDName = null,
                    sipCallerIDNumber = null,
                    fcmToken = null,
                    ringtone = null,
                    ringBackTone = null,
                    logLevel = LogLevel.NONE,
                    autoReconnect = true,
                ),
                txPushMetaData = null,
                autoLogin = true,
            )
            trace("telnyx-connecting")
        } catch (t: Throwable) {
            connecting = false
            trace("telnyx-connect-throw", t.message ?: "")
            emit("engineState", "ready" to false, "error" to "connect")
        }
    }

    // ── Telnyx: what the socket says ──────────────────────────────────────────

    private fun onSocket(c: TelnyxClient, r: SocketResponse<ReceivedMessageBody>) {
        when (r.status) {
            SocketStatus.ESTABLISHED -> trace("telnyx-socket-up")
            SocketStatus.LOADING -> {}
            SocketStatus.MESSAGERECEIVED -> {
                val body = r.data ?: return
                when (body.method) {
                    SocketMethod.LOGIN.methodName, SocketMethod.CLIENT_READY.methodName -> onClientReady()
                    SocketMethod.INVITE.methodName -> (body.result as? InviteResponse)?.let { onIncomingCall(c, it) }
                    SocketMethod.BYE.methodName -> (body.result as? ByeResponse)?.let { onBye(it) }
                    else -> {}
                }
            }
            SocketStatus.ERROR -> onClientError(r.errorMessage ?: "error")
            SocketStatus.DISCONNECT -> onSocketDisconnected()
        }
    }

    private fun onClientReady() {
        if (clientReady) return
        trace("telnyx-ready", "pending=${calls.values.count { it.sdk == null }}")
        clientReady = true
        connecting = false
        emit("engineState", "ready" to true)
        // A moment for the fresh registration to be routable before the server
        // dials it — a leg dialed the same second never arrived (iOS, build 11).
        main.postDelayed({ if (clientReady) flushReady() }, 1_500)
    }

    private fun onClientError(message: String) {
        trace("telnyx-error", message)
        clientReady = false
        if (connecting && !retriedLogin) {
            // One more try with a fresh token (the old one may simply have expired).
            retriedLogin = true
            val m = wantMembership
            main.postDelayed({ scope.launch { connect(m) } }, 2_000)
            return
        }
        connecting = false
        emit("engineState", "ready" to false, "error" to "telnyx")
    }

    private fun onSocketDisconnected() {
        trace("telnyx-disconnected", "pending=${calls.values.count { it.sdk == null }}")
        clientReady = false
        emit("engineState", "ready" to false)
        // A call is waiting on this registration: come back on a fresh socket
        // and ask for the leg again (the server dials it anew).
        if (calls.values.any { it.sdk == null }) ensureConnectedNow(wantMembership, fresh = true)
    }

    private fun header(invite: InviteResponse, name: String): String? =
        invite.customHeaders.firstOrNull { it.name.equals(name, ignoreCase = true) }?.value

    private fun onIncomingCall(c: TelnyxClient, invite: InviteResponse) {
        val ourId = header(invite, "X-WB-Call-Id")
        val outbound = header(invite, "X-WB-Outbound") == "1"
        val sdk = c.getActiveCalls()[invite.callId]
        trace("invite", "headers=${invite.customHeaders.joinToString(",") { it.name }} outbound=$outbound known=${ourId?.let { calls[it] != null } ?: false} sdk=${sdk != null}", ourId)
        if (sdk == null) return
        if (outbound) {
            // Our own outbound call's leg: pick up, the server dials the customer next.
            // A leg for a call placed from a browser also forks here — leave it
            // alone; Telnyx cancels it when that browser answers.
            val r = ourId?.let { calls[it] } ?: return
            if (r.direction != Direction.OUTBOUND) return
            attach(sdk, invite, r)
            accept(r)
            return
        }
        val id = ourId ?: "sip:${invite.callId}"
        val label = invite.callerIdName.ifBlank { invite.callerIdNumber.ifBlank { "Incoming call" } }
        // Known from a push: attach (and answer, if Answer was already tapped). Otherwise the INVITE beat the push: ring now.
        reportIncoming(id, label, invite.callerIdNumber.ifBlank { null }, sdk to invite)
    }

    private fun onBye(bye: ByeResponse) {
        val id = bySdk[bye.callId] ?: return
        trace("bye", "cause=${bye.cause ?: "-"} sip=${bye.sipCode ?: "-"}", id)
        finish(id, "remoteEnded")
    }

    private fun watchState(r: Rec, sdk: Call) {
        r.stateJob?.cancel()
        r.stateJob = scope.launch {
            sdk.callStateFlow.collect { state ->
                if (calls[r.callId] !== r) return@collect
                trace("call-state", state.value, r.callId)
                when (state) {
                    is CallState.ACTIVE -> {
                        if (r.direction == Direction.INBOUND && !r.connected) {
                            r.connected = true
                            emit("callActive", "callId" to r.callId)
                            CallService.ongoing(app, r.callId, r.label, "On a call")
                        } else if (r.held) {
                            r.held = false
                            emit("holdChanged", "callId" to r.callId, "held" to false)
                        }
                        applySpeaker()
                    }
                    is CallState.HELD -> if (!r.held) {
                        r.held = true
                        emit("holdChanged", "callId" to r.callId, "held" to true)
                    }
                    is CallState.DONE, is CallState.DROPPED, is CallState.ERROR -> finish(r.callId, "remoteEnded")
                    else -> {}
                }
            }
        }
    }

    // ── Calls: creation ───────────────────────────────────────────────────────

    /** A call reaching the phone (from a push, or an INVITE that beat the push): the system screen rings. */
    private fun reportIncoming(callId: String, label: String, number: String?, sdk: Pair<Call, InviteResponse>?) {
        calls[callId]?.let { r ->
            if (r.sdk == null && sdk != null) {
                attach(sdk.first, sdk.second, r)
                if (r.answered) accept(r)
            }
            return
        }
        val r = Rec(callId, Direction.INBOUND, label, number)
        calls[callId] = r
        if (sdk != null) attach(sdk.first, sdk.second, r)
        CallService.incoming(app, callId, label, number)
        emit("incomingCall", "callId" to callId, "label" to label, "number" to number)
        trace("ring-reported", "sdk=${sdk != null}", callId)
        if (sdk == null) {
            val timeout = Runnable {
                val cur = calls[callId] ?: return@Runnable
                if (cur.sdk != null) return@Runnable
                trace("unclaimed-timeout", "answered=${cur.answered}", callId)
                finish(callId, if (cur.answered) "failed" else "unanswered")
            }
            r.unclaimed = timeout
            main.postDelayed(timeout, UNCLAIMED_TIMEOUT_MS)
        }
        if (sdk != null && r.answered) accept(r)
    }

    /** The SIP leg for a known call arrived: from here on the SDK call is the call. */
    private fun attach(sdk: Call, invite: InviteResponse, r: Rec) {
        r.sdk = sdk
        bySdk[invite.callId] = r.callId
        r.unclaimed?.let { main.removeCallbacks(it) }
        r.unclaimed = null
        watchState(r, sdk)
        trace("invite-attached", "answered=${r.answered}", r.callId)
    }

    /** Answer the SDK call (Answer was tapped, or it is our own outbound leg). */
    private fun accept(r: Rec) {
        val sdk = r.sdk ?: return
        val c = client ?: return
        if (r.connected) return
        try {
            val invite = sdk.inviteResponse
            c.acceptCall(sdk.callId, invite?.callerIdNumber ?: r.number ?: "")
            trace("accepted", "", r.callId)
        } catch (t: Throwable) {
            trace("accept-throw", t.message ?: "", r.callId)
        }
        main.postDelayed({ applySpeaker() }, 500)
    }

    fun placeCall(callId: String, label: String, number: String?) = main.post {
        if (calls.containsKey(callId)) return@post
        val r = Rec(callId, Direction.OUTBOUND, label, number)
        r.answered = true
        calls[callId] = r
        CallService.ongoing(app, callId, label, "Calling…")
        trace("place-call", "", callId)
        ensureConnectedNow(null, fresh = false)
    }

    fun reportConnected(callId: String) = main.post {
        val r = calls[callId] ?: return@post
        r.connected = true
        CallService.ongoing(app, callId, r.label, "On a call")
        emit("callActive", "callId" to callId)
    }

    // ── Calls: the person's taps (system screen, the activity, or the page) ───

    fun answer(callId: String) = main.post {
        val r = calls[callId] ?: return@post
        if (r.answered) return@post
        r.answered = true
        trace("answer", "sdk=${r.sdk != null} ready=$clientReady", callId)
        CallService.ongoing(app, callId, r.label, "Connecting…")
        // No INVITE yet (pushed call, engine still registering): attach() answers it on arrival.
        if (r.sdk != null) accept(r)
        emit("callAnswered", "callId" to callId)
    }

    fun end(callId: String, reason: String) = main.post {
        val r = calls[callId] ?: return@post
        r.endedByUs = true
        // Not yet on the line: ringing, or answered while the leg was still on
        // its way. Either way the server must hear it, or the caller sits on
        // ringback until the leg times out.
        val ringingInbound = r.direction == Direction.INBOUND && (!r.answered || r.sdk == null)
        val dialingOutbound = r.direction == Direction.OUTBOUND && !r.connected
        scope.launch(Dispatchers.IO) {
            try {
                if (ringingInbound) siteRequest("/api/app/line/call/decline", method = "POST", json = JSONObject().put("id", callId))
                else if (dialingOutbound) siteRequest("/api/app/line/call", query = mapOf("id" to callId), method = "DELETE")
            } catch (_: Throwable) {}
        }
        trace("end", "ringing=$ringingInbound dialing=$dialingOutbound reason=$reason", callId)
        r.sdk?.let { sdk -> try { client?.endCall(sdk.callId) } catch (_: Throwable) {} }
        emit("callEnded", "callId" to callId, "reason" to (if (ringingInbound) "declined" else "user"))
        forget(callId)
    }

    fun setMuted(callId: String, muted: Boolean) = main.post {
        val r = calls[callId] ?: return@post
        if (r.muted != muted) {
            try { r.sdk?.onMuteUnmutePressed() } catch (_: Throwable) {}
            r.muted = muted
        }
        emit("muteChanged", "callId" to callId, "muted" to r.muted)
    }

    fun setHeld(callId: String, held: Boolean) = main.post {
        val r = calls[callId] ?: return@post
        if (r.held != held) {
            r.sdk?.let { sdk -> try { sdk.onHoldUnholdPressed(sdk.callId) } catch (_: Throwable) {} }
            r.held = held
            // The SDK's hold only quiets our leg; the other party gets hold music from the server.
            scope.launch(Dispatchers.IO) {
                try { siteRequest("/api/app/line/call", method = "PATCH", json = JSONObject().put("id", callId).put("hold", held)) } catch (_: Throwable) {}
            }
        }
        emit("holdChanged", "callId" to callId, "held" to r.held)
    }

    fun sendDigits(callId: String, digits: String) = main.post {
        val sdk = calls[callId]?.sdk ?: return@post
        for (ch in digits) if (ch in "0123456789*#") try { sdk.dtmf(sdk.callId, ch.toString()) } catch (_: Throwable) {}
    }

    fun setSpeaker(on: Boolean) = main.post {
        speakerOn = on
        applySpeaker()
        emit("speakerChanged", "on" to on)
    }

    private fun applySpeaker() {
        try { client?.setAudioOutputDevice(if (speakerOn) AudioDevice.LOUDSPEAKER else AudioDevice.PHONE_EARPIECE) } catch (_: Throwable) {}
    }

    // ── Calls: ending ─────────────────────────────────────────────────────────

    /** The call is over as far as this phone is concerned: the service, the page, the maps. */
    private fun finish(callId: String, tell: String) {
        if (!calls.containsKey(callId)) return
        emit("callEnded", "callId" to callId, "reason" to tell)
        forget(callId)
    }

    private fun forget(callId: String) {
        val r = calls.remove(callId) ?: return
        r.unclaimed?.let { main.removeCallbacks(it) }
        r.stateJob?.cancel()
        r.sdk?.let { bySdk.remove(it.callId) }
        if (calls.isEmpty()) {
            speakerOn = false
            CallService.stop(app)
        } else {
            calls.values.firstOrNull()?.let { CallService.ongoing(app, it.callId, it.label, if (it.connected) "On a call" else "Connecting…") }
        }
    }

    // ── The server: "I'm awake for this call" ─────────────────────────────────

    private fun flushReady() {
        for (r in calls.values.toList()) {
            if (r.direction != Direction.INBOUND || r.sdk != null || r.readyPosted || r.membership != loginMembership) continue
            postReady(r.callId, 0)
        }
    }

    private fun postReady(callId: String, attempt: Int) {
        val r = calls[callId] ?: return
        r.readyPosted = true
        val json = JSONObject().put("callId", callId).put("device", "android")
        r.membership?.let { json.put("membership", it) }
        scope.launch {
            var outcome = "error"
            var switchTo: String? = null
            try {
                val (status, body) = siteRequest("/api/app/line/softphone/ready", method = "POST", json = json)
                if (status == 401 || status == 403) outcome = "ineligible"
                else if (status == 200) {
                    val j = JSONObject(body)
                    outcome = j.optString("outcome", "late")
                    switchTo = j.optString("userId", "").ifEmpty { null }
                }
            } catch (_: Throwable) {}
            trace("ready-outcome", "$outcome switchTo=${switchTo ?: "-"} attempt=$attempt", callId)
            val cur = calls[callId] ?: return@launch
            if (cur.sdk != null) return@launch
            when (outcome) {
                "ringing", "already" -> {}
                "switch" -> {
                    // Another company on this login owns the call: register as that membership and ask again.
                    if (switchTo != null && !cur.switched) {
                        cur.switched = true
                        cur.membership = switchTo
                        cur.readyPosted = false
                        ensureConnectedNow(switchTo, fresh = false)
                    } else finish(callId, "ineligible")
                }
                "late", "ineligible" -> finish(callId, outcome)
                else -> if (attempt < 2) {
                    cur.readyPosted = false
                    delay(1_500)
                    postReady(callId, attempt + 1)
                }
            }
        }
    }

    // ── App lifecycle (VoipPlugin forwards Capacitor's pause/resume) ──────────

    /** Background with no call: a clean disconnect, so Telnyx forgets this socket's registration now. */
    fun appBackgrounded() = main.post {
        if (calls.isNotEmpty() || client == null) return@post
        trace("background-disconnect")
        dropClient()
    }

    fun appForegrounded() = main.post {
        if (wantConnected) ensureConnectedNow(null, fresh = false)
    }

    // ── HTTP with the app's own session ───────────────────────────────────────

    private fun cookieHeader(): String = try { CookieManager.getInstance().getCookie(origin) ?: "" } catch (_: Throwable) { "" }

    private suspend fun siteRequest(
        path: String,
        query: Map<String, String> = emptyMap(),
        method: String = "GET",
        json: JSONObject? = null,
    ): Pair<Int, String> = withContext(Dispatchers.IO) { rawRequest(path, query, method, json, cookies = true) }

    private fun rawRequest(path: String, query: Map<String, String> = emptyMap(), method: String, json: JSONObject?, cookies: Boolean): Pair<Int, String> {
        val qs = if (query.isEmpty()) "" else "?" + query.entries.joinToString("&") { (k, v) -> "${URLEncoder.encode(k, "UTF-8")}=${URLEncoder.encode(v, "UTF-8")}" }
        val conn = URL("$origin$path$qs").openConnection() as HttpURLConnection
        conn.requestMethod = method
        conn.connectTimeout = 10_000
        conn.readTimeout = 15_000
        conn.setRequestProperty("Accept", "application/json")
        conn.setRequestProperty("User-Agent", "WorkBench Android calling engine ($build)")
        if (cookies) cookieHeader().takeIf { it.isNotEmpty() }?.let { conn.setRequestProperty("Cookie", it) }
        if (json != null) {
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.outputStream.use { it.write(json.toString().toByteArray()) }
        }
        val status = conn.responseCode
        val stream = if (status >= 400) conn.errorStream else conn.inputStream
        val body = try { stream?.bufferedReader()?.use(BufferedReader::readText) ?: "" } catch (_: Throwable) { "" }
        conn.disconnect()
        return status to body
    }
}
