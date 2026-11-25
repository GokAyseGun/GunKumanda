package com.gunteknik.kumanda.ble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import java.util.UUID
import java.util.concurrent.LinkedBlockingDeque

/**
 * Gün IR modülü (ESP32) ile Bluetooth LE bağlantısı.
 * Paket biçimi firmware/gun-ir-modul/gun-ir-modul.ino ile aynıdır.
 */
@SuppressLint("MissingPermission")
class BleIrModule(private val context: Context) {

    companion object {
        val SERVICE: UUID = UUID.fromString("8e1f0001-7c2b-4d5e-9a10-6b4a3c2d1e00")
        val TX: UUID = UUID.fromString("8e1f0002-7c2b-4d5e-9a10-6b4a3c2d1e00")
        val RX: UUID = UUID.fromString("8e1f0003-7c2b-4d5e-9a10-6b4a3c2d1e00")
        val CCCD: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
        const val PREFS = "ble_modul"
    }

    interface Listener {
        fun onModuleState(connected: Boolean, name: String, message: String)
        fun onLearned(freq: Int, timings: IntArray)
        fun onModuleText(text: String)
    }

    var listener: Listener? = null
    @Volatile var isConnected = false
        private set
    var deviceName: String = ""
        private set

    private val main = Handler(Looper.getMainLooper())
    private val adapter: BluetoothAdapter? =
        (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
    private var gatt: BluetoothGatt? = null
    private var txChar: BluetoothGattCharacteristic? = null
    private var mtu = 23
    private val queue = LinkedBlockingDeque<ByteArray>()
    @Volatile private var writing = false
    private var scanning = false

    // Öğrenilen sinyal birleştirme
    private var capCount = 0
    private var capFreq = 38
    private var capBuf = IntArray(0)

    private val prefs get() = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun scanAndConnect(): String? {
        val a = adapter ?: return "Bluetooth yok"
        if (!a.isEnabled) return "Bluetooth kapalı"
        if (isConnected) return null
        val saved = prefs.getString("adres", null)
        if (saved != null) {
            runCatching { connect(a.getRemoteDevice(saved)); return null }
        }
        val scanner = a.bluetoothLeScanner ?: return "Tarayıcı yok"
        if (scanning) return null
        scanning = true
        val filter = ScanFilter.Builder().setServiceUuid(ParcelUuid(SERVICE)).build()
        val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
        val cb = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                if (!scanning) return
                scanning = false
                runCatching { scanner.stopScan(this) }
                connect(result.device)
            }

            override fun onScanFailed(errorCode: Int) {
                scanning = false
                notifyState("Tarama başarısız ($errorCode)")
            }
        }
        scanner.startScan(listOf(filter), settings, cb)
        notifyState("Modül aranıyor…")
        main.postDelayed({
            if (scanning) {
                scanning = false
                runCatching { scanner.stopScan(cb) }
                notifyState("Modül bulunamadı")
            }
        }, 12000)
        return null
    }

    fun forget() {
        prefs.edit().remove("adres").apply()
        disconnect()
    }

    fun disconnect() {
        runCatching { gatt?.disconnect(); gatt?.close() }
        gatt = null
        txChar = null
        isConnected = false
        notifyState("Bağlantı kesildi")
    }

    private fun connect(device: BluetoothDevice) {
        deviceName = runCatching { device.name }.getOrNull() ?: "Gün IR modülü"
        notifyState("Bağlanıyor…")
        gatt = device.connectGatt(context, false, callback, BluetoothDevice.TRANSPORT_LE)
    }

    private fun notifyState(msg: String) {
        main.post { listener?.onModuleState(isConnected, deviceName, msg) }
    }

    private val callback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                g.requestMtu(247)
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                isConnected = false
                txChar = null
                queue.clear()
                writing = false
                runCatching { g.close() }
                if (gatt == g) gatt = null
                notifyState("Bağlantı kesildi")
            }
        }

        override fun onMtuChanged(g: BluetoothGatt, newMtu: Int, status: Int) {
            mtu = if (status == BluetoothGatt.GATT_SUCCESS) newMtu else 23
            g.discoverServices()
        }

        @Suppress("DEPRECATION")
        override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
            val s = g.getService(SERVICE)
            if (s == null) {
                notifyState("Bu cihaz Gün IR modülü değil")
                g.disconnect()
                return
            }
            txChar = s.getCharacteristic(TX)
            val rx = s.getCharacteristic(RX)
            if (rx != null) {
                g.setCharacteristicNotification(rx, true)
                val d = rx.getDescriptor(CCCD)
                if (d != null) {
                    d.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                    g.writeDescriptor(d)
                }
            }
            isConnected = true
            prefs.edit().putString("adres", g.device.address).apply()
            notifyState("Bağlandı")
        }

        override fun onCharacteristicWrite(g: BluetoothGatt, c: BluetoothGattCharacteristic, status: Int) {
            writing = false
            pump()
        }

        @Deprecated("Android 13 öncesi")
        @Suppress("DEPRECATION")
        override fun onCharacteristicChanged(g: BluetoothGatt, c: BluetoothGattCharacteristic) {
            if (c.uuid == RX) handleIncoming(c.value ?: return)
        }

        override fun onCharacteristicChanged(g: BluetoothGatt, c: BluetoothGattCharacteristic, value: ByteArray) {
            if (c.uuid == RX) handleIncoming(value)
        }
    }

    private fun handleIncoming(v: ByteArray) {
        if (v.isEmpty()) return
        when (v[0].toInt() and 0xFF) {
            0x30 -> { // yakalama başlangıcı: count(u16), freq kHz
                capCount = u16(v, 1)
                capFreq = if (v.size > 3) v[3].toInt() and 0xFF else 38
                capBuf = IntArray(capCount)
            }
            0x31 -> { // veri: offset(u16), u16 değerler
                val off = u16(v, 1)
                var i = 3
                var k = off
                while (i + 1 < v.size && k < capBuf.size) {
                    capBuf[k++] = u16(v, i)
                    i += 2
                }
            }
            0x32 -> {
                val f = (if (capFreq in 30..60) capFreq else 38) * 1000
                val t = capBuf.copyOf()
                main.post { listener?.onLearned(f, t) }
            }
            0x40 -> {
                val text = String(v, 1, v.size - 1, Charsets.UTF_8)
                main.post { listener?.onModuleText(text) }
            }
        }
    }

    private fun u16(b: ByteArray, i: Int): Int =
        if (i + 1 < b.size) (b[i].toInt() and 0xFF) or ((b[i + 1].toInt() and 0xFF) shl 8) else 0

    /** Sinyali modüle gönder. pattern: mark/space mikrosaniye. */
    fun transmit(freq: Int, pattern: IntArray): String? {
        if (!isConnected || txChar == null) return "Modül bağlı değil"
        val list = ArrayList<Int>(pattern.size + 8)
        for (t in pattern) {
            var rest = t
            // 65535 üstü değerleri böl (aynı türden ardışık değer ESP tarafında toplanır)
            while (rest > 65535) {
                list.add(65535); list.add(0); rest -= 65535
            }
            list.add(rest)
        }
        val kHz = (freq / 1000).coerceIn(30, 60)
        queue.add(byteArrayOf(0x10, kHz.toByte(), (list.size and 0xFF).toByte(), (list.size shr 8).toByte()))
        val per = ((mtu - 3 - 3) / 2).coerceAtLeast(8)
        var off = 0
        while (off < list.size) {
            val n = minOf(per, list.size - off)
            val pkt = ByteArray(3 + n * 2)
            pkt[0] = 0x11
            pkt[1] = (off and 0xFF).toByte(); pkt[2] = (off shr 8).toByte()
            for (j in 0 until n) {
                val v = list[off + j]
                pkt[3 + j * 2] = (v and 0xFF).toByte()
                pkt[4 + j * 2] = (v shr 8).toByte()
            }
            queue.add(pkt)
            off += n
        }
        queue.add(byteArrayOf(0x12))
        pump()
        return null
    }

    fun startLearning(seconds: Int): String? {
        if (!isConnected) return "Modül bağlı değil"
        queue.add(byteArrayOf(0x20, seconds.coerceIn(3, 60).toByte()))
        pump()
        return null
    }

    fun stopLearning() {
        if (!isConnected) return
        queue.add(byteArrayOf(0x21))
        pump()
    }

    @Suppress("DEPRECATION")
    @Synchronized
    private fun pump() {
        if (writing) return
        val c = txChar ?: return
        val g = gatt ?: return
        val pkt = queue.poll() ?: return
        writing = true
        c.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
        c.value = pkt
        if (!g.writeCharacteristic(c)) {
            writing = false
            queue.addFirst(pkt)
            main.postDelayed({ pump() }, 30)
        }
    }
}
