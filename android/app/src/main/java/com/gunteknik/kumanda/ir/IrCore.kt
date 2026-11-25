package com.gunteknik.kumanda.ir

/**
 * IRremoteESP8266 tabanlı native çekirdek (libircore.so).
 * Dönen IntArray: [frekans, mark, space, mark, ...] (mikrosaniye). Hata: null.
 */
object IrCore {
    init {
        System.loadLibrary("ircore")
    }

    /** Klima sinyali üret. fields: ircore.h içindeki sırayla 15 alan. */
    external fun encodeAc(protocol: String, model: Int, fields: IntArray, degrees: Float): IntArray?

    /** Protokol sinyali üret (NEC, SAMSUNG, RC5...). value: hex. */
    external fun encode(protocol: String, value: String, bits: Int, repeat: Int): IntArray?

    /** Ham sinyali çöz; JSON döner. */
    external fun decode(timings: IntArray): String

    external fun acProtocols(): String
    external fun protocols(): String

    // Klima nesneleri çok yer kapladığı için kodlama büyük yığınlı bir
    // iş parçacığında yapılır.
    private val lock = Object()

    fun <T> onBigStack(block: () -> T): T {
        var result: Result<T>? = null
        val t = Thread(null, {
            result = runCatching(block)
        }, "ircore", 32L * 1024 * 1024)
        synchronized(lock) {
            t.start()
            t.join()
        }
        return result!!.getOrThrow()
    }
}
