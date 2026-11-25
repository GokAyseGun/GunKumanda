# Gün IR modülü

ESP32 tabanlı, Bluetooth LE ile Gün Kumanda uygulamasına bağlanan IR verici + alıcı.

## Parçalar
- ESP32-C3 SuperMini (ya da herhangi bir ESP32 kartı)
- 2 × 940 nm IR LED (geniş açı için iki LED farklı yönlere)
- 1 × NPN transistör (S8050 / 2N2222)
- 1 × VS1838B ya da TSOP38238 IR alıcı (38 kHz)
- Dirençler: 1 kΩ (baz), 10 Ω (LED akımı)
- İsteğe bağlı: 3.7 V Li-ion pil + TP4056 şarj kartı, kutu

## Bağlantı
| Uç | ESP32 |
|---|---|
| Transistör bazı (1 kΩ üzerinden) | GPIO4 |
| VS1838B OUT | GPIO5 |
| VS1838B VCC / GND | 3V3 / GND |
| LED'ler: 3V3 (ya da 5V) → 10 Ω → LED → kolektör, emitör → GND | |

Farklı pin kullanmak için `IR_TX_PIN` / `IR_RX_PIN` tanımlarını değiştirin.

## Yükleme
GitHub Actions her derlemede `gun-ir-modul-esp32c3.bin` ve `gun-ir-modul-esp32.bin` dosyalarını üretir.
Kart ilk kez yükleniyorsa Arduino IDE ile `gun-ir-modul.ino` dosyasını açıp yüklemek en kolayıdır:
- Kart paketi: esp32 (Espressif)
- Kütüphaneler: IRremoteESP8266, NimBLE-Arduino 1.4.x
- C3 SuperMini için: "ESP32C3 Dev Module", "USB CDC On Boot: Enabled"

Telefonda: Ayarlar > IR çıkışı > Modül > Bağlan. Modül "Gun IR Modul" adıyla görünür.
