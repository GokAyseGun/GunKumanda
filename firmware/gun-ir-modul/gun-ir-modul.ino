/*
 * Gün IR modülü — ESP32 (C3 SuperMini ya da herhangi bir ESP32)
 * Telefondaki Gün Kumanda uygulaması ile Bluetooth LE üzerinden çalışır:
 *  - Telefondan gelen ham IR sinyalini IR LED ile gönderir
 *  - Öğrenme modunda IR alıcıdan (VS1838B/TSOP) okuduğu sinyali telefona yollar
 *
 * Bağlantı:
 *   GPIO4 --1k--> NPN baz (S8050/2N2222), emitör GND,
 *   kolektör --> IR LED(ler) --10R--> 3V3 (ya da 5V)
 *   VS1838B: OUT -> GPIO5, VCC -> 3V3, GND -> GND
 *
 * Kütüphaneler: IRremoteESP8266 (2.9+), NimBLE-Arduino (1.4.x)
 *
 * Paketler (küçük-endian):
 *   Telefon -> modül (TX karakteristiği, yazma):
 *     0x10 frekans_kHz sayı_lo sayı_hi         gönderim başlangıcı
 *     0x11 ofset_lo ofset_hi [u16 ...]          zamanlama verisi (µs)
 *     0x12                                       gönder
 *     0x20 saniye                                öğrenmeyi başlat
 *     0x21                                       öğrenmeyi durdur
 *   Modül -> telefon (RX karakteristiği, bildirim):
 *     0x30 sayı_lo sayı_hi frekans_kHz           yakalama başlangıcı
 *     0x31 ofset_lo ofset_hi [u16 ...]           yakalama verisi
 *     0x32                                       yakalama sonu
 *     0x40 metin                                  durum mesajı
 */
#include <Arduino.h>
#include <NimBLEDevice.h>
#include <IRremoteESP8266.h>
#include <IRsend.h>
#include <IRrecv.h>
#include <IRutils.h>

#ifndef IR_TX_PIN
#define IR_TX_PIN 4
#endif
#ifndef IR_RX_PIN
#define IR_RX_PIN 5
#endif
#ifndef LED_PIN
#define LED_PIN 8   // C3 SuperMini kart üstü LED (yoksa önemsiz)
#endif

static const char* SERVICE_UUID = "8e1f0001-7c2b-4d5e-9a10-6b4a3c2d1e00";
static const char* TX_UUID      = "8e1f0002-7c2b-4d5e-9a10-6b4a3c2d1e00";
static const char* RX_UUID      = "8e1f0003-7c2b-4d5e-9a10-6b4a3c2d1e00";

static const uint16_t MAX_LEN = 1600;

IRsend irsend(IR_TX_PIN);
IRrecv irrecv(IR_RX_PIN, 1024, 50, true);
decode_results results;

NimBLECharacteristic* rxChar = nullptr;
volatile bool connected = false;

// Gönderim tamponu
uint16_t txBuf[MAX_LEN];
uint16_t txCount = 0;
uint8_t txKhz = 38;
volatile bool txReady = false;

// Öğrenme
volatile bool learning = false;
uint32_t learnUntil = 0;

void notify(const uint8_t* data, size_t len) {
  if (!connected || rxChar == nullptr) return;
  rxChar->setValue(data, len);
  rxChar->notify();
  delay(8);
}

void notifyText(const char* t) {
  uint8_t buf[64];
  size_t n = strlen(t);
  if (n > 62) n = 62;
  buf[0] = 0x40;
  memcpy(buf + 1, t, n);
  notify(buf, n + 1);
}

class ServerCb : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* s) override {
    connected = true;
    digitalWrite(LED_PIN, LOW);
  }
  void onDisconnect(NimBLEServer* s) override {
    connected = false;
    learning = false;
    digitalWrite(LED_PIN, HIGH);
    NimBLEDevice::startAdvertising();
  }
};

class TxCb : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* c) override {
    std::string v = c->getValue();
    if (v.empty()) return;
    const uint8_t* d = (const uint8_t*)v.data();
    size_t n = v.size();
    switch (d[0]) {
      case 0x10:
        if (n >= 4) {
          txKhz = d[1];
          txCount = (uint16_t)(d[2] | (d[3] << 8));
          if (txCount > MAX_LEN) txCount = MAX_LEN;
        }
        break;
      case 0x11:
        if (n >= 3) {
          uint16_t off = (uint16_t)(d[1] | (d[2] << 8));
          for (size_t i = 3; i + 1 < n; i += 2) {
            if (off < MAX_LEN) txBuf[off++] = (uint16_t)(d[i] | (d[i + 1] << 8));
          }
        }
        break;
      case 0x12:
        txReady = true;
        break;
      case 0x20:
        learnUntil = millis() + (uint32_t)(n > 1 ? d[1] : 15) * 1000UL;
        learning = true;
        irrecv.resume();
        break;
      case 0x21:
        learning = false;
        break;
    }
  }
};

void sendCapture(const decode_results& r) {
  uint16_t count = r.rawlen > 1 ? r.rawlen - 1 : 0;
  if (count == 0) return;
  uint8_t hdr[4] = {0x30, (uint8_t)(count & 0xFF), (uint8_t)(count >> 8), 38};
  notify(hdr, 4);
  const uint16_t per = 60;
  uint8_t pkt[3 + per * 2];
  for (uint16_t off = 0; off < count; off += per) {
    uint16_t m = (count - off) < per ? (count - off) : per;
    pkt[0] = 0x31;
    pkt[1] = off & 0xFF;
    pkt[2] = off >> 8;
    for (uint16_t j = 0; j < m; j++) {
      uint32_t us = (uint32_t)r.rawbuf[off + j + 1] * kRawTick;
      if (us > 65535) us = 65535;
      pkt[3 + j * 2] = us & 0xFF;
      pkt[4 + j * 2] = us >> 8;
    }
    notify(pkt, 3 + m * 2);
  }
  uint8_t end = 0x32;
  notify(&end, 1);
}

void setup() {
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);
  irsend.begin();
  irrecv.setUnknownThreshold(12);
  irrecv.enableIRIn();

  NimBLEDevice::init("Gun IR Modul");
  NimBLEDevice::setMTU(247);
  NimBLEDevice::setPower(ESP_PWR_LVL_P9);
  NimBLEServer* server = NimBLEDevice::createServer();
  server->setCallbacks(new ServerCb());
  NimBLEService* svc = server->createService(SERVICE_UUID);
  NimBLECharacteristic* tx = svc->createCharacteristic(TX_UUID, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
  tx->setCallbacks(new TxCb());
  rxChar = svc->createCharacteristic(RX_UUID, NIMBLE_PROPERTY::NOTIFY);
  svc->start();
  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  adv->setScanResponse(true);
  adv->start();
}

void loop() {
  if (txReady) {
    txReady = false;
    irrecv.disableIRIn();          // kendi sinyalimizi okumayalım
    irsend.sendRaw(txBuf, txCount, txKhz);
    delay(30);
    irrecv.enableIRIn();
    digitalWrite(LED_PIN, connected ? LOW : HIGH);
  }
  if (irrecv.decode(&results)) {
    if (learning && results.rawlen > 8) {
      learning = false;
      sendCapture(results);
      notifyText("OKUNDU");
    }
    irrecv.resume();
  }
  if (learning && (int32_t)(millis() - learnUntil) > 0) {
    learning = false;
    notifyText("ZAMAN ASIMI");
  }
  delay(2);
}
