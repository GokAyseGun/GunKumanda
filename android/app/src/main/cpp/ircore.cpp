// Gün Kumanda - IR çekirdeği
// IRremoteESP8266 (LGPL-2.1) kütüphanesini UNIT_TEST modunda kullanarak
// protokol/klima sinyali üretir ve ham sinyalleri çözer.
#include "ircore.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <mutex>

#include "IRac.h"
#include "IRrecv.h"
#include "IRremoteESP8266.h"
#include "IRsend.h"
#include "IRsend_test.h"
#include "IRutils.h"

namespace {

std::mutex g_mutex;
IrSignal* g_rec = nullptr;

std::string jsonEscape(const std::string& s) {
  std::string o;
  o.reserve(s.size() + 8);
  for (char c : s) {
    switch (c) {
      case '"': o += "\\\""; break;
      case '\\': o += "\\\\"; break;
      case '\n': o += "\\n"; break;
      case '\r': break;
      case '\t': o += " "; break;
      default:
        if (static_cast<unsigned char>(c) < 0x20) break;
        o += c;
    }
  }
  return o;
}

std::string toStd(const String& s) { return std::string(s.c_str()); }

std::string hex64(uint64_t v) {
  char buf[32];
  snprintf(buf, sizeof(buf), "0x%llX", static_cast<unsigned long long>(v));
  return buf;
}

bool parseHexBytes(const std::string& in, std::vector<uint8_t>* out) {
  std::string h;
  for (char c : in) {
    if (isxdigit(static_cast<unsigned char>(c))) h += c;
  }
  // "0x" öneki varsa x zaten atlandı ama baştaki 0 kalır; tek uzunlukta ise
  // baştaki sıfırı at.
  if (in.size() > 1 && in[0] == '0' && (in[1] == 'x' || in[1] == 'X'))
    h = h.substr(1);
  if (h.size() % 2) h = "0" + h;
  out->clear();
  for (size_t i = 0; i + 1 < h.size(); i += 2)
    out->push_back(static_cast<uint8_t>(strtoul(h.substr(i, 2).c_str(),
                                                nullptr, 16)));
  return !out->empty();
}

void finish(IrSignal* out) {
  // Sondaki boşlukları kırp (gönderirken gereksiz), çift uzunluk zorunlu değil
  while (!out->t.empty() && out->t.size() % 2 == 0 && out->t.back() == 0)
    out->t.pop_back();
  if (out->freq == 0) out->freq = 38000;
}

}  // namespace

void ircore_rec_push(bool is_mark, uint32_t usec, uint32_t freq) {
  if (!g_rec || usec == 0) return;
  std::vector<uint32_t>& t = g_rec->t;
  if (freq) g_rec->freq = freq;
  bool last_is_mark = (t.size() % 2) == 1;  // dizi mark ile başlar
  if (t.empty()) {
    if (!is_mark) return;  // baştaki boşlukları yok say
    t.push_back(usec);
    return;
  }
  if (is_mark == last_is_mark) {
    uint64_t v = static_cast<uint64_t>(t.back()) + usec;
    t.back() = v > 0xFFFFFFFFULL ? 0xFFFFFFFFU : static_cast<uint32_t>(v);
  } else {
    t.push_back(usec);
  }
}

bool ircore_encode_ac(const std::string& protocol, int model, const int* f,
                      int nf, float degrees, IrSignal* out,
                      std::string* err) {
  std::lock_guard<std::mutex> lock(g_mutex);
  decode_type_t type = strToDecodeType(protocol.c_str());
  if (type == decode_type_t::UNKNOWN || !IRac::isProtocolSupported(type)) {
    if (err) *err = "Desteklenmeyen klima protokolu: " + protocol;
    return false;
  }
  auto get = [&](int i, int def) { return (i < nf) ? f[i] : def; };
  stdAc::state_t st;
  st.protocol = type;
  // Modeli belirtilmemişse, -1 ile hatalı sinyal üreten protokoller için
  // kütüphanenin varsayılan modelini (1) kullan.
  if (model < 0 && type == decode_type_t::FUJITSU_AC) model = 1;
  st.model = static_cast<int16_t>(model);
  st.power = get(0, 1) != 0;
  st.mode = static_cast<stdAc::opmode_t>(get(1, 1));
  st.celsius = get(2, 1) != 0;
  st.degrees = degrees;
  st.fanspeed = static_cast<stdAc::fanspeed_t>(get(3, 0));
  st.swingv = static_cast<stdAc::swingv_t>(get(4, -1));
  st.swingh = static_cast<stdAc::swingh_t>(get(5, -1));
  st.quiet = get(6, 0) != 0;
  st.turbo = get(7, 0) != 0;
  st.econo = get(8, 0) != 0;
  st.light = get(9, 0) != 0;
  st.filter = get(10, 0) != 0;
  st.clean = get(11, 0) != 0;
  st.beep = get(12, 0) != 0;
  st.sleep = static_cast<int16_t>(get(13, -1));
  st.clock = static_cast<int16_t>(get(14, -1));

  out->t.clear();
  out->freq = 38000;
  g_rec = out;
  IRac ac(kGpioUnused);
  bool ok = ac.sendAc(st, nullptr);
  g_rec = nullptr;
  if (!ok || out->t.empty()) {
    if (err) *err = "Sinyal uretilemedi";
    return false;
  }
  finish(out);
  return true;
}

bool ircore_encode(const std::string& protocol, const std::string& value_hex,
                   int bits, int repeat, IrSignal* out, std::string* err) {
  std::lock_guard<std::mutex> lock(g_mutex);
  decode_type_t type = strToDecodeType(protocol.c_str());
  if (type == decode_type_t::UNKNOWN) {
    if (err) *err = "Bilinmeyen protokol: " + protocol;
    return false;
  }
  out->t.clear();
  out->freq = 38000;
  std::unique_ptr<IRsendTest> tx(new IRsendTest(kGpioUnused));
  tx->begin();
  bool ok;
  g_rec = out;
  if (hasACState(type)) {
    std::vector<uint8_t> state;
    if (!parseHexBytes(value_hex, &state)) {
      g_rec = nullptr;
      if (err) *err = "Gecersiz durum verisi";
      return false;
    }
    ok = tx->send(type, state.data(), static_cast<uint16_t>(state.size()));
  } else {
    uint64_t v = strtoull(value_hex.c_str(), nullptr, 16);
    uint16_t nbits = bits > 0 ? static_cast<uint16_t>(bits)
                              : IRsend::defaultBits(type);
    ok = tx->send(type, v, nbits,
                  static_cast<uint16_t>(repeat < 0 ? 0 : repeat));
  }
  g_rec = nullptr;
  if (!ok || out->t.empty()) {
    if (err) *err = "Sinyal uretilemedi";
    return false;
  }
  finish(out);
  return true;
}

std::string ircore_decode(const uint32_t* t, int n) {
  std::lock_guard<std::mutex> lock(g_mutex);
  if (n < 6) return "{\"ok\":false,\"error\":\"Sinyal cok kisa\"}";
  std::vector<uint16_t> raw(n + 2, 0);
  raw[0] = 0;
  for (int i = 0; i < n; i++) {
    uint32_t ticks = t[i] / kRawTick;
    raw[i + 1] = ticks > UINT16_MAX ? UINT16_MAX : static_cast<uint16_t>(ticks);
  }
  decode_results r;
  r.decode_type = UNKNOWN;
  r.bits = 0;
  r.rawbuf = raw.data();
  r.rawlen = static_cast<uint16_t>(n + 1);
  r.overflow = false;
  r.repeat = false;
  r.address = 0;
  r.command = 0;
  r.value = 0;
  IRrecv rx(kGpioUnused);
  bool ok = rx.decode(&r);
  std::string j = "{\"ok\":";
  if (!ok || r.decode_type == UNKNOWN) {
    j += "false,\"protocol\":\"UNKNOWN\"}";
    return j;
  }
  j += "true,\"protocol\":\"" + jsonEscape(toStd(typeToString(r.decode_type)))
       + "\",\"bits\":" + std::to_string(r.bits);
  if (hasACState(r.decode_type)) {
    std::string st;
    char b[4];
    for (uint16_t i = 0; i < r.bits / 8; i++) {
      snprintf(b, sizeof(b), "%02X", r.state[i]);
      st += b;
    }
    j += ",\"state\":\"" + st + "\"";
  } else {
    j += ",\"value\":\"" + hex64(r.value) + "\"";
    j += ",\"address\":\"" + hex64(r.address) + "\"";
    j += ",\"command\":\"" + hex64(r.command) + "\"";
  }
  j += ",\"repeat\":" + std::string(r.repeat ? "true" : "false");
  std::string desc = toStd(IRAcUtils::resultAcToString(&r));
  if (!desc.empty()) j += ",\"description\":\"" + jsonEscape(desc) + "\"";
  stdAc::state_t s;
  if (IRac::isProtocolSupported(r.decode_type) &&
      IRAcUtils::decodeToState(&r, &s, nullptr)) {
    j += ",\"ac\":{\"protocol\":\"" +
         jsonEscape(toStd(typeToString(s.protocol))) +
         "\",\"model\":" + std::to_string(s.model) +
         ",\"power\":" + (s.power ? "true" : "false") +
         ",\"mode\":" + std::to_string(static_cast<int>(s.mode)) +
         ",\"degrees\":" + std::to_string(s.degrees) +
         ",\"celsius\":" + (s.celsius ? "true" : "false") +
         ",\"fan\":" + std::to_string(static_cast<int>(s.fanspeed)) +
         ",\"swingv\":" + std::to_string(static_cast<int>(s.swingv)) +
         ",\"swingh\":" + std::to_string(static_cast<int>(s.swingh)) +
         ",\"quiet\":" + (s.quiet ? "true" : "false") +
         ",\"turbo\":" + (s.turbo ? "true" : "false") +
         ",\"econo\":" + (s.econo ? "true" : "false") +
         ",\"light\":" + (s.light ? "true" : "false") +
         ",\"clean\":" + (s.clean ? "true" : "false") + "}";
  }
  j += "}";
  return j;
}

std::string ircore_ac_protocols() {
  std::string j = "[";
  bool first = true;
  for (int i = 0; i <= kLastDecodeType; i++) {
    decode_type_t t = static_cast<decode_type_t>(i);
    if (!IRac::isProtocolSupported(t)) continue;
    if (t == decode_type_t::YORK) continue;  // kütüphanede sendAc karşılığı yok
    if (!first) j += ",";
    first = false;
    j += "\"" + jsonEscape(toStd(typeToString(t))) + "\"";
  }
  return j + "]";
}

std::string ircore_protocols() {
  std::string j = "[";
  bool first = true;
  for (int i = 1; i <= kLastDecodeType; i++) {
    decode_type_t t = static_cast<decode_type_t>(i);
    std::string name = toStd(typeToString(t));
    if (name.empty() || name == "UNKNOWN") continue;
    if (!first) j += ",";
    first = false;
    j += "{\"name\":\"" + jsonEscape(name) + "\",\"state\":" +
         (hasACState(t) ? "true" : "false") + ",\"bits\":" +
         std::to_string(IRsend::defaultBits(t)) + "}";
  }
  return j + "]";
}
