/* Kayıtlar sekmesi ve Ayarlar */
(function () {
  'use strict';

  // ------------------------------------------------------------ Kayıtlar
  function KayitlarAna() {
    const el = h('div');
    const arama = h('input.arama', { type: 'search', placeholder: 'Kayıtlarda ara (marka, model, not)' });
    const durum = h('div.not', { style: { marginBottom: '10px' } });
    const liste = h('div');
    function durumYaz() {
      const son = Ayar.get('sonBasariliEsitleme', null);
      durum.textContent = !Senk.kullanici ? 'Giriş yapılmadı — kayıtlar yalnız bu telefonda. (Ayarlar > Hesap)'
        : !Senk.uye ? 'Hesabınız ekibe eklenmemiş. Yöneticiden eklemesini isteyin.'
          : 'Ekiple eşitleniyor' + (son ? ' · son: ' + Arac.tarih(son) : '');
    }
    function ciz() {
      const q = Arac.sade(arama.value);
      const kayitlar = Kayit.hepsi().filter(k => !q || Arac.sade([k.marka, k.model, k.notlar, k.kategori].join(' ')).includes(q));
      liste.innerHTML = '';
      if (!kayitlar.length) {
        liste.append(h('div.bos', { text: q ? 'Eşleşen kayıt yok' : 'Henüz kayıt yok. Çalışan bir kumandada ⋯ > Kaydet ile ekleyin.' }));
        return;
      }
      const gruplar = {};
      for (const k of kayitlar) (gruplar[k.kategori || 'diger'] = gruplar[k.kategori || 'diger'] || []).push(k);
      for (const [kat, l] of Object.entries(gruplar)) {
        liste.append(h('div.bolum-baslik', { text: (DB.IKON[kat] || '🔧') + ' ' + kat + ' (' + l.length + ')' }),
          h('div.liste', null, l.map(Saha.kayitSatiri)));
      }
    }
    arama.addEventListener('input', ciz);
    const yenile = () => { durumYaz(); ciz(); };
    document.addEventListener('esitlendi', yenile);
    el.append(arama, durum,
      h('div.btn-satir', { style: { marginTop: '0', marginBottom: '8px' } },
        h('button.btn', { text: '↻ Eşitle', on: { click: async () => {
          const ok = await Senk.esitle(); tost(ok ? 'Eşitlendi' : 'Eşitlenemedi (giriş/internet)', ok ? 'basari' : 'hata'); yenile();
        } } }),
        h('button.btn', { text: '📄 İçe aktar', on: { click: () => Araclar.iceAktar() } })),
      liste);
    yenile();
    return { baslik: 'Kayıtlar', el, kapat: () => document.removeEventListener('esitlendi', yenile) };
  }

  // ------------------------------------------------------------ Ayarlar
  function AyarlarAna() {
    const el = h('div');
    const bolum = (ad, ...c) => [h('div.bolum-baslik', { text: ad }), h('div.kutu', null, ...c)];

    // Hesap
    const hesap = h('div');
    function hesapCiz() {
      hesap.innerHTML = '';
      if (!Senk.hazir) { hesap.append(h('p.not', { text: 'Bulut bağlantısı yüklenemedi.' })); return; }
      if (Senk.kullanici) {
        hesap.append(h('div', { style: { fontWeight: '700' }, text: Senk.kullanici.email }),
          h('p.not', { text: Senk.uye ? (Senk.erpUye ? 'ERP üyesi — ekip yöneticisi' : 'Ekip üyesi') : 'Ekibe eklenmemiş: yöneticiden bu e-postayı eklemesini isteyin.' }),
          h('div.btn-satir', null,
            h('button.btn', { text: '↻ Yetkiyi yenile', on: { click: async () => { await Senk.yetkiKontrol(); hesapCiz(); Senk.esitle(); } } }),
            h('button.btn.tehlike', { text: 'Çıkış', on: { click: async () => { await Senk.cikis(); hesapCiz(); } } })));
        if (Senk.erpUye) hesap.append(h('button.btn.blok', { style: { marginTop: '10px' }, text: '👥 Ekip üyeleri', on: { click: () => Ekran.ac(Ekip) } }));
      } else {
        const ep = h('input.giris', { type: 'email', placeholder: 'E-posta' });
        const sf = h('input.giris', { type: 'password', placeholder: 'Şifre' });
        hesap.append(h('p.not', { text: 'ERP hesabınızla ya da yöneticinin eklediği e-postayla giriş yapın.' }), ep, h('div', { style: { height: '8px' } }), sf,
          h('div.btn-satir', null,
            h('button.btn.ana', { text: 'Giriş', on: { click: async () => {
              try { const r = await Senk.giris(ep.value, sf.value); tost(r.uye ? 'Giriş yapıldı' : 'Giriş yapıldı, ancak ekibe eklenmemişsiniz', r.uye ? 'basari' : 'hata'); hesapCiz(); }
              catch (e) { tost(e.message, 'hata'); }
            } } }),
            h('button.btn', { text: 'Yeni hesap', on: { click: async () => {
              if (sf.value.length < 6) return tost('Şifre en az 6 karakter', 'hata');
              try { const oturum = await Senk.kayitOl(ep.value, sf.value); tost(oturum ? 'Hesap açıldı' : 'E-postanıza gelen bağlantıyla hesabı onaylayın', 'basari'); hesapCiz(); }
              catch (e) { tost(e.message, 'hata'); }
            } } })));
      }
    }

    // IR çıkışı
    const ir = h('div');
    function irCiz() {
      const d = IR.durum();
      ir.innerHTML = '';
      ir.append(
        h('div.satir', { style: { background: 'var(--kart2)' } }, h('div.s-ana', null, h('div.s-ad', { text: 'Dahili IR verici' }),
          h('div.s-alt', { text: d.builtin ? 'Var' : 'Bu telefonda yok' })), h('span.rozet' + (d.builtin ? '.yesil' : ''), { text: d.builtin ? '✓' : '✕' })),
        h('div', { style: { height: '8px' } }),
        h('div.satir', { style: { background: 'var(--kart2)' } }, h('div.s-ana', null, h('div.s-ad', { text: 'Gün IR modülü (gönder + oku)' }),
          h('div.s-alt', { text: d.module ? (d.moduleName || 'Bağlı') : 'Bağlı değil' })),
          d.module ? h('button.btn', { text: 'Unut', on: { click: () => { Yerel.cagri('moduleForget'); setTimeout(irCiz, 300); } } })
            : h('button.btn.ana', { text: 'Bağlan', on: { click: () => { const e = Yerel.cagri('moduleConnect'); if (e) tost(e, 'hata'); } } })));
      const tercih = h('select.giris', null, [['auto', 'Otomatik (önce dahili)'], ['builtin', 'Dahili verici'], ['module', 'Modül']]
        .map(([v, a]) => h('option', { value: v, text: a, selected: Ayar.get('irCikis', 'auto') === v })));
      tercih.addEventListener('change', () => { Ayar.set('irCikis', tercih.value); Yerel.cagri('irSetOutput', tercih.value); });
      ir.append(h('label.alan', { text: 'Gönderim için kullan' }), tercih,
        h('button.btn.blok', { style: { marginTop: '10px' }, text: '▶ Test sinyali gönder (NEC)', on: { click: () => IR.gonder(['Test', 'NEC', '00FFA25D', 32]) } }));
      if (!d.builtin && !d.module) ir.prepend(h('div.uyari', { text: 'Bu telefonda IR verici yok. Saha kumandası için Gün IR modülünü bağlayın (Yardım bölümünde parça listesi var). Akıllı TV kısmı modülsüz çalışır.' }));
    }
    const irDinle = Yerel.on('modul', v => { irCiz(); if (v.message) tost(v.message); });

    // Genel
    const anahtarK = (ad, k, v) => {
      const c = h('input', { type: 'checkbox', checked: Ayar.get(k, v) });
      c.addEventListener('change', () => Ayar.set(k, c.checked));
      return h('label.anahtar', null, h('span', { text: ad }), c);
    };

    el.append(
      ...bolum('Hesap ve ekip', hesap),
      ...bolum('IR çıkışı', ir),
      ...bolum('Genel', anahtarK('Tuşa basınca titreşim', 'titresim', true),
        h('button.btn.blok', { style: { marginTop: '10px' }, text: '⬇ Güncelleme / dosyalar (GitHub)', on: { click: () =>
          Yerel.cagri('openUrl', 'https://github.com/GokAyseGun/GunKumanda/releases/latest') } })),
      ...bolum('Yardım',
        h('button.btn.blok', { text: '📺 Android TV yardımcısı kurulumu', on: { click: () => Ekran.ac(Yardim, { konu: 'tv' }) } }),
        h('div', { style: { height: '8px' } }),
        h('button.btn.blok', { text: '🔌 Gün IR modülü (parça listesi)', on: { click: () => Ekran.ac(Yardim, { konu: 'modul' }) } }),
        h('div', { style: { height: '8px' } }),
        h('button.btn.blok', { text: '📜 Lisanslar ve kaynaklar', on: { click: () => Ekran.ac(Yardim, { konu: 'lisans' }) } })),
      h('p.not.ortala', { style: { marginTop: '18px' }, text: 'Gün Kumanda ' + ((Yerel.json('info') || {}).version || '') + ' · Gün Teknik' }));
    hesapCiz(); irCiz();
    return { baslik: 'Ayarlar', el, kapat: irDinle };
  }

  function Ekip() {
    const el = h('div');
    const liste = h('div.liste');
    async function ciz() {
      liste.innerHTML = '';
      try {
        const u = await Senk.uyeler();
        if (!u.length) liste.append(h('div.bos', { text: 'Henüz ekip üyesi eklenmedi. ERP üyeleri her zaman erişebilir.' }));
        for (const x of u) liste.append(h('div.satir', null,
          h('div.s-ana', null, h('div.s-ad', { text: x.ad || x.eposta }), h('div.s-alt', { text: x.eposta })),
          h('button.btn', { text: '✕', on: { click: async () => {
            if (await onay('Çıkarılsın mı?', x.eposta + ' artık ortak kayıtları göremez.', 'Çıkar', true)) { await Senk.uyeSil(x.eposta); ciz(); }
          } } })));
      } catch (e) { liste.append(h('div.bos', { text: e.message })); }
    }
    el.append(h('p.not', { text: 'Buraya eklenen kişiler yalnızca kumanda kayıtlarını görür; ERP verilerini (müşteri, kasa, işlem) göremez. ' +
      'Kişi uygulamada bu e-postayla "Yeni hesap" açıp giriş yapar.' }),
    h('button.btn.ana.blok', { text: '+ Üye ekle', on: { click: async () => {
      const ep = await sor('E-posta', null, '', { tur: 'email' }); if (!ep) return;
      const ad = await sor('Ad', 'İsteğe bağlı', '');
      try { await Senk.uyeEkle(ep, ad || null); tost('Eklendi', 'basari'); ciz(); } catch (e) { tost(e.message, 'hata'); }
    } } }), h('div', { style: { height: '12px' } }), liste);
    ciz();
    return { baslik: 'Ekip üyeleri', el };
  }

  function Yardim(p) {
    const el = h('div');
    const P = (t) => h('p.not', { text: t });
    if (p.konu === 'tv') {
      el.append(h('div.kutu', null,
        h('div', { style: { fontWeight: '700' }, text: 'Gün Kumanda TV Yardımcısı' }),
        P('Android / Google TV\'lerde telefonun dokunmatik alanı ve havada faresi ağ üzerinden imleç olarak çalışsın diye TV\'ye kurulan küçük uygulama.'),
        P('1. Ayarlar > "Güncelleme / dosyalar" sayfasından GunKumanda-TV-Yardimcisi.apk dosyasını indirip USB belleğe kopyalayın.'),
        P('2. TV\'de "Bilinmeyen kaynaklar"a izin verip dosya yöneticisiyle kurun (ya da "Send Files to TV" uygulamasıyla gönderin).'),
        P('3. TV\'de uygulamayı açın, Erişilebilirlik ayarlarından "Gün Kumanda TV Yardımcısı" servisini etkinleştirin.'),
        P('4. Telefonda TV\'ye bağlanın: Fare sekmesi otomatik olarak imleci gösterir.'),
        P('Yardımcı olmadan da Bluetooth fare/klavye modu her TV\'de çalışır.')));
    } else if (p.konu === 'modul') {
      el.append(h('div.kutu', null,
        h('div', { style: { fontWeight: '700' }, text: 'Gün IR modülü' }),
        P('IR vericisi olmayan telefonlarda sinyal göndermek ve tüm telefonlarda orijinal kumandaları okumak (kopyalamak) için.'),
        P('Parçalar: ESP32-C3 SuperMini (ya da herhangi bir ESP32), 2 adet 940 nm IR LED, 1 adet NPN transistör (S8050 / 2N2222), ' +
          '1 adet VS1838B (ya da TSOP38238) IR alıcı, 2 adet 10 Ω (LED), 1 adet 1 kΩ (baz) direnç, isteğe bağlı 3.7 V pil + şarj kartı.'),
        P('Bağlantı: GPIO4 → 1 kΩ → transistör bazı; LED\'ler 10 Ω ile 5V/3V3 ile kolektör arasına; emitör GND. ' +
          'VS1838B: OUT → GPIO5, VCC → 3V3, GND → GND.'),
        P('Yazılım: projedeki firmware/gun-ir-modul klasörü (GitHub Actions derler). Telefon modülü "Gün IR" adıyla bulur.')));
    } else {
      el.append(h('div.kutu', null,
        P('IR kod veritabanı: Flipper-IRDB (CC0) — github.com/Lucaslhm/Flipper-IRDB'),
        P('Contains/accesses irdb by Simon Peter and contributors, used under permission. For licensing details and for information on how to contribute to the database, see https://github.com/probonopd/irdb'),
        P('IR protokol ve klima kodlayıcıları: IRremoteESP8266 (LGPL-2.1) — github.com/crankyoldgit/IRremoteESP8266'),
        P('LG webOS eşleştirme manifesti: lgtv2 (MIT) — github.com/hobbyquaker/lgtv2'),
        P('Android TV protokolü belgeleri: androidtvremote2 — github.com/tronikos/androidtvremote2'),
        P('Samsung ve Vestel protokol notları: samsung-tv-ws-api, pyvesteltv'),
        P('Bulut: supabase-js (MIT)')));
    }
    return { baslik: 'Yardım', el };
  }

  window.Ayarlar = { KayitlarAna, AyarlarAna, Ekip, Yardim };
})();
