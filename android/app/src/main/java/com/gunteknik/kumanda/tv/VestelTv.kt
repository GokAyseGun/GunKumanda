package com.gunteknik.kumanda.tv

import android.content.Context
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

/**
 * Vestel ailesi (Vestel, Regal, Finlux, Telefunken, Toshiba, JVC, Hitachi, Sharp,
 * Panasonic'in Vestel üretimi modelleri) ağ kumandası.
 * DIAL keşfi ile "Application-URL" bulunur, tuşlar <app-url>vr/remote adresine
 * XML olarak gönderilir. Tuş kodu = 1000 + RC5 komut numarası.
 * Kaynak: github.com/T3m3z/pyvesteltv
 * Not: TV IR kumandayla kapatılırsa derin uykuya geçer ve ağdan açılamaz;
 * uygulama bu durumda IR ile açmayı dener.
 */
class VestelTv(
    context: Context,
    override val host: String,
    private val events: TvEvents
) : TvDriver {
    override val platform = "vestel"

    private val prefs = context.getSharedPreferences("tv_$host", Context.MODE_PRIVATE)
    private val client = OkHttpClient.Builder().connectTimeout(3, TimeUnit.SECONDS)
        .readTimeout(4, TimeUnit.SECONDS).build()
    @Volatile private var appUrl: String? = prefs.getString("app_url", null)

    override fun connect(done: (String?) -> Unit) {
        thread {
            val url = discover() ?: appUrl ?: "http://$host:56789/apps/"
            appUrl = url
            prefs.edit().putString("app_url", url).apply()
            // Bağlantı kontrolü: zararsız bir tuş göndermek yerine adrese HEAD/GET
            val ok = runCatching {
                client.newCall(Request.Builder().url(url).build()).execute().use { it.code in 200..499 }
            }.getOrDefault(false)
            if (ok) {
                events.event(host, "baglandi", JSONObject())
                done(null)
            } else done("Vestel TV'ye ulaşılamadı (TV açık ve aynı ağda mı?)")
        }
    }

    /** SSDP ile DIAL adresini bul */
    private fun discover(): String? = runCatching {
        DatagramSocket().use { s ->
            s.soTimeout = 1500
            val msg = ("M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\n" +
                "MX: 1\r\nST: urn:dial-multiscreen-org:service:dial:1\r\n\r\n").toByteArray()
            s.send(DatagramPacket(msg, msg.size, InetAddress.getByName(host), 1900))
            s.send(DatagramPacket(msg, msg.size, InetAddress.getByName("239.255.255.250"), 1900))
            val buf = ByteArray(2048)
            val end = System.currentTimeMillis() + 2500
            while (System.currentTimeMillis() < end) {
                val p = DatagramPacket(buf, buf.size)
                s.receive(p)
                if (p.address.hostAddress != host) continue
                val text = String(p.data, 0, p.length)
                val loc = text.lines().firstOrNull { it.startsWith("LOCATION:", true) }
                    ?.substringAfter(":")?.trim() ?: continue
                val res = client.newCall(Request.Builder().url(loc).build()).execute()
                val app = res.header("Application-URL")
                res.close()
                if (app != null) return@runCatching if (app.endsWith("/")) app else "$app/"
            }
            null
        }
    }.getOrNull()

    override fun isConnected() = appUrl != null

    private fun sendCode(code: Int): Boolean {
        val url = appUrl ?: return false
        thread {
            runCatching {
                val xml = "<?xml version=\"1.0\" ?><remote><key code=\"$code\"/></remote>"
                client.newCall(Request.Builder().url(url + "vr/remote")
                    .post(xml.toRequestBody("text/plain".toMediaType())).build()).execute().close()
            }
        }
        return true
    }

    override fun key(name: String): Boolean {
        val c = RC5[name] ?: return false
        return sendCode(1000 + c)
    }

    override fun close() {}

    companion object {
        // Vestel kumandalarının RC5 komut numaraları (adres 1)
        val RC5 = mapOf(
            "POWER" to 12, "MUTE" to 13, "VOL_UP" to 16, "VOL_DOWN" to 17,
            "CH_UP" to 32, "CH_DOWN" to 33, "UP" to 20, "DOWN" to 19, "LEFT" to 21,
            "RIGHT" to 22, "OK" to 53, "BACK" to 10, "EXIT" to 37, "HOME" to 48,
            "MENU" to 48, "SOURCE" to 56, "INFO" to 18, "GUIDE" to 47, "LIST" to 38,
            "PLAY" to 25, "PAUSE" to 49, "PLAY_PAUSE" to 25, "STOP" to 24, "REW" to 27,
            "FF" to 28, "PREV" to 27, "NEXT" to 28, "RED" to 55, "GREEN" to 54,
            "YELLOW" to 50, "BLUE" to 52, "SUBTITLE" to 31, "QMENU" to 43,
            "0" to 0, "1" to 1, "2" to 2, "3" to 3, "4" to 4, "5" to 5,
            "6" to 6, "7" to 7, "8" to 8, "9" to 9
        )
    }
}
