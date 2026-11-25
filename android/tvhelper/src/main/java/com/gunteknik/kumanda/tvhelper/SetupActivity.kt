package com.gunteknik.kumanda.tvhelper

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/** Kurulum ekranı: erişilebilirlik servisini açmaya yönlendirir. */
class SetupActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.rgb(0x0E, 0x1A, 0x22))
            setPadding(80, 80, 80, 80)
        }
        box.addView(TextView(this).apply {
            text = "Gün Kumanda TV Yardımcısı"
            textSize = 30f
            setTextColor(Color.rgb(0xE0, 0xA5, 0x26))
        })
        box.addView(TextView(this).apply {
            text = "\nTelefondaki havada fare ve dokunmatik alanın bu TV'de imleç olarak çalışması için:\n\n" +
                "1. Aşağıdaki düğmeyle Erişilebilirlik ayarlarını açın.\n" +
                "2. \"Gün Kumanda TV Yardımcısı\" servisini etkinleştirin.\n" +
                "3. Telefonda bu TV'ye bağlanın; imleç otomatik çalışır.\n"
            textSize = 18f
            setTextColor(Color.rgb(0xBF, 0xE6, 0xF2))
        })
        box.addView(Button(this).apply {
            text = "Erişilebilirlik ayarlarını aç"
            setOnClickListener {
                runCatching { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
            }
            requestFocus()
        })
        setContentView(box)
    }
}
