package com.gunteknik.kumanda.hid

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothHidDevice
import android.bluetooth.BluetoothHidDeviceAppSdpSettings
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * Telefonu Bluetooth klavye + fare + medya tuşu olarak tanıtır (Android 9+).
 * TV'nin Bluetooth ayarlarından "Gün Kumanda" eşleştirilir; ardından imleç
 * ve klavye doğrudan TV'de çalışır, TV'de ek uygulama gerekmez.
 */
@SuppressLint("MissingPermission")
class HidRemote(private val context: Context) {

    interface Listener {
        fun onHidState(state: String, device: String)
    }

    var listener: Listener? = null
    private val main = Handler(Looper.getMainLooper())
    private val adapter: BluetoothAdapter? =
        (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
    private var hid: BluetoothHidDevice? = null
    private var host: BluetoothDevice? = null
    private var registered = false
    private val exec = Executors.newSingleThreadExecutor()

    val supported: Boolean get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && adapter != null
    val connected: Boolean get() = host != null

    companion object {
        // Rapor 1: klavye, 2: fare (göreli + tekerlek), 3: tüketici (medya) tuşları
        private val DESCRIPTOR = byteArrayOf(
            0x05, 0x01, 0x09, 0x06, 0xA1.toByte(), 0x01, 0x85.toByte(), 0x01,
            0x05, 0x07, 0x19, 0xE0.toByte(), 0x29, 0xE7.toByte(), 0x15, 0x00, 0x25, 0x01,
            0x75, 0x01, 0x95.toByte(), 0x08, 0x81.toByte(), 0x02,
            0x95.toByte(), 0x01, 0x75, 0x08, 0x81.toByte(), 0x01,
            0x95.toByte(), 0x06, 0x75, 0x08, 0x15, 0x00, 0x25, 0x65,
            0x05, 0x07, 0x19, 0x00, 0x29, 0x65, 0x81.toByte(), 0x00,
            0xC0.toByte(),
            0x05, 0x01, 0x09, 0x02, 0xA1.toByte(), 0x01, 0x85.toByte(), 0x02,
            0x09, 0x01, 0xA1.toByte(), 0x00,
            0x05, 0x09, 0x19, 0x01, 0x29, 0x03, 0x15, 0x00, 0x25, 0x01,
            0x95.toByte(), 0x03, 0x75, 0x01, 0x81.toByte(), 0x02,
            0x95.toByte(), 0x01, 0x75, 0x05, 0x81.toByte(), 0x01,
            0x05, 0x01, 0x09, 0x30, 0x09, 0x31, 0x09, 0x38,
            0x15, 0x81.toByte(), 0x25, 0x7F, 0x75, 0x08, 0x95.toByte(), 0x03, 0x81.toByte(), 0x06,
            0xC0.toByte(), 0xC0.toByte(),
            0x05, 0x0C, 0x09, 0x01, 0xA1.toByte(), 0x01, 0x85.toByte(), 0x03,
            0x15, 0x00, 0x26, 0xFF.toByte(), 0x03, 0x19, 0x00, 0x2A, 0xFF.toByte(), 0x03,
            0x75, 0x10, 0x95.toByte(), 0x01, 0x81.toByte(), 0x00,
            0xC0.toByte()
        )

        // Tüketici (consumer) kullanım kodları
        val CONSUMER = mapOf(
            "VOL_UP" to 0xE9, "VOL_DOWN" to 0xEA, "MUTE" to 0xE2,
            "PLAY_PAUSE" to 0xCD, "NEXT" to 0xB5, "PREV" to 0xB6, "STOP" to 0xB7,
            "HOME" to 0x223, "BACK" to 0x224, "MENU" to 0x40, "POWER" to 0x30,
            "SEARCH" to 0x221, "CH_UP" to 0x9C, "CH_DOWN" to 0x9D
        )

        // Klavye tuş kodları
        val KEYS = mapOf(
            "UP" to 0x52, "DOWN" to 0x51, "LEFT" to 0x50, "RIGHT" to 0x4F,
            "OK" to 0x28, "ENTER" to 0x28, "ESC" to 0x29, "BACKSPACE" to 0x2A,
            "TAB" to 0x2B, "SPACE" to 0x2C, "DEL" to 0x4C, "PAGE_UP" to 0x4B,
            "PAGE_DOWN" to 0x4E, "F5" to 0x3E
        )
    }

    fun start(): String? {
        if (!supported) return "Bu telefon Bluetooth fare/klavye modunu desteklemiyor (Android 9+ gerekli)."
        if (hid != null) {
            if (!registered) register()
            return null
        }
        val ok = adapter!!.getProfileProxy(context, object : BluetoothProfile.ServiceListener {
            override fun onServiceConnected(profile: Int, proxy: BluetoothProfile) {
                if (profile == BluetoothProfile.HID_DEVICE) {
                    hid = proxy as BluetoothHidDevice
                    register()
                }
            }

            override fun onServiceDisconnected(profile: Int) {
                hid = null
                registered = false
                host = null
                emit("kapali", "")
            }
        }, BluetoothProfile.HID_DEVICE)
        return if (ok) null else "Bluetooth HID profili bu telefonda kapalı."
    }

    private fun register() {
        val h = hid ?: return
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return
        val sdp = BluetoothHidDeviceAppSdpSettings(
            "Gün Kumanda", "Klavye ve fare", "Gün Teknik",
            BluetoothHidDevice.SUBCLASS1_COMBO, DESCRIPTOR
        )
        h.registerApp(sdp, null, null, exec, object : BluetoothHidDevice.Callback() {
            override fun onAppStatusChanged(pluggedDevice: BluetoothDevice?, reg: Boolean) {
                registered = reg
                emit(if (reg) "hazir" else "kapali", "")
                if (reg && pluggedDevice != null) h.connect(pluggedDevice)
            }

            override fun onConnectionStateChanged(device: BluetoothDevice, state: Int) {
                val name = runCatching { device.name }.getOrNull() ?: device.address
                when (state) {
                    BluetoothProfile.STATE_CONNECTED -> { host = device; emit("bagli", name) }
                    BluetoothProfile.STATE_CONNECTING -> emit("baglaniyor", name)
                    BluetoothProfile.STATE_DISCONNECTED -> {
                        if (host?.address == device.address) host = null
                        emit("hazir", "")
                    }
                }
            }
        })
    }

    fun stop() {
        runCatching { if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) hid?.unregisterApp() }
        registered = false
        host = null
    }

    /** Eşleşmiş cihazlar (TV'ler) */
    fun bonded(): String {
        val arr = JSONArray()
        runCatching {
            adapter?.bondedDevices?.forEach {
                arr.put(JSONObject().put("name", it.name ?: it.address).put("address", it.address))
            }
        }
        return arr.toString()
    }

    fun connectTo(address: String): String? {
        val h = hid ?: return "Önce Bluetooth fare modunu başlatın"
        val d = runCatching { adapter!!.getRemoteDevice(address) }.getOrNull() ?: return "Cihaz bulunamadı"
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && h.connect(d)) null else "Bağlanılamadı"
    }

    private fun emit(state: String, dev: String) = main.post { listener?.onHidState(state, dev) }

    private fun send(id: Int, data: ByteArray): Boolean {
        val h = hid ?: return false
        val d = host ?: return false
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && h.sendReport(d, id, data)
    }

    // --- fare ---
    private var buttons = 0

    fun mouseMove(dx: Int, dy: Int, wheel: Int = 0) {
        var x = dx
        var y = dy
        var w = wheel
        // Büyük hareketleri 127'lik parçalara böl
        do {
            val sx = x.coerceIn(-127, 127)
            val sy = y.coerceIn(-127, 127)
            val sw = w.coerceIn(-127, 127)
            send(2, byteArrayOf(buttons.toByte(), sx.toByte(), sy.toByte(), sw.toByte()))
            x -= sx; y -= sy; w -= sw
        } while (x != 0 || y != 0 || w != 0)
    }

    fun mouseButton(button: Int, down: Boolean) {
        val bit = when (button) { 2 -> 2; 3 -> 4; else -> 1 }
        buttons = if (down) buttons or bit else buttons and bit.inv()
        send(2, byteArrayOf(buttons.toByte(), 0, 0, 0))
    }

    fun click(button: Int = 1) {
        mouseButton(button, true)
        main.postDelayed({ mouseButton(button, false) }, 30)
    }

    // --- klavye ---
    fun key(code: Int, modifiers: Int = 0) {
        send(1, byteArrayOf(modifiers.toByte(), 0, code.toByte(), 0, 0, 0, 0, 0))
        main.postDelayed({ send(1, ByteArray(8)) }, 25)
    }

    fun namedKey(name: String): Boolean {
        CONSUMER[name]?.let { u ->
            send(3, byteArrayOf((u and 0xFF).toByte(), (u shr 8).toByte()))
            main.postDelayed({ send(3, byteArrayOf(0, 0)) }, 40)
            return true
        }
        KEYS[name]?.let { key(it); return true }
        return false
    }

    /** ASCII metni klavye ile yaz (ABD düzeni). Türkçe karakterler için TV'nin kendi
     * metin gönderme yolu (Android TV/LG/Samsung) tercih edilir. */
    fun typeText(text: String) {
        var delay = 0L
        for (ch in text) {
            val m = map(ch) ?: continue
            main.postDelayed({ key(m.first, m.second) }, delay)
            delay += 45
        }
    }

    private fun map(c: Char): Pair<Int, Int>? {
        val shift = 0x02
        return when (c) {
            in 'a'..'z' -> (0x04 + (c - 'a')) to 0
            in 'A'..'Z' -> (0x04 + (c - 'A')) to shift
            in '1'..'9' -> (0x1E + (c - '1')) to 0
            '0' -> 0x27 to 0
            ' ' -> 0x2C to 0
            '\n' -> 0x28 to 0
            '-' -> 0x2D to 0; '_' -> 0x2D to shift
            '=' -> 0x2E to 0; '+' -> 0x2E to shift
            '.' -> 0x37 to 0; '>' -> 0x37 to shift
            ',' -> 0x36 to 0; '<' -> 0x36 to shift
            '/' -> 0x38 to 0; '?' -> 0x38 to shift
            ';' -> 0x33 to 0; ':' -> 0x33 to shift
            '\'' -> 0x34 to 0; '"' -> 0x34 to shift
            '!' -> 0x1E to shift; '@' -> 0x1F to shift; '#' -> 0x20 to shift
            '$' -> 0x21 to shift; '%' -> 0x22 to shift; '^' -> 0x23 to shift
            '&' -> 0x24 to shift; '*' -> 0x25 to shift; '(' -> 0x26 to shift; ')' -> 0x27 to shift
            '[' -> 0x2F to 0; ']' -> 0x30 to 0; '\\' -> 0x31 to 0
            'ı' -> 0x0C to 0; 'İ' -> 0x0C to shift
            'ş' -> 0x16 to 0; 'Ş' -> 0x16 to shift
            'ğ' -> 0x0A to 0; 'Ğ' -> 0x0A to shift
            'ü' -> 0x18 to 0; 'Ü' -> 0x18 to shift
            'ö' -> 0x12 to 0; 'Ö' -> 0x12 to shift
            'ç' -> 0x06 to 0; 'Ç' -> 0x06 to shift
            else -> null
        }
    }
}
