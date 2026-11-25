package com.gunteknik.kumanda

import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.webkit.JavascriptInterface
import com.gunteknik.kumanda.ir.IrCore
import org.json.JSONArray
import org.json.JSONObject

/**
 * JavaScript <-> Android köprüsü. JS'de `Native` adıyla görünür.
 * Uzun işlemler sonucu window.__nativeCb(id, json) ile döndürür.
 * Hata dönen metotlar: "" = başarılı, aksi halde hata mesajı.
 */
class Bridge(private val a: MainActivity) {

    private fun ints(csv: String): IntArray =
        csv.split(',', ' ', ';').filter { it.isNotBlank() }.map { it.trim().toDouble().toInt() }.toIntArray()

    // ---------------------------------------------------------------- genel
    @JavascriptInterface
    fun info(): String = JSONObject()
        .put("version", BuildConfigInfo.versionName(a))
        .put("sdk", Build.VERSION.SDK_INT)
        .put("model", Build.MANUFACTURER + " " + Build.MODEL)
        .put("gyro", a.airMouse.available)
        .put("hid", a.hid.supported)
        .toString()

    @JavascriptInterface
    fun vibrate(ms: Int) {
        val v = a.getSystemService(Vibrator::class.java) ?: return
        if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(ms.toLong().coerceIn(5, 400), VibrationEffect.DEFAULT_AMPLITUDE))
    }

    @JavascriptInterface
    fun keepScreenOn(on: Boolean) = a.runOnUiThread { a.setKeepScreenOn(on) }

    @JavascriptInterface
    fun volumeKeys(on: Boolean) { a.volumeKeysToJs = on }

    @JavascriptInterface
    fun requestPermissions(group: String) = a.runOnUiThread { a.askPermissions(group) }

    @JavascriptInterface
    fun shareText(title: String, text: String) = a.runOnUiThread { a.shareText(title, text) }

    @JavascriptInterface
    fun saveText(fileName: String, text: String) = a.runOnUiThread { a.saveText(fileName, text) }

    @JavascriptInterface
    fun openUrl(url: String) = a.runOnUiThread { a.openUrl(url) }

    @JavascriptInterface
    fun speech(cb: String) = a.runOnUiThread { a.startSpeech(cb) }

    // ---------------------------------------------------------------- IR
    @JavascriptInterface
    fun irStatus(): String = a.irOut.status()

    @JavascriptInterface
    fun irSetOutput(mode: String) { a.irOut.preferred = mode }

    @JavascriptInterface
    fun irSendRaw(freq: Int, timings: String): String {
        val t = ints(timings)
        if (t.isEmpty()) return "Sinyal boş"
        return a.irOut.transmit(intArrayOf(freq) + t) ?: ""
    }

    @JavascriptInterface
    fun irSendProto(protocol: String, hex: String, bits: Int, repeat: Int): String {
        val sig = IrCore.onBigStack { IrCore.encode(protocol, hex, bits, repeat) } ?: return "Sinyal üretilemedi ($protocol)"
        return a.irOut.transmit(sig) ?: ""
    }

    /** Sinyalin ham halini döndür: {"f":38000,"t":[...]} */
    @JavascriptInterface
    fun irEncode(protocol: String, hex: String, bits: Int): String {
        val sig = IrCore.onBigStack { IrCore.encode(protocol, hex, bits, 0) } ?: return "{}"
        return JSONObject().put("f", sig[0]).put("t", JSONArray(sig.drop(1))).toString()
    }

    @JavascriptInterface
    fun irSendAc(protocol: String, model: Int, fields: String, degrees: Float): String {
        val f = ints(fields)
        val sig = IrCore.onBigStack { IrCore.encodeAc(protocol, model, f, degrees) } ?: return "Klima sinyali üretilemedi ($protocol)"
        return a.irOut.transmit(sig) ?: ""
    }

    @JavascriptInterface
    fun irEncodeAc(protocol: String, model: Int, fields: String, degrees: Float): String {
        val f = ints(fields)
        val sig = IrCore.onBigStack { IrCore.encodeAc(protocol, model, f, degrees) } ?: return "{}"
        return JSONObject().put("f", sig[0]).put("t", JSONArray(sig.drop(1))).toString()
    }

    @JavascriptInterface
    fun irAcProtocols(): String = IrCore.onBigStack { IrCore.acProtocols() }

    @JavascriptInterface
    fun irProtocols(): String = IrCore.onBigStack { IrCore.protocols() }

    @JavascriptInterface
    fun irDecode(timings: String): String = IrCore.onBigStack { IrCore.decode(ints(timings)) }

    // ---------------------------------------------------------------- modül
    @JavascriptInterface
    fun moduleConnect(): String {
        a.askPermissions("bt")
        return a.ble.scanAndConnect() ?: ""
    }

    @JavascriptInterface
    fun moduleForget() = a.ble.forget()

    @JavascriptInterface
    fun learnStart(seconds: Int): String = a.ble.startLearning(seconds) ?: ""

    @JavascriptInterface
    fun learnStop() = a.ble.stopLearning()

    // ---------------------------------------------------------------- akıllı TV
    @JavascriptInterface
    fun tvScan(cb: String) {
        a.tv.discovery.scan(4) { a.callback(cb, it) }
    }

    @JavascriptInterface
    fun tvProbe(ip: String, cb: String) {
        Thread { a.callback(cb, JSONObject().put("platform", a.tv.discovery.probe(ip)).toString()) }.start()
    }

    @JavascriptInterface
    fun tvConnect(host: String, platform: String, cb: String) {
        a.tv.connect(host, platform) { err -> a.callback(cb, JSONObject().put("ok", err == null).put("error", err ?: "").toString()) }
    }

    @JavascriptInterface
    fun tvPairStart(host: String, cb: String) {
        val d = a.tv.androidTv(host) ?: return a.callback(cb, """{"ok":false,"error":"Android TV değil"}""")
        d.startPairing { err -> a.callback(cb, JSONObject().put("ok", err == null).put("error", err ?: "").toString()) }
    }

    @JavascriptInterface
    fun tvPairFinish(host: String, code: String, cb: String) {
        val d = a.tv.androidTv(host) ?: return a.callback(cb, """{"ok":false,"error":"Android TV değil"}""")
        d.finishPairing(code) { err -> a.callback(cb, JSONObject().put("ok", err == null).put("error", err ?: "").toString()) }
    }

    @JavascriptInterface
    fun tvSonyPsk(host: String, psk: String) {
        (runCatching { a.tv.driver(host, "sony") }.getOrNull() as? com.gunteknik.kumanda.tv.SonyTv)?.psk = psk
    }

    @JavascriptInterface fun tvKey(name: String): Boolean = a.tv.key(name)
    @JavascriptInterface fun tvText(s: String): Boolean = a.tv.text(s)
    @JavascriptInterface fun tvEnter(): Boolean = a.tv.enter()
    @JavascriptInterface fun tvBackspace(): Boolean = a.tv.backspace()
    @JavascriptInterface fun tvLaunch(app: String): Boolean = a.tv.launch(app)
    @JavascriptInterface fun tvPointer(dx: Int, dy: Int): Boolean = a.tv.pointerMove(dx, dy)
    @JavascriptInterface fun tvClick(): Boolean = a.tv.pointerClick()
    @JavascriptInterface fun tvScroll(dx: Int, dy: Int): Boolean = a.tv.pointerScroll(dx, dy)
    @JavascriptInterface fun tvHasPointer(): Boolean = a.tv.hasPointer()
    @JavascriptInterface fun tvWake(host: String): String = a.tv.wake(host) ?: ""
    @JavascriptInterface fun tvDisconnect() = a.tv.disconnectAll()

    @JavascriptInterface
    fun tvInfo(cb: String) {
        a.tv.info { a.callback(cb, it.toString()) }
    }

    // ---------------------------------------------------------------- Bluetooth fare/klavye
    @JavascriptInterface
    fun hidStart(): String {
        a.askPermissions("bt")
        return a.hid.start() ?: ""
    }

    @JavascriptInterface fun hidStop() = a.hid.stop()
    @JavascriptInterface fun hidBonded(): String = a.hid.bonded()
    @JavascriptInterface fun hidConnect(address: String): String = a.hid.connectTo(address) ?: ""
    @JavascriptInterface fun hidDiscoverable() = a.runOnUiThread { a.requestDiscoverable() }
    @JavascriptInterface fun hidConnected(): Boolean = a.hid.connected
    @JavascriptInterface fun hidMove(dx: Int, dy: Int) = a.hid.mouseMove(dx, dy)
    @JavascriptInterface fun hidScroll(v: Int) = a.hid.mouseMove(0, 0, v)
    @JavascriptInterface fun hidClick(button: Int) = a.hid.click(button)
    @JavascriptInterface fun hidButton(button: Int, down: Boolean) = a.hid.mouseButton(button, down)
    @JavascriptInterface fun hidKey(name: String): Boolean = a.hid.namedKey(name)
    @JavascriptInterface fun hidText(s: String) = a.hid.typeText(s)

    // ---------------------------------------------------------------- havada fare
    /** target: "tv" (ağ) ya da "bt" (Bluetooth fare) */
    @JavascriptInterface
    fun airStart(target: String): Boolean {
        a.airTarget = target
        return a.airMouse.start()
    }

    @JavascriptInterface fun airStop() = a.airMouse.stop()
    @JavascriptInterface fun airEngage(on: Boolean) { a.airMouse.engaged = on }
    @JavascriptInterface fun airMode(mode: String) { a.airMouse.mode = mode }

    @JavascriptInterface
    fun airConfig(json: String) {
        val j = runCatching { JSONObject(json) }.getOrNull() ?: return
        a.airMouse.sensitivity = j.optDouble("hassasiyet", 1.0).toFloat().coerceIn(0.2f, 4f)
        a.airMouse.acceleration = j.optDouble("ivme", 1.0).toFloat().coerceIn(0f, 3f)
        a.airMouse.invertY = j.optBoolean("tersY", false)
        a.airMouse.always = j.optBoolean("surekli", false)
        a.airMouse.gesturesEnabled = j.optBoolean("jestler", true)
    }
}

object BuildConfigInfo {
    fun versionName(a: MainActivity): String = runCatching {
        a.packageManager.getPackageInfo(a.packageName, 0).versionName ?: "?"
    }.getOrDefault("?")
}
