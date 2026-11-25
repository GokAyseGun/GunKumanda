package com.gunteknik.kumanda.tvhelper

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import java.net.DatagramPacket
import java.net.DatagramSocket
import kotlin.concurrent.thread

/**
 * Android TV'de imleç gösterir. Telefondaki Gün Kumanda UDP 47800 portuna
 * "M dx dy" (hareket), "C" (tıkla), "S dx dy" (kaydır), "P" (yoklama) gönderir.
 */
class CursorService : AccessibilityService() {

    private val main = Handler(Looper.getMainLooper())
    private lateinit var wm: WindowManager
    private var cursor: CursorView? = null
    private var params: WindowManager.LayoutParams? = null
    private var x = 0f
    private var y = 0f
    private var screenW = 1920
    private var screenH = 1080
    @Volatile private var running = false
    private var socket: DatagramSocket? = null
    private val hide = Runnable { cursor?.visibility = View.GONE }

    override fun onServiceConnected() {
        super.onServiceConnected()
        wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val m = resources.displayMetrics
        screenW = m.widthPixels
        screenH = m.heightPixels
        x = screenW / 2f
        y = screenH / 2f
        val v = CursorView(this)
        val p = WindowManager.LayoutParams(
            48, 48,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        )
        p.gravity = Gravity.TOP or Gravity.START
        p.x = x.toInt(); p.y = y.toInt()
        wm.addView(v, p)
        v.visibility = View.GONE
        cursor = v
        params = p
        startServer()
    }

    private fun startServer() {
        running = true
        thread(name = "imlec-udp") {
            try {
                val s = DatagramSocket(47800)
                socket = s
                val buf = ByteArray(128)
                while (running) {
                    val pkt = DatagramPacket(buf, buf.size)
                    s.receive(pkt)
                    val parts = String(pkt.data, 0, pkt.length).trim().split(' ')
                    when (parts[0]) {
                        "P" -> {
                            val ok = "OK".toByteArray()
                            s.send(DatagramPacket(ok, ok.size, pkt.address, pkt.port))
                        }
                        "M" -> if (parts.size >= 3) main.post { move(parts[1].toFloat(), parts[2].toFloat()) }
                        "C" -> main.post { tap() }
                        "S" -> if (parts.size >= 3) main.post { scroll(parts[1].toFloat(), parts[2].toFloat()) }
                    }
                }
            } catch (_: Exception) {
            }
        }
    }

    private fun show() {
        cursor?.visibility = View.VISIBLE
        main.removeCallbacks(hide)
        main.postDelayed(hide, 6000)
    }

    private fun move(dx: Float, dy: Float) {
        x = (x + dx).coerceIn(0f, screenW - 1f)
        y = (y + dy).coerceIn(0f, screenH - 1f)
        val p = params ?: return
        p.x = x.toInt(); p.y = y.toInt()
        runCatching { wm.updateViewLayout(cursor, p) }
        show()
    }

    private fun tap() {
        show()
        val path = Path().apply { moveTo(x, y) }
        dispatchGesture(GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 60)).build(), null, null)
    }

    private fun scroll(dx: Float, dy: Float) {
        show()
        val path = Path().apply {
            moveTo(x, y)
            lineTo((x - dx * 4).coerceIn(0f, screenW - 1f), (y - dy * 4).coerceIn(0f, screenH - 1f))
        }
        dispatchGesture(GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 180)).build(), null, null)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}
    override fun onInterrupt() {}

    override fun onDestroy() {
        running = false
        runCatching { socket?.close() }
        runCatching { cursor?.let { wm.removeView(it) } }
        super.onDestroy()
    }

    /** Hardal renkli, buz mavisi kenarlı ok imleç */
    class CursorView(ctx: Context) : View(ctx) {
        private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(0xE0, 0xA5, 0x26) }
        private val edge = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.rgb(0xBF, 0xE6, 0xF2); style = Paint.Style.STROKE; strokeWidth = 3f
        }
        private val arrow = Path().apply {
            moveTo(2f, 2f); lineTo(2f, 40f); lineTo(12f, 30f); lineTo(20f, 46f)
            lineTo(27f, 43f); lineTo(19f, 27f); lineTo(33f, 27f); close()
        }

        override fun onDraw(canvas: Canvas) {
            canvas.drawPath(arrow, fill)
            canvas.drawPath(arrow, edge)
        }
    }
}
