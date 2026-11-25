package com.gunteknik.kumanda.tv

import android.content.Context
import android.util.Base64
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

/**
 * Samsung Tizen (2016+) WebSocket uzaktan kumanda API'si.
 * wss://TV:8002/api/v2/channels/samsung.remote.control (ilk bağlantıda TV onay ister)
 * Kaynak: github.com/xchwarze/samsung-tv-ws-api
 */
class SamsungTv(
    private val context: Context,
    override val host: String,
    private val events: TvEvents
) : TvDriver {
    override val platform = "tizen"

    private val prefs = context.getSharedPreferences("tv_$host", Context.MODE_PRIVATE)
    private val client = OkHttpClient.Builder()
        .sslSocketFactory(TrustAll.sslContext().socketFactory, TrustAll)
        .hostnameVerifier { _, _ -> true }
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS)
        .pingInterval(15, TimeUnit.SECONDS)
        .build()
    @Volatile private var ws: WebSocket? = null
    @Volatile private var ready = false
    private val name = Base64.encodeToString("Gün Kumanda".toByteArray(), Base64.NO_WRAP)

    override fun connect(done: (String?) -> Unit) {
        if (isConnected()) { done(null); return }
        val token = prefs.getString("token", null)
        val url = "wss://$host:8002/api/v2/channels/samsung.remote.control?name=$name" +
            (if (token != null) "&token=$token" else "")
        var finished = false
        fun finish(e: String?) { if (!finished) { finished = true; done(e) } }
        events.event(host, "onay", JSONObject().put("mesaj", "İlk bağlantıda TV ekranında 'İzin ver' seçin"))
        ws = client.newWebSocket(Request.Builder().url(url).build(), object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, text: String) {
                val m = runCatching { JSONObject(text) }.getOrNull() ?: return
                when (m.optString("event")) {
                    "ms.channel.connect" -> {
                        m.optJSONObject("data")?.optString("token")?.takeIf { it.isNotEmpty() }?.let {
                            prefs.edit().putString("token", it).apply()
                        }
                        ready = true
                        finish(null)
                        events.event(host, "baglandi", JSONObject())
                    }
                    "ms.channel.unauthorized" -> finish("TV bağlantıyı reddetti")
                    "ms.channel.timeOut" -> finish("TV'de onay verilmedi")
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                ready = false
                finish(t.message ?: "Samsung TV'ye bağlanılamadı")
                events.event(host, "koptu", JSONObject())
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                ready = false
                events.event(host, "koptu", JSONObject())
            }
        })
    }

    override fun isConnected() = ws != null && ready

    private fun remote(params: JSONObject): Boolean {
        val w = ws ?: return false
        if (!ready) return false
        return w.send(JSONObject().put("method", "ms.remote.control").put("params", params).toString())
    }

    private fun click(key: String) = remote(JSONObject()
        .put("Cmd", "Click").put("DataOfCmd", key).put("Option", "false").put("TypeOfRemote", "SendRemoteKey"))

    fun press(key: String, down: Boolean) = remote(JSONObject()
        .put("Cmd", if (down) "Press" else "Release").put("DataOfCmd", key)
        .put("Option", "false").put("TypeOfRemote", "SendRemoteKey"))

    override fun key(name: String): Boolean = click(KEYS[name] ?: return false)

    override fun text(s: String): Boolean {
        val ok = remote(JSONObject()
            .put("Cmd", Base64.encodeToString(s.toByteArray(), Base64.NO_WRAP))
            .put("DataOfCmd", "base64").put("TypeOfRemote", "SendInputString"))
        remote(JSONObject().put("TypeOfRemote", "SendInputEnd"))
        return ok
    }

    override fun enter() = click("KEY_ENTER")

    // Deneysel: Samsung'un tarayıcı/uygulama imleci (ProcessMouseDevice)
    override fun pointerMove(dx: Int, dy: Int) = remote(JSONObject()
        .put("Cmd", "Move").put("TypeOfRemote", "ProcessMouseDevice")
        .put("Position", JSONObject().put("x", dx).put("y", dy).put("Time", System.currentTimeMillis().toString())))

    override fun pointerClick() = remote(JSONObject()
        .put("Cmd", "LeftClick").put("TypeOfRemote", "ProcessMouseDevice"))

    override fun launch(app: String): Boolean {
        val w = ws ?: return false
        return w.send(JSONObject().put("method", "ms.channel.emit").put("params", JSONObject()
            .put("event", "ed.apps.launch").put("to", "host")
            .put("data", JSONObject().put("action_type", "DEEP_LINK").put("appId", APPS[app] ?: app).put("metaTag", ""))).toString())
    }

    override fun info(done: (JSONObject) -> Unit) {
        thread {
            val r = JSONObject().put("platform", platform).put("host", host)
            runCatching {
                val res = client.newCall(Request.Builder().url("http://$host:8001/api/v2/").build()).execute()
                val d = JSONObject(res.body?.string() ?: "{}").optJSONObject("device")
                if (d != null) {
                    r.put("model", d.optString("modelName")).put("ad", d.optString("name"))
                        .put("mac", d.optString("wifiMac")).put("version", d.optString("firmwareVersion"))
                        .put("os", d.optString("OS"))
                    if (d.optString("wifiMac").isNotEmpty()) prefs.edit().putString("mac", d.optString("wifiMac")).apply()
                }
            }
            done(r)
        }
    }

    override fun close() {
        runCatching { ws?.close(1000, null) }
        ready = false
    }

    companion object {
        val KEYS = mapOf(
            "POWER" to "KEY_POWER", "VOL_UP" to "KEY_VOLUP", "VOL_DOWN" to "KEY_VOLDOWN",
            "MUTE" to "KEY_MUTE", "CH_UP" to "KEY_CHUP", "CH_DOWN" to "KEY_CHDOWN",
            "UP" to "KEY_UP", "DOWN" to "KEY_DOWN", "LEFT" to "KEY_LEFT", "RIGHT" to "KEY_RIGHT",
            "OK" to "KEY_ENTER", "BACK" to "KEY_RETURN", "HOME" to "KEY_HOME", "MENU" to "KEY_MENU",
            "SOURCE" to "KEY_SOURCE", "INFO" to "KEY_INFO", "EXIT" to "KEY_EXIT",
            "PLAY" to "KEY_PLAY", "PAUSE" to "KEY_PAUSE", "PLAY_PAUSE" to "KEY_PLAY", "STOP" to "KEY_STOP",
            "FF" to "KEY_FF", "REW" to "KEY_REWIND", "NEXT" to "KEY_FF", "PREV" to "KEY_REWIND",
            "RED" to "KEY_RED", "GREEN" to "KEY_GREEN", "YELLOW" to "KEY_YELLOW", "BLUE" to "KEY_CYAN",
            "GUIDE" to "KEY_GUIDE", "LIST" to "KEY_CH_LIST", "SETTINGS" to "KEY_MENU",
            "SUBTITLE" to "KEY_CAPTION", "TV" to "KEY_TV", "DEL" to "KEY_DEL",
            "0" to "KEY_0", "1" to "KEY_1", "2" to "KEY_2", "3" to "KEY_3", "4" to "KEY_4",
            "5" to "KEY_5", "6" to "KEY_6", "7" to "KEY_7", "8" to "KEY_8", "9" to "KEY_9"
        )
        val APPS = mapOf(
            "youtube" to "111299001912", "netflix" to "3201907018807",
            "prime" to "3201910019365", "disney" to "3201901017640",
            "spotify" to "3201606009684", "browser" to "org.tizen.browser"
        )
    }
}
