package com.gunteknik.kumanda.tv

import android.content.Context
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

/**
 * Sony Bravia IRCC-IP. TV'de: Ayarlar > Ağ > Ev ağı > IP kontrolü >
 * Kimlik doğrulama "Normal ve Önceden Paylaşılan Anahtar" ve bir PSK girilmeli.
 * (Android TV olan Bravia'lar Android TV protokolüyle de kontrol edilebilir.)
 */
class SonyTv(
    context: Context,
    override val host: String,
    private val events: TvEvents
) : TvDriver {
    override val platform = "sony"

    private val prefs = context.getSharedPreferences("tv_$host", Context.MODE_PRIVATE)
    private val client = OkHttpClient.Builder().connectTimeout(3, TimeUnit.SECONDS)
        .readTimeout(5, TimeUnit.SECONDS).build()
    private val codes = HashMap<String, String>()
    var psk: String
        get() = prefs.getString("psk", "0000") ?: "0000"
        set(v) { prefs.edit().putString("psk", v).apply() }

    override fun connect(done: (String?) -> Unit) {
        thread {
            try {
                val body = """{"method":"getRemoteControllerInfo","id":10,"params":[],"version":"1.0"}"""
                val res = client.newCall(Request.Builder().url("http://$host/sony/system")
                    .header("X-Auth-PSK", psk)
                    .post(body.toRequestBody("application/json".toMediaType())).build()).execute()
                val j = JSONObject(res.body?.string() ?: "{}")
                res.close()
                val arr = j.optJSONArray("result")?.optJSONArray(1)
                    ?: throw Exception("TV yanıtı beklenmedik. IP kontrolü ve PSK ayarını kontrol edin.")
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    codes[o.optString("name")] = o.optString("value")
                }
                events.event(host, "baglandi", JSONObject())
                done(null)
            } catch (e: Exception) {
                done(e.message ?: "Sony TV'ye bağlanılamadı")
            }
        }
    }

    override fun isConnected() = codes.isNotEmpty()

    private fun ircc(code: String): Boolean {
        thread {
            runCatching {
                val soap = "<?xml version=\"1.0\"?><s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" " +
                    "s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\"><s:Body>" +
                    "<u:X_SendIRCC xmlns:u=\"urn:schemas-sony-com:service:IRCC:1\"><IRCCCode>$code</IRCCCode>" +
                    "</u:X_SendIRCC></s:Body></s:Envelope>"
                client.newCall(Request.Builder().url("http://$host/sony/IRCC")
                    .header("X-Auth-PSK", psk)
                    .header("SOAPACTION", "\"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC\"")
                    .post(soap.toRequestBody("text/xml; charset=UTF-8".toMediaType())).build()).execute().close()
            }
        }
        return true
    }

    override fun key(name: String): Boolean {
        val sonyName = NAMES[name] ?: name
        val code = codes[sonyName] ?: return false
        return ircc(code)
    }

    override fun close() {}

    companion object {
        val NAMES = mapOf(
            "POWER" to "PowerOff", "VOL_UP" to "VolumeUp", "VOL_DOWN" to "VolumeDown",
            "MUTE" to "Mute", "CH_UP" to "ChannelUp", "CH_DOWN" to "ChannelDown",
            "UP" to "Up", "DOWN" to "Down", "LEFT" to "Left", "RIGHT" to "Right",
            "OK" to "Confirm", "BACK" to "Return", "HOME" to "Home", "MENU" to "Options",
            "SOURCE" to "Input", "INFO" to "Display", "EXIT" to "Exit", "PLAY" to "Play",
            "PAUSE" to "Pause", "PLAY_PAUSE" to "Play", "STOP" to "Stop", "FF" to "Forward",
            "REW" to "Rewind", "NEXT" to "Next", "PREV" to "Prev", "RED" to "Red",
            "GREEN" to "Green", "YELLOW" to "Yellow", "BLUE" to "Blue", "GUIDE" to "EPG",
            "SUBTITLE" to "SubTitle", "0" to "Num0", "1" to "Num1", "2" to "Num2",
            "3" to "Num3", "4" to "Num4", "5" to "Num5", "6" to "Num6", "7" to "Num7",
            "8" to "Num8", "9" to "Num9"
        )
    }
}
