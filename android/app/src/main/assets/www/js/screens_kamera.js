/* Fotoğraf makinesi kumandası — Canon EOS 650D (RC-6 kızılötesi protokolü)
 *
 * RC-6 iki sinyal gönderir: iki kısa ışık patlaması, aralarındaki boşluk komutu belirler.
 *   Hemen çek      : ~490 µs  —  7,33 ms boşluk  —  ~490 µs
 *   2 sn gecikmeli : ~490 µs  —  5,36 ms boşluk  —  ~490 µs  (video modunda kaydı başlatır/durdurur)
 * Taşıyıcı ~32,6 kHz. Bazı telefonlar bu frekansı desteklemezse 38 kHz de çoğu gövdede çalışır.
 * ISO, diyafram, enstantane gibi ayarlar kızılötesi ile değiştirilemez; zamanlama işleri (zamanlayıcı,
 * seri, aralıklı çekim, uzun pozlama süresi) uygulama tarafında yapılır.
 */
(function () {
  'use strict';

  const PATLAMA = 490;
  const BOSLUK_HEMEN = 7330;
  const BOSLUK_IKI = 5360;

  function frekans() { return Ayar.get('kameraFrekans', 32600); }
  function sinyal(bosluk, ad) { return [ad, frekans(), [PATLAMA, bosluk, PATLAMA]]; }
  const HEMEN = () => sinyal(BOSLUK_HEMEN, 'Çek');
  const IKI_SN = () => sinyal(BOSLUK_IKI, '2 sn / Video');

  function gonder(s) {
    Yerel.titre(25);
    return IR.gonder(s);
  }

  const bekle = ms => new Promise(r => setTimeout(r, ms));
  function sure(sn) {
    sn = Math.max(0, Math.round(sn));
    const s = Math.floor(sn / 3600), d = Math.floor(sn % 3600 / 60), k = sn % 60;
    const iki = n => String(n).padStart(2, '0');
    return (s ? s + ':' + iki(d) : d) + ':' + iki(k);
  }
  function sayiAlani(etiket, anahtar, varsayilan, birim, min, max) {
    const giris = h('input.giris', { type: 'number', inputmode: 'decimal', value: String(Ayar.get(anahtar, varsayilan)) });
    giris.addEventListener('change', () => {
      let v = parseFloat(giris.value.replace(',', '.'));
      if (!isFinite(v)) v = varsayilan;
      v = Math.min(max, Math.max(min, v));
      giris.value = String(v); Ayar.set(anahtar, v);
    });
    return {
      el: h('div', null, h('label.alan', { text: etiket + (birim ? ' (' + birim + ')' : '') }), giris),
      deger: () => { const v = parseFloat(String(giris.value).replace(',', '.')); return isFinite(v) ? Math.min(max, Math.max(min, v)) : varsayilan; }
    };
  }

  // Ekranlar arasında süren tek bir iş (zamanlayıcı, seri, aralıklı, bulb) olabilir
  const Is = {
    aktif: null,
    baslat(ad) { this.durdur(); const is = { ad, iptal: false }; this.aktif = is; return is; },
    durdur() { if (this.aktif) this.aktif.iptal = true; this.aktif = null; }
  };

  // Kaydı tahmini durumla izleriz (kamera geri bildirim vermez)
  const Video = { kayitta: false, basla: 0 };

  function Canon650D() {
    let sekme = Ayar.get('kameraSekme', 'foto');
    const el = h('div.kumanda');
    const durum = h('div.kutu', { style: { textAlign: 'center' } });
    let saat = null;
    const durumYaz = (baslik, alt, renk) => {
      durum.innerHTML = '';
      durum.append(h('div', { style: { fontWeight: '800', fontSize: '18px', color: renk || 'var(--buz)' }, text: baslik }),
        alt ? h('div.not', { style: { marginTop: '4px' }, text: alt }) : null);
    };

    const sekmeler = [['foto', 'Fotoğraf'], ['video', 'Video'], ['bulb', 'Uzun poz'], ['aralik', 'Aralıklı'], ['kurulum', 'Kurulum']];
    const sekmeCubugu = h('div.mod-sekme', null, sekmeler.map(([k, ad]) =>
      h('button' + (sekme === k ? '.secili' : ''), { text: ad, style: { fontSize: '12px' }, on: { click: async () => {
        if (k === sekme) return;
        if (Is.aktif && !(await onay('İşlem sürüyor', Is.aktif.ad + ' durdurulsun mu?', 'Durdur', true))) return;
        Is.durdur(); sekme = k; Ayar.set('kameraSekme', k); Ekran.yenile();
      } } })));
    el.append(sekmeCubugu);

    const buyukTus = (metin, alt, f, sinif) => {
      const b = h('button.tus' + (sinif || '.hardal'), { style: { width: '100%', minHeight: '120px', fontSize: '26px', fontWeight: '800', borderRadius: '24px', flexDirection: 'column' } },
        h('div', { text: metin }), alt ? h('div', { style: { fontSize: '12px', fontWeight: '600', opacity: '.8', marginTop: '4px' }, text: alt }) : null);
      b.addEventListener('click', f);
      return b;
    };

    // ---------------------------------------------------------------- Fotoğraf
    if (sekme === 'foto') {
      durumYaz('Hazır', 'Telefonun ses tuşları da deklanşör olarak çalışır.');
      el.append(durum,
        buyukTus('📷 ÇEK', 'Odaklar ve hemen çeker', () => { gonder(HEMEN()); durumYaz('Çekildi', new Date().toLocaleTimeString('tr-TR')); }),
        h('div.btn-satir', { style: { marginTop: '10px' } },
          h('button.btn', { text: '⏱ 2 sn gecikmeli', on: { click: () => { gonder(IKI_SN()); durumYaz('2 sn sonra çekecek', 'Kamera kendi sayar, ayna titreşimi için iyi.'); } } })));

      const zamanlayici = sayiAlani('Zamanlayıcı', 'kZaman', 10, 'sn', 1, 3600);
      const seriAdet = sayiAlani('Seri çekim adedi', 'kSeriAdet', 5, 'kare', 1, 999);
      const seriAra = sayiAlani('Kareler arası', 'kSeriAra', 1.5, 'sn', 0.5, 600);

      el.append(h('div.bolum-baslik', { text: 'Zamanlayıcı' }), h('div.kutu', null, zamanlayici.el,
        h('button.btn.ana.blok', { style: { marginTop: '10px' }, text: '▶ Başlat', on: { click: async () => {
          const is = Is.baslat('zamanlayıcı');
          const bitis = Date.now() + zamanlayici.deger() * 1000;
          while (!is.iptal && Date.now() < bitis) {
            const kalan = (bitis - Date.now()) / 1000;
            durumYaz(sure(Math.ceil(kalan)), 'Çekime kalan', 'var(--hardal)');
            if (kalan <= 3.2 && kalan > 0) Yerel.titre(10);
            await bekle(Math.min(250, Math.max(10, bitis - Date.now())));
          }
          if (is.iptal) return;
          gonder(HEMEN()); Is.durdur(); durumYaz('Çekildi', new Date().toLocaleTimeString('tr-TR'));
        } } })));

      el.append(h('div.bolum-baslik', { text: 'Seri çekim' }), h('div.kutu', null, seriAdet.el, seriAra.el,
        h('p.not', { text: 'Kamera tek çekim modunda kalır; her kare için ayrı sinyal gönderilir. Aralık, enstantane süresi + kayıt süresinden uzun olmalı.' }),
        h('button.btn.ana.blok', { style: { marginTop: '10px' }, text: '▶ Seriyi başlat', on: { click: async () => {
          const is = Is.baslat('seri çekim');
          const adet = Math.round(seriAdet.deger()), ara = seriAra.deger() * 1000;
          const t0 = Date.now();
          for (let i = 0; i < adet && !is.iptal; i++) {
            while (!is.iptal && Date.now() < t0 + i * ara) await bekle(Math.min(100, t0 + i * ara - Date.now()));
            if (is.iptal) break;
            gonder(HEMEN());
            durumYaz((i + 1) + ' / ' + adet, 'Seri çekim sürüyor', 'var(--hardal)');
          }
          if (!is.iptal) { Is.durdur(); durumYaz('Seri bitti', adet + ' kare'); }
        } } }),
        h('button.btn.blok', { style: { marginTop: '8px' }, text: '⏹ Durdur', on: { click: () => { Is.durdur(); durumYaz('Durduruldu'); } } })));

      el.append(h('div.uyari', { style: { marginTop: '12px' }, text: 'Odak: objektif AF konumundaysa kamera her çekimden önce kendisi odaklar. Kızılötesiyle "yalnızca odakla" komutu yoktur; odağı sabitlemek için önce bir kez çekip objektifi MF\'ye alın.' }));
    }

    // ---------------------------------------------------------------- Video
    if (sekme === 'video') {
      const ciz = () => {
        if (Video.kayitta) {
          const gecen = (Date.now() - Video.basla) / 1000;
          durumYaz('⏺ KAYITTA  ' + sure(gecen), gecen > 29 * 60 ? 'Dikkat: 650D tek klipte en fazla 29:59 / 4 GB kaydeder.' : 'Tahmini durum', '#ff6b6b');
        } else durumYaz('Kayıt yok', 'Mod tekerini video (🎥) konumuna alın.');
      };
      ciz();
      saat = setInterval(ciz, 500);
      const otoDur = sayiAlani('Otomatik durdur (0 = kapalı)', 'kVideoOto', 0, 'dk', 0, 29);
      let otoZam = null;
      const kur = () => {
        clearTimeout(otoZam);
        const dk = otoDur.deger();
        if (Video.kayitta && dk > 0) {
          const kalan = Video.basla + dk * 60000 - Date.now();
          otoZam = setTimeout(() => { if (Video.kayitta) { gonder(IKI_SN()); Video.kayitta = false; ciz(); tost('Kayıt otomatik durduruldu'); } }, Math.max(0, kalan));
        }
      };
      el.append(durum,
        buyukTus('⏺ REC', 'Kaydı başlat / durdur', () => {
          gonder(IKI_SN());
          Video.kayitta = !Video.kayitta; Video.basla = Date.now();
          ciz(); kur();
        }, '.kirmizi'),
        h('div.btn-satir', { style: { marginTop: '10px' } },
          h('button.btn', { text: '⇄ Durumu düzelt (kayıt / durdu)', on: { click: () => { Video.kayitta = !Video.kayitta; Video.basla = Date.now(); ciz(); kur(); } } })),
        h('div.kutu', { style: { marginTop: '12px' } }, otoDur.el),
        h('p.not', { text: 'Kamera kızılötesiyle kayıt durumunu geri bildirmez; ekrandaki süre telefonun tahminidir. Kamera kaydı kendisi keserse "Durumu düzelt" ile düzeltin. Video modunda 2 sn sinyali kaydı başlatıp durdurur.' }));
      const eskiKapat = () => { clearInterval(saat); clearTimeout(otoZam); };
      return { baslik: 'Canon EOS 650D', el, ekranAcik: true, sesTuslari: true,
        fizikselSes: () => { gonder(IKI_SN()); Video.kayitta = !Video.kayitta; Video.basla = Date.now(); ciz(); kur(); },
        kapat: eskiKapat };
    }

    // ---------------------------------------------------------------- Uzun pozlama (Bulb)
    if (sekme === 'bulb') {
      durumYaz('Bulb hazır', 'Mod tekeri M, enstantane BULB olmalı.');
      const sn = sayiAlani('Pozlama süresi', 'kBulbSn', 60, 'sn', 1, 7200);
      const hizli = h('div.secim-grup', null, [[30, '30 sn'], [60, '1 dk'], [120, '2 dk'], [300, '5 dk'], [600, '10 dk'], [1800, '30 dk']].map(([v, ad]) =>
        h('button.secim', { text: ad, on: { click: e => {
          const g = sn.el.querySelector('input'); g.value = String(v); Ayar.set('kBulbSn', v);
          hizli.querySelectorAll('.secim').forEach(b => b.classList.remove('secili')); e.target.classList.add('secili');
        } } })));
      let elle = false, elleT0 = 0;
      const bulbIs = async () => {
        const is = Is.baslat('uzun pozlama');
        const t = sn.deger() * 1000;
        gonder(HEMEN());
        const t0 = Date.now();
        while (!is.iptal && Date.now() < t0 + t) {
          durumYaz('Pozlama  ' + sure((Date.now() - t0) / 1000) + ' / ' + sure(t / 1000), 'Kapanmaya ' + sure((t0 + t - Date.now()) / 1000), 'var(--hardal)');
          await bekle(Math.min(250, t0 + t - Date.now()));
        }
        gonder(HEMEN());
        const erken = is.iptal;
        if (!erken) Is.durdur();
        durumYaz(erken ? 'Erken kapatıldı' : 'Pozlama bitti', sure((Date.now() - t0) / 1000) + ' açık kaldı');
      };
      el.append(durum,
        h('div.kutu', null, sn.el, hizli,
          h('button.btn.ana.blok', { style: { marginTop: '10px' }, text: '▶ Süreli pozlamayı başlat', on: { click: bulbIs } }),
          h('button.btn.blok', { style: { marginTop: '8px' }, text: '⏹ Şimdi kapat', on: { click: () => { if (Is.aktif && Is.aktif.ad === 'uzun pozlama') Is.durdur(); } } })),
        h('div.bolum-baslik', { text: 'Elle aç / kapat' }),
        buyukTus('◉ AÇ / KAPAT', 'Bir bas: perde açılır · tekrar bas: kapanır', () => {
          gonder(HEMEN());
          elle = !elle;
          if (elle) { elleT0 = Date.now(); clearInterval(saat); saat = setInterval(() => durumYaz('Açık  ' + sure((Date.now() - elleT0) / 1000), 'Kapatmak için tekrar basın', 'var(--hardal)'), 250); }
          else { clearInterval(saat); durumYaz('Kapandı', sure((Date.now() - elleT0) / 1000) + ' açık kaldı'); }
        }),
        h('div.uyari', { style: { marginTop: '12px' }, text: 'Denenecek: 650D\'de kızılötesi bulb "bas aç, tekrar bas kapat" şeklinde çalışmalı. İlk kullanımda kısa (5 sn) bir deneme yapın. Kapanmazsa kameranın deklanşörüne basarak kapatın. 30 sn ve altı için bulb yerine kameranın kendi enstantanesini kullanmak daha hassastır.' }));
      return { baslik: 'Canon EOS 650D', el, ekranAcik: true, kapat: () => { clearInterval(saat); Is.durdur(); } };
    }

    // ---------------------------------------------------------------- Aralıklı çekim (timelapse)
    if (sekme === 'aralik') {
      durumYaz('Aralıklı çekim', 'Telefon kameraya bakacak şekilde sabit dursun.');
      const ara = sayiAlani('Kareler arası', 'kTlAra', 5, 'sn', 1, 3600);
      const adet = sayiAlani('Kare sayısı (0 = sınırsız)', 'kTlAdet', 300, 'kare', 0, 99999);
      const gecikme = sayiAlani('Başlamadan önce bekle', 'kTlGecikme', 0, 'sn', 0, 86400);
      const pozSn = sayiAlani('Her kare bulb süresi (0 = kameranın enstantanesi)', 'kTlBulb', 0, 'sn', 0, 3600);
      const fps = 25;
      const ozet = h('p.not');
      const ozetYaz = () => {
        const n = adet.deger();
        ozet.textContent = n ? n + ' kare · çekim ' + sure(n * ara.deger()) + ' sürer · ' + fps + ' fps ile ' + sure(n / fps) + ' video'
          : 'Sınırsız: siz durdurana kadar her ' + ara.deger() + ' sn bir kare.';
      };
      [ara, adet].forEach(a => a.el.querySelector('input').addEventListener('input', ozetYaz));
      ozetYaz();
      el.append(durum, h('div.kutu', null, ara.el, adet.el, gecikme.el, pozSn.el, ozet,
        h('button.btn.ana.blok', { style: { marginTop: '10px' }, text: '▶ Başlat', on: { click: async () => {
          const is = Is.baslat('aralıklı çekim');
          const n = Math.round(adet.deger()), aralik = ara.deger() * 1000, bulb = pozSn.deger() * 1000;
          if (bulb && bulb + 1500 > aralik) { tost('Bulb süresi + 1,5 sn, aralıktan kısa olmalı', 'hata'); Is.durdur(); return; }
          const basla = Date.now() + gecikme.deger() * 1000;
          while (!is.iptal && Date.now() < basla) {
            durumYaz('Başlamaya ' + sure((basla - Date.now()) / 1000), 'Bekleniyor', 'var(--hardal)');
            await bekle(Math.min(500, basla - Date.now()));
          }
          let i = 0;
          while (!is.iptal && (!n || i < n)) {
            const hedef = basla + i * aralik;
            while (!is.iptal && Date.now() < hedef) {
              durumYaz('Kare ' + i + (n ? ' / ' + n : ''), 'Sonraki kare ' + Math.ceil((hedef - Date.now()) / 1000) + ' sn · geçen ' + sure((Date.now() - basla) / 1000), 'var(--hardal)');
              await bekle(Math.min(250, hedef - Date.now()));
            }
            if (is.iptal) break;
            gonder(HEMEN());
            if (bulb) {
              const kapan = Date.now() + bulb;
              while (!is.iptal && Date.now() < kapan) await bekle(Math.min(100, kapan - Date.now()));
              gonder(HEMEN());
            }
            i++;
          }
          const erken = is.iptal;
          if (!erken) Is.durdur();
          durumYaz(erken ? 'Durduruldu' : 'Tamamlandı', i + ' kare çekildi');
        } } }),
        h('button.btn.blok', { style: { marginTop: '8px' }, text: '⏹ Durdur', on: { click: () => Is.durdur() } })),
        h('p.not', { text: 'Ekran açık kalır. Uzun çekimlerde telefonu şarja takın, kamerada otomatik kapanmayı (Otomatik kapanma: Devre dışı) kapatın ve RAW yerine JPEG kullanın.' }));
      return { baslik: 'Canon EOS 650D', el, ekranAcik: true, kapat: () => Is.durdur() };
    }

    // ---------------------------------------------------------------- Kurulum
    if (sekme === 'kurulum') {
      const adim = (n, metin) => h('div.satir', { style: { cursor: 'default' } },
        h('div', { style: { minWidth: '28px', fontWeight: '800', color: 'var(--hardal)' }, text: n + '.' }),
        h('div.s-ana', null, h('div.s-ad', { style: { fontWeight: '500' }, text: metin })));
      el.append(h('div.liste', null,
        adim(1, 'Kamerada DRIVE (◄ ok tuşu) → "10 sn otomatik zamanlayıcı / uzaktan kumanda" simgesini seçin. Kumanda yalnızca bu modda çalışır; tepki 10 sn değil, anında olur.'),
        adim(2, 'Telefonun üst kenarındaki IR vericiyi, kameranın ön yüzündeki kızılötesi alıcıya (tutamak tarafındaki küçük pencere) doğrultun. 5 m\'ye kadar, önden çalışır.'),
        adim(3, 'Video için mod tekerini 🎥 konumuna alın; REC tuşu kaydı başlatır/durdurur.'),
        adim(4, 'Uzun pozlama için mod tekerini M yapın, enstantaneyi 30" sonrasındaki BULB\'a getirin.'),
        adim(5, 'Floresan ve LED ışık bazen kamerayı yanlışlıkla tetikleyebilir; kamerayı bu ışıklardan uzak tutun.')),
        h('div.bolum-baslik', { text: 'Sinyal' }),
        h('div.kutu', null,
          h('p.not', { text: 'Orijinal RC-6 32,6 kHz kullanır. Telefonunuz bu frekansta göndermiyorsa ya da kamera tepki vermezse 38 kHz\'i deneyin.' }),
          h('div.secim-grup', null, [[32600, '32,6 kHz (orijinal)'], [38000, '38 kHz']].map(([f, ad]) =>
            h('button.secim' + (frekans() === f ? '.secili' : ''), { text: ad, on: { click: () => { Ayar.set('kameraFrekans', f); Ekran.yenile(); } } }))),
          h('div.btn-satir', null,
            h('button.btn.ana', { text: 'Test: çek', on: { click: () => gonder(HEMEN()) } }),
            h('button.btn', { text: 'Test: 2 sn', on: { click: () => gonder(IKI_SN()) } }))),
        h('div.bolum-baslik', { text: 'Kızılötesinin sınırı' }),
        h('div.kutu', null, h('p.not', { text: 'Kızılötesi kumanda yalnızca deklanşör ve video kaydını tetikler. ISO, diyafram, enstantane, beyaz ayarı, odak noktası, canlı görüntü gibi ayarlar kızılötesiyle değiştirilemez. Bunlar için kamerayı USB OTG kablosuyla telefona bağlamak gerekir; istenirse sonraki sürümde eklenebilir.' })));
      return { baslik: 'Canon EOS 650D', el };
    }

    return { baslik: 'Canon EOS 650D', el, ekranAcik: true, sesTuslari: true,
      fizikselSes: () => { gonder(HEMEN()); durumYaz('Çekildi', new Date().toLocaleTimeString('tr-TR')); },
      kapat: () => { clearInterval(saat); Is.durdur(); } };
  }

  window.Kamera = { Canon650D, HEMEN, IKI_SN };
})();
