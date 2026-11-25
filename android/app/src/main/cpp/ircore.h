// Gün Kumanda - IR çekirdeği (JNI ve masaüstü testleri ortak kullanır)
#ifndef GUNKUMANDA_IRCORE_H_
#define GUNKUMANDA_IRCORE_H_

#include <stdint.h>
#include <string>
#include <vector>

struct IrSignal {
  uint32_t freq = 38000;
  std::vector<uint32_t> t;  // mark, space, mark, space ... (mikrosaniye)
};

// Klima alanları (f dizisi sırası):
//  0 power(0/1) 1 mode(-1 kapalı,0 auto,1 cool,2 heat,3 dry,4 fan)
//  2 celsius(0/1) 3 fan(0 auto,1 min,2 low,3 medium,4 high,5 max,6 medHigh)
//  4 swingv(-1 off,0 auto,1 highest,2 high,3 middle,4 low,5 lowest,
//           6 upperMiddle) 5 swingh(-1 off,0 auto,1 leftMax,2 left,
//           3 middle,4 right,5 rightMax,6 wide)
//  6 quiet 7 turbo 8 econo 9 light 10 filter 11 clean 12 beep
//  13 sleep(dakika,-1 kapalı) 14 clock(gün içindeki dakika,-1 yok)
static const int kAcFieldCount = 15;

bool ircore_encode_ac(const std::string& protocol, int model, const int* f,
                      int nf, float degrees, IrSignal* out, std::string* err);

// value_hex: durum (state) protokollerinde bayt dizisi, diğerlerinde sayı.
bool ircore_encode(const std::string& protocol, const std::string& value_hex,
                   int bits, int repeat, IrSignal* out, std::string* err);

// Ham sinyali çöz (kopyalama). JSON döner.
std::string ircore_decode(const uint32_t* t, int n);

// Klima protokolleri listesi (JSON dizi).
std::string ircore_ac_protocols();
// Gönderilebilen tüm protokoller (JSON dizi).
std::string ircore_protocols();

#endif  // GUNKUMANDA_IRCORE_H_
