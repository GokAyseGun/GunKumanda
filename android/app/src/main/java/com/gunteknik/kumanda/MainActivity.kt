package com.gunteknik.kumanda

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.bluetooth.BluetoothAdapter
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.speech.RecognizerIntent
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import com.gunteknik.kumanda.ble.BleIrModule
import com.gunteknik.kumanda.usb.UsbIrDongle
import com.gunteknik.kumanda.hid.HidRemote
import com.gunteknik.kumanda.ir.IrOutput
import com.gunteknik.kumanda.motion.AirMouse
import com.gunteknik.kumanda.tv.TvEvents
import com.gunteknik.kumanda.tv.TvManager
import org.json.JSONArray
import org.json.JSONObject

class MainActivity : Activity() {

    lateinit var web: WebView
    lateinit var ble: BleIrModule
    lateinit var irOut: IrOutput
    lateinit var usbIr: UsbIrDongle
    lateinit var hid: HidRemote
    lateinit var tv: TvManager
    lateinit var airMouse: AirMouse
    @Volatile var airTarget = "tv"
    @Volatile var volumeKeysToJs = false

    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var speechCb: String? = null

    companion object {
        const val REQ_FILE = 11
        const val REQ_SPEECH = 12
        const val REQ_PERM = 13
        const val REQ_DISCOVERABLE = 14
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        ble = BleIrModule(this)
        usbIr = UsbIrDongle(this)
        irOut = IrOutput(this, ble, usbIr)
        usbIr.listener = object : UsbIrDongle.Listener {
            override fun onDongleState(connected: Boolean, name: String, message: String) {
                emit("modul", JSONObject().put("connected", connected).put("name", name).put("message", message).put("usb", true))
            }
            override fun onLearned(freq: Int, timings: IntArray) {
                emit("ogrenildi", JSONObject().put("f", freq).put("t", JSONArray(timings.toList())))
            }
        }
        usbIr.start()
        hid = HidRemote(this)
        airMouse = AirMouse(this)
        tv = TvManager(this, TvEvents { host, type, data ->
            emit("tv", JSONObject().put("host", host).put("type", type).put("data", data))
        })

        ble.listener = object : BleIrModule.Listener {
            override fun onModuleState(connected: Boolean, name: String, message: String) =
                emit("modul", JSONObject().put("connected", connected).put("name", name).put("message", message))

            override fun onLearned(freq: Int, timings: IntArray) =
                emit("ogrenildi", JSONObject().put("f", freq).put("t", JSONArray(timings.toList())))

            override fun onModuleText(text: String) = emit("modulMesaj", JSONObject().put("text", text))
        }
        hid.listener = object : HidRemote.Listener {
            override fun onHidState(state: String, device: String) =
                emit("hid", JSONObject().put("state", state).put("device", device))
        }
        airMouse.sink = object : AirMouse.Sink {
            override fun move(dx: Int, dy: Int) {
                if (airTarget == "bt") hid.mouseMove(dx, dy) else tv.pointerMove(dx, dy)
            }

            override fun gesture(name: String) = emit("jest", JSONObject().put("name", name))
        }

        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web = WebView(this)
        web.setBackgroundColor(0xFF0E1A22.toInt())
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            textZoom = 100
        }
        web.overScrollMode = View.OVER_SCROLL_NEVER
        web.isHapticFeedbackEnabled = true
        web.addJavascriptInterface(Bridge(this), "Native")
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val u = request.url
                if (u.host == "appassets.androidplatform.net") return false
                openUrl(u.toString())
                return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                return try {
                    startActivityForResult(Intent.createChooser(params.createIntent(), "Dosya seç"), REQ_FILE)
                    true
                } catch (e: Exception) {
                    fileCallback = null
                    false
                }
            }
        }
        setContentView(web)
        web.loadUrl("https://appassets.androidplatform.net/assets/www/index.html")
        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.action == android.hardware.usb.UsbManager.ACTION_USB_DEVICE_ATTACHED) { usbIr.kontrolEt(); return }
        handleIntent(intent)
    }

    /** .irplus dosyası "Birlikte aç" ile gelirse içeriği arayüze ilet */
    private fun handleIntent(i: Intent?) {
        val uri = i?.data ?: return
        if (i.action != Intent.ACTION_VIEW) return
        Thread {
            val text = runCatching {
                contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() }
            }.getOrNull() ?: return@Thread
            runOnUiThread {
                web.postDelayed({ emit("dosyaAc", JSONObject().put("name", uri.lastPathSegment ?: "").put("text", text)) }, 1200)
            }
        }.start()
    }

    fun emit(type: String, data: JSONObject) {
        val js = "window.__nativeEvent && window.__nativeEvent(${JSONObject.quote(type)}, $data)"
        runOnUiThread { if (::web.isInitialized) web.evaluateJavascript(js, null) }
    }

    fun callback(id: String, json: String) {
        val js = "window.__nativeCb && window.__nativeCb(${JSONObject.quote(id)}, $json)"
        runOnUiThread { web.evaluateJavascript(js, null) }
    }

    fun setKeepScreenOn(on: Boolean) {
        if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    fun askPermissions(group: String) {
        val need = ArrayList<String>()
        if (group == "bt") {
            if (Build.VERSION.SDK_INT >= 31) {
                need += Manifest.permission.BLUETOOTH_CONNECT
                need += Manifest.permission.BLUETOOTH_SCAN
                need += Manifest.permission.BLUETOOTH_ADVERTISE
            } else {
                need += Manifest.permission.ACCESS_FINE_LOCATION
            }
        }
        val missing = need.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isNotEmpty()) requestPermissions(missing.toTypedArray(), REQ_PERM)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        emit("izin", JSONObject().put("ok", grantResults.all { it == PackageManager.PERMISSION_GRANTED }))
    }

    @SuppressLint("MissingPermission")
    fun requestDiscoverable() {
        askPermissions("bt")
        runCatching {
            startActivityForResult(Intent(BluetoothAdapter.ACTION_REQUEST_DISCOVERABLE)
                .putExtra(BluetoothAdapter.EXTRA_DISCOVERABLE_DURATION, 180), REQ_DISCOVERABLE)
        }
    }

    fun startSpeech(cb: String) {
        speechCb = cb
        try {
            startActivityForResult(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "tr-TR")
                .putExtra(RecognizerIntent.EXTRA_PROMPT, "Söyleyin, TV'ye yazayım"), REQ_SPEECH)
        } catch (e: Exception) {
            callback(cb, JSONObject().put("ok", false).put("error", "Ses tanıma bu telefonda yok").toString())
            speechCb = null
        }
    }

    fun shareText(title: String, text: String) {
        runCatching {
            startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain")
                .putExtra(Intent.EXTRA_SUBJECT, title).putExtra(Intent.EXTRA_TEXT, text), title))
        }
    }

    /** İndirilenler klasörüne metin dosyası kaydet */
    fun saveText(fileName: String, text: String) {
        val ok = runCatching {
            if (Build.VERSION.SDK_INT >= 29) {
                val values = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
                    put(MediaStore.MediaColumns.MIME_TYPE, "application/octet-stream")
                    put(MediaStore.MediaColumns.RELATIVE_PATH, "Download/GunKumanda")
                }
                val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)!!
                contentResolver.openOutputStream(uri)!!.use { it.write(text.toByteArray()) }
            } else {
                shareText(fileName, text)
            }
            true
        }.getOrDefault(false)
        emit("kaydedildi", JSONObject().put("ok", ok).put("name", fileName))
    }

    fun openUrl(url: String) {
        runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
    }

    @Deprecated("Activity sonuç API'si")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        when (requestCode) {
            REQ_FILE -> {
                val result = WebChromeClient.FileChooserParams.parseResult(resultCode, data)
                fileCallback?.onReceiveValue(result)
                fileCallback = null
            }
            REQ_SPEECH -> {
                val cb = speechCb ?: return
                speechCb = null
                val text = data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
                callback(cb, JSONObject().put("ok", text != null).put("text", text ?: "").toString())
            }
            REQ_DISCOVERABLE -> emit("gorunur", JSONObject().put("ok", resultCode != RESULT_CANCELED))
        }
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (volumeKeysToJs && (event.keyCode == KeyEvent.KEYCODE_VOLUME_UP || event.keyCode == KeyEvent.KEYCODE_VOLUME_DOWN)) {
            if (event.action == KeyEvent.ACTION_DOWN) {
                emit("fizikselTus", JSONObject().put("tus", if (event.keyCode == KeyEvent.KEYCODE_VOLUME_UP) "VOL_UP" else "VOL_DOWN"))
            }
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    @Deprecated("Geri tuşu")
    override fun onBackPressed() {
        web.evaluateJavascript("window.__onBack ? window.__onBack() : false") { r ->
            if (r != "true") {
                @Suppress("DEPRECATION")
                super.onBackPressed()
            }
        }
    }

    override fun onPause() {
        super.onPause()
        airMouse.stop()
        emit("arkaplan", JSONObject())
    }

    override fun onResume() {
        super.onResume()
        emit("onplan", JSONObject())
    }

    override fun onDestroy() {
        airMouse.stop()
        hid.stop()
        tv.disconnectAll()
        ble.disconnect()
        usbIr.stop()
        web.destroy()
        super.onDestroy()
    }
}
