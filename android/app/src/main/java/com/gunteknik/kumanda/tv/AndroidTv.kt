package com.gunteknik.kumanda.tv

import android.content.Context
import org.json.JSONObject
import java.io.OutputStream
import java.security.MessageDigest
import java.security.interfaces.RSAPublicKey
import javax.net.ssl.SSLSocket
import kotlin.concurrent.thread

/**
 * Android TV / Google TV uzaktan kumanda protokolü v2.
 * Google TV uygulamasının kullandığı protokoldür; TV'de geliştirici modu
 * gerekmez. Eşleştirme 6467, kontrol 6466 portundan TLS ile yapılır.
 * Kaynak: github.com/tronikos/androidtvremote2 (polo.proto, remotemessage.proto)
 */
class AndroidTv(
    private val context: Context,
    override val host: String,
    private val events: TvEvents
) : TvDriver {
    override val platform = "androidtv"

    private val identity by lazy { ClientIdentity.load(context) }
    @Volatile private var socket: SSLSocket? = null
    @Volatile private var out: OutputStream? = null
    @Volatile private var started = false
    private var imeCounter = 0L
    private var fieldCounter = 0L
    private var deviceInfo = JSONObject()

    // PING | KEY | IME | POWER | VOLUME | APP_LINK
    private val features = 1 or 2 or 4 or 32 or 64 or 512

    // --- Eşleştirme ---------------------------------------------------------
    @Volatile private var pairSocket: SSLSocket? = null

    /** Eşleştirmeyi başlat: TV ekranında 6 haneli kod çıkar. */
    fun startPairing(done: (String?) -> Unit) {
        thread(name = "atv-pair") {
            try {
                val s = identity.sslContext().socketFactory.createSocket(host, 6467) as SSLSocket
                s.soTimeout = 60000
                s.startHandshake()
                pairSocket = s
                val o = s.outputStream
                val i = s.inputStream
                fun outer(): Pb = Pb().int(1, 2).int(2, 200)
                fun send(m: Pb) {
                    val b = m.toByteArray()
                    o.write(Pb.varint(b.size.toLong()) + b); o.flush()
                }
                send(outer().msg(10, Pb().str(1, "atvremote").str(2, "Gün Kumanda")))
                while (true) {
                    val raw = Pb.readDelimited(i) ?: throw Exception("TV bağlantıyı kapattı")
                    val m = PbMsg(raw)
                    if (m.int(2) != 200L) throw Exception("TV eşleştirmeyi reddetti (${m.int(2)})")
                    when {
                        m.has(11) -> send(outer().msg(20, Pb()
                            .msg(1, Pb().int(1, 3).int(2, 6))
                            .int(3, 1)))
                        m.has(20) -> send(outer().msg(30, Pb()
                            .msg(1, Pb().int(1, 3).int(2, 6))
                            .int(2, 1)))
                        m.has(31) -> { done(null); return@thread }
                    }
                }
            } catch (e: Exception) {
                runCatching { pairSocket?.close() }
                pairSocket = null
                done(e.message ?: "Eşleştirme başlatılamadı")
            }
        }
    }

    /** TV ekranındaki 6 haneli kodu gönder. */
    fun finishPairing(code: String, done: (String?) -> Unit) {
        thread(name = "atv-pair2") {
            val s = pairSocket
            if (s == null) { done("Önce eşleştirmeyi başlatın"); return@thread }
            try {
                val c = code.trim().uppercase()
                if (!Regex("[0-9A-F]{6}").matches(c)) throw Exception("Kod 6 karakter olmalı (0-9, A-F)")
                val clientKey = identity.cert.publicKey as RSAPublicKey
                val serverKey = s.session.peerCertificates[0].publicKey as RSAPublicKey
                val md = MessageDigest.getInstance("SHA-256")
                md.update(bigUnsigned(clientKey.modulus))
                md.update(bigUnsigned(clientKey.publicExponent))
                md.update(bigUnsigned(serverKey.modulus))
                md.update(bigUnsigned(serverKey.publicExponent))
                md.update(byteArrayOf(c.substring(2, 4).toInt(16).toByte(), c.substring(4, 6).toInt(16).toByte()))
                val hash = md.digest()
                if ((hash[0].toInt() and 0xFF) != c.substring(0, 2).toInt(16)) throw Exception("Kod hatalı")
                val msg = Pb().int(1, 2).int(2, 200).msg(40, Pb().bytes(1, hash)).toByteArray()
                s.outputStream.write(Pb.varint(msg.size.toLong()) + msg)
                s.outputStream.flush()
                val raw = Pb.readDelimited(s.inputStream) ?: throw Exception("TV yanıt vermedi")
                val m = PbMsg(raw)
                if (m.int(2) != 200L || !m.has(41)) throw Exception("Kod kabul edilmedi")
                context.getSharedPreferences("tv_$host", Context.MODE_PRIVATE).edit()
                    .putBoolean("eslesti", true).apply()
                done(null)
            } catch (e: Exception) {
                done(e.message ?: "Eşleştirme hatası")
            } finally {
                runCatching { s.close() }
                pairSocket = null
            }
        }
    }

    // --- Kontrol ------------------------------------------------------------
    override fun connect(done: (String?) -> Unit) {
        if (isConnected()) { done(null); return }
        thread(name = "atv-remote") {
            var reported = false
            try {
                val s = identity.sslContext().socketFactory.createSocket(host, 6466) as SSLSocket
                s.soTimeout = 0
                s.startHandshake()
                socket = s
                out = s.outputStream
                val input = s.inputStream
                while (true) {
                    val raw = Pb.readDelimited(input) ?: break
                    val m = PbMsg(raw)
                    when {
                        m.has(1) -> { // remote_configure
                            m.sub(1)?.sub(2)?.let {
                                deviceInfo = JSONObject()
                                    .put("model", it.str(1)).put("vendor", it.str(2))
                                    .put("version", it.str(6)).put("package", it.str(5))
                            }
                            send(Pb().msg(1, Pb().int(1, features).msg(2, Pb()
                                .str(1, "Gün Kumanda").str(2, "Gün Teknik").int(3, 1)
                                .str(4, "1").str(5, "atvremote").str(6, "1.0.0"))))
                        }
                        m.has(2) -> send(Pb().msg(2, Pb().int(1, features)))
                        m.has(8) -> send(Pb().msg(9, Pb().int(1, m.sub(8)?.int(1) ?: 0L)))
                        m.has(40) -> {
                            started = true
                            if (!reported) { reported = true; done(null) }
                            events.event(host, "baglandi", deviceInfo)
                        }
                        m.has(20) -> m.sub(20)?.let { k ->
                            k.sub(1)?.int(1)?.let { if (it != 0L) imeCounter = it }
                            k.sub(2)?.int(1)?.let { if (it != 0L) fieldCounter = it }
                        }
                        m.has(22) -> m.sub(22)?.sub(2)?.int(1)?.let { fieldCounter = it }
                        m.has(21) -> m.sub(21)?.let {
                            if (imeCounter == 0L) imeCounter = it.int(1)
                            if (fieldCounter == 0L) fieldCounter = it.int(2)
                        }
                        m.has(50) -> m.sub(50)?.let {
                            events.event(host, "ses", JSONObject()
                                .put("seviye", it.int(7)).put("max", it.int(6)).put("sessiz", it.int(8) != 0L))
                        }
                        m.has(3) -> events.event(host, "hata", JSONObject().put("mesaj", "TV komutu reddetti"))
                    }
                }
                if (!reported) {
                    reported = true
                    done("TV bağlantıyı kapattı. Eşleştirme gerekebilir.")
                }
            } catch (e: Exception) {
                if (!reported) {
                    reported = true
                    done(if (e is javax.net.ssl.SSLException) "Eşleştirme gerekli" else (e.message ?: "Bağlanılamadı"))
                }
            } finally {
                started = false
                runCatching { socket?.close() }
                socket = null
                out = null
                events.event(host, "koptu", JSONObject())
            }
        }
    }

    override fun isConnected() = socket != null && started

    private fun send(m: Pb): Boolean {
        val o = out ?: return false
        return try {
            val b = m.toByteArray()
            synchronized(this) { o.write(Pb.varint(b.size.toLong()) + b); o.flush() }
            true
        } catch (e: Exception) {
            false
        }
    }

    private fun sendKey(code: Int, direction: Int = 3) =
        send(Pb().msg(10, Pb().int(1, code).int(2, direction)))

    override fun key(name: String): Boolean {
        val code = KEYS[name] ?: return false
        // Arka planda gönder (ağ işlemi ana iş parçacığında yapılmaz)
        thread { sendKey(code) }
        return true
    }

    fun longPress(name: String, down: Boolean): Boolean {
        val code = KEYS[name] ?: return false
        thread { sendKey(code, if (down) 1 else 2) }
        return true
    }

    override fun text(s: String): Boolean {
        if (s.isEmpty()) return false
        thread {
            send(Pb().msg(21, Pb().int(1, imeCounter).int(2, fieldCounter)
                .msg(3, Pb().int(1, 1).msg(2, Pb().int(1, s.length).int(2, s.length).str(3, s)))))
        }
        return true
    }

    override fun backspace(): Boolean { thread { sendKey(67) }; return true }
    override fun enter(): Boolean { thread { sendKey(66) }; return true }

    override fun launch(app: String): Boolean {
        val link = APPS[app] ?: app
        thread { send(Pb().msg(90, Pb().str(1, link))) }
        return true
    }

    override fun info(done: (JSONObject) -> Unit) {
        done(JSONObject(deviceInfo.toString()).put("platform", platform).put("host", host))
    }

    override fun close() {
        runCatching { socket?.close() }
        runCatching { pairSocket?.close() }
    }

    companion object {
        val KEYS = mapOf(
            "POWER" to 26, "VOL_UP" to 24, "VOL_DOWN" to 25, "MUTE" to 164,
            "CH_UP" to 166, "CH_DOWN" to 167, "UP" to 19, "DOWN" to 20,
            "LEFT" to 21, "RIGHT" to 22, "OK" to 23, "BACK" to 4, "HOME" to 3,
            "MENU" to 82, "SOURCE" to 178, "INFO" to 165, "PLAY_PAUSE" to 85,
            "PLAY" to 126, "PAUSE" to 127, "STOP" to 86, "NEXT" to 87, "PREV" to 88,
            "FF" to 90, "REW" to 89, "RED" to 183, "GREEN" to 184, "YELLOW" to 185,
            "BLUE" to 186, "SETTINGS" to 176, "GUIDE" to 172, "SEARCH" to 84,
            "EXIT" to 4, "SUBTITLE" to 175, "TV" to 170, "APPS" to 284,
            "0" to 7, "1" to 8, "2" to 9, "3" to 10, "4" to 11, "5" to 12,
            "6" to 13, "7" to 14, "8" to 15, "9" to 16, "DEL" to 67, "ENTER" to 66,
            "SLEEP" to 223, "WAKEUP" to 224
        )
        val APPS = mapOf(
            "youtube" to "https://www.youtube.com",
            "netflix" to "https://www.netflix.com/title",
            "prime" to "https://app.primevideo.com",
            "disney" to "https://www.disneyplus.com",
            "spotify" to "spotify://"
        )
    }
}
