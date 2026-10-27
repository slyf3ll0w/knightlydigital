package com.streamflaire.hub

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject

/**
 * The call screen Android does not give apps: shown full-screen over the
 * lock screen by CallService's notification while a business-line call
 * rings, and kept as the in-call screen once answered (the web app's call
 * card is behind the lock; this is not). Everything it shows comes from
 * VoipEngine's events, everything it does goes back to the engine — the
 * same path the page and the notification buttons take.
 *
 * Drawn in code (no layout XML, no theme dependencies): brand blue, the
 * caller big, two round buttons.
 */
class IncomingCallActivity : Activity(), VoipEngine.Listener {

    private lateinit var engine: VoipEngine
    private var callId: String = ""
    private val main = Handler(Looper.getMainLooper())

    private lateinit var who: TextView
    private lateinit var sub: TextView
    private lateinit var state: TextView
    private lateinit var ringingRow: LinearLayout
    private lateinit var liveRow: LinearLayout
    private lateinit var muteBtn: Button
    private lateinit var speakerBtn: Button
    private var answered = false
    private var connectedAt = 0L
    private var muted = false
    private var speaker = false
    private val tick = object : Runnable {
        override fun run() {
            if (connectedAt > 0) {
                val s = (SystemClock.elapsedRealtime() - connectedAt) / 1000
                state.text = String.format("%d:%02d", s / 60, s % 60)
            }
            main.postDelayed(this, 1000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        engine = VoipEngine.get(applicationContext)
        showOverLock()
        readIntent(intent)
        setContentView(buildUi())
        engine.addListener(this)
        // The page may have answered / the call may have ended before this screen drew.
        main.post { syncFromEngine() }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        readIntent(intent)
        syncFromEngine()
    }

    override fun onDestroy() {
        engine.removeListener(this)
        main.removeCallbacks(tick)
        super.onDestroy()
    }

    private fun readIntent(i: Intent?) {
        callId = i?.getStringExtra(CallService.EXTRA_CALL_ID) ?: callId
    }

    private fun showOverLock() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    private fun dp(v: Int): Int = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

    private fun roundButton(text: String, color: Int): Button = Button(this).apply {
        this.text = text
        setTextColor(Color.WHITE)
        textSize = 16f
        typeface = Typeface.DEFAULT_BOLD
        isAllCaps = false
        background = GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = dp(40).toFloat()
            setColor(color)
        }
        setPadding(dp(28), dp(18), dp(28), dp(18))
        stateListAnimator = null
    }

    private fun buildUi(): View {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setBackgroundColor(Color.parseColor("#0065FC"))
            setPadding(dp(24), dp(96), dp(24), dp(48))
        }
        val brand = TextView(this).apply {
            text = "WorkBench · Business line"
            setTextColor(Color.parseColor("#CFE0FF"))
            textSize = 14f
            letterSpacing = 0.04f
        }
        who = TextView(this).apply {
            setTextColor(Color.WHITE)
            textSize = 32f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setPadding(0, dp(28), 0, dp(6))
        }
        sub = TextView(this).apply {
            setTextColor(Color.parseColor("#CFE0FF"))
            textSize = 18f
            gravity = Gravity.CENTER
        }
        state = TextView(this).apply {
            setTextColor(Color.WHITE)
            textSize = 18f
            gravity = Gravity.CENTER
            setPadding(0, dp(18), 0, 0)
            text = "Incoming call"
        }
        val spacer = View(this).also { it.layoutParams = LinearLayout.LayoutParams(0, 0, 1f) }

        ringingRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
        }
        val decline = roundButton("Decline", Color.parseColor("#E5484D")).apply { setOnClickListener { engine.end(callId, "declined"); finishSoon() } }
        val answer = roundButton("Answer", Color.parseColor("#30A46C")).apply { setOnClickListener { engine.answer(callId) } }
        ringingRow.addView(decline, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { marginEnd = dp(12) })
        ringingRow.addView(answer, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dp(12) })

        liveRow = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            visibility = View.GONE
        }
        val controls = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
        muteBtn = roundButton("Mute", Color.parseColor("#1F4FB8")).apply { setOnClickListener { engine.setMuted(callId, !muted) } }
        speakerBtn = roundButton("Speaker", Color.parseColor("#1F4FB8")).apply { setOnClickListener { engine.setSpeaker(!speaker) } }
        controls.addView(muteBtn, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { marginEnd = dp(12) })
        controls.addView(speakerBtn, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dp(12) })
        val hangup = roundButton("Hang up", Color.parseColor("#E5484D")).apply { setOnClickListener { engine.end(callId, "user"); finishSoon() } }
        val open = TextView(this).apply {
            text = "Open WorkBench"
            setTextColor(Color.WHITE)
            textSize = 16f
            gravity = Gravity.CENTER
            setPadding(0, dp(22), 0, 0)
            setOnClickListener { openApp() }
        }
        liveRow.addView(controls, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        liveRow.addView(hangup, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(16) })
        liveRow.addView(open)

        root.addView(brand)
        root.addView(who)
        root.addView(sub)
        root.addView(state)
        root.addView(spacer)
        root.addView(ringingRow, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        root.addView(liveRow, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        return root
    }

    private fun syncFromEngine() {
        val r = engine.current(callId)
        if (r == null) {
            // Nothing by that id any more: the call ended (or was answered elsewhere) before we drew.
            finishSoon()
            return
        }
        who.text = r.label.ifBlank { r.number ?: "Incoming call" }
        sub.text = if (r.number != null && r.number != r.label) r.number else ""
        if (r.answered && !answered) showLive()
        if (r.connected && connectedAt == 0L) markConnected()
        muted = r.muted
        speaker = engine.speakerOn
        refreshToggles()
    }

    private fun showLive() {
        answered = true
        ringingRow.visibility = View.GONE
        liveRow.visibility = View.VISIBLE
        state.text = "Connecting…"
    }

    private fun markConnected() {
        connectedAt = SystemClock.elapsedRealtime()
        main.removeCallbacks(tick)
        main.post(tick)
    }

    private fun refreshToggles() {
        muteBtn.text = if (muted) "Unmute" else "Mute"
        speakerBtn.text = if (speaker) "Earpiece" else "Speaker"
    }

    private fun openApp() {
        val km = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
        val launch = Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && km.isKeyguardLocked) {
            km.requestDismissKeyguard(this, object : KeyguardManager.KeyguardDismissCallback() {
                override fun onDismissSucceeded() {
                    startActivity(launch)
                    finish()
                }
            })
        } else {
            startActivity(launch)
            finish()
        }
    }

    private fun finishSoon() {
        main.postDelayed({ if (!isFinishing) finish() }, 350)
    }

    // ── VoipEngine.Listener (main thread) ─────────────────────────────────────

    override fun onEvent(event: String, data: JSONObject) {
        val id = data.optString("callId", "")
        if (id.isNotEmpty() && id != callId) return
        when (event) {
            "callAnswered" -> showLive()
            "callActive" -> { if (!answered) showLive(); if (connectedAt == 0L) markConnected() }
            "callEnded" -> {
                main.removeCallbacks(tick)
                state.text = when (data.optString("reason")) {
                    "declined" -> "Declined"
                    "late", "unanswered", "failed" -> "Missed"
                    else -> "Call ended"
                }
                finishSoon()
            }
            "muteChanged" -> { muted = data.optBoolean("muted", muted); refreshToggles() }
            "speakerChanged" -> { speaker = data.optBoolean("on", speaker); refreshToggles() }
            "holdChanged" -> state.text = if (data.optBoolean("held")) "On hold" else if (connectedAt > 0) state.text else "Connecting…"
        }
    }
}
