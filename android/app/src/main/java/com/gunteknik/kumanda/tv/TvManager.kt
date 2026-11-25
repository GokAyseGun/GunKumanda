package com.gunteknik.kumanda.tv

import android.content.Context
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.util.concurrent.ConcurrentHashMap
import kotlin.concurrent.thread

/**
 * Akıllı TV bağlantılarını yönetir. Aynı anda bir "aktif" TV vardır; tuş,
 * yazı ve imleç komutları ona gider.
 */
class TvManager(private val context: Context, private val events: TvEvents) {

    private val drivers = ConcurrentHashMap<String, TvDriver>()
    val discovery = TvDiscovery(context)
    @Volatile var active: TvDriver? = null
        private set
    private val helper = HelperLink()

    fun driver(host: String, platform: String): TvDriver {
        val cur = drivers[host]
        if (cur != null && cur.platform == platform) return cur
        cur?.close()
        val d: TvDriver = when (platform) {
            "androidtv" -> AndroidTv(context, host, events)
            "webos" -> LgTv(context, host, events)
            "tizen" -> SamsungTv(context, host, events)
            "vestel" -> VestelTv(context, host, events)
            "sony" -> SonyTv(context, host, events)
            else -> throw IllegalArgumentException("Bilinmeyen platform: $platform")
        }
        drivers[host] = d
        return d
    }

    fun connect(host: String, platform: String, done: (String?) -> Unit) {
        val d = try { driver(host, platform) } catch (e: Exception) { done(e.message); return }
        active = d
        d.connect { err ->
            if (err == null && platform == "androidtv") helper.check(host)
            done(err)
        }
    }

    fun disconnectAll() {
        drivers.values.forEach { runCatching { it.close() } }
        drivers.clear()
        active = null
    }

    fun androidTv(host: String): AndroidTv? = drivers[host] as? AndroidTv ?: (driver(host, "androidtv") as? AndroidTv)

    fun key(name: String): Boolean = active?.key(name) ?: false
    fun text(s: String): Boolean = active?.text(s) ?: false
    fun enter(): Boolean = active?.enter() ?: false
    fun backspace(): Boolean = active?.backspace() ?: false
    fun launch(app: String): Boolean = active?.launch(app) ?: false

    /** İmleç: önce TV'nin kendi desteği, Android TV'de yardımcı uygulama */
    fun pointerMove(dx: Int, dy: Int): Boolean {
        val a = active ?: return false
        if (a.platform == "androidtv" && helper.available(a.host)) return helper.move(a.host, dx, dy)
        return a.pointerMove(dx, dy)
    }

    fun pointerClick(): Boolean {
        val a = active ?: return false
        if (a.platform == "androidtv" && helper.available(a.host)) return helper.click(a.host)
        return a.pointerClick()
    }

    fun pointerScroll(dx: Int, dy: Int): Boolean {
        val a = active ?: return false
        if (a.platform == "androidtv" && helper.available(a.host)) return helper.scroll(a.host, dx, dy)
        return a.pointerScroll(dx, dy)
    }

    fun hasPointer(): Boolean {
        val a = active ?: return false
        return when (a.platform) {
            "webos", "tizen" -> true
            "androidtv" -> helper.available(a.host)
            else -> false
        }
    }

    fun info(done: (JSONObject) -> Unit) {
        val a = active ?: run { done(JSONObject()); return }
        a.info { j ->
            j.put("imlec", hasPointer())
            done(j)
        }
    }

    fun wake(host: String): String? {
        val mac = context.getSharedPreferences("tv_$host", Context.MODE_PRIVATE).getString("mac", null)
            ?: return "Bu TV'nin MAC adresi henüz bilinmiyor (bir kez bağlandıktan sonra öğrenilir)."
        return Wol.send(mac)
    }

    /**
     * Android TV'ye kurulan "Gün Kumanda TV Yardımcısı" ile UDP bağlantısı.
     * Yardımcı, erişilebilirlik servisiyle ekranda imleç gösterir ve tıklar.
     */
    private class HelperLink {
        private val port = 47800
        private val ok = ConcurrentHashMap<String, Long>()
        private val sock by lazy { DatagramSocket().apply { soTimeout = 700 } }

        fun available(host: String): Boolean = (ok[host] ?: 0L) > 0L

        fun check(host: String) {
            thread {
                runCatching {
                    DatagramSocket().use { s ->
                        s.soTimeout = 800
                        val b = "P".toByteArray()
                        s.send(DatagramPacket(b, b.size, InetAddress.getByName(host), port))
                        val r = DatagramPacket(ByteArray(16), 16)
                        s.receive(r)
                        if (String(r.data, 0, r.length).startsWith("OK")) ok[host] = System.currentTimeMillis()
                    }
                }
            }
        }

        private fun send(host: String, msg: String): Boolean = runCatching {
            val b = msg.toByteArray()
            sock.send(DatagramPacket(b, b.size, InetAddress.getByName(host), port))
            true
        }.getOrDefault(false)

        fun move(host: String, dx: Int, dy: Int) = send(host, "M $dx $dy")
        fun click(host: String) = send(host, "C")
        fun scroll(host: String, dx: Int, dy: Int) = send(host, "S $dx $dy")
    }
}
