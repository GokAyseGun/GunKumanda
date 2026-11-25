package com.gunteknik.kumanda.motion

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.HandlerThread
import kotlin.math.abs
import kotlin.math.sqrt

/**
 * Jiroskopla havada fare + hareket kısayolları.
 *
 * Telefon hangi açıyla tutulursa tutulsun, sağ-sol hareket yerçekimi eksenine
 * göre (yaw), yukarı-aşağı hareket telefonun yatay eksenine göre (pitch)
 * hesaplanır. Küçük titremeler ölü bölgeyle süzülür, hızlı hareketlerde
 * ivmelenme eğrisi uygulanır (gerçek fare hissi).
 *
 * Modlar:
 *  - "fare":   imleç hareketi (engaged iken ya da her zaman)
 *  - "dugme":  telefonu düğme gibi çevirerek ses (her ~18°'de bir adım)
 *  - "jest":   bilek fiskesi sağ/sol, telefonu ters çevirme (sessiz)
 */
class AirMouse(context: Context) : SensorEventListener {

    interface Sink {
        fun move(dx: Int, dy: Int)
        fun gesture(name: String)
    }

    var sink: Sink? = null
    var sensitivity = 1.0f      // kullanıcı ayarı (0.3 - 3)
    var acceleration = 1.0f     // ivme eğrisi (0 - 2)
    var invertY = false
    @Volatile var engaged = false
    @Volatile var mode = "fare"
    var always = false
    var gesturesEnabled = true

    private val sm = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val gyro: Sensor? = sm.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
    private val gravitySensor: Sensor? = sm.getDefaultSensor(Sensor.TYPE_GRAVITY)
        ?: sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    private var thread: HandlerThread? = null
    private var running = false

    val available: Boolean get() = gyro != null

    private val g = floatArrayOf(0f, 0f, 9.81f)
    private var lastTs = 0L
    private var sx = 0f
    private var sy = 0f
    private var remX = 0f
    private var remY = 0f
    private var knob = 0f
    private var faceDownSince = 0L
    private var lastGesture = 0L

    fun start(): Boolean {
        if (gyro == null) return false
        if (running) return true
        val t = HandlerThread("havada-fare").apply { start() }
        thread = t
        val h = Handler(t.looper)
        sm.registerListener(this, gyro, SensorManager.SENSOR_DELAY_GAME, h)
        gravitySensor?.let { sm.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME, h) }
        running = true
        return true
    }

    fun stop() {
        if (!running) return
        sm.unregisterListener(this)
        thread?.quitSafely()
        thread = null
        running = false
        lastTs = 0L
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    override fun onSensorChanged(e: SensorEvent) {
        when (e.sensor.type) {
            Sensor.TYPE_GRAVITY, Sensor.TYPE_ACCELEROMETER -> {
                // İvmeölçerden gelirse alçak geçiren filtre ile yerçekimini ayır
                val a = if (e.sensor.type == Sensor.TYPE_GRAVITY) 1f else 0.1f
                for (i in 0..2) g[i] = g[i] + a * (e.values[i] - g[i])
                checkFaceDown(e.timestamp)
            }
            Sensor.TYPE_GYROSCOPE -> onGyro(e)
        }
    }

    private fun onGyro(e: SensorEvent) {
        val dt = if (lastTs == 0L) 0.02f else ((e.timestamp - lastTs) / 1e9f).coerceIn(0.001f, 0.1f)
        lastTs = e.timestamp
        val wx = e.values[0]
        val wy = e.values[1]
        val wz = e.values[2]
        val gn = sqrt(g[0] * g[0] + g[1] * g[1] + g[2] * g[2]).coerceAtLeast(0.1f)
        // Dünya dikey eksenine göre dönüş (sağ-sol)
        val yaw = (wx * g[0] + wy * g[1] + wz * g[2]) / gn
        // Telefonun yatay ekseni etrafında dönüş (yukarı-aşağı)
        val pitch = wx

        if (gesturesEnabled && mode != "dugme") detectFlick(yaw, e.timestamp)

        when (mode) {
            "dugme" -> {
                if (!engaged) { knob = 0f; return }
                // Telefonun uzun ekseni etrafında çevirme (düğme)
                knob += wy * dt * 57.3f
                while (knob > 18f) { knob -= 18f; sink?.gesture("ses_azalt") }
                while (knob < -18f) { knob += 18f; sink?.gesture("ses_artir") }
            }
            else -> {
                if (!(engaged || always)) { sx = 0f; sy = 0f; return }
                var vx = -yaw
                var vy = -pitch
                if (invertY) vy = -vy
                // ölü bölge (rad/s)
                val dz = 0.015f
                vx = if (abs(vx) < dz) 0f else vx - dz * Math.signum(vx)
                vy = if (abs(vy) < dz) 0f else vy - dz * Math.signum(vy)
                val speed = sqrt(vx * vx + vy * vy)
                val gain = 900f * sensitivity * (1f + acceleration * 0.9f * speed)
                // yumuşatma
                sx = 0.55f * sx + 0.45f * vx
                sy = 0.55f * sy + 0.45f * vy
                remX += sx * gain * dt
                remY += sy * gain * dt
                val ix = remX.toInt()
                val iy = remY.toInt()
                if (ix != 0 || iy != 0) {
                    remX -= ix
                    remY -= iy
                    sink?.move(ix, iy)
                }
            }
        }
    }

    private fun detectFlick(yaw: Float, ts: Long) {
        if (engaged) return
        val now = ts / 1_000_000L
        if (now - lastGesture < 700) return
        if (yaw > 6.5f) { lastGesture = now; sink?.gesture("fiske_sol") }
        else if (yaw < -6.5f) { lastGesture = now; sink?.gesture("fiske_sag") }
    }

    private fun checkFaceDown(ts: Long) {
        if (!gesturesEnabled) return
        val now = ts / 1_000_000L
        if (g[2] < -8.5f) {
            if (faceDownSince == 0L) faceDownSince = now
            else if (now - faceDownSince > 700 && now - lastGesture > 1500) {
                lastGesture = now
                faceDownSince = Long.MAX_VALUE / 2
                sink?.gesture("ters")
            }
        } else if (g[2] > -5f) {
            faceDownSince = 0L
        }
    }
}
