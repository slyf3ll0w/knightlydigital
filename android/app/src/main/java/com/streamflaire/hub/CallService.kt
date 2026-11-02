package com.streamflaire.hub

import android.app.KeyguardManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.IBinder
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.Person

/**
 * The foreground service behind a business-line call on Android — what
 * CallKit is on the iPhone, minus the system UI: Android has no shared call
 * screen for apps, so this service owns the notification (CallStyle: Answer
 * / Decline while ringing, Hang up once on the line), the full-screen
 * IncomingCallActivity over the lock screen, the ringtone and vibration, and
 * — being a foreground service of type phoneCall — the right to keep the
 * process and its microphone alive while the app is in the background.
 *
 * It renders; VoipEngine decides. Every action here is forwarded to the
 * engine, and the engine calls incoming() / ongoing() / stop() as the call
 * moves. Started from a high-priority FCM data message when the app is
 * closed, which is the one background start Android allows for this.
 */
class CallService : Service() {

    companion object {
        private const val TAG = "voip-service"
        const val CHANNEL_INCOMING = "wb_calls_incoming"
        const val CHANNEL_ONGOING = "wb_calls_ongoing"
        const val NOTIFICATION_ID = 4201

        const val ACTION_INCOMING = "com.streamflaire.hub.call.INCOMING"
        const val ACTION_ONGOING = "com.streamflaire.hub.call.ONGOING"
        const val ACTION_ANSWER = "com.streamflaire.hub.call.ANSWER"
        const val ACTION_DECLINE = "com.streamflaire.hub.call.DECLINE"
        const val ACTION_HANGUP = "com.streamflaire.hub.call.HANGUP"
        const val ACTION_STOP = "com.streamflaire.hub.call.STOP"

        const val EXTRA_CALL_ID = "callId"
        const val EXTRA_LABEL = "label"
        const val EXTRA_NUMBER = "number"
        const val EXTRA_STATUS = "status"
        /** On the IncomingCallActivity intent: Answer was tapped on the notification; the screen asks for the mic, then answers. */
        const val EXTRA_ANSWER = "answer"

        fun incoming(ctx: Context, callId: String, label: String, number: String?) =
            start(ctx, Intent(ctx, CallService::class.java).setAction(ACTION_INCOMING)
                .putExtra(EXTRA_CALL_ID, callId).putExtra(EXTRA_LABEL, label).putExtra(EXTRA_NUMBER, number))

        fun ongoing(ctx: Context, callId: String, label: String, status: String) =
            start(ctx, Intent(ctx, CallService::class.java).setAction(ACTION_ONGOING)
                .putExtra(EXTRA_CALL_ID, callId).putExtra(EXTRA_LABEL, label).putExtra(EXTRA_STATUS, status))

        fun stop(ctx: Context) = start(ctx, Intent(ctx, CallService::class.java).setAction(ACTION_STOP))

        private fun start(ctx: Context, intent: Intent) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(intent) else ctx.startService(intent)
            } catch (t: Throwable) {
                Log.w(TAG, "start failed: ${intent.action}", t)
            }
        }

        fun ensureChannels(ctx: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(CHANNEL_INCOMING) == null) {
                // The service plays the ringtone itself (looping, honouring the
                // ringer mode); the channel stays silent so the two never overlap.
                nm.createNotificationChannel(NotificationChannel(CHANNEL_INCOMING, "Incoming calls", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "Business-line calls ringing this phone"
                    lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                    setSound(null, null)
                    enableVibration(false)
                    setBypassDnd(false)
                })
            }
            if (nm.getNotificationChannel(CHANNEL_ONGOING) == null) {
                nm.createNotificationChannel(NotificationChannel(CHANNEL_ONGOING, "Calls in progress", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "A business-line call you are on"
                    setSound(null, null)
                    enableVibration(false)
                })
            }
        }
    }

    private var ringtone: Ringtone? = null
    private var vibrating = false
    private var currentCallId: String? = null
    private var currentLabel: String = "Incoming call"
    private var currentNumber: String? = null
    private var inForeground = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        ensureChannels(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        val callId = intent?.getStringExtra(EXTRA_CALL_ID)
        val engine = VoipEngine.get(applicationContext)
        when (action) {
            ACTION_INCOMING -> {
                currentCallId = callId
                currentLabel = intent.getStringExtra(EXTRA_LABEL) ?: "Incoming call"
                currentNumber = intent.getStringExtra(EXTRA_NUMBER)
                foreground(incomingNotification(callId ?: "", currentLabel, currentNumber), mic = false)
                startRinging()
                // Android 14+ with the full-screen switch off: no call screen over the
                // lock, just the heads-up — say so in the trace, the phone looks "silent".
                if (!engine.canUseFullScreenIntent()) engine.trace("ring-no-fullscreen", "mic=${engine.micGranted()}", callId)
            }
            ACTION_ONGOING -> {
                stopRinging()
                currentCallId = callId
                currentLabel = intent.getStringExtra(EXTRA_LABEL) ?: currentLabel
                foreground(ongoingNotification(callId ?: "", currentLabel, intent.getStringExtra(EXTRA_STATUS) ?: "On a call"), mic = true)
            }
            ACTION_ANSWER -> {
                stopRinging()
                // Keep the service in the foreground while the engine connects the leg; it re-posts ongoing().
                foreground(ongoingNotification(callId ?: "", currentLabel, "Connecting…"), mic = true)
                if (callId != null) engine.answer(callId)
            }
            ACTION_DECLINE -> {
                stopRinging()
                if (callId != null) engine.end(callId, "declined")
            }
            ACTION_HANGUP -> {
                if (callId != null) engine.end(callId, "user")
            }
            ACTION_STOP, null -> {
                stopRinging()
                // A service started without an action (or to stop) must still
                // call startForeground once or Android raises; post then drop.
                if (!inForeground) foreground(ongoingNotification("", currentLabel, "Call ended"), mic = false)
                stopForeground(STOP_FOREGROUND_REMOVE)
                inForeground = false
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        stopRinging()
        super.onDestroy()
    }

    /**
     * startForeground with the right type for the moment: phoneCall while
     * ringing (mic = false), + microphone once answered (mic = true: the
     * service is asked to capture). The microphone type is what lets
     * a backgrounded process keep capturing (Android 14+ throws
     * SecurityException when RECORD_AUDIO was never granted, or when the
     * while-in-use rules refuse it) — falling back to phoneCall alone keeps
     * the service alive but the call has NO outbound audio, so the fallback
     * is never silent: it is logged, traced and raised to the engine
     * (micState event; the call screen shows it).
     */
    private fun foreground(n: Notification, mic: Boolean) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val phone = ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
                val micType = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                val engine = VoipEngine.get(applicationContext)
                // Asking for the microphone type without the permission is a
                // guaranteed SecurityException on 14+; say why instead of throwing.
                val wantMic = mic && engine.micGranted()
                if (mic && !wantMic) {
                    Log.e(TAG, "RECORD_AUDIO not granted: foreground service on phoneCall type only — no outbound audio")
                    engine.foregroundMicRefused("permission-missing")
                }
                try {
                    startForeground(NOTIFICATION_ID, n, if (wantMic) phone or micType else phone)
                } catch (e: SecurityException) {
                    Log.e(TAG, "startForeground(${if (wantMic) "phoneCall|microphone" else "phoneCall"}) refused: ${e.message}", e)
                    if (wantMic) engine.foregroundMicRefused("security: ${e.message ?: "?"}")
                    try { startForeground(NOTIFICATION_ID, n, phone) } catch (e2: SecurityException) {
                        Log.e(TAG, "startForeground(phoneCall) refused too: ${e2.message}", e2)
                        startForeground(NOTIFICATION_ID, n)
                    }
                }
            } else startForeground(NOTIFICATION_ID, n)
            inForeground = true
        } catch (t: Throwable) {
            Log.e(TAG, "startForeground failed", t)
        }
    }

    private fun pi(action: String, callId: String, code: Int): PendingIntent {
        val i = Intent(this, CallService::class.java).setAction(action).putExtra(EXTRA_CALL_ID, callId)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) PendingIntent.getForegroundService(this, code, i, flags)
        else PendingIntent.getService(this, code, i, flags)
    }

    private fun screenIntent(callId: String, label: String, number: String?, code: Int, answer: Boolean = false): PendingIntent {
        val i = Intent(this, IncomingCallActivity::class.java)
            .putExtra(EXTRA_CALL_ID, callId).putExtra(EXTRA_LABEL, label).putExtra(EXTRA_NUMBER, number)
            .putExtra(EXTRA_ANSWER, answer)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        return PendingIntent.getActivity(this, code, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    /**
     * The notification's Answer: straight to the engine when the microphone
     * is granted; otherwise through the call screen, the one place with a
     * window to show the RECORD_AUDIO prompt (a service cannot), which
     * answers once the prompt is done.
     */
    private fun answerIntent(callId: String, label: String, number: String?): PendingIntent =
        if (VoipEngine.get(applicationContext).micGranted()) pi(ACTION_ANSWER, callId, 3)
        else screenIntent(callId, label, number, 5, answer = true)

    private fun person(label: String) = Person.Builder().setName(label.ifBlank { "Incoming call" }).setImportant(true).build()

    private fun incomingNotification(callId: String, label: String, number: String?): Notification {
        val screen = screenIntent(callId, label, number, 1)
        val b = NotificationCompat.Builder(this, CHANNEL_INCOMING)
            .setSmallIcon(android.R.drawable.sym_call_incoming)
            .setContentTitle(label)
            .setContentText(number?.let { "Business line · $it" } ?: "Business line")
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(false)
            .setContentIntent(screen)
            .setFullScreenIntent(screen, true)
            .setStyle(NotificationCompat.CallStyle.forIncomingCall(person(label), pi(ACTION_DECLINE, callId, 2), answerIntent(callId, label, number)))
        return b.build()
    }

    private fun ongoingNotification(callId: String, label: String, status: String): Notification {
        val screen = screenIntent(callId, label, currentNumber, 1)
        return NotificationCompat.Builder(this, CHANNEL_ONGOING)
            .setSmallIcon(android.R.drawable.sym_action_call)
            .setContentTitle(label)
            .setContentText(status)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(screen)
            .setStyle(NotificationCompat.CallStyle.forOngoingCall(person(label), pi(ACTION_HANGUP, callId, 4)))
            .build()
    }

    // ── Ringtone + vibration, honouring the ringer switch ─────────────────────

    private fun startRinging() {
        if (ringtone?.isPlaying == true) return
        val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val mode = am.ringerMode
        if (mode == AudioManager.RINGER_MODE_NORMAL) {
            try {
                val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
                val r = RingtoneManager.getRingtone(this, uri)
                r.audioAttributes = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) r.isLooping = true
                r.play()
                ringtone = r
            } catch (t: Throwable) {
                Log.w(TAG, "ringtone failed", t)
            }
        }
        if (mode != AudioManager.RINGER_MODE_SILENT) {
            try {
                val v = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
                    (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
                else @Suppress("DEPRECATION") getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
                val pattern = longArrayOf(0, 800, 1200)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) v.vibrate(VibrationEffect.createWaveform(pattern, 0))
                else @Suppress("DEPRECATION") v.vibrate(pattern, 0)
                vibrating = true
            } catch (t: Throwable) {
                Log.w(TAG, "vibration failed", t)
            }
        }
    }

    private fun stopRinging() {
        try { ringtone?.stop() } catch (_: Throwable) {}
        ringtone = null
        if (vibrating) {
            try {
                val v = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
                    (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
                else @Suppress("DEPRECATION") getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
                v.cancel()
            } catch (_: Throwable) {}
            vibrating = false
        }
    }

    /** Whether the screen is locked — the activity decides how much to show. */
    fun isLocked(): Boolean = (getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked
}
