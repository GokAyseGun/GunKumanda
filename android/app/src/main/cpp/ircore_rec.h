// Gün Kumanda - IRremoteESP8266 çıktısını yakalayan küçük kaydedici.
// Kütüphanenin UNIT_TEST modundaki IRsendTest sınıfı her mark/space
// çağrısında buraya yazar; böylece klima sınıflarının kendi içlerinde
// oluşturduğu gönderici nesnelerinin ürettiği sinyal de yakalanır.
#ifndef GUNKUMANDA_IRCORE_REC_H_
#define GUNKUMANDA_IRCORE_REC_H_

#include <stdint.h>

void ircore_rec_push(bool is_mark, uint32_t usec, uint32_t freq);

#endif  // GUNKUMANDA_IRCORE_REC_H_
