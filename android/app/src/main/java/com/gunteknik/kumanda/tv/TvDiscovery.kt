package com.gunteknik.kumanda.tv

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import org.json.JSONArray
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.MulticastSocket
import java.net.Socket
import java.util.concurrent.ConcurrentHashMap
import kotlin.concurrent.thread

/**
 * Ağdaki akıllı TV'leri bulur: mDNS (Android TV) + SSDP (LG, Samsung, Sony, Vestel).
 */
class TvDiscovery(private val context: Context) {

    private val found = ConcurrentHashMap<String, JSONObject>()

    fun scan(seconds: Int = 4, done: (String) -> Unit) {
        found.clear()
        thread(name = "tv-kesif") {
            val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            val lock = wifi.createMulticastLock("gunkumanda")
            lock.setReferenceCounted(false)
            lock.acquire()
            val nsd = context.getSystemService(Context.NSD_SERVICE) as NsdManager
            val listeners = ArrayList<NsdManager.DiscoveryListener>()
            for (type in listOf("_androidtvremote2._tcp.", "_googlecast._tcp.")) {
                val l = object : NsdManager.DiscoveryListener {
                    override fun onDiscoveryStarted(serviceType: String) {}
                    override fun onDiscoveryStopped(serviceType: String) {}
                    override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {}
                    override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
                    override fun onServiceLost(serviceInfo: NsdServiceInfo) {}
                    @Suppress("DEPRECATION")
                    override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                        runCatching {
                            nsd.resolveService(serviceInfo, object : NsdManager.ResolveListener {
                                override fun onResolveFailed(si: NsdServiceInfo, errorCode: Int) {}
                                override fun onServiceResolved(si: NsdServiceInfo) {
                                    val ip = si.host?.hostAddress ?: return
                                    if (ip.contains(':')) return
                                    val isAtv = si.serviceType.contains("androidtvremote")
                                    val prev = found[ip]
                                    if (prev == null || isAtv) {
                                        val attrs = si.attributes
                                        val model = attrs["md"]?.toString(Charsets.UTF_8) ?: ""
                                        add(ip, if (isAtv) "androidtv" else (prev?.optString("platform") ?: "cast"),
                                            si.serviceName ?: ip, model)
                                    }
                                }
                            })
                        }
                    }
                }
                runCatching { nsd.discoverServices(type, NsdManager.PROTOCOL_DNS_SD, l); listeners.add(l) }
            }
            ssdp(seconds)
            Thread.sleep(500)
            listeners.forEach { runCatching { nsd.stopServiceDiscovery(it) } }
            runCatching { lock.release() }
            // Yalnızca cast olarak görünenler: Android TV portu açık mı?
            for ((ip, o) in found) {
                if (o.optString("platform") == "cast" && portOpen(ip, 6466)) o.put("platform", "androidtv")
            }
            val arr = JSONArray()
            found.values.forEach { arr.put(it) }
            done(arr.toString())
        }
    }

    private fun add(ip: String, platform: String, name: String, model: String) {
        val o = found[ip] ?: JSONObject().put("host", ip)
        // Daha kesin platform bilgisi önceliklidir
        val cur = o.optString("platform")
        if (cur.isEmpty() || cur == "dial" || cur == "cast") o.put("platform", platform)
        if (name.isNotEmpty() && o.optString("name").isEmpty()) o.put("name", name)
        if (model.isNotEmpty()) o.put("model", model)
        found[ip] = o
    }

    private fun ssdp(seconds: Int) {
        runCatching {
            MulticastSocket(null as java.net.SocketAddress?).use { s ->
                s.reuseAddress = true
                s.bind(InetSocketAddress(0))
                s.soTimeout = 400
                val group = InetAddress.getByName("239.255.255.250")
                for (st in listOf("ssdp:all", "urn:dial-multiscreen-org:service:dial:1",
                    "urn:lge-com:service:webos-second-screen:1",
                    "urn:samsung.com:device:RemoteControlReceiver:1")) {
                    val msg = ("M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\n" +
                        "MAN: \"ssdp:discover\"\r\nMX: 2\r\nST: $st\r\n\r\n").toByteArray()
                    s.send(DatagramPacket(msg, msg.size, group, 1900))
                }
                val end = System.currentTimeMillis() + seconds * 1000L
                val buf = ByteArray(4096)
                while (System.currentTimeMillis() < end) {
                    val p = DatagramPacket(buf, buf.size)
                    try { s.receive(p) } catch (e: java.net.SocketTimeoutException) { continue }
                    val ip = p.address.hostAddress ?: continue
                    val text = String(p.data, 0, p.length)
                    val low = text.lowercase()
                    val platform = when {
                        "webos" in low || "lge" in low || "lg smart" in low -> "webos"
                        "samsung" in low || "tizen" in low -> "tizen"
                        "bravia" in low || "sony" in low -> "sony"
                        "vestel" in low -> "vestel"
                        "dial" in low -> "dial"
                        else -> null
                    } ?: continue
                    val server = text.lines().firstOrNull { it.startsWith("SERVER:", true) }
                        ?.substringAfter(":")?.trim() ?: ""
                    add(ip, platform, "", server.take(60))
                }
            }
        }
        // DIAL görünen ama türü belli olmayanları portlarla ayırt et
        for ((ip, o) in found) {
            if (o.optString("platform") != "dial") continue
            when {
                portOpen(ip, 3001) || portOpen(ip, 3000) -> o.put("platform", "webos")
                portOpen(ip, 8002) -> o.put("platform", "tizen")
                portOpen(ip, 6466) -> o.put("platform", "androidtv")
                portOpen(ip, 56789) || portOpen(ip, 7681) -> o.put("platform", "vestel")
            }
        }
        found.entries.removeIf { it.value.optString("platform") == "dial" }
    }

    /** Elle girilen IP için platformu tahmin et */
    fun probe(ip: String): String = when {
        portOpen(ip, 6466) -> "androidtv"
        portOpen(ip, 3001) || portOpen(ip, 3000) -> "webos"
        portOpen(ip, 8002) || portOpen(ip, 8001) -> "tizen"
        portOpen(ip, 56789) || portOpen(ip, 7681) || portOpen(ip, 1986) -> "vestel"
        portOpen(ip, 80) -> "sony"
        else -> "bilinmiyor"
    }

    private fun portOpen(ip: String, port: Int): Boolean = runCatching {
        Socket().use { it.connect(InetSocketAddress(ip, port), 600); true }
    }.getOrDefault(false)
}
