package com.gunteknik.kumanda.tv

import org.json.JSONObject

/** Akıllı TV sürücüsü ortak arayüzü. Tuş adları ortak (POWER, VOL_UP, OK...). */
interface TvDriver {
    val host: String
    val platform: String

    /** Bağlan. Sonuç: null = başarılı, aksi halde hata/durum mesajı. */
    fun connect(done: (String?) -> Unit)
    fun isConnected(): Boolean
    fun key(name: String): Boolean
    fun text(s: String): Boolean = false
    fun enter(): Boolean = key("OK")
    fun backspace(): Boolean = false
    /** İmleç desteği yoksa false */
    fun pointerMove(dx: Int, dy: Int): Boolean = false
    fun pointerClick(): Boolean = false
    fun pointerScroll(dx: Int, dy: Int): Boolean = false
    fun launch(app: String): Boolean = false
    fun info(done: (JSONObject) -> Unit) = done(JSONObject().put("platform", platform).put("host", host))
    fun close()
}

/** Sürücülerin durum/olay bildirimi */
fun interface TvEvents {
    fun event(host: String, type: String, data: JSONObject)
}
