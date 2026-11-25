/* Kumanda ekleme: kategoriye özel tuş şablonları, adım adım okuma sihirbazı,
   marka önerileri (Türkiye listesi + ekip + veritabanı) */
(function () {
  'use strict';

  const RAKAM = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  const YON = ['Yukarı', 'Aşağı', 'Sol', 'Sağ', 'OK'];
  const RENK = ['Kırmızı', 'Yeşil', 'Sarı', 'Mavi'];

  // Her cihaz türü için sırayla okunacak tuşlar (en çok kullanılan önce)
  const SABLON = {
    uydu: ['Güç', 'Sessiz', 'Ses +', 'Ses −', 'Kanal +', 'Kanal −'].concat(YON, ['Menü', 'Çıkış', 'Geri', 'Bilgi', 'EPG', 'Favori',
      'TV/Radyo'], RAKAM, ['Ses dili', 'Altyazı', 'Teletext'], RENK, ['Sayfa +', 'Sayfa −', 'Oynat', 'Duraklat', 'Durdur', 'Kayıt',
      'USB', 'Uyku', 'Format', 'Liste']),
    tv: ['Güç', 'Kaynak', 'Sessiz', 'Ses +', 'Ses −', 'Kanal +', 'Kanal −'].concat(YON, ['Menü', 'Geri', 'Çıkış', 'Ana sayfa',
      'Bilgi', 'EPG'], RAKAM, RENK, ['Netflix', 'YouTube', 'Altyazı', 'Teletext', 'Oynat', 'Duraklat', 'Durdur', 'Ekran formatı', 'Uyku']),
    tvbox: ['Güç', 'Ana sayfa', 'Geri', 'Menü'].concat(YON, ['Ses +', 'Ses −', 'Sessiz', 'Oynat/Duraklat', 'İleri sar', 'Geri sar',
      'Ayarlar', 'Netflix', 'YouTube', 'Uygulamalar', 'Fare'], RAKAM),
    ses: ['Güç', 'Ses +', 'Ses −', 'Sessiz', 'Kaynak', 'Bluetooth', 'USB', 'AUX', 'Radyo', 'Oynat/Duraklat', 'Sonraki', 'Önceki',
      'Bas +', 'Bas −', 'Tiz +', 'Tiz −', 'EQ / Mod', 'Işık', 'Uyku'],
    dvr: ['Güç', 'Menü', 'Çıkış'].concat(YON, ['Çoklu ekran', 'Oynat', 'Duraklat', 'Durdur', 'İleri sar', 'Geri sar', 'Kayıt',
      'Ara', 'PTZ'], RAKAM),
    projektor: ['Güç', 'Kaynak', 'Menü', 'Geri'].concat(YON, ['Ses +', 'Ses −', 'Sessiz', 'Keystone +', 'Keystone −', 'Zoom +',
      'Zoom −', 'Odak +', 'Odak −', 'Boş ekran', 'Dondur', 'Otomatik']),
    aydinlatma: ['Aç', 'Kapat', 'Parlaklık +', 'Parlaklık −', 'Beyaz', 'Sıcak beyaz', 'Kırmızı', 'Yeşil', 'Mavi', 'Sarı', 'Mor',
      'Turuncu', 'Flash', 'Strobe', 'Fade', 'Smooth', 'Hız +', 'Hız −', 'Gece', 'Zamanlayıcı'],
    vantilator: ['Güç', 'Hız +', 'Hız −', 'Hız', 'Salınım', 'Mod', 'Zamanlayıcı', 'Işık', 'İyon', 'Uyku'],
    isitici: ['Güç', 'Isı +', 'Isı −', 'Mod', 'Zamanlayıcı', 'Salınım', 'Eko', 'Fan'],
    hava: ['Güç', 'Hız', 'Mod', 'Zamanlayıcı', 'Işık', 'İyon', 'Uyku', 'Kilit'],
    klima: ['Aç (soğutma 24°)', 'Kapat', 'Sıcaklık +', 'Sıcaklık −', 'Soğutma', 'Isıtma', 'Nem alma', 'Fan', 'Otomatik',
      'Fan hızı', 'Salınım', 'Turbo', 'Uyku', 'Zamanlayıcı', 'Işık'],
    medya: ['Güç', 'Aç / Çıkar', 'Oynat', 'Duraklat', 'Durdur', 'Sonraki', 'Önceki', 'İleri sar', 'Geri sar', 'Menü'].concat(YON,
      ['Geri', 'Altyazı', 'Ses dili', 'Ses +', 'Ses −', 'Sessiz'], RAKAM),
    ekran: ['Güç', 'Kaynak', 'Menü', 'Çıkış'].concat(YON, ['Ses +', 'Ses −', 'Sessiz', 'Parlaklık +', 'Parlaklık −', 'Otomatik']),
    diger: ['Güç', 'Menü', 'Geri'].concat(YON, ['Ses +', 'Ses −', 'Sessiz'], RAKAM)
  };
  function sablon(kat) { return (SABLON[kat] || SABLON.diger).slice(); }

  /** Kategori için marka önerileri: Türkiye listesi, ekip, veritabanı */
  async function markaOnerileri(kategori, q) {
    const c = await DB.kategoriBilgi(kategori);
    const sq = Arac.sade(q || '');
    const harita = new Map();
    const ekle = (n, tur) => {
      const k = Arac.sade(n);
      if (!k || harita.has(k)) return;
      if (sq && !k.includes(sq)) return;
      harita.set(k, { n, tur });
    };
    for (const b of (c ? c.brands : []).filter(b => b.tr)) ekle(b.n, 'tr');
    for (const k of Kayit.hepsi()) if (k.kategori === kategori && k.marka) ekle(k.marka, 'ekip');
    for (const b of (c ? c.brands : [])) ekle(b.n, 'db');
    return Array.from(harita.values());
  }

  function ogrenmeDurumu() {
    const d = IR.durum();
    return { var: !!(d.usb || d.module), ad: d.usb ? (d.usbName || 'USB-C IR') : d.module ? (d.moduleName || 'Gün IR modülü') : '' };
  }

  /** Okuyucu yoksa gösterilen kart */
  function okuyucuKarti(yenile) {
    return h('div.kutu', null,
      h('div', { style: { fontWeight: '800', color: 'var(--hardal)' }, text: 'Kumanda okumak için alıcı gerekli' }),
      h('p.not', { text: 'Telefonların IR alıcısı yoktur. USB-C kızılötesi alıcı/vericiyi (ör. EKX4S, EKX5S) telefona takın; ' +
        'Android izin sorarsa "Gün Kumanda" için onaylayın. Ya da Gün IR modülünü açın.' }),
      h('div.btn-satir', null,
        h('button.btn.ana', { text: '🔌 USB\'yi kontrol et', on: { click: () => { const e = Yerel.cagri('usbCheck'); if (e) tost(e, 'hata'); setTimeout(yenile, 700); } } }),
        h('button.btn', { text: 'Modüle bağlan', on: { click: () => { const e = Yerel.cagri('moduleConnect'); if (e) tost(e, 'hata'); } } })));
  }

  // ------------------------------------------------------------ 1) Bilgi + yöntem
  function KumandaEkle(p) {
    p = p || {};
    const el = h('div');
    const b = {
      kategori: p.kategori || Ayar.get('ekleSonKat', 'uydu'), marka: p.marka || '', model: p.model || '',
      kumanda_kodu: p.kumanda_kodu || '', uyumlu: p.uyumlu || ''
    };
    const katGrup = h('div.secim-grup');
    const marka = h('input.giris', { value: b.marka, placeholder: 'Marka (ör. Next, Goldmaster)' });
    const oneriler = h('div.secim-grup', { style: { marginTop: '8px' } });
    const model = h('input.giris', { value: b.model, placeholder: 'Cihaz modeli (etiketteki, ör. Kanky HD)' });
    const kod = h('input.giris', { value: b.kumanda_kodu, placeholder: 'Kumandanın arkasındaki kod (ör. UK-660)' });
    const uyumlu = h('input.giris', { value: b.uyumlu, placeholder: 'Aynı kumandayı kullanan diğer modeller (virgülle)' });

    function bilgi() {
      return { kategori: b.kategori, marka: marka.value.trim(), model: model.value.trim(),
        kumanda_kodu: kod.value.trim(), uyumlu: uyumlu.value.trim() };
    }
    async function oneriCiz() {
      const liste = await markaOnerileri(b.kategori, marka.value);
      oneriler.innerHTML = '';
      const tam = liste.some(x => Arac.sade(x.n) === Arac.sade(marka.value));
      liste.slice(0, tam ? 0 : 12).forEach(x => oneriler.append(h('button.secim' + (x.tur === 'tr' ? '.secili' : ''), {
        text: (x.tur === 'ekip' ? '★ ' : '') + x.n, on: { click: () => { marka.value = x.n; oneriCiz(); } } })));
    }
    async function katCiz() {
      const i = await DB.indeks();
      katGrup.innerHTML = '';
      i.categories.forEach(c => katGrup.append(h('button.secim' + (c.id === b.kategori ? '.secili' : ''), {
        text: (DB.IKON[c.id] || '') + ' ' + c.name, style: { padding: '8px 10px', fontSize: '13px' }, on: { click: () => { b.kategori = c.id; Ayar.set('ekleSonKat', c.id); katCiz(); oneriCiz(); } } })));
    }
    marka.addEventListener('input', oneriCiz);

    const yontem = (ikon, ad, alt, f, vurgu) => h('button.satir' + (vurgu ? '.vurgu' : ''), { on: { click: f } },
      h('div', { style: { fontSize: '24px', width: '36px' }, text: ikon }),
      h('div.s-ana', null, h('div.s-ad', { text: ad }), h('div.s-alt', { text: alt })), h('div.s-sag', { text: '›' }));
    const markaGerek = () => { if (!marka.value.trim()) { tost('Önce markayı yazın', 'hata'); marka.focus(); return false; } return true; };
    const ogr = ogrenmeDurumu();

    el.append(
      h('div.bolum-baslik', { text: '1 · Cihaz türü' }), katGrup,
      h('div.bolum-baslik', { text: '2 · Bilgiler' }),
      h('div.kutu', null, h('label.alan', { text: 'Marka' }), marka, oneriler,
        h('label.alan', { text: 'Model' }), model,
        h('label.alan', { text: 'Kumanda kodu' }), kod,
        h('label.alan', { text: 'Uyumlu modeller (isteğe bağlı)' }), uyumlu),
      h('div.bolum-baslik', { text: '3 · Nasıl ekleyelim?' }),
      h('div.liste', null,
        yontem('📥', 'Orijinal kumandadan oku', ogr.var ? 'Hazır: ' + ogr.ad + ' · tuş tuş, sırayla' : 'USB-C IR alıcı ya da modül gerekir',
          () => { if (markaGerek()) Ekran.ac(OgrenSihirbazi, { bilgi: bilgi() }); }, true),
        yontem('🔁', 'Benzer kumandaları dene', 'Aynı markanın kayıtlı kumandaları ya da hızlı bulma',
          async () => {
            const c = await DB.kategoriBilgi(b.kategori);
            const bb = c && c.brands.find(x => Arac.sade(x.n) === Arac.sade(marka.value));
            if (bb && bb.r.length) Ekran.ac(Araclar.MarkaDene, { kategori: b.kategori, marka: bb });
            else Ekran.ac(Araclar.HizliBulma, { kategori: b.kategori });
          }),
        yontem('🔎', 'Kod tarama', 'Protokol + adres bilinirse 256 komutu tek tek dene', () => Ekran.ac(Araclar.Tarama, { bilgi: bilgi() })),
        yontem('⌨️', 'Elle kod gir', 'Protokol/hex, ham zamanlama ya da Pronto', () => Ekran.ac(Araclar.ElleKod, { bilgi: bilgi() })),
        yontem('📄', 'Dosyadan içe aktar', 'irplus ya da Flipper .ir dosyası', () => Araclar.iceAktar())));
    katCiz(); oneriCiz();
    return { baslik: 'Kumanda ekle', el };
  }

  // ------------------------------------------------------------ 2) Okuma sihirbazı
  /**
   * p.bilgi: {kategori, marka, model, kumanda_kodu, uyumlu}
   * p.hedef: var olan kumanda (eksik tuş eklemek için)
   */
  function OgrenSihirbazi(p) {
    const hedef = p.hedef || null;
    const bilgi = hedef ? { kategori: hedef.kategori, marka: hedef.marka, model: hedef.model,
      kumanda_kodu: hedef.kumanda_kodu || '', uyumlu: hedef.uyumlu || '' } : p.bilgi;
    const varOlan = new Set(((hedef && hedef.tuslar) || []).map(s => Arac.sade(s[0])));
    const sira = sablon(bilgi.kategori).filter(a => !varOlan.has(Arac.sade(a)));
    // Durum p içinde tutulur: başka ekrana geçip dönünce kaybolmaz
    p.durum = p.durum || { okunan: new Map(), atlanan: new Set(), i: null, sira: null };
    const D = p.durum;
    if (D.sira) { sira.length = 0; D.sira.forEach(x => sira.push(x)); } else D.sira = sira;
    const okunan = D.okunan;   // ad -> sinyal
    const atlanan = D.atlanan;
    let i = 0, dinliyor = false, yeniden = null, son = null, kapandi = false;

    const el = h('div');
    const ust = h('div');
    const kart = h('div.kutu.ortala', { style: { padding: '22px 16px' } });
    const ilerleme = h('div.ilerleme', null, h('div'));
    const cipler = h('div.secim-grup', { style: { marginTop: '6px' } });
    const altBtn = h('div');

    function dinle() {
      clearTimeout(yeniden);
      if (kapandi || i >= sira.length || !ogrenmeDurumu().var) { dinliyor = false; return; }
      Yerel.cagri('learnStop');
      const e = Yerel.cagri('learnStart', 30);
      if (e) { dinliyor = false; tost(e, 'hata'); return; }
      dinliyor = true;
      yeniden = setTimeout(dinle, 28000);   // sessizce yeniden dinlemeye başla
    }
    function durdur() { clearTimeout(yeniden); dinliyor = false; Yerel.cagri('learnStop'); }

    function sonrakiBos(bas) {
      for (let j = bas; j < sira.length; j++) if (!okunan.has(sira[j]) && !atlanan.has(sira[j])) return j;
      for (let j = 0; j < sira.length; j++) if (!okunan.has(sira[j]) && !atlanan.has(sira[j])) return j;
      return sira.length;
    }
    function git(j) { i = j; D.i = j; ciz(); dinle(); }

    function ayniMi(a, b) {
      if (typeof a[1] === 'string' || typeof b[1] === 'string') return a[1] === b[1] && String(a[2]) === String(b[2]);
      const x = a[2], y = b[2];
      if (!x || !y || Math.abs(x.length - y.length) > 2) return false;
      const n = Math.min(x.length, y.length);
      let fark = 0;
      for (let k = 0; k < n; k++) if (Math.abs(x[k] - y[k]) > Math.max(120, x[k] * 0.25)) fark++;
      return fark <= Math.max(2, n * 0.05);
    }

    function ogrenildi(v) {
      if (kapandi || i >= sira.length) return;
      clearTimeout(yeniden);
      const ad = sira[i];
      const t = v.t || [];
      if (t.length < 4) { tost('Sinyal çok kısa, tekrar basın', 'hata'); return dinle(); }
      const c = Yerel.json('irDecode', t.join(',')) || {};
      let s;
      if (c.ok && c.protocol && c.protocol !== 'UNKNOWN') {
        const deger = c.state || String(c.value || '').replace(/^0x/i, '');
        if (/^F+$/i.test(deger)) { tost('Tekrar kodu geldi — tuşa kısa basın', 'hata'); return dinle(); }
        s = [ad, c.protocol, deger, c.bits | 0];
      } else s = [ad, v.f || 38000, t];
      // Klima kumandası: protokol bulunduysa tam panel öner
      if (c.ac && c.ac.protocol && bilgi.kategori === 'klima' && !okunan.size) {
        durdur();
        onay('Klima protokolü bulundu', c.ac.protocol + ' — tuş tuş okumak yerine tam kontrol paneli açılsın mı? (sıcaklık, mod, fan hepsi)', 'Paneli aç')
          .then(e => {
            if (e) Ekran.ac(Klima.Panel, { protokol: c.ac.protocol, model: c.ac.model > 0 ? c.ac.model : null, marka: bilgi.marka, yeniBulundu: true });
            else { okunan.set(ad, s); i = sonrakiBos(i + 1); ciz(); dinle(); }
          });
        return;
      }
      for (const [digerAd, d] of okunan) {
        if (digerAd !== ad && ayniMi(d, s)) {
          tost('Bu sinyal "' + digerAd + '" ile aynı. Doğru tuşa bastığınızdan emin olun.', 'hata');
          Yerel.titre(120);
          return dinle();
        }
      }
      okunan.set(ad, s);
      atlanan.delete(ad);
      son = ad;
      Yerel.titre(35);
      i = sonrakiBos(i + 1); D.i = i;
      ciz();
      dinle();
    }

    function ciz() {
      ust.innerHTML = '';
      const ogr = ogrenmeDurumu();
      if (!ogr.var) ust.append(okuyucuKarti(() => { ciz(); dinle(); }));
      const okunanSay = okunan.size;
      ilerleme.firstChild.style.width = (sira.length ? Math.min(i, sira.length) / sira.length * 100 : 100) + '%';

      kart.innerHTML = '';
      if (i < sira.length) {
        kart.append(
          h('div.not', { text: 'Sıradaki tuş (' + (i + 1) + ' / ' + sira.length + ')' }),
          h('div', { style: { fontSize: '34px', fontWeight: '800', color: 'var(--hardal)', margin: '6px 0' }, text: sira[i] }),
          h('div.not', { text: ogr.var ? (dinliyor ? '● Dinleniyor — orijinal kumandayı alıcıya 3-5 cm yaklaştırıp bu tuşa bir kez basın' :
            'Hazır') : 'Alıcı bağlanınca dinleme başlar' }),
          son ? h('div.not', { style: { marginTop: '6px', color: 'var(--yesil)' }, text: '✓ "' + son + '" okundu' }) : null,
          h('div.btn-satir', { style: { marginTop: '12px' } },
            h('button.btn', { text: '‹ Önceki', on: { click: () => git(Math.max(0, i - 1)) } }),
            h('button.btn', { text: 'Bu tuş yok ›', on: { click: () => { atlanan.add(sira[i]); git(sonrakiBos(i + 1)); } } })),
          h('div.btn-satir', null,
            h('button.btn', { text: '✎ Başka tuş', on: { click: ozelTus } }),
            okunan.has(sira[i]) ? h('button.btn', { text: '▶ Dene', on: { click: () => dene(okunan.get(sira[i])) } }) : null));
      } else {
        kart.append(h('div', { style: { fontSize: '22px', fontWeight: '800', color: 'var(--yesil)' }, text: '✓ Liste bitti' }),
          h('div.not', { text: okunanSay + ' tuş okundu. Eksik kalan tuşa dokunup okuyabilir ya da kaydedebilirsiniz.' }),
          h('button.btn', { style: { marginTop: '10px' }, text: '+ Listede olmayan tuş ekle', on: { click: ozelTus } }));
      }

      cipler.innerHTML = '';
      sira.forEach((a, j) => {
        const sinif = j === i ? '.secili' : '';
        const b = h('button.secim' + sinif, { text: (okunan.has(a) ? '✓ ' : atlanan.has(a) ? '– ' : '') + a,
          style: okunan.has(a) && j !== i ? { background: '#1F6B43', color: '#fff' } : atlanan.has(a) ? { opacity: '.45' } : null,
          on: { click: () => { atlanan.delete(a); git(j); } } });
        cipler.append(b);
      });

      altBtn.innerHTML = '';
      altBtn.append(h('button.btn.ana.blok', { style: { marginTop: '14px', padding: '16px' }, disabled: !okunanSay,
        text: hedef ? '✓ ' + okunanSay + ' tuşu kumandaya ekle' : '✓ Bitir ve kaydet (' + okunanSay + ' tuş)', on: { click: bitir } }));
    }

    async function ozelTus() {
      const ad = await sor('Tuş adı', 'Kumandada yazan adı yazın (ör. "Fav", "Sleep", "V.Format")', '');
      if (!ad) return;
      sira.splice(i < sira.length ? i : sira.length, 0, ad.trim());
      if (i >= sira.length) i = sira.length - 1;
      D.sira = sira; D.i = i;
      ciz(); dinle();
    }

    function dene(s) {
      durdur();
      setTimeout(() => { IR.gonder(s); setTimeout(dinle, 900); }, 350);
    }

    async function bitir() {
      durdur();
      const yeni = sira.filter(a => okunan.has(a)).map(a => okunan.get(a));
      if (!yeni.length) return;
      if (hedef) {
        const birlesik = (hedef.tuslar || []).filter(s => !okunan.has(s[0])).concat(yeni);
        if (hedef.yerlesik) {
          Araclar.kaydetDiyalog(Object.assign({}, hedef, { tuslar: birlesik }), { kaydedilince: ac });
        } else {
          const k = Kayit.kaydet(Object.assign({}, hedef, { tuslar: birlesik }));
          tost(yeni.length + ' tuş eklendi', 'basari');
          ac(k);
        }
        return;
      }
      Araclar.kaydetDiyalog(Object.assign({}, bilgi, { tuslar: yeni, kaynak: 'kopya' }), { kaydedilince: ac });
    }
    function ac(k) {
      // Sihirbaz ekranlarını yığından çıkar, kumandayı aç
      const y = Ekran.yigin[Ekran.sekme];
      while (y.length > 1 && (y[y.length - 1].fn === OgrenSihirbazi || y[y.length - 1].fn === KumandaEkle ||
        y[y.length - 1].fn === Saha.KumandaEkrani)) y.pop();
      Ekran.ac(Saha.KumandaEkrani, { kumanda: k });
    }

    const k1 = Yerel.on('ogrenildi', ogrenildi);
    const k2 = Yerel.on('modul', () => { ciz(); if (!dinliyor) dinle(); });

    el.append(ust,
      h('div.kutu', { style: { padding: '10px 14px' } },
        h('div', { style: { fontWeight: '700', color: 'var(--buz)' }, text: (DB.IKON[bilgi.kategori] || '') + ' ' + (bilgi.marka || '') + ' ' + (bilgi.model || '') }),
        h('div.not', { text: hedef ? 'Eksik tuşlar ekleniyor' : 'Okunan her tuştan sonra sıradakine geçilir. Kumandada olmayan tuşu atlayın.' }),
        ilerleme),
      kart, altBtn, h('div.bolum-baslik', { text: 'Tüm tuşlar (dokunup seçin)' }), cipler);
    i = D.i != null ? D.i : sonrakiBos(0);
    ciz();
    setTimeout(dinle, 300);
    return { baslik: hedef ? 'Tuş ekle' : 'Kumandayı oku', el, ekranAcik: true,
      kapat: () => { kapandi = true; durdur(); k1(); k2(); },
      onplan: () => { if (!dinliyor) dinle(); } };
  }

  window.Ekle = { KumandaEkle, OgrenSihirbazi, SABLON, sablon, markaOnerileri, okuyucuKarti };
})();
