/* Saha araçları: hızlı bulma, marka deneme, tarama, kopyalama, elle kod,
   LED paneli, servis menüleri, içe/dışa aktarma, kaydetme ve düzenleme */
(function () {
  'use strict';

  const rev = (v, n) => { let r = 0; for (let i = 0; i < n; i++) if (v & (1 << i)) r |= 1 << (n - 1 - i); return r >>> 0; };
  const hex = (v, w) => (v >>> 0).toString(16).toUpperCase().padStart(w, '0');

  /** Protokol ailesine göre (adres, komut) -> sinyal */
  const AILE = {
    NEC: { ad: 'NEC (8 bit adres)', adresMax: 255, komutMax: 255,
      sinyal: (a, c) => ['NEC', hex((rev(a, 8) << 24 | rev(~a & 255, 8) << 16 | rev(c, 8) << 8 | rev(~c & 255, 8)) >>> 0, 8), 32] },
    NECX: { ad: 'NEC genişletilmiş (16 bit adres)', adresMax: 65535, komutMax: 255,
      sinyal: (a, c) => ['NEC', hex((rev(a & 255, 8) << 24 | rev(a >> 8 & 255, 8) << 16 | rev(c, 8) << 8 | rev(~c & 255, 8)) >>> 0, 8), 32] },
    SAMSUNG: { ad: 'Samsung', adresMax: 255, komutMax: 255,
      sinyal: (a, c) => ['SAMSUNG', hex((rev(a, 8) << 24 | rev(a, 8) << 16 | rev(c, 8) << 8 | rev(~c & 255, 8)) >>> 0, 8), 32] },
    RC5: { ad: 'Philips RC5', adresMax: 31, komutMax: 127,
      sinyal: (a, c) => c < 64 ? ['RC5', hex(a << 6 | c, 3), 12] : ['RC5X', hex((((~c >> 6) & 1) << 12) | a << 6 | (c & 63), 4), 13] },
    RC6: { ad: 'Philips RC6', adresMax: 255, komutMax: 255, sinyal: (a, c) => ['RC6', hex(a << 8 | c, 5), 20] },
    SONY: { ad: 'Sony SIRC 12', adresMax: 31, komutMax: 127, sinyal: (a, c) => ['SONY', hex(rev(c, 7) << 5 | rev(a, 5), 3), 12] }
  };

  // ------------------------------------------------------------ Hızlı bulma
  function HizliBulmaSec() {
    const el = h('div', null, h('p.not', { text: 'Markayı bilmeden cihazı açmak için bilinen yüzlerce açma/kapama kodu sırayla gönderilir. ' +
      'Cihaz tepki verince durdurun.' }), h('div.liste', null,
      [['tv', '📺 Televizyon'], ['audio', '🔊 Ses sistemi / soundbar / amfi'], ['projector', '📽️ Projektör'], ['ac', '❄️ Klima (sabit kayıtlar)']]
        .map(([l, ad]) => h('button.satir', { on: { click: () => Ekran.ac(HizliBulma, { liste: l }) } },
          h('div.s-ana', null, h('div.s-ad', { text: ad })), h('div.s-sag', { text: '›' })))),
      h('div.bolum-baslik', { text: 'Diğer' }),
      h('button.btn.blok', { text: 'Klima için protokol bulma (önerilen)', on: { click: () => Ekran.ac(Klima.MarkaSec) } }));
    return { baslik: 'Hızlı bulma', el };
  }

  function HizliBulma(p) {
    const el = h('div');
    let sinyaller = [], i = 0, oto = false, zam = null;
    const tusAdi = p.liste === 'ac' ? 'Off' : 'Power';
    const ad = h('div.buyuk-sayi', { text: '…' });
    const alt = h('div.not.ortala');
    const ilerleme = h('div.ilerleme', null, h('div'));
    const hiz = h('input', { type: 'range', min: '500', max: '3000', step: '100', value: String(Ayar.get('hizliHiz', 1300)) });
    const otoBtn = h('button.btn.ana', { text: '▶ Otomatik başlat' });

    function gonder() {
      const s = sinyaller[i];
      ad.textContent = (i + 1) + ' / ' + sinyaller.length;
      alt.textContent = (typeof s[1] === 'string' ? s[1] + ' ' + s[2] : 'Ham sinyal ' + s[1] + ' Hz');
      ilerleme.firstChild.style.width = ((i + 1) / sinyaller.length * 100) + '%';
      IR.gonder(s);
    }
    const sonraki = () => { if (i < sinyaller.length - 1) { i++; gonder(); } else { durdur(); tost('Liste bitti'); } };
    function durdur() { oto = false; clearInterval(zam); otoBtn.textContent = '▶ Otomatik devam'; }
    function basla() {
      oto = true; otoBtn.textContent = '⏸ Durdur';
      clearInterval(zam);
      zam = setInterval(sonraki, Number(hiz.value));
    }
    otoBtn.addEventListener('click', () => oto ? durdur() : basla());
    hiz.addEventListener('change', () => { Ayar.set('hizliHiz', Number(hiz.value)); if (oto) basla(); });

    el.append(
      h('div.kutu.ortala', null, h('div.not', { text: 'Cihaza doğrultun' }), ad, alt, ilerleme),
      h('button.btn.yesil.blok', { text: '✓ Cihaz tepki verdi', style: { padding: '18px', fontSize: '17px' }, on: { click: () => {
        durdur();
        // Otomatikte tepki gecikebilir: son 2 sinyali de göster
        bulundu(sinyaller.slice(Math.max(0, i - 2), i + 1).reverse());
      } } }),
      h('div.btn-satir', null, otoBtn),
      h('div.btn-satir', null,
        h('button.btn', { text: '‹ Önceki', on: { click: () => { durdur(); if (i > 0) { i--; gonder(); } } } }),
        h('button.btn', { text: '↻ Tekrar', on: { click: gonder } }),
        h('button.btn', { text: 'Sonraki ›', on: { click: () => { durdur(); sonraki(); } } })),
      h('label.alan', { text: 'Otomatik hız (ms)' }), hiz);

    DB.evrensel().then(u => {
      const grup = u[p.liste] || {};
      sinyaller = (grup[tusAdi] || grup.Power || []).map(x => [tusAdi].concat(x));
      if (!sinyaller.length) { el.prepend(h('div.bos', { text: 'Liste boş' })); return; }
      gonder();
    });

    function bulundu(adaylar) {
      sayfa('Hangisi?', kapat => h('div', null,
        h('p.not', { text: 'Otomatik modda tepki birkaç saniye gecikebilir. Her birini tekrar deneyip doğru olanı seçin.' }),
        h('div.liste', null, adaylar.map((s, n) => h('div.satir', null,
          h('div.s-ana', null, h('div.s-ad', { text: n === 0 ? 'Son gönderilen' : n + ' önceki' }),
            h('div.s-alt.kod', { text: typeof s[1] === 'string' ? s[1] + ' ' + s[2] : 'ham' })),
          h('button.btn', { text: 'Dene', on: { click: () => IR.gonder(s) } }),
          h('button.btn.ana', { text: 'Bu', on: { click: () => { kapat(); sonuc(s); } } }))))));
    }

    async function sonuc(s) {
      Senk.sahaKaydi({ calisti: true, notlar: 'Hızlı bulma: ' + (typeof s[1] === 'string' ? s[1] + ' ' + s[2] : 'ham') });
      const benzer = await benzerleriBul(s, p.liste === 'audio' ? ['ses'] : p.liste === 'projector' ? ['projektor'] : p.liste === 'ac' ? ['klima'] : ['tv', 'uydu', 'medya', 'ekran']);
      Ekran.ac(BulunanSonuc, { sinyal: s, benzer, kategori: p.liste === 'audio' ? 'ses' : p.liste === 'projector' ? 'projektor' : p.liste === 'ac' ? 'klima' : 'tv' });
    }
    return { baslik: 'Hızlı bulma', el, ekranAcik: true, kapat: durdur };
  }

  /** Aynı sinyali (ya da aynı protokol+adresi) içeren kumandaları bul */
  async function benzerleriBul(s, kategoriler) {
    const tam = [], adres = [];
    const ayni = typeof s[1] === 'string';
    const adresAnahtar = ayni && /^(NEC|SAMSUNG)$/.test(s[1]) ? s[2].slice(0, 4) : null;
    const i = await DB.indeks();
    for (const kat of kategoriler) {
      const paket = await DB.kategori(kat);
      const bilgi = i.categories.find(c => c.id === kat);
      const ad = new Map();
      for (const b of bilgi.brands) for (const r of b.r) ad.set(r[0], { marka: b.n, model: r[1], tus: r[2], kaynak: r[3] });
      for (const [rid, tuslar] of paket) {
        let t = false, a = false;
        for (const x of tuslar) {
          if (ayni && x[1] === s[1] && x[2] === s[2]) { t = true; break; }
          if (!ayni && typeof x[1] !== 'string' && JSON.stringify(x[2]) === JSON.stringify(s[2])) { t = true; break; }
          if (adresAnahtar && x[1] === s[1] && String(x[2]).slice(0, 4) === adresAnahtar) a = true;
        }
        const bilgiR = Object.assign({ id: rid, kategori: kat }, ad.get(rid));
        if (t) tam.push(bilgiR); else if (a) adres.push(bilgiR);
      }
    }
    // Ekip kayıtları
    const ekip = Kayit.hepsi().filter(k => (k.tuslar || []).some(x => x[1] === s[1] && x[2] === s[2]));
    return { tam, adres: adres.slice(0, 60), ekip };
  }

  function BulunanSonuc(p) {
    const s = p.sinyal, b = p.benzer;
    const el = h('div',
      null,
      h('div.kutu', null, h('div', { style: { fontWeight: '700', color: 'var(--yesil)' }, text: '✓ Çalışan kod bulundu' }),
        h('div.kod', { text: typeof s[1] === 'string' ? s[1] + ' · ' + s[2] + ' · ' + s[3] + ' bit' : 'Ham sinyal' }),
        h('div.btn-satir', null, h('button.btn', { text: 'Tekrar gönder', on: { click: () => IR.gonder(s) } }))));
    const satirlar = (liste) => h('div.liste', null, liste.map(r => h('button.satir', { on: { click: () => Saha.kumandaAc(r.id) } },
      h('div.s-ana', null, h('div.s-ad', { text: r.marka + ' · ' + r.model }), h('div.s-alt', { text: r.tus + ' tuş' })), h('div.s-sag', { text: '›' }))));
    if (b.ekip.length) el.append(h('div.bolum-baslik', { text: 'Ekip kayıtları' }), h('div.liste', null, b.ekip.map(Saha.kayitSatiri)));
    if (b.tam.length) el.append(h('div.bolum-baslik', { text: 'Bu kodu içeren kumandalar (' + b.tam.length + ')' }), satirlar(b.tam.slice(0, 80)));
    if (b.adres.length) el.append(h('div.bolum-baslik', { text: 'Aynı adresi kullananlar (' + b.adres.length + ')' }), satirlar(b.adres));
    if (!b.tam.length && !b.adres.length && !b.ekip.length) el.append(h('div.bos', { text: 'Veritabanında eşleşen kumanda yok. Tarama ile diğer tuşları bulun.' }));
    if (typeof s[1] === 'string' && /^(NEC|SAMSUNG|RC5|RC6|SONY)$/.test(s[1])) {
      el.append(h('button.btn.ana.blok', { style: { marginTop: '14px' }, text: '🔎 Bu adresle tüm tuşları tara', on: { click: () => {
        const ai = adresCoz(s);
        Ekran.ac(Tarama, ai);
      } } }));
    }
    return { baslik: 'Sonuç', el };
  }

  /** Sinyalden aile ve adres çıkar (tarama için) */
  function adresCoz(s) {
    const v = parseInt(s[2], 16);
    if (s[1] === 'NEC') {
      const a = rev(v >>> 24 & 255, 8), a2 = rev(v >>> 16 & 255, 8);
      return a2 === (~a & 255) ? { aile: 'NEC', adres: a } : { aile: 'NECX', adres: a | a2 << 8 };
    }
    if (s[1] === 'SAMSUNG') return { aile: 'SAMSUNG', adres: rev(v >>> 24 & 255, 8) };
    if (s[1] === 'RC5') return { aile: 'RC5', adres: v >> 6 & 31 };
    if (s[1] === 'RC6') return { aile: 'RC6', adres: v >> 8 & 255 };
    if (s[1] === 'SONY') return { aile: 'SONY', adres: rev(v & 31, 5) };
    return {};
  }

  // ------------------------------------------------------------ Marka modellerini sırayla dene
  function MarkaDene(p) {
    const el = h('div');
    const kalemler = p.marka.r;
    let i = 0;
    let paket = null;
    const ad = h('div.buyuk-sayi');
    const alt = h('div.not.ortala');
    async function gonder() {
      if (!paket) paket = await DB.kategori(p.kategori);
      const r = kalemler[i];
      const tuslar = paket.get(r[0]) || [];
      const guc = tuslar.find(s => /^(POWER|POWER_ON)$/.test(IR.anahtar(s[0]) || '')) || tuslar[0];
      ad.textContent = (i + 1) + ' / ' + kalemler.length;
      alt.textContent = r[1] + ' · ' + (guc ? guc[0] : '-');
      if (guc) IR.gonder(guc);
    }
    el.append(h('div.kutu.ortala', null, h('div.not', { text: p.marka.n + ' modellerinin açma/kapama tuşu' }), ad, alt),
      h('button.btn.yesil.blok', { text: '✓ Tepki verdi — bu kumandayı aç', style: { padding: '16px' }, on: { click: () => Saha.kumandaAc(kalemler[i][0]) } }),
      h('div.btn-satir', null,
        h('button.btn', { text: '‹ Önceki', on: { click: () => { if (i > 0) { i--; gonder(); } } } }),
        h('button.btn', { text: '↻ Tekrar', on: { click: gonder } }),
        h('button.btn.ana', { text: 'Sonraki ›', on: { click: () => { if (i < kalemler.length - 1) { i++; gonder(); } else tost('Liste bitti'); } } })));
    setTimeout(gonder, 200);
    return { baslik: p.marka.n, el, ekranAcik: true };
  }

  // ------------------------------------------------------------ Kod tarama
  function Tarama(p) {
    let aile = p.aile || Ayar.get('taramaAile', 'NEC');
    let adres = p.adres != null ? p.adres : Ayar.get('taramaAdres', 0);
    const bulunan = new Map();  // komut -> ad
    let oto = false, zam = null, sira = 0;
    const el = h('div');
    const aileSec = h('select.giris', null, Object.entries(AILE).map(([k, v]) => h('option', { value: k, text: v.ad, selected: k === aile })));
    const adresGir = h('input.giris', { value: hex(adres, 2), inputmode: 'text', placeholder: 'Adres (hex)' });
    const izgara = h('div.tuslar4');
    const sonuclar = h('div');
    const otoBtn = h('button.btn', { text: '▶ Otomatik tara' });
    const durumYazi = h('div.not.ortala');

    function sinyal(c) { const r = AILE[aile].sinyal(adres, c); return [bulunan.get(c) || ('Kod ' + hex(c, 2)), r[0], r[1], r[2]]; }
    function gonder(c) { sira = c; durumYazi.textContent = 'Son gönderilen: ' + hex(c, 2); return IR.gonder(sinyal(c)); }
    function ciz() {
      izgara.innerHTML = '';
      const max = AILE[aile].komutMax;
      for (let c = 0; c <= max; c++) {
        const b = h('button.tus' + (bulunan.has(c) ? '.hardal' : ''), { text: bulunan.has(c) ? bulunan.get(c) : hex(c, 2), style: { minHeight: '46px', fontSize: '13px' } });
        IR.bas(b, () => () => gonder(c));
        let uzun = null;
        b.addEventListener('pointerdown', () => { uzun = setTimeout(() => adVer(c), 650); });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(o => b.addEventListener(o, () => clearTimeout(uzun)));
        izgara.append(b);
      }
      sonucCiz();
    }
    async function adVer(c) {
      const hazir = ['Güç', 'Ses +', 'Ses −', 'Sessiz', 'Kanal +', 'Kanal −', 'Yukarı', 'Aşağı', 'Sol', 'Sağ', 'OK', 'Menü', 'Geri', 'Çıkış',
        'Kaynak', 'Bilgi', 'Ana sayfa', 'Oynat', 'Durdur', 'Duraklat', 'İleri', 'Geri sar', 'Mod', 'USB', 'Radyo', 'AUX', 'Bluetooth'];
      const secim = await sec('Kod ' + hex(c, 2) + ' ne yaptı?', [{ ad: '✎ Kendim yazayım', deger: '__yaz' }, { ad: '✕ İşaretsiz yap', deger: '__sil' }]
        .concat(hazir.map(x => ({ ad: x, deger: x }))));
      if (!secim) return;
      if (secim === '__sil') bulunan.delete(c);
      else if (secim === '__yaz') { const a = await sor('Tuş adı', null, bulunan.get(c) || ''); if (a) bulunan.set(c, a); }
      else bulunan.set(c, secim);
      ciz();
    }
    function sonucCiz() {
      sonuclar.innerHTML = '';
      if (!bulunan.size) return;
      sonuclar.append(h('div.bolum-baslik', { text: 'Bulunan tuşlar (' + bulunan.size + ')' }),
        h('div.liste', null, Array.from(bulunan.entries()).map(([c, a]) => h('div.satir', null,
          h('div.s-ana', null, h('div.s-ad', { text: a }), h('div.s-alt.kod', { text: 'Kod ' + hex(c, 2) })),
          h('button.btn', { text: 'Dene', on: { click: () => gonder(c) } })))),
        h('button.btn.ana.blok', { style: { marginTop: '10px' }, text: '★ Kumanda olarak kaydet', on: { click: () => {
          const tuslar = Array.from(bulunan.keys()).map(c => sinyal(c));
          kaydetDiyalog({ kategori: 'diger', marka: '', model: '', tuslar, kaynak: 'tarama', notlar: AILE[aile].ad + ' adres ' + hex(adres, 2) });
        } } }));
    }
    function durdur() { oto = false; clearInterval(zam); otoBtn.textContent = '▶ Otomatik tara'; }
    otoBtn.addEventListener('click', () => {
      if (oto) return durdur();
      oto = true; otoBtn.textContent = '⏸ Durdur (tepki verdi)';
      zam = setInterval(() => { if (sira >= AILE[aile].komutMax) return durdur(); gonder(sira + 1); }, Ayar.get('taramaHiz', 1100));
    });
    aileSec.addEventListener('change', () => { aile = aileSec.value; Ayar.set('taramaAile', aile); bulunan.clear(); ciz(); });
    adresGir.addEventListener('change', () => {
      const v = parseInt(adresGir.value, 16);
      if (isNaN(v) || v < 0 || v > AILE[aile].adresMax) { tost('Adres geçersiz', 'hata'); return; }
      adres = v; Ayar.set('taramaAdres', adres); bulunan.clear(); ciz();
    });

    el.append(
      h('div.uyari', { text: 'Tuşlara sırayla basın; cihaz tepki verince tuşa UZUN basıp ne yaptığını seçin. Adresi bilmiyorsanız önce Hızlı bulma ile açma kodunu bulun.' }),
      h('label.alan', { text: 'Protokol' }), aileSec,
      h('label.alan', { text: 'Adres (hex) — yaygın: NEC 00, 01, 04 (LG), 20, 40, 80 · Samsung 07 · RC5 00, 01' }), adresGir,
      h('div.btn-satir', null, otoBtn, h('button.btn', { text: '‹ Bir geri', on: { click: () => { durdur(); if (sira > 0) gonder(sira - 1); } } })),
      durumYazi, sonuclar, h('div.bolum-baslik', { text: 'Komutlar' }), izgara);
    ciz();
    return { baslik: 'Kod tarama', el, ekranAcik: true, kapat: durdur };
  }

  // ------------------------------------------------------------ Kopyalama (öğrenme)
  function Kopyala(p) {
    const el = h('div');
    const tuslar = (p && p.tuslar) ? p.tuslar.slice() : [];
    let bekleyenAd = null;
    const durum = h('div.kutu');
    const liste = h('div');
    let cik = null;

    function durumCiz() {
      const d = IR.durum();
      durum.innerHTML = '';
      if (!d.module) {
        durum.append(h('div', { style: { fontWeight: '700' }, text: 'IR alıcı modülü bağlı değil' }),
          h('p.not', { text: 'Kumanda okumak için Gün IR modülü gerekir (telefonların IR alıcısı yoktur). Modülü açıp yanına yaklaşın.' }),
          h('button.btn.ana.blok', { text: 'Modüle bağlan', on: { click: () => { const e = Yerel.cagri('moduleConnect'); if (e) tost(e, 'hata'); } } }));
      } else {
        durum.append(h('div', { style: { fontWeight: '700', color: 'var(--yesil)' }, text: '✓ ' + (d.moduleName || 'Modül') + ' bağlı' }),
          h('p.not', { text: bekleyenAd ? '"' + bekleyenAd + '" için orijinal kumandanın tuşuna modülün alıcısına doğru basın…' :
            'Yeni tuş okumak için aşağıdaki düğmeye dokunun.' }),
          h('button.btn.ana.blok', { text: bekleyenAd ? 'Bekleniyor… (iptal)' : '+ Yeni tuş oku', on: { click: oku } }));
      }
    }
    async function oku() {
      if (bekleyenAd) { bekleyenAd = null; Yerel.cagri('learnStop'); durumCiz(); return; }
      const hazir = ['Güç', 'Ses +', 'Ses −', 'Sessiz', 'Kanal +', 'Kanal −', 'Yukarı', 'Aşağı', 'Sol', 'Sağ', 'OK', 'Menü', 'Geri', 'Çıkış', 'Kaynak',
        'Bilgi', 'Ana sayfa', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
      const kullanilmis = new Set(tuslar.map(t => t[0]));
      const s = await sec('Hangi tuş?', [{ ad: '✎ Adını yazayım', deger: '__yaz' }].concat(hazir.filter(x => !kullanilmis.has(x)).map(x => ({ ad: x, deger: x }))));
      if (!s) return;
      const ad = s === '__yaz' ? await sor('Tuş adı') : s;
      if (!ad) return;
      bekleyenAd = ad;
      const e = Yerel.cagri('learnStart', 15);
      if (e) { tost(e, 'hata'); bekleyenAd = null; }
      durumCiz();
    }
    function ogrenildi(v) {
      if (!bekleyenAd) return;
      const ad = bekleyenAd;
      bekleyenAd = null;
      const t = v.t || [];
      const c = Yerel.json('irDecode', t.join(',')) || {};
      let sinyal;
      if (c.ok && c.protocol && c.protocol !== 'UNKNOWN') {
        sinyal = [ad, c.protocol, c.state || String(c.value || '').replace(/^0x/i, ''), c.bits | 0];
      } else {
        sinyal = [ad, v.f || 38000, t];
      }
      tuslar.push(sinyal);
      Yerel.titre(40);
      tost('"' + ad + '" okundu' + (c.ok ? ' (' + c.protocol + ')' : ' (ham)'), 'basari');
      if (c.ac && c.ac.protocol) {
        onay('Klima kumandası algılandı', 'Bu bir ' + c.ac.protocol + ' klima kumandası. Tam kontrol panelini bu protokolle açalım mı?', 'Paneli aç')
          .then(e => { if (e) Ekran.ac(Klima.Panel, { protokol: c.ac.protocol, model: c.ac.model > 0 ? c.ac.model : null, marka: '', yeniBulundu: true }); });
      }
      durumCiz(); listeCiz();
    }
    function listeCiz() {
      liste.innerHTML = '';
      if (!tuslar.length) return;
      liste.append(h('div.bolum-baslik', { text: 'Okunan tuşlar (' + tuslar.length + ')' }),
        h('div.liste', null, tuslar.map((s, n) => h('div.satir', null,
          h('div.s-ana', null, h('div.s-ad', { text: s[0] }), h('div.s-alt.kod', { text: typeof s[1] === 'string' ? s[1] + ' ' + s[2] : 'ham · ' + (s[2] || []).length + ' darbe' })),
          h('button.btn', { text: 'Dene', on: { click: () => IR.gonder(s) } }),
          h('button.btn', { text: '✕', on: { click: () => { tuslar.splice(n, 1); listeCiz(); } } })))),
        h('button.btn.ana.blok', { style: { marginTop: '10px' }, text: '★ Kumanda olarak kaydet', on: { click: () =>
          kaydetDiyalog({ id: p && p.id, kategori: (p && p.kategori) || 'diger', marka: (p && p.marka) || '', model: (p && p.model) || '', tuslar, kaynak: 'kopya' }) } }));
    }
    const k1 = Yerel.on('ogrenildi', ogrenildi);
    const k2 = Yerel.on('modul', () => durumCiz());
    cik = () => { k1(); k2(); if (bekleyenAd) Yerel.cagri('learnStop'); };
    el.append(durum, liste);
    durumCiz(); listeCiz();
    return { baslik: 'Kumanda kopyala', el, kapat: cik, ekranAcik: true };
  }

  // ------------------------------------------------------------ Elle kod
  function ElleKod(p) {
    const el = h('div');
    const tur = h('div.mod-sekme');
    const govde = h('div');
    let secili = 'adres';
    const turler = [['adres', 'Adres + komut'], ['protokol', 'Protokol'], ['ham', 'Ham'], ['pronto', 'Pronto']];
    turler.forEach(([k, ad]) => tur.append(h('button' + (k === secili ? '.secili' : ''), { text: ad, on: { click: e => {
      secili = k; tur.querySelectorAll('button').forEach(b => b.classList.remove('secili')); e.target.classList.add('secili'); ciz();
    } } })));
    let sinyalAl = () => null;

    function ciz() {
      govde.innerHTML = '';
      if (secili === 'adres') {
        const aile = h('select.giris', null, Object.entries(AILE).map(([k, v]) => h('option', { value: k, text: v.ad })));
        const adres = h('input.giris', { placeholder: 'Adres (hex) ör. 00', value: '00' });
        const komut = h('input.giris', { placeholder: 'Komut (hex) ör. 45', value: '' });
        govde.append(h('label.alan', { text: 'Protokol' }), aile, h('label.alan', { text: 'Adres (hex)' }), adres, h('label.alan', { text: 'Komut (hex)' }), komut);
        sinyalAl = () => {
          const a = parseInt(adres.value, 16), c = parseInt(komut.value, 16);
          if (isNaN(a) || isNaN(c)) return null;
          const r = AILE[aile.value].sinyal(a, c);
          return ['Kod ' + hex(c, 2), r[0], r[1], r[2]];
        };
      } else if (secili === 'protokol') {
        const tumu = (Yerel.json('irProtocols') || []).map(x => x.name);
        const liste = tumu.length ? tumu : ['NEC', 'SAMSUNG', 'RC5', 'RC6', 'SONY', 'PANASONIC', 'LG', 'JVC', 'SHARP', 'DENON', 'NIKAI'];
        const pr = h('select.giris', null, liste.map(x => h('option', { value: x, text: x, selected: x === 'NEC' })));
        const deger = h('input.giris', { placeholder: 'Değer (hex) ör. 00FFA25D' });
        const bit = h('input.giris', { placeholder: 'Bit (boş = varsayılan)', inputmode: 'numeric' });
        govde.append(h('label.alan', { text: 'Protokol (IRremoteESP8266 adı)' }), pr, h('label.alan', { text: 'Değer (hex)' }), deger,
          h('label.alan', { text: 'Bit sayısı' }), bit, h('p.not', { text: 'irplus WINLIRC_NEC1 kodları için: "0x00ff 0xa25d" → NEC, değer 00FFA25D.' }));
        sinyalAl = () => {
          const v = deger.value.replace(/0x/gi, '').replace(/[^0-9a-f]/gi, '');
          return v ? ['Kod', pr.value, v.toUpperCase(), parseInt(bit.value) || 0] : null;
        };
      } else if (secili === 'ham') {
        const f = h('input.giris', { value: '38000', inputmode: 'numeric' });
        const t = h('textarea.giris', { placeholder: '9000, 4500, 560, 560, …' });
        govde.append(h('label.alan', { text: 'Taşıyıcı frekans (Hz)' }), f, h('label.alan', { text: 'Zamanlamalar (µs, mark/space)' }), t);
        sinyalAl = () => {
          const z = t.value.split(/[^0-9]+/).filter(Boolean).map(Number);
          return z.length > 3 ? ['Ham', Number(f.value) || 38000, z] : null;
        };
      } else {
        const t = h('textarea.giris', { placeholder: '0000 006D 0022 0002 0156 00AB …' });
        govde.append(h('label.alan', { text: 'Pronto HEX' }), t);
        sinyalAl = () => { const r = prontoCoz(t.value); return r ? ['Pronto', r.f, r.t] : null; };
      }
    }
    el.append(tur, govde,
      h('div.btn-satir', null,
        h('button.btn.ana', { text: '▶ Gönder', on: { click: () => { const s = sinyalAl(); if (!s) return tost('Kod eksik ya da hatalı', 'hata'); IR.gonder(s); } } }),
        h('button.btn', { text: '+ Kumandaya ekle', on: { click: async () => {
          const s = sinyalAl(); if (!s) return tost('Kod eksik ya da hatalı', 'hata');
          const ad = await sor('Tuş adı', null, s[0]); if (!ad) return;
          s[0] = ad;
          kumandayaEkle(s);
        } } })));
    ciz();
    return { baslik: 'Elle kod', el };
  }

  async function kumandayaEkle(s) {
    const kayitlar = Kayit.hepsi().filter(k => !(k.klima && k.klima.protokol));
    const hedef = await sec('Hangi kumandaya?', [{ ad: '+ Yeni kumanda', deger: '__yeni' }].concat(
      kayitlar.map(k => ({ ad: (k.marka || '?') + ' ' + (k.model || ''), alt: (k.tuslar || []).length + ' tuş', deger: k.id }))));
    if (!hedef) return;
    if (hedef === '__yeni') return kaydetDiyalog({ kategori: 'diger', marka: '', model: '', tuslar: [s], kaynak: 'elle' });
    const k = Kayit.getir(hedef);
    k.tuslar = (k.tuslar || []).concat([s]);
    Kayit.kaydet(k);
    tost('Eklendi: ' + s[0], 'basari');
  }

  function prontoCoz(metin) {
    const w = metin.trim().split(/\s+/).map(x => parseInt(x, 16));
    if (w.length < 6 || w.some(isNaN) || w[0] !== 0) return null;
    const f = Math.round(1000000 / (w[1] * 0.241246));
    const birim = 1000000 / f;
    const n1 = w[2], n2 = w[3];
    const veri = w.slice(4);
    const parca = (n1 > 0 ? veri.slice(0, n1 * 2) : veri.slice(n1 * 2, n1 * 2 + n2 * 2));
    if (parca.length < 4) return null;
    return { f, t: parca.map(x => Math.round(x * birim)) };
  }

  function prontoYap(f, t) {
    const per = Math.round(1000000 / (f * 0.241246));
    const birim = 1000000 / f;
    let z = t.slice();
    if (z.length % 2) z.push(Math.max(10000, 40000));
    const w = [0, per, z.length / 2, 0].concat(z.map(x => Math.max(1, Math.round(x / birim))));
    return w.map(x => hex(x, 4)).join(' ');
  }

  // ------------------------------------------------------------ LED paneli
  function LedPanel() {
    let tip = Ayar.get('ledTip', 24);
    const el = h('div.kumanda');
    const sekme = h('div.mod-sekme', null,
      h('button' + (tip === 24 ? '.secili' : ''), { text: '24 tuş', on: { click: () => { tip = 24; Ayar.set('ledTip', 24); Ekran.yenile(); } } }),
      h('button' + (tip === 44 ? '.secili' : ''), { text: '44 tuş', on: { click: () => { tip = 44; Ayar.set('ledTip', 44); Ekran.yenile(); } } }));
    const panel = tip === 44 ? IR.LED44 : IR.LED24;
    const izgara = h('div.tuslar4', null, panel.tuslar.map(([s, renk]) => {
      const sinif = renk === 'hardal' ? '.hardal' : renk === 'kirmizi' ? '.kirmizi' : renk === 'yesil' ? '.yesil' : '';
      const b = h('button.tus' + sinif, { text: s[0], style: { fontSize: '12px', minHeight: '52px' } });
      if (renk && renk.startsWith('#')) {
        b.style.background = renk; b.style.color = ['#eee', '#fcc', '#fdd', '#cef', '#ec3', '#f93'].includes(renk) ? '#1a1a1a' : '#fff';
      }
      return IR.bas(b, () => s, { tekrar: /Parlak|\+|−/.test(s[0]) });
    }));
    el.append(sekme, h('p.not', { text: panel.ad + '. Çalışmazsa diğer düzeni deneyin; yine olmazsa Aydınlatma kategorisinden markaya bakın.' }), izgara,
      h('button.btn.blok', { style: { marginTop: '12px' }, text: '★ Bu paneli kumanda olarak kaydet', on: { click: () =>
        kaydetDiyalog({ kategori: 'aydinlatma', marka: 'LED şerit', model: panel.ad, tuslar: panel.tuslar.map(x => x[0]), kaynak: 'veritabani' }) } }));
    return { baslik: 'LED şerit', el };
  }

  // ------------------------------------------------------------ Servis menüleri
  function Servis() {
    const el = h('div', null, h('div.uyari', { text: 'Servis menüleri TV ayarlarını kalıcı değiştirebilir. Müşteri cihazında dikkatli kullanın.' }));
    let marka = '';
    for (const m of IR.SERVIS) {
      if (m.marka !== marka) { marka = m.marka; el.append(h('div.bolum-baslik', { text: marka })); }
      el.append(h('div.kutu', null,
        h('div', { style: { fontWeight: '700', color: 'var(--buz)' }, text: m.ad }),
        h('p.not', { text: m.not }),
        h('div.btn-satir', null,
          h('button.btn.ana', { text: '▶ Sırayla gönder', on: { click: async e => {
            e.target.disabled = true; await IR.diziGonder(m.dizi, 700); e.target.disabled = false;
          } } })),
        h('div.tuslar-oto', null, m.dizi.map(s => IR.bas(h('button.tus', { text: s[0], style: { minHeight: '44px' } }), () => s)))));
    }
    return { baslik: 'Servis menüleri', el };
  }

  // ------------------------------------------------------------ irplus içe/dışa aktarma
  function iceAktar() {
    const g = h('input', { type: 'file', accept: '.irplus,.xml,text/xml,application/xml,*/*', style: { display: 'none' } });
    g.addEventListener('change', async () => {
      const f = g.files && g.files[0];
      if (!f) return;
      irplusAc(await f.text(), f.name);
    });
    document.body.append(g);
    g.click();
    setTimeout(() => g.remove(), 60000);
  }

  function irplusAc(metin, dosyaAdi) {
    let doc;
    try { doc = new DOMParser().parseFromString(metin, 'text/xml'); } catch (e) { return tost('Dosya okunamadı', 'hata'); }
    const cihazlar = Array.from(doc.getElementsByTagName('device'));
    if (!cihazlar.length) return tost('irplus cihazı bulunamadı', 'hata');
    let atlanan = 0, eklenen = 0;
    for (const d of cihazlar) {
      const format = (d.getAttribute('format') || '').toUpperCase();
      const tuslar = [];
      for (const b of Array.from(d.getElementsByTagName('button'))) {
        const ad = (b.getAttribute('label') || '?').replace(/&#x[0-9a-f]+;/gi, '').trim() || 'Tuş';
        const kod = (b.textContent || '').trim();
        const s = irplusSinyal(format, kod, ad === '' ? 'Güç' : ad);
        if (s) tuslar.push(s); else atlanan++;
      }
      if (tuslar.length) {
        Kayit.kaydet({ kategori: 'diger', marka: d.getAttribute('manufacturer') || '', model: d.getAttribute('model') || dosyaAdi || '',
          tuslar, kaynak: 'irplus' });
        eklenen++;
      }
    }
    tost(eklenen + ' kumanda içe aktarıldı' + (atlanan ? ', ' + atlanan + ' tuş atlandı' : ''), eklenen ? 'basari' : 'hata');
    if (eklenen) Ekran.sekmeyeGec('kayitlar');
  }

  function irplusSinyal(format, kod, ad) {
    const parca = kod.split(/\s+/).filter(Boolean);
    if (format.startsWith('WINLIRC_NEC') || format === 'NEC_HEX') {
      if (parca.length >= 2) {
        const v = (parseInt(parca[0], 16) & 0xFFFF) * 65536 + (parseInt(parca[1], 16) & 0xFFFF);
        return [ad, 'NEC', hex(v, 8), 32];
      }
      return [ad, 'NEC', hex(parseInt(parca[0], 16), 8), 32];
    }
    if (format === 'PRONTO_HEX' || /^0000\s/.test(kod)) {
      const r = prontoCoz(kod); return r ? [ad, r.f, r.t] : null;
    }
    if (format === 'RAW' || format.startsWith('RAW')) {
      const z = kod.split(/[^0-9]+/).filter(Boolean).map(Number);
      return z.length > 3 ? [ad, 38000, z] : null;
    }
    if (format === 'SAMSUNG' && parca.length) return [ad, 'SAMSUNG', parca.join('').replace(/0x/gi, ''), 32];
    return null;
  }

  function paylas(k) {
    const tuslar = (k.tuslar || []).filter(Boolean);
    if (!tuslar.length) return tost('Paylaşılacak tuş yok', 'hata');
    const satir = [];
    for (const s of tuslar) {
      let f, t;
      if (typeof s[1] === 'string') {
        const r = Yerel.json('irEncode', s[1], String(s[2]), s[3] | 0);
        if (!r || !r.t || !r.t.length) continue;
        f = r.f; t = r.t;
      } else { f = s[1]; t = s[2]; }
      satir.push('    <button label="' + String(s[0]).replace(/[<>&"]/g, '') + '" span="3">' + prontoYap(f, t) + '</button>');
    }
    const xml = '<irplus>\n  <device manufacturer="' + (k.marka || 'Gun Kumanda').replace(/[<>&"]/g, '') + '" model="' +
      (k.model || '').replace(/[<>&"]/g, '') + '" columns="12" format="PRONTO_HEX">\n' + satir.join('\n') + '\n  </device>\n</irplus>\n';
    const ad = ((k.marka || 'kumanda') + '_' + (k.model || '')).replace(/[^A-Za-z0-9_-]+/g, '_') + '.irplus';
    Yerel.cagri('saveText', ad, xml);
    Yerel.cagri('shareText', ad, xml);
  }

  // ------------------------------------------------------------ Kaydet diyaloğu
  function kaydetDiyalog(k, secenek) {
    const yeni = !k.id || k.yerlesik;
    const marka = h('input.giris', { value: k.marka || '', placeholder: 'Marka' });
    const model = h('input.giris', { value: k.model || '', placeholder: 'Model (etiketteki)' });
    const not = h('input.giris', { value: k.notlar || '', placeholder: 'Not (ör. Dalyan villa, salon klima)' });
    const kategori = h('select.giris', null);
    DB.indeks().then(i => i.categories.forEach(c => kategori.append(h('option', { value: c.id, text: c.name, selected: c.id === (k.kategori || 'diger') }))));
    let kisiId = k.kisi_id || null;
    const kisiBtn = h('button.btn.blok', { text: kisiId ? 'Müşteri bağlı (#' + kisiId + ')' : '👤 Müşteriye bağla (isteğe bağlı)' });
    if (kisiId) Senk.kisiAdi(kisiId).then(a => { if (a) kisiBtn.textContent = '👤 ' + a; });
    kisiBtn.addEventListener('click', async () => {
      if (!Senk.erpUye) return tost('Müşteri bağlamak ERP üyelerine açıktır', 'hata');
      const q = await sor('Müşteri ara', 'İsmin bir kısmını yazın', '');
      if (q == null) return;
      const liste = await Senk.kisiAra(q);
      const s = await sec('Müşteri', [{ ad: '✕ Bağlantıyı kaldır', deger: 0 }].concat(liste.map(x => ({ ad: x.isim, alt: x.tel || x.adres || '', deger: x.id }))));
      if (s == null) return;
      kisiId = s || null;
      const kisi = liste.find(x => x.id === s);
      kisiBtn.textContent = kisi ? '👤 ' + kisi.isim : '👤 Müşteriye bağla (isteğe bağlı)';
    });
    const foto = h('input', { type: 'file', accept: 'image/*', capture: 'environment', style: { display: 'none' } });
    let fotoDosya = null;
    const fotoBtn = h('button.btn.blok', { text: k.etiket_foto ? '📷 Etiket fotoğrafı var (değiştir)' : '📷 Etiket fotoğrafı ekle' });
    fotoBtn.addEventListener('click', () => foto.click());
    foto.addEventListener('change', () => { fotoDosya = foto.files[0]; if (fotoDosya) fotoBtn.textContent = '📷 ' + fotoDosya.name; });

    const kapat = sayfa(yeni ? 'Kumandayı kaydet' : 'Kumanda bilgileri', h('div', null,
      h('label.alan', { text: 'Kategori' }), kategori,
      h('label.alan', { text: 'Marka' }), marka,
      h('label.alan', { text: 'Model' }), model,
      h('label.alan', { text: 'Not' }), not,
      h('div', { style: { marginTop: '12px', display: 'grid', gap: '8px' } }, kisiBtn, fotoBtn, foto),
      h('div.btn-satir', null,
        h('button.btn', { text: 'Vazgeç', on: { click: () => kapat() } }),
        h('button.btn.ana', { text: 'Kaydet', on: { click: async () => {
          const kayit = {
            id: yeni ? null : k.id, kategori: kategori.value || k.kategori || 'diger', marka: marka.value.trim(), model: model.value.trim(),
            notlar: not.value.trim(), tuslar: k.tuslar || [], klima: k.klima || null, duzen: k.duzen || null,
            kaynak: k.yerlesik ? 'veritabani' : (k.kaynak || 'saha'), kisi_id: kisiId, etiket_foto: k.etiket_foto || null
          };
          if (!kayit.marka) return tost('Marka yazın', 'hata');
          const sonuc = Kayit.kaydet(kayit);
          kapat();
          if (secenek && secenek.calisti) Senk.sahaKaydi({ kumanda_id: sonuc.id, calisti: true });
          if (fotoDosya) {
            try { sonuc.etiket_foto = await Senk.fotoYukle(fotoDosya, sonuc.id); Kayit.kaydet(sonuc); }
            catch (e) { tost('Fotoğraf yüklenemedi: ' + e.message, 'hata'); }
          }
          tost('Kaydedildi' + (Senk.uye ? ' ve ekiple paylaşılıyor' : ' (giriş yapınca ekiple paylaşılır)'), 'basari');
          if (yeni && k.yerlesik) Ekran.yigin[Ekran.sekme].pop(), Ekran.ac(Saha.KumandaEkrani, { kumanda: sonuc });
        } } }))));
    return kapat;
  }

  // ------------------------------------------------------------ Düzenleyici
  function Duzenle(p) {
    const k = JSON.parse(JSON.stringify(p.kumanda));
    k.tuslar = k.tuslar || [];
    const el = h('div');
    const liste = h('div.liste');
    function ciz() {
      liste.innerHTML = '';
      k.tuslar.forEach((s, i) => liste.append(h('div.satir', null,
        h('div.s-ana', null, h('div.s-ad', { text: s[0] }), h('div.s-alt.kod', { text: typeof s[1] === 'string' ? s[1] + ' ' + s[2] : 'ham' })),
        h('button.btn', { text: '▶', on: { click: () => IR.gonder(s) } }),
        h('button.btn', { text: '✎', on: { click: async () => { const a = await sor('Tuş adı', null, s[0]); if (a) { s[0] = a; ciz(); } } } }),
        h('button.btn', { text: '↑', on: { click: () => { if (i > 0) { [k.tuslar[i - 1], k.tuslar[i]] = [k.tuslar[i], k.tuslar[i - 1]]; ciz(); } } } }),
        h('button.btn', { text: '✕', on: { click: () => { k.tuslar.splice(i, 1); ciz(); } } }))));
    }
    el.append(h('p.not', { text: 'Tuş adlarını "Power", "Vol_up", "Ok", "Menu" gibi yazarsanız düzen ekranında doğru yere yerleşir.' }),
      liste,
      h('div.btn-satir', null,
        h('button.btn', { text: '+ Kopyala', on: { click: () => Ekran.ac(Kopyala, k) } }),
        h('button.btn', { text: '+ Elle kod', on: { click: () => Ekran.ac(ElleKod) } })),
      h('button.btn.ana.blok', { style: { marginTop: '12px' }, text: 'Değişiklikleri kaydet', on: { click: () => {
        Kayit.kaydet(k); tost('Kaydedildi', 'basari'); Ekran.geri(); Ekran.geri(); Ekran.ac(Saha.KumandaEkrani, { kumanda: Kayit.getir(k.id) });
      } } }));
    ciz();
    return { baslik: 'Tuşları düzenle', el };
  }

  window.Araclar = {
    HizliBulmaSec, HizliBulma, BulunanSonuc, MarkaDene, Tarama, Kopyala, ElleKod, LedPanel, Servis,
    iceAktar, irplusAc, paylas, kaydetDiyalog, Duzenle, prontoCoz, prontoYap, AILE, adresCoz
  };
})();
