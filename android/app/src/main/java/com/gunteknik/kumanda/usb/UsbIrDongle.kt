package com.gunteknik.kumanda.usb

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import java.util.PriorityQueue
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * Telefonun USB-C girişine takılan kızılötesi verici/alıcı (ElkSmart / Ocrustar ailesi:
 * EKX4S, EKX5S, EKX5S-T …, USB kimliği 045C:xxxx).
 *
 * Kablo üzerindeki konuşma (topluluğun çözdüğü protokol):
 *  - Kimlik:   FC FC FC FC  ->  FC FC FC FC tt tt   (tt tt = alt tür, 70 01 ya da 02 AA)
 *  - Gönderim: FF FF FF FF + karıştırılmış frekans(3) + uzunluk(2) + sıkıştırılmış darbeler,
 *              62 baytlık parçalar halinde, her tam parçanın sonuna 1 bayt sağlama eklenir.
 *  - Öğrenme:  FC×4 (yanıt bekle) -> FA×4 -> FE×4 ... cihaz FE FE FE FE nn nn + veri gönderir -> FD×4
 */
class UsbIrDongle(private val context: Context) {

    interface Listener {
        fun onDongleState(connected: Boolean, name: String, message: String)
        fun onLearned(freq: Int, timings: IntArray)
    }

    companion object {
        const val VID = 0x045C
        val PIDS = setOf(0x0131, 0x0132, 0x0134, 0x014A, 0x0184, 0x0195, 0x02AA)
        private const val ACTION_IZIN = "com.gunteknik.kumanda.USB_IZIN"
        fun destekli(d: UsbDevice) = d.vendorId == VID && d.productId in PIDS
    }

    var listener: Listener? = null
    @Volatile var isConnected = false
        private set
    var deviceName = ""
        private set

    private val usb = context.getSystemService(Context.USB_SERVICE) as? UsbManager
    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor { Thread(it, "usb-ir") }
    private var device: UsbDevice? = null
    private var conn: UsbDeviceConnection? = null
    private var intf: UsbInterface? = null
    private var epOut: UsbEndpoint? = null
    private var epIn: UsbEndpoint? = null
    private var huffman = false
    private val learning = AtomicBoolean(false)
    private val nesil = AtomicInteger(0)
    private var izinIstendi = false

    @Suppress("DEPRECATION")
    private fun cihaz(i: Intent): UsbDevice? =
        if (Build.VERSION.SDK_INT >= 33) i.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
        else i.getParcelableExtra(UsbManager.EXTRA_DEVICE)

    private val alici = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) {
            val d = cihaz(i)
            when (i.action) {
                UsbManager.ACTION_USB_DEVICE_ATTACHED -> if (d != null && destekli(d)) kontrolEt()
                UsbManager.ACTION_USB_DEVICE_DETACHED -> if (d != null && d.deviceName == device?.deviceName) kapat("USB IR çıkarıldı")
                ACTION_IZIN -> {
                    izinIstendi = false
                    if (i.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false) && d != null) ac(d)
                    else bildir("USB IR için izin verilmedi")
                }
            }
        }
    }

    fun start() {
        val f = IntentFilter().apply {
            addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED)
            addAction(UsbManager.ACTION_USB_DEVICE_DETACHED)
            addAction(ACTION_IZIN)
        }
        kaydet(f)
        kontrolEt()
    }

    @android.annotation.SuppressLint("UnspecifiedRegisterReceiverFlag")
    private fun kaydet(f: IntentFilter) {
        if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(alici, f, Context.RECEIVER_NOT_EXPORTED)
        else context.registerReceiver(alici, f)
    }

    fun stop() {
        runCatching { context.unregisterReceiver(alici) }
        kapat(null)
        io.shutdownNow()
    }

    /** Takılı destekli cihaz varsa bağlan (gerekirse izin iste). Dönüş: hata mesajı ya da null */
    fun kontrolEt(): String? {
        val m = usb ?: return "USB desteklenmiyor"
        if (isConnected) return null
        val d = m.deviceList.values.firstOrNull { destekli(it) } ?: return "USB IR verici takılı değil"
        if (m.hasPermission(d)) { ac(d); return null }
        if (!izinIstendi) {
            izinIstendi = true
            val bayrak = if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0
            val pi = PendingIntent.getBroadcast(context, 7, Intent(ACTION_IZIN).setPackage(context.packageName), bayrak)
            m.requestPermission(d, pi)
        }
        return null
    }

    private fun ac(d: UsbDevice) = io.execute {
        if (isConnected) return@execute
        val m = usb ?: return@execute
        for (i in 0 until d.interfaceCount) {
            val itf = d.getInterface(i)
            val outs = HashMap<Int, UsbEndpoint>(); val ins = HashMap<Int, UsbEndpoint>()
            for (e in 0 until itf.endpointCount) {
                val ep = itf.getEndpoint(e)
                if (ep.type != UsbConstants.USB_ENDPOINT_XFER_BULK) continue
                val no = ep.address and UsbConstants.USB_ENDPOINT_NUMBER_MASK
                if (ep.direction == UsbConstants.USB_DIR_OUT) outs[no] = ep else ins[no] = ep
            }
            val no = (outs.keys intersect ins.keys).minOrNull() ?: continue
            val c = m.openDevice(d) ?: break
            if (!c.claimInterface(itf, true)) { c.close(); continue }
            conn = c; intf = itf; epOut = outs[no]; epIn = ins[no]; device = d
            val tur = kimlik()
            huffman = tur == 0x02AA
            isConnected = true
            deviceName = (runCatching { d.productName }.getOrNull()?.takeIf { it.isNotBlank() } ?: "USB IR") +
                " (" + String.format("%04X", d.productId) + ")"
            bildir("$deviceName bağlandı")
            return@execute
        }
        bildir("USB IR açılamadı")
    }

    private fun kapat(mesaj: String?) {
        learning.set(false)
        val c = conn
        conn = null
        if (c != null) {
            runCatching { intf?.let { c.releaseInterface(it) } }
            runCatching { c.close() }
        }
        val vardi = isConnected
        isConnected = false
        device = null
        if (vardi && mesaj != null) bildir(mesaj)
    }

    private fun bildir(m: String) = main.post { listener?.onDongleState(isConnected, deviceName, m) }

    // ------------------------------------------------------------------ düşük seviye
    private fun yaz(b: ByteArray): Boolean {
        val c = conn ?: return false
        val e = epOut ?: return false
        return c.bulkTransfer(e, b, b.size, 400) == b.size
    }

    private fun oku(ms: Int): ByteArray? {
        val c = conn ?: return null
        val e = epIn ?: return null
        val buf = ByteArray(4096)
        val n = c.bulkTransfer(e, buf, buf.size, ms.coerceAtLeast(1))
        return if (n > 0) buf.copyOf(n) else null
    }

    private fun bosalt(ms: Long) {
        val son = SystemClock.uptimeMillis() + ms
        while (SystemClock.uptimeMillis() < son) if (oku(15) == null) break
    }

    private fun dortlu(b: Int) = ByteArray(4) { b.toByte() }
    private fun ByteArray.onEk(b: Int) = size >= 4 && (0..3).all { this[it] == b.toByte() }

    /** Kimlik sorgusu; alt türü (ör. 0x7001, 0x02AA) döndürür, yanıt yoksa 0 */
    private fun kimlik(): Int {
        bosalt(150)
        if (!yaz(dortlu(0xFC))) return 0
        val son = SystemClock.uptimeMillis() + 500
        while (SystemClock.uptimeMillis() < son) {
            val r = oku(120) ?: continue
            if (r.size >= 6 && r.onEk(0xFC)) return ((r[4].toInt() and 0xFF) shl 8) or (r[5].toInt() and 0xFF)
        }
        return 0
    }

    // ------------------------------------------------------------------ gönderim
    fun transmit(freq: Int, pattern: IntArray): String? {
        if (!isConnected) return "USB IR bağlı değil"
        if (learning.get()) return "Öğrenme sürüyor"
        io.execute {
            runCatching {
                for (parca in paketle(freq, pattern)) {
                    if (!yaz(parca)) break
                    SystemClock.sleep(2)
                }
                val sure = pattern.sumOf { it.toLong().coerceAtLeast(0) } / 1000 + 25
                SystemClock.sleep(sure.coerceAtLeast(80))
                bosalt(120)
            }
        }
        return null
    }

    /** Ters çevrilmiş bitlerin tümleyeni */
    private fun karistir(v: Int): Int {
        var x = v and 0xFF; var r = 0
        repeat(8) { r = (r shl 1) or (x and 1); x = x ushr 1 }
        return r.inv() and 0xFF
    }

    private fun deger(v: Int, out: Yazici) {
        if (v <= 2032) { out.b(if (v <= 1) v else ((v / 16.0) + 0.5).toInt()); return }
        var x = v
        while (true) {
            var b = x and 0x7F
            x = x ushr 7
            if (x != 0) b = b or 0x80
            if (b == 0xFF) b = 0xFE
            out.b(b)
            if (x == 0) break
        }
    }

    private fun sikistir(p: IntArray): ByteArray {
        val ciftler = ArrayList<Pair<Int, Int>>()
        var i = 0
        while (i < p.size) {
            ciftler.add(p[i].coerceAtLeast(0) to if (i + 1 < p.size) p[i + 1].coerceAtLeast(0) else 10_000)
            i += 2
        }
        if (ciftler.isEmpty()) return ByteArray(0)
        val sayac = LinkedHashMap<Pair<Int, Int>, Int>()
        for (c in ciftler) sayac[c] = (sayac[c] ?: 0) + 1
        val sirali = sayac.entries.sortedByDescending { it.value }
        val a = sirali[0].key
        val b = sirali.getOrNull(1)?.key ?: a
        val o = Yazici()
        deger(b.first, o); deger(b.second, o); deger(a.first, o); deger(a.second, o)
        o.b(0xFF); o.b(0xFF); o.b(0xFF)
        for (c in ciftler) when (c) {
            a -> o.b(0)
            b -> o.b(1)
            else -> { deger(c.first, o); deger(c.second, o) }
        }
        return o.dizi()
    }

    private abstract class Dugum(val agirlik: Int)
    private class Yaprak(w: Int, val sembol: Int) : Dugum(w)
    private class Dal(val sol: Dugum, val sag: Dugum) : Dugum(sol.agirlik + sag.agirlik)

    /** 02AA alt türü veriyi Huffman ile sıkıştırılmış ister */
    private fun huffmanla(veri: ByteArray): ByteArray {
        if (veri.isEmpty()) return veri
        val frek = IntArray(256)
        for (x in veri) frek[x.toInt() and 0xFF]++
        val kuyruk = PriorityQueue<Dugum>(compareBy<Dugum> { it.agirlik })
        for (s in 0..255) if (frek[s] > 0) kuyruk.offer(Yaprak(frek[s], s))
        while (kuyruk.size > 1) { val l = kuyruk.poll()!!; val r = kuyruk.poll()!!; kuyruk.offer(Dal(l, r)) }
        val kodlar = sortedMapOf<Int, String>()
        fun gez(d: Dugum, on: String) {
            when (d) {
                is Yaprak -> kodlar[d.sembol] = on.ifEmpty { "0" }
                is Dal -> { gez(d.sol, on + "0"); gez(d.sag, on + "1") }
            }
        }
        gez(kuyruk.poll()!!, "")
        val o = Yazici()
        o.b(kodlar.size ushr 8); o.b(kodlar.size)
        for ((s, _) in kodlar) { o.b(s); o.b(frek[s] ushr 8); o.b(frek[s]) }
        val bit = StringBuilder()
        for (x in veri) bit.append(kodlar[x.toInt() and 0xFF])
        val dolgu = (8 - bit.length % 8) % 8
        repeat(dolgu) { bit.append('0') }
        o.b(dolgu)
        var k = 0
        while (k < bit.length) { o.b(bit.substring(k, k + 8).toInt(2)); k += 8 }
        return o.dizi()
    }

    private fun paketle(freq: Int, pattern: IntArray): List<ByteArray> {
        val ham = sikistir(pattern)
        val yuk = if (huffman) huffmanla(ham) else ham
        val f = freq + 0x7FFFF
        val o = Yazici()
        repeat(4) { o.b(0xFF) }
        o.b(karistir(f ushr 8)); o.b(karistir(f ushr 16)); o.b(karistir(f))
        o.b(karistir(yuk.size ushr 8)); o.b(karistir(yuk.size))
        for (x in yuk) o.b(x.toInt())
        val mesaj = o.dizi()
        val parcalar = ArrayList<ByteArray>()
        var bas = 0
        while (bas < mesaj.size) {
            val n = minOf(62, mesaj.size - bas)
            if (n == 62) {
                val p = ByteArray(63)
                System.arraycopy(mesaj, bas, p, 0, 62)
                var top = 0
                for (j in 0 until 62) top += p[j].toInt() and 0xFF
                p[62] = karistir((top and 0xF0) or ((top ushr 8) and 0x0F)).toByte()
                parcalar.add(p)
            } else parcalar.add(mesaj.copyOfRange(bas, bas + n))
            bas += n
        }
        return parcalar
    }

    // ------------------------------------------------------------------ öğrenme
    fun startLearning(seconds: Int): String? {
        if (!isConnected) return "USB IR bağlı değil"
        val benim = nesil.incrementAndGet()
        learning.set(true)
        io.execute {
            fun aktif() = learning.get() && nesil.get() == benim
            if (!aktif()) return@execute
            var sonuc: IntArray? = null
            var iptal = false
            try {
                val son = SystemClock.uptimeMillis() + seconds.coerceIn(3, 60) * 1000L
                bosalt(200)
                var izinli = false
                for (deneme in 0 until 3) {
                    if (!aktif()) break
                    yaz(dortlu(0xFC))
                    val s = SystemClock.uptimeMillis() + 500
                    while (SystemClock.uptimeMillis() < s) {
                        val r = oku(120) ?: continue
                        if (r.size == 6 && r.onEk(0xFC)) { izinli = true; break }
                    }
                    if (izinli) break
                    bosalt(150)
                }
                if (izinli && aktif()) {
                    yaz(dortlu(0xFA))
                    yaz(dortlu(0xFE))
                    while (aktif() && SystemClock.uptimeMillis() < son && sonuc == null) {
                        val r = oku(300) ?: continue
                        if (r.size <= 7 || !r.onEk(0xFE)) continue
                        val beklenen = ((r[4].toInt() and 0xFF) shl 8) or (r[5].toInt() and 0xFF)
                        val veri = ArrayList<Int>(beklenen)
                        for (j in 6 until r.size) veri.add(r[j].toInt() and 0xFF)
                        while (veri.size < beklenen && SystemClock.uptimeMillis() < son) {
                            val ek = oku(250) ?: break
                            for (x in ek) veri.add(x.toInt() and 0xFF)
                        }
                        if (veri.size >= beklenen) sonuc = coz(veri.subList(0, beklenen))
                    }
                }
                iptal = !aktif()
            } catch (_: Throwable) {
            } finally {
                runCatching { yaz(dortlu(0xFD)) }
                if (nesil.get() == benim) learning.set(false)
            }
            val t = sonuc
            if (t != null && t.size >= 3) main.post { listener?.onLearned(38000, t) }
            else if (!iptal) bildir("Sinyal okunamadı, tekrar deneyin")
        }
        return null
    }

    fun stopLearning() { nesil.incrementAndGet(); learning.set(false) }

    /** Cihazın öğrenme verisi: her bayt ×16 µs; 0xFF bir sonrakine 4080 µs ekler */
    private fun coz(veri: List<Int>): IntArray? {
        val out = ArrayList<Int>(veri.size)
        var tasima = 0
        for (v in veri) {
            if (v < 0xFF) {
                val us = v * 16 + tasima
                if (us == 0) return null
                out.add(us); tasima = 0
            } else tasima += 0xFF0
        }
        // Sondaki çok uzun boşlukları at
        while (out.size > 1 && out.size % 2 == 0 && out.last() > 60_000) out.removeAt(out.lastIndex)
        return out.toIntArray()
    }

    private class Yazici {
        private var buf = ByteArray(256); private var n = 0
        fun b(v: Int) { if (n == buf.size) buf = buf.copyOf(buf.size * 2); buf[n++] = v.toByte() }
        fun dizi(): ByteArray = buf.copyOf(n)
    }
}
