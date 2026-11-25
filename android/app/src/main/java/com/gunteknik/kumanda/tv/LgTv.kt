package com.gunteknik.kumanda.tv

import android.content.Context
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * LG webOS (SSAP). wss://TV:3001 (2018+) ya da ws://TV:3000.
 * İşaretçi kanalı ile fare hareketi, tıklama ve kaydırma desteklenir.
 * Kaynak: github.com/hobbyquaker/lgtv2 (MIT) — eşleştirme manifesti assets/lg_pairing.json
 */
class LgTv(
    private val context: Context,
    override val host: String,
    private val events: TvEvents
) : TvDriver {
    override val platform = "webos"

    private val prefs = context.getSharedPreferences("tv_$host", Context.MODE_PRIVATE)
    private val client: OkHttpClient = OkHttpClient.Builder()
        .sslSocketFactory(TrustAll.sslContext().socketFactory, TrustAll)
        .hostnameVerifier { _, _ -> true }
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS)
        .pingInterval(10, TimeUnit.SECONDS)
        .build()

    @Volatile private var ws: WebSocket? = null
    @Volatile private var pointer: WebSocket? = null
    @Volatile private var registered = false
    private val ids = AtomicInteger(1)
    private val callbacks = ConcurrentHashMap<String, (JSONObject?, String?) -> Unit>()

    override fun connect(done: (String?) -> Unit) {
        if (isConnected()) { done(null); return }
        open("wss://$host:3001", done, fallback = true, unsigned = false)
    }

    private fun open(url: String, done: (String?) -> Unit, fallback: Boolean, unsigned: Boolean) {
        var finished = false
        fun finish(err: String?) { if (!finished) { finished = true; done(err) } }
        ws = client.newWebSocket(Request.Builder().url(url).build(), object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                register(webSocket, unsigned) { err ->
                    if (err == null) {
                        registered = true
                        openPointer()
                        finish(null)
                        events.event(host, "baglandi", JSONObject())
                    } else if (err.contains("blacklisted", true) && !unsigned) {
                        webSocket.close(1000, null)
                        open(url, done, fallback, unsigned = true)
                        finished = true
                    } else finish(err)
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                val m = runCatching { JSONObject(text) }.getOrNull() ?: return
                val id = m.optString("id")
                val type = m.optString("type")
                val payload = m.optJSONObject("payload")
                if (id == "register_0") {
                    when (type) {
                        "registered" -> {
                            payload?.optString("client-key")?.takeIf { it.isNotEmpty() }?.let {
                                prefs.edit().putString("client_key", it).apply()
                            }
                            callbacks.remove(id)?.invoke(payload, null)
                        }
                        "response" -> if (payload?.optString("pairingType") == "PROMPT")
                            events.event(host, "onay", JSONObject().put("mesaj", "TV ekranında bağlantıyı onaylayın"))
                        "error" -> callbacks.remove(id)?.invoke(null, m.optString("error", "Kayıt reddedildi"))
                    }
                    return
                }
                val cb = callbacks.remove(id) ?: return
                if (type == "error") cb(null, m.optString("error")) else cb(payload, null)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                registered = false
                if (!finished && fallback && url.startsWith("wss")) {
                    finished = true
                    open("ws://$host:3000", done, fallback = false, unsigned = unsigned)
                    return
                }
                finish(t.message ?: "LG TV'ye bağlanılamadı")
                events.event(host, "koptu", JSONObject())
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                registered = false
                events.event(host, "koptu", JSONObject())
            }
        })
    }

    private fun register(w: WebSocket, unsigned: Boolean, cb: (String?) -> Unit) {
        val pairing = JSONObject(context.assets.open("lg_pairing.json").bufferedReader().readText())
        if (unsigned) {
            val man = pairing.getJSONObject("manifest")
            man.remove("signed")
            man.put("appVersion", "1.0")
            man.getJSONArray("permissions").put("CONTROL_INPUT_TEXT").put("CONTROL_MOUSE_AND_KEYBOARD")
        }
        prefs.getString("client_key", null)?.let { pairing.put("client-key", it) }
        callbacks["register_0"] = { _, err -> cb(err) }
        w.send(JSONObject().put("id", "register_0").put("type", "register").put("payload", pairing).toString())
    }

    private fun request(uri: String, payload: JSONObject? = null, cb: ((JSONObject?, String?) -> Unit)? = null): Boolean {
        val w = ws ?: return false
        if (!registered) return false
        val id = "r" + ids.getAndIncrement()
        if (cb != null) callbacks[id] = cb
        val msg = JSONObject().put("id", id).put("type", "request").put("uri", uri)
        if (payload != null) msg.put("payload", payload)
        return w.send(msg.toString())
    }

    private fun openPointer() {
        request("ssap://com.webos.service.networkinput/getPointerInputSocket") { p, _ ->
            val path = p?.optString("socketPath") ?: return@request
            pointer = client.newWebSocket(Request.Builder().url(path).build(), object : WebSocketListener() {
                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) { pointer = null }
                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) { pointer = null }
            })
        }
    }

    private fun pointerSend(type: String, vararg kv: Pair<String, Any>): Boolean {
        val p = pointer ?: return false
        val sb = StringBuilder("type:").append(type).append('\n')
        for ((k, v) in kv) sb.append(k).append(':').append(v).append('\n')
        sb.append('\n')
        return p.send(sb.toString())
    }

    override fun isConnected() = ws != null && registered

    override fun key(name: String): Boolean {
        when (name) {
            "POWER" -> return request("ssap://system/turnOff")
            "SOURCE" -> return request("ssap://system.launcher/launch", JSONObject().put("id", "com.webos.app.inputpicker"))
            "SETTINGS" -> return request("ssap://system.launcher/launch", JSONObject().put("id", "com.palm.app.settings"))
            "PLAY_PAUSE" -> return pointerSend("button", "name" to "PLAY") || request("ssap://media.controls/play")
        }
        val b = BUTTONS[name] ?: return false
        return pointerSend("button", "name" to b)
    }

    override fun text(s: String) = request("ssap://com.webos.service.ime/insertText", JSONObject().put("text", s).put("replace", 0))
    override fun enter() = request("ssap://com.webos.service.ime/sendEnterKey")
    override fun backspace() = request("ssap://com.webos.service.ime/deleteCharacters", JSONObject().put("count", 1))
    override fun pointerMove(dx: Int, dy: Int) = pointerSend("move", "dx" to dx, "dy" to dy, "down" to 0)
    override fun pointerClick() = pointerSend("click")
    override fun pointerScroll(dx: Int, dy: Int) = pointerSend("scroll", "dx" to dx, "dy" to dy)

    override fun launch(app: String) =
        request("ssap://system.launcher/launch", JSONObject().put("id", APPS[app] ?: app))

    fun toast(msg: String) = request("ssap://system.notifications/createToast", JSONObject().put("message", msg))

    override fun info(done: (JSONObject) -> Unit) {
        val r = JSONObject().put("platform", platform).put("host", host)
        val ok = request("ssap://com.webos.service.update/getCurrentSWInformation") { p, _ ->
            if (p != null) {
                r.put("model", p.optString("model_name")).put("urun", p.optString("product_name"))
                    .put("version", p.optString("major_ver") + "." + p.optString("minor_ver"))
                    .put("mac", p.optString("device_id"))
                if (p.optString("device_id").isNotEmpty()) prefs.edit().putString("mac", p.optString("device_id")).apply()
            }
            request("ssap://system/getSystemInfo") { q, _ ->
                if (q != null) r.put("modelName", q.optString("modelName"))
                done(r)
            } || run { done(r); true }
        }
        if (!ok) done(r)
    }

    override fun close() {
        runCatching { pointer?.close(1000, null) }
        runCatching { ws?.close(1000, null) }
        registered = false
    }

    companion object {
        val BUTTONS = mapOf(
            "UP" to "UP", "DOWN" to "DOWN", "LEFT" to "LEFT", "RIGHT" to "RIGHT",
            "OK" to "ENTER", "BACK" to "BACK", "HOME" to "HOME", "EXIT" to "EXIT",
            "MENU" to "MENU", "INFO" to "INFO", "VOL_UP" to "VOLUMEUP", "VOL_DOWN" to "VOLUMEDOWN",
            "MUTE" to "MUTE", "CH_UP" to "CHANNELUP", "CH_DOWN" to "CHANNELDOWN",
            "PLAY" to "PLAY", "PAUSE" to "PAUSE", "STOP" to "STOP", "REW" to "REWIND",
            "FF" to "FASTFORWARD", "RED" to "RED", "GREEN" to "GREEN", "YELLOW" to "YELLOW",
            "BLUE" to "BLUE", "GUIDE" to "GUIDE", "SUBTITLE" to "CC", "LIST" to "LIST",
            "QMENU" to "QMENU", "0" to "0", "1" to "1", "2" to "2", "3" to "3", "4" to "4",
            "5" to "5", "6" to "6", "7" to "7", "8" to "8", "9" to "9", "DASH" to "DASH"
        )
        val APPS = mapOf(
            "youtube" to "youtube.leanback.v4", "netflix" to "netflix",
            "prime" to "amazon", "disney" to "com.disney.disneyplus-prod",
            "spotify" to "spotify-beehive", "browser" to "com.webos.app.browser"
        )
    }
}
