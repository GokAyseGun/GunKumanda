package com.gunteknik.kumanda.tv

import android.content.Context
import android.util.Base64
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.math.BigInteger
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.SecureRandom
import java.security.Signature
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.security.spec.PKCS8EncodedKeySpec
import javax.net.ssl.KeyManagerFactory
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

/** Asgari protobuf yazıcı (yalnızca varint ve uzunluk-önekli alanlar). */
class Pb {
    private val out = ByteArrayOutputStream()

    private fun raw(v: Long) {
        var x = v
        while (true) {
            if ((x and 0x7FL.inv()) == 0L) { out.write(x.toInt()); return }
            out.write(((x and 0x7F) or 0x80).toInt())
            x = x ushr 7
        }
    }

    private fun tag(field: Int, type: Int) = raw(((field shl 3) or type).toLong())

    fun int(field: Int, v: Long): Pb { tag(field, 0); raw(v); return this }
    fun int(field: Int, v: Int): Pb = int(field, v.toLong())
    fun bool(field: Int, v: Boolean): Pb = int(field, if (v) 1L else 0L)
    fun bytes(field: Int, b: ByteArray): Pb { tag(field, 2); raw(b.size.toLong()); out.write(b); return this }
    fun str(field: Int, s: String): Pb = bytes(field, s.toByteArray(Charsets.UTF_8))
    fun msg(field: Int, m: Pb): Pb = bytes(field, m.toByteArray())
    fun toByteArray(): ByteArray = out.toByteArray()

    companion object {
        fun varint(v: Long): ByteArray {
            val o = ByteArrayOutputStream()
            var x = v
            while (true) {
                if ((x and 0x7FL.inv()) == 0L) { o.write(x.toInt()); break }
                o.write(((x and 0x7F) or 0x80).toInt())
                x = x ushr 7
            }
            return o.toByteArray()
        }

        /** Uzunluk önekli bir mesaj oku. Bağlantı kapanırsa null. */
        fun readDelimited(input: InputStream): ByteArray? {
            var len = 0L
            var shift = 0
            while (true) {
                val b = input.read()
                if (b < 0) return null
                len = len or ((b and 0x7F).toLong() shl shift)
                if (b and 0x80 == 0) break
                shift += 7
                if (shift > 35) return null
            }
            if (len > 4 * 1024 * 1024) return null
            val buf = ByteArray(len.toInt())
            var off = 0
            while (off < buf.size) {
                val n = input.read(buf, off, buf.size - off)
                if (n < 0) return null
                off += n
            }
            return buf
        }
    }
}

/** Protobuf mesajını alan numarasına göre çözümler. */
class PbMsg(data: ByteArray) {
    val ints = HashMap<Int, Long>()
    val bytes = HashMap<Int, ByteArray>()

    init {
        var i = 0
        fun readVar(): Long {
            var r = 0L
            var s = 0
            while (i < data.size) {
                val b = data[i++].toInt() and 0xFF
                r = r or ((b and 0x7F).toLong() shl s)
                if (b and 0x80 == 0) break
                s += 7
            }
            return r
        }
        while (i < data.size) {
            val key = readVar()
            val field = (key ushr 3).toInt()
            when ((key and 7).toInt()) {
                0 -> ints[field] = readVar()
                2 -> {
                    val n = readVar().toInt()
                    if (n < 0 || i + n > data.size) break
                    bytes[field] = data.copyOfRange(i, i + n)
                    i += n
                }
                5 -> i += 4
                1 -> i += 8
                else -> break
            }
        }
    }

    fun has(field: Int) = ints.containsKey(field) || bytes.containsKey(field)
    fun sub(field: Int): PbMsg? = bytes[field]?.let { PbMsg(it) }
    fun str(field: Int): String = bytes[field]?.toString(Charsets.UTF_8) ?: ""
    fun int(field: Int): Long = ints[field] ?: 0L
}

/** TV'lerin kendinden imzalı sertifikaları için: yerel ağda tümüne güven. */
object TrustAll : X509TrustManager {
    override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
    override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
    override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()

    fun sslContext(km: javax.net.ssl.KeyManager? = null): SSLContext {
        val ctx = SSLContext.getInstance("TLS")
        ctx.init(km?.let { arrayOf(it) }, arrayOf<TrustManager>(this), SecureRandom())
        return ctx
    }
}

/**
 * Android TV eşleştirmesi için istemci kimliği: RSA anahtarı + kendinden imzalı
 * X.509 sertifika. Ek kütüphane olmadan DER olarak elle üretilir.
 */
class ClientIdentity(val key: PrivateKey, val cert: X509Certificate) {

    fun sslContext(): SSLContext {
        val ks = KeyStore.getInstance("PKCS12")
        ks.load(null, null)
        val pw = "gk".toCharArray()
        ks.setKeyEntry("istemci", key, pw, arrayOf(cert))
        val kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm())
        kmf.init(ks, pw)
        val ctx = SSLContext.getInstance("TLS")
        ctx.init(kmf.keyManagers, arrayOf<TrustManager>(TrustAll), SecureRandom())
        return ctx
    }

    companion object {
        fun load(context: Context): ClientIdentity {
            val p = context.getSharedPreferences("atv_kimlik", Context.MODE_PRIVATE)
            val k = p.getString("anahtar", null)
            val c = p.getString("sertifika", null)
            if (k != null && c != null) {
                runCatching {
                    val key = KeyFactory.getInstance("RSA")
                        .generatePrivate(PKCS8EncodedKeySpec(Base64.decode(k, Base64.NO_WRAP)))
                    val cert = CertificateFactory.getInstance("X.509")
                        .generateCertificate(ByteArrayInputStream(Base64.decode(c, Base64.NO_WRAP))) as X509Certificate
                    return ClientIdentity(key, cert)
                }
            }
            val id = create()
            p.edit()
                .putString("anahtar", Base64.encodeToString(id.key.encoded, Base64.NO_WRAP))
                .putString("sertifika", Base64.encodeToString(id.cert.encoded, Base64.NO_WRAP))
                .apply()
            return id
        }

        private fun create(): ClientIdentity {
            val kpg = KeyPairGenerator.getInstance("RSA")
            kpg.initialize(2048)
            val kp = kpg.generateKeyPair()
            val sha256Rsa = Der.seq(Der.oid(byteArrayOf(0x2A, 0x86.toByte(), 0x48, 0x86.toByte(), 0xF7.toByte(), 0x0D, 0x01, 0x01, 0x0B)), Der.nul())
            val name = Der.seq(Der.set(Der.seq(Der.oid(byteArrayOf(0x55, 0x04, 0x03)), Der.utf8("atvremote"))))
            val serial = BigInteger(64, SecureRandom()).abs().add(BigInteger.ONE)
            val tbs = Der.seq(
                Der.tagged(0, Der.int(BigInteger.valueOf(2))),
                Der.int(serial),
                sha256Rsa,
                name,
                Der.seq(Der.utcTime("200101000000Z"), Der.utcTime("491231235959Z")),
                name,
                kp.public.encoded
            )
            val sig = Signature.getInstance("SHA256withRSA")
            sig.initSign(kp.private)
            sig.update(tbs)
            val certDer = Der.seq(tbs, sha256Rsa, Der.bitString(sig.sign()))
            val cert = CertificateFactory.getInstance("X.509")
                .generateCertificate(ByteArrayInputStream(certDer)) as X509Certificate
            return ClientIdentity(kp.private, cert)
        }
    }
}

/** Basit DER kodlayıcı */
object Der {
    private fun len(n: Int): ByteArray = when {
        n < 0x80 -> byteArrayOf(n.toByte())
        n < 0x100 -> byteArrayOf(0x81.toByte(), n.toByte())
        n < 0x10000 -> byteArrayOf(0x82.toByte(), (n shr 8).toByte(), n.toByte())
        else -> byteArrayOf(0x83.toByte(), (n shr 16).toByte(), (n shr 8).toByte(), n.toByte())
    }

    private fun tlv(tag: Int, body: ByteArray): ByteArray = byteArrayOf(tag.toByte()) + len(body.size) + body
    fun seq(vararg parts: ByteArray) = tlv(0x30, parts.fold(ByteArray(0)) { a, b -> a + b })
    fun set(vararg parts: ByteArray) = tlv(0x31, parts.fold(ByteArray(0)) { a, b -> a + b })
    fun int(v: BigInteger) = tlv(0x02, v.toByteArray())
    fun oid(encoded: ByteArray) = tlv(0x06, encoded)
    fun nul() = byteArrayOf(0x05, 0x00)
    fun utf8(s: String) = tlv(0x0C, s.toByteArray(Charsets.UTF_8))
    fun utcTime(s: String) = tlv(0x17, s.toByteArray(Charsets.US_ASCII))
    fun bitString(b: ByteArray) = tlv(0x03, byteArrayOf(0) + b)
    fun tagged(n: Int, body: ByteArray) = tlv(0xA0 or n, body)
}

object Wol {
    /** Wake-on-LAN sihirli paketi gönder. */
    fun send(mac: String): String? {
        val hex = mac.replace(":", "").replace("-", "")
        if (hex.length != 12) return "MAC adresi geçersiz"
        val m = ByteArray(6) { hex.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
        val pkt = ByteArray(6 + 16 * 6)
        for (i in 0 until 6) pkt[i] = 0xFF.toByte()
        for (i in 0 until 16) System.arraycopy(m, 0, pkt, 6 + i * 6, 6)
        return try {
            DatagramSocket().use { s ->
                s.broadcast = true
                val addr = InetAddress.getByName("255.255.255.255")
                s.send(DatagramPacket(pkt, pkt.size, addr, 9))
                s.send(DatagramPacket(pkt, pkt.size, addr, 7))
            }
            null
        } catch (e: Exception) {
            e.message
        }
    }
}

fun bigUnsigned(b: BigInteger): ByteArray {
    val a = b.toByteArray()
    return if (a.size > 1 && a[0].toInt() == 0) a.copyOfRange(1, a.size) else a
}
