package com.gunteknik.kumanda.ir

import android.content.Context
import android.hardware.ConsumerIrManager
import com.gunteknik.kumanda.ble.BleIrModule
import com.gunteknik.kumanda.usb.UsbIrDongle

/**
 * IR çıkışı: telefonun dahili vericisi, USB-C'ye takılan IR verici/alıcı ya da Bluetooth'lu Gün IR modülü.
 */
class IrOutput(context: Context, private val ble: BleIrModule, private val usb: UsbIrDongle) {
    private val ir: ConsumerIrManager? =
        context.getSystemService(Context.CONSUMER_IR_SERVICE) as? ConsumerIrManager

    val hasBuiltin: Boolean get() = runCatching { ir?.hasIrEmitter() == true }.getOrDefault(false)

    /** "auto" | "builtin" | "usb" | "module" */
    var preferred: String = "auto"

    private fun aktif(): String {
        val module = ble.isConnected
        val u = usb.isConnected
        return when {
            preferred == "usb" && u -> "usb"
            preferred == "module" && module -> "module"
            preferred == "builtin" && hasBuiltin -> "builtin"
            hasBuiltin -> "builtin"
            u -> "usb"
            module -> "module"
            else -> "none"
        }
    }

    fun status(): String {
        val module = ble.isConnected
        val u = usb.isConnected
        val learner = if (u) "usb" else if (module) "module" else ""
        return org.json.JSONObject()
            .put("builtin", hasBuiltin).put("module", module).put("moduleName", ble.deviceName)
            .put("usb", u).put("usbName", usb.deviceName)
            .put("active", aktif()).put("canLearn", u || module).put("learner", learner).toString()
    }

    /** Öğrenme: önce USB, yoksa modül */
    fun learnStart(seconds: Int): String? = when {
        usb.isConnected -> usb.startLearning(seconds)
        ble.isConnected -> ble.startLearning(seconds)
        else -> "Kumanda okumak için USB-C IR alıcı ya da Gün IR modülü takın"
    }

    fun learnStop() { if (usb.isConnected) usb.stopLearning(); if (ble.isConnected) ble.stopLearning() }

    /**
     * Sinyali gönder. signal: [frekans, t0, t1, ...]
     * Dahili verici 2 saniyeden uzun desenleri kabul etmez; gerekirse böler.
     */
    fun transmit(signal: IntArray): String? {
        if (signal.size < 3) return "Sinyal boş"
        val freq = signal[0].coerceIn(30000, 60000)
        var pattern = signal.copyOfRange(1, signal.size)
        // Desen mark ile bitmeli (tek uzunluk); sondaki boşluğu at.
        if (pattern.size % 2 == 0) pattern = pattern.copyOfRange(0, pattern.size - 1)
        when (aktif()) {
            "usb" -> return usb.transmit(freq, pattern)
            "module" -> return ble.transmit(freq, pattern)
        }
        val mgr = ir ?: return "IR verici yok"
        if (!hasBuiltin) return "Bu telefonda IR verici yok. USB-C IR verici takın ya da Gün IR modülünü bağlayın."
        return try {
            val ranges = mgr.carrierFrequencies
            val f = if (ranges.isNullOrEmpty() || ranges.any { freq in it.minFrequency..it.maxFrequency }) freq
            else ranges.minByOrNull { minOf(kotlin.math.abs(it.minFrequency - freq), kotlin.math.abs(it.maxFrequency - freq)) }!!
                .let { freq.coerceIn(it.minFrequency, it.maxFrequency) }
            for (chunk in splitPattern(pattern)) mgr.transmit(f, chunk)
            null
        } catch (e: Exception) {
            e.message ?: "Gönderilemedi"
        }
    }

    /** Toplamı ~1.9 saniyeyi aşan desenleri uzun boşluklarda böl. */
    private fun splitPattern(p: IntArray): List<IntArray> {
        val limit = 1_900_000L
        if (p.sumOf { it.toLong() } <= limit) return listOf(p)
        val out = ArrayList<IntArray>()
        var start = 0
        var sum = 0L
        var i = 0
        while (i < p.size) {
            sum += p[i]
            // Bölme yalnızca bir boşluktan (tek indeks) sonra yapılır
            if (sum > limit && i % 2 == 1 && i > start) {
                out.add(p.copyOfRange(start, i)) // boşluğu dahil etme
                start = i + 1
                sum = 0
            }
            i++
        }
        if (start < p.size) {
            var last = p.copyOfRange(start, p.size)
            if (last.size % 2 == 0) last = last.copyOfRange(0, last.size - 1)
            if (last.isNotEmpty()) out.add(last)
        }
        return out
    }
}
