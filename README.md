# Gün Kumanda

Gün Teknik saha ekibi için evrensel kumanda uygulaması (Android) ve ESP32 IR modülü.

## Ne yapar
- **Saha kumandası (IR):** klima (65 protokol, tam kontrol paneli + "bip ile protokol bulma"), TV, uydu alıcısı,
  ses sistemi, DVR/NVR, projektör, TV box, aydınlatma (LED şerit 24/44 hazır panel), vantilatör, ısıtıcı ve diğerleri.
  Yaklaşık 6.900 hazır kumanda (Flipper-IRDB + irdb + irplus dönüşümleri) internetsiz çalışır.
- **Saha araçları:** hızlı bulma (markasız açma), markanın tüm modellerini sırayla deneme, 256 komut tarama,
  kumanda kopyalama (IR modülüyle), elle kod (adres/komut, protokol, ham, Pronto), servis/otel menüleri,
  irplus içe/dışa aktarma.
- **Ortak kayıt:** çalışan kumandalar ERP Supabase projesindeki `ir_kumandalar` tablosuna kaydedilir, ekipte eşitlenir;
  müşteri (kisiler) ve etiket fotoğrafı bağlanabilir. Ekip üyeleri ERP verilerini görmez.
- **Akıllı TV (Wi-Fi):** Android/Google TV (resmi uzaktan kumanda protokolü v2), LG webOS, Samsung Tizen,
  Vestel ailesi, Sony Bravia. Dokunmatik alan, jiroskoplu havada fare, canlı klavye ve sesle yazma, uygulama kısayolları,
  telefonu düğme gibi çevirerek ses, bilek fiskesiyle kanal, ters çevirince sessiz, TV kimlik kartı (ERP'ye kayıt).
- **Bluetooth fare/klavye:** telefon her TV'ye Bluetooth HID fare + klavye + medya tuşu olarak bağlanır.
- **TV Yardımcısı (isteğe bağlı):** Android TV'ye kurulan küçük uygulama, ağ üzerinden imleç gösterir.

## Klasörler
- `android/app` — uygulama (Kotlin kabuk + `assets/www` arayüz + `cpp` IR çekirdeği)
- `android/tvhelper` — Android TV imleç yardımcısı
- `firmware/gun-ir-modul` — ESP32 IR modülü
- `tools/build_db.py` — IR veritabanı üretici
- `supabase/kumanda_tablolari.sql` — veritabanı tabloları (uygulandı)
- `tests/` — native çekirdek testleri

## Derleme
Her `main` gönderiminde GitHub Actions APK'ları ve modül yazılımını derler, "Releases" altında yayınlar.

## Lisanslar
IRremoteESP8266 (LGPL-2.1), Flipper-IRDB (CC0), irdb (Simon Peter, izinle), lgtv2 (MIT), supabase-js (MIT).
Contains/accesses irdb by Simon Peter and contributors, used under permission. See https://github.com/probonopd/irdb
