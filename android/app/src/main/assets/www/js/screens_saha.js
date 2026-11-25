/* Saha sekmesi: kategoriler, marka/model listeleri, kumanda ekranı */
(function () {
  'use strict';

  // ------------------------------------------------------------ Ana ekran
  function SahaAna() {
    const el = h('div');
    const arama = h('input.arama', { type: 'search', placeholder: 'Marka ya da model ara (ör. Vestel, Beko klima)' });
    const sonuc = h('div');
    const icerik = h('div');
    let zam = null;
    arama.addEventListener('input', () => {
      clearTimeout(zam);
      zam = setTimeout(async () => {
        const q = arama.value.trim();
        if (q.length < 2) { sonuc.innerHTML = ''; icerik.hidden = false; return; }
        icerik.hidden = true;
        const liste = await DB.ara(q);
        const kayitlar = Kayit.hepsi().filter(k => Arac.sade(k.marka + ' ' + k.model + ' ' + (k.notlar || '')).includes(Arac.sade(q)));
        sonuc.innerHTML = '';
        if (kayitlar.length) {
          sonuc.append(h('div.bolum-baslik', { text: 'Ekip kayıtları' }),
            h('div.liste', null, kayitlar.slice(0, 30).map(kayitSatiri)));
        }
        sonuc.append(h('div.bolum-baslik', { text: 'Veritabanı (' + liste.length + (liste.length > 300 ? '+' : '') + ')' }),
          liste.length ? h('div.liste', null, liste.slice(0, 150).map(r => modelSatiri(r, true)))
            : h('div.bos', { text: 'Bulunamadı. Hızlı bulma ya da tarama ile deneyin.' }));
      }, 220);
    });

    const araclar = [
      ['⚡', 'Hızlı bulma', 'Markayı bilmeden aç', () => Ekran.ac(Araclar.HizliBulmaSec)],
      ['❄️', 'Klima kumandası', 'Tam kontrol paneli', () => Ekran.ac(Klima.MarkaSec)],
      ['🔎', 'Kod tarama', '256 komutu dene', () => Ekran.ac(Araclar.Tarama)],
      ['📥', 'Kopyala', 'Orijinal kumandayı oku', () => Ekran.ac(Araclar.Kopyala)],
      ['⌨️', 'Elle kod', 'Protokol / ham / Pronto', () => Ekran.ac(Araclar.ElleKod)],
      ['💡', 'LED şerit', '24 / 44 tuşlu', () => Ekran.ac(Araclar.LedPanel)],
      ['🛠️', 'Servis menüleri', 'Otel / servis tuşları', () => Ekran.ac(Araclar.Servis)],
      ['📄', 'İçe aktar', 'irplus dosyası', () => Araclar.iceAktar()]
    ];
    icerik.append(
      h('div.bolum-baslik', { text: 'Araçlar' }),
      h('div.izgara', null, araclar.map(([i, ad, alt, f]) =>
        h('button.karo', { on: { click: f } }, h('div.k-ikon', { text: i }), h('div.k-ad', { text: ad }), h('div.k-alt', { text: alt }))))
    );
    const son = Kayit.sonKullanilan();
    if (son.length) {
      icerik.append(h('div.bolum-baslik', { text: 'Son kullanılanlar' }),
        h('div.liste', null, son.slice(0, 6).map(s => h('button.satir', { on: { click: () => kumandaAc(s.id) } },
          h('div.s-ana', null, h('div.s-ad', { text: s.marka + ' ' + s.model }), h('div.s-alt', { text: (DB.IKON[s.kategori] || '') + ' ' + (s.kategoriAd || s.kategori || '') })),
          h('div.s-sag', { text: '›' })))));
    }
    const katKutu = h('div.izgara');
    icerik.append(h('div.bolum-baslik', { text: 'Kategoriler' }), katKutu);
    DB.indeks().then(i => {
      for (const c of i.categories) {
        katKutu.append(h('button.karo', { on: { click: () => Ekran.ac(MarkaListesi, { kategori: c.id, ad: c.name }) } },
          h('div.k-ikon', { text: DB.IKON[c.id] || '🔧' }), h('div.k-ad', { text: c.name }),
          h('div.k-alt', { text: c.count + ' kumanda' })));
      }
    }).catch(e => katKutu.append(h('div.bos', { text: 'Veritabanı yüklenemedi: ' + e.message })));

    el.append(arama, sonuc, icerik);
    return { baslik: 'Gün Kumanda', el };
  }

  function kayitSatiri(k) {
    return h('button.satir', { on: { click: () => kayitAc(k) } },
      h('div.s-ana', null,
        h('div.s-ad', null, (DB.IKON[k.kategori] || '') + ' ' + (k.marka || '?') + ' ' + (k.model || ''),
          k.calisti_sayisi ? h('span.rozet.yesil', { text: '✓ ' + k.calisti_sayisi }) : null),
        h('div.s-alt', { text: (k.tuslar || []).length + ' tuş · ' + (k.kaynak || 'saha') + (k.notlar ? ' · ' + k.notlar : '') })),
      h('div.s-sag', { text: '›' }));
  }

  function kayitAc(k) {
    if (k.klima && k.klima.protokol) Ekran.ac(Klima.Panel, { protokol: k.klima.protokol, model: k.klima.model, marka: k.marka, kayit: k });
    else Ekran.ac(KumandaEkrani, { kumanda: k });
  }

  function modelSatiri(r, markaGoster) {
    return h('button.satir', { on: { click: () => kumandaAc(r.id) } },
      h('div.s-ana', null,
        h('div.s-ad', { text: (markaGoster ? (DB.IKON[r.kategori] || '') + ' ' + r.marka + ' · ' : '') + (r.model || 'Genel') }),
        h('div.s-alt', { text: r.tus + ' tuş' + (r.kaynak && r.kaynak !== 'flipper' ? ' · ' + r.kaynak : '') })),
      h('div.s-sag', { text: '›' }));
  }

  async function kumandaAc(rid) {
    if (!/^[a-z]+-\d+$/.test(rid)) {
      const k = Kayit.getir(rid);
      if (k) return kayitAc(k);
    }
    try {
      const k = await DB.kumanda(rid);
      Ekran.ac(KumandaEkrani, { kumanda: k });
    } catch (e) { tost('Açılamadı: ' + e.message, 'hata'); }
  }

  // ------------------------------------------------------------ Marka listesi
  function MarkaListesi(p) {
    const el = h('div');
    const arama = h('input.arama', { type: 'search', placeholder: p.ad + ' markası ara' });
    const liste = h('div');
    el.append(arama);
    if (p.kategori === 'klima') {
      el.append(h('button.btn.ana.blok', { text: '❄️ Klima kumandası (tam kontrol, protokolle)', style: { marginBottom: '12px' },
        on: { click: () => Ekran.ac(Klima.MarkaSec) } }));
    }
    if (['tv', 'ses', 'projektor'].includes(p.kategori)) {
      el.append(h('button.btn.blok', { text: '⚡ Markayı bilmiyorum — hızlı bulma', style: { marginBottom: '12px' },
        on: { click: () => Ekran.ac(Araclar.HizliBulma, { liste: p.kategori === 'ses' ? 'audio' : p.kategori === 'projektor' ? 'projector' : 'tv' }) } }));
    }
    const ekipKayit = Kayit.hepsi().filter(k => k.kategori === p.kategori);
    if (ekipKayit.length) {
      el.append(h('div.bolum-baslik', { text: 'Ekip kayıtları' }), h('div.liste', null, ekipKayit.slice(0, 20).map(kayitSatiri)),
        h('div.bolum-baslik', { text: 'Veritabanı' }));
    }
    el.append(liste);
    let markalar = [];
    const ciz = () => {
      const q = Arac.sade(arama.value);
      liste.innerHTML = '';
      let harf = '';
      const parcalar = [];
      for (const b of markalar) {
        if (q && !Arac.sade(b.n).includes(q)) continue;
        const ilk = (b.n[0] || '#').toLocaleUpperCase('tr');
        if (ilk !== harf && !q) { harf = ilk; parcalar.push(h('div.harf', { text: harf })); }
        parcalar.push(h('button.satir', { on: { click: () => Ekran.ac(ModelListesi, { kategori: p.kategori, marka: b }) } },
          h('div.s-ana', null, h('div.s-ad', { text: b.n })), h('div.s-sag', { text: b.r.length + ' ›' })));
      }
      liste.append(h('div.liste', null, parcalar.length ? parcalar : h('div.bos', { text: 'Marka bulunamadı' })));
    };
    arama.addEventListener('input', ciz);
    DB.kategoriBilgi(p.kategori).then(c => { markalar = c.brands; ciz(); });
    return { baslik: p.ad, el };
  }

  function ModelListesi(p) {
    const b = p.marka;
    const el = h('div',
      null,
      h('p.not', { text: b.r.length > 1 ? 'Modeli bilmiyorsanız sırayla deneyin; çalışanı yıldızla kaydedin.' : '' }),
      h('div.liste', null, b.r.map(r => modelSatiri({ id: r[0], kategori: p.kategori, marka: b.n, model: r[1], tus: r[2], kaynak: r[3] }))));
    if (b.r.length > 1) {
      el.prepend(h('button.btn.ana.blok', { text: '⚡ Bu markanın tüm modellerini sırayla dene', style: { marginBottom: '10px' },
        on: { click: () => Ekran.ac(Araclar.MarkaDene, { kategori: p.kategori, marka: b }) } }));
    }
    return { baslik: b.n, el };
  }

  // ------------------------------------------------------------ Kumanda ekranı
  function KumandaEkrani(p) {
    const k = p.kumanda;
    const tuslar = k.tuslar || [];
    Kayit.sonKullanilan({ id: k.id, marka: k.marka, model: k.model, kategori: k.kategori });
    let gorunum = Ayar.get('gorunum', 'duzen');
    const el = h('div.kumanda');
    const govde = h('div');

    const ust = h('div.k-ust', null,
      h('div', null,
        h('div', { style: { fontWeight: '700', color: 'var(--buz)' }, text: (k.marka || '') + ' ' + (k.model || '') }),
        h('div.not', { text: tuslar.length + ' tuş' + (k.yerlesik ? ' · veritabanı' : ' · ' + (k.kaynak || 'kayıt')) })),
      h('div', { style: { display: 'flex', gap: '6px' } },
        h('button.cip', { text: gorunum === 'duzen' ? '☰ Liste' : '⊞ Düzen', on: { click: e => {
          gorunum = gorunum === 'duzen' ? 'liste' : 'duzen'; Ayar.set('gorunum', gorunum);
          e.target.textContent = gorunum === 'duzen' ? '☰ Liste' : '⊞ Düzen'; ciz();
        } } }),
        h('button.cip', { text: '⋯', on: { click: () => menu() } })));

    function sinyalBul(anah) { return tuslar.find(s => IR.anahtar(s[0]) === anah); }

    function tus(sinyal, sinif, etiket, tekrar) {
      const b = h('button.tus' + (sinif ? '.' + sinif : ''), { text: etiket != null ? etiket : sinyal[0] });
      return IR.bas(b, () => sinyal, { tekrar });
    }

    function ciz() {
      govde.innerHTML = '';
      if (!tuslar.length) { govde.append(h('div.bos', { text: 'Bu kumandada tuş yok.' })); return; }
      if (gorunum === 'liste' || k.kategori === 'klima' && !sinyalBul('UP')) {
        govde.append(h('div.tuslar-oto', null, tuslar.map(s => {
          const a = IR.anahtar(s[0]);
          return tus(s, a === 'POWER' || a === 'POWER_OFF' ? 'kirmizi' : '', null, /VOL|CH_/.test(a || ''));
        })));
        return;
      }
      const kullanilan = new Set();
      const al = (a) => { const s = sinyalBul(a); if (s) kullanilan.add(s); return s; };

      // Üst sıra
      const guc = al('POWER') || al('POWER_ON');
      const ustSira = h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '6px' } });
      ustSira.append(guc ? tus(guc, 'guc', '⏻') : h('div', { style: { width: '64px' } }));
      const ustSag = h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' } });
      for (const a of ['POWER_OFF', 'SOURCE', 'MUTE', 'HOME']) {
        const s = al(a);
        if (!s) continue;
        const et = IR.ETIKET[a] || s[0];
        const b = tus(s, et.length <= 2 ? 'yuvarlak' : '', et);
        if (et.length > 2) Object.assign(b.style, { minHeight: '54px', padding: '0 16px', borderRadius: '27px' });
        ustSag.append(b);
      }
      ustSira.append(ustSag);
      govde.append(ustSira);

      // Yön tuşları
      const yon = { UP: al('UP'), DOWN: al('DOWN'), LEFT: al('LEFT'), RIGHT: al('RIGHT'), OK: al('OK') };
      if (yon.UP || yon.DOWN || yon.OK) {
        const d = h('div.dpad');
        if (yon.UP) d.append(tus(yon.UP, 'yukari', '▲', true));
        if (yon.DOWN) d.append(tus(yon.DOWN, 'asagi', '▼', true));
        if (yon.LEFT) d.append(tus(yon.LEFT, 'sol', '◀', true));
        if (yon.RIGHT) d.append(tus(yon.RIGHT, 'sag', '▶', true));
        if (yon.OK) d.append(tus(yon.OK, 'ok', 'OK'));
        govde.append(d);
      }
      const nav = ['BACK', 'MENU', 'EXIT', 'INFO', 'GUIDE', 'SETTINGS'].map(a => [a, al(a)]).filter(x => x[1]);
      if (nav.length) govde.append(h('div.tuslar4', null, nav.map(([a, s]) => tus(s, '', IR.ETIKET[a] || s[0]))));

      // Ses ve kanal
      const vu = al('VOL_UP'), vd = al('VOL_DOWN'), cu = al('CH_UP'), cd = al('CH_DOWN');
      if (vu || vd || cu || cd) {
        const roker = (ad, a, b) => h('div.roker', null, a ? tus(a, '', '+', true) : null, h('div.r-ad', { text: ad }), b ? tus(b, '', '−', true) : null);
        govde.append(h('div.rokerler', null,
          (vu || vd) ? roker('SES', vu, vd) : h('div'),
          h('div.orta-tuslar', null, ['SUBTITLE'].map(a => al(a)).filter(Boolean).map(s => tus(s, 'yuvarlak', 'CC'))),
          (cu || cd) ? roker('KANAL', cu, cd) : h('div')));
      }
      // Medya
      const medya = ['REW', 'PLAY', 'PLAY_PAUSE', 'PAUSE', 'STOP', 'FF', 'PREV', 'NEXT', 'REC'].map(a => [a, al(a)]).filter(x => x[1]);
      if (medya.length) govde.append(h('div.tuslar4', null, medya.map(([a, s]) => tus(s, '', IR.ETIKET[a]))));
      // Renkler
      const renk = [['RED', 'kirmizi'], ['GREEN', 'yesil'], ['YELLOW', 'sari'], ['BLUE', 'mavi']].map(([a, c]) => [c, al(a)]).filter(x => x[1]);
      if (renk.length) govde.append(h('div.tuslar4', null, renk.map(([c, s]) => tus(s, c, ''))));
      // Rakamlar
      const rakam = ['1', '2', '3', '4', '5', '6', '7', '8', '9', null, '0', null].map(a => a == null ? null : al(a));
      if (rakam.filter(Boolean).length >= 5) {
        govde.append(h('div.tuslar3', null, rakam.map(s => s ? tus(s, '', s[0].replace(/\D/g, '') || s[0]) : h('div'))));
      }
      // Kalanlar
      const kalan = tuslar.filter(s => !kullanilan.has(s));
      if (kalan.length) {
        govde.append(h('div.bolum-baslik', { text: 'Diğer tuşlar' }),
          h('div.tuslar-oto', null, kalan.map(s => tus(s, '', s[0].replace(/_/g, ' ')))));
      }
    }

    async function menu() {
      const secim = await sec('Kumanda', [
        { ad: '✓ Bu kumanda çalıştı', alt: 'Ekibe bildirilir, ilk sıraya çıkar', deger: 'calisti' },
        { ad: '★ Kaydet', alt: k.yerlesik ? 'Kendi kayıtlarına ekle (isim, müşteri, foto)' : 'Bilgileri düzenle', deger: 'kaydet' },
        !k.yerlesik ? { ad: '✎ Tuşları düzenle', alt: 'İsim, sıra, ekle, sil', deger: 'duzenle' } : null,
        { ad: '⤴ Paylaş (irplus dosyası)', deger: 'paylas' },
        !k.yerlesik ? { ad: '🗑 Sil', deger: 'sil' } : null
      ].filter(Boolean));
      if (secim === 'calisti') {
        Senk.sahaKaydi({ kumanda_id: k.yerlesik ? null : k.id, veritabani_id: k.yerlesik ? k.id : null, calisti: true });
        if (k.yerlesik) Araclar.kaydetDiyalog(k, { calisti: true }); else tost('Kaydedildi, teşekkürler!', 'basari');
      } else if (secim === 'kaydet') Araclar.kaydetDiyalog(k);
      else if (secim === 'duzenle') Ekran.ac(Araclar.Duzenle, { kumanda: k });
      else if (secim === 'paylas') Araclar.paylas(k);
      else if (secim === 'sil') {
        if (await onay('Silinsin mi?', (k.marka || '') + ' ' + (k.model || '') + ' ekipten de silinir.', 'Sil', true)) {
          Kayit.sil(k.id); Ekran.geri(); tost('Silindi');
        }
      }
    }

    el.append(ust, govde);
    ciz();
    return { baslik: k.marka || 'Kumanda', el, sesTuslari: true, ekranAcik: true,
      fizikselSes: (tus) => { const s = sinyalBul(tus); if (s) IR.gonder(s); } };
  }

  window.Saha = { SahaAna, MarkaListesi, ModelListesi, KumandaEkrani, kumandaAc, kayitSatiri, kayitAc };
})();
