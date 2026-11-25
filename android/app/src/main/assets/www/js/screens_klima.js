/* Klima: marka seçimi, protokol bulma (bip ile), tam kontrol paneli */
(function () {
  'use strict';

  function MarkaSec() {
    const el = h('div');
    const kayitli = Kayit.hepsi().filter(k => k.kategori === 'klima' && k.klima && k.klima.protokol);
    el.append(h('div.uyari', { text: 'Klima kumandası her basışta tüm ayarı (sıcaklık, mod, fan) gönderir. Önce markayı seçin; ' +
      'uygulama o markanın protokollerini sırayla dener, klima "bip" deyince doğru protokol bulunmuş olur.' }));
    if (kayitli.length) {
      el.append(h('div.bolum-baslik', { text: 'Kayıtlı klimalar' }), h('div.liste', null, kayitli.map(k =>
        h('button.satir', { on: { click: () => Ekran.ac(Panel, { protokol: k.klima.protokol, model: k.klima.model, marka: k.marka, kayit: k }) } },
          h('div.s-ana', null, h('div.s-ad', { text: '❄️ ' + k.marka + ' ' + (k.model || '') }),
            h('div.s-alt', { text: k.klima.protokol + (k.notlar ? ' · ' + k.notlar : '') })), h('div.s-sag', { text: '›' })))));
    }
    const arama = h('input.arama', { type: 'search', placeholder: 'Klima markası ara' });
    const liste = h('div.liste');
    const ciz = () => {
      const q = Arac.sade(arama.value);
      liste.innerHTML = '';
      const markalar = IR.KLIMA_MARKA.slice().sort((a, b) => a[0].localeCompare(b[0], 'tr'));
      for (const [m, p] of markalar) {
        if (q && !Arac.sade(m).includes(q)) continue;
        liste.append(h('button.satir', { on: { click: () => Ekran.ac(Bul, { marka: m, adaylar: p }) } },
          h('div.s-ana', null, h('div.s-ad', { text: m }), h('div.s-alt', { text: p.length + ' protokol: ' + p.slice(0, 3).join(', ') + (p.length > 3 ? '…' : '') })),
          h('div.s-sag', { text: '›' })));
      }
    };
    arama.addEventListener('input', ciz);
    el.append(
      h('div.btn-satir', null,
        h('button.btn.ana', { text: '❓ Markayı bilmiyorum', on: { click: () => Ekran.ac(Bul, { marka: 'Bilinmeyen', adaylar: IR.acProtokoller() }) } }),
        h('button.btn', { text: '⚙ Protokolü seç', on: { click: protokolSec } })),
      h('div.bolum-baslik', { text: 'Markalar' }), arama, liste);
    ciz();
    return { baslik: 'Klima kumandası', el };
  }

  async function protokolSec() {
    const p = await sec('Protokol', IR.acProtokoller().map(x => ({ ad: x, deger: x })));
    if (p) Ekran.ac(Panel, { protokol: p, marka: '' });
  }

  // ------------------------------------------------------------ Protokol bulma
  function Bul(p) {
    const tumu = IR.acProtokoller();
    let adaylar = (p.adaylar || []).filter(x => tumu.includes(x));
    if (!adaylar.length) adaylar = tumu.slice();
    let i = 0;
    let oto = false;
    let zam = null;
    const derece = 24;
    const el = h('div');
    const sayac = h('div.not.ortala');
    const ad = h('div.buyuk-sayi');
    const ilerleme = h('div.ilerleme', null, h('div'));
    const durum = h('p.not.ortala');
    const otoBtn = h('button.btn', { text: '▶ Otomatik' });

    function gonder() {
      const pr = adaylar[i];
      ad.textContent = pr.replace(/_/g, ' ');
      sayac.textContent = (i + 1) + ' / ' + adaylar.length;
      ilerleme.firstChild.style.width = ((i + 1) / adaylar.length * 100) + '%';
      const hata = IR.klimaGonder({ protokol: pr, guc: true, mod: 1, derece, fan: 0 });
      durum.textContent = hata ? hata : 'Gönderildi: Açık · Soğutma · ' + derece + '°C. Klima bip dedi mi?';
      Yerel.titre(25);
    }
    function sonraki() {
      if (i < adaylar.length - 1) { i++; gonder(); }
      else {
        durOto();
        const kalan = tumu.filter(x => !adaylar.includes(x));
        durum.textContent = 'Liste bitti.';
        if (kalan.length && p.marka !== 'Bilinmeyen') {
          onay('Bulunamadı', 'Bu markanın bilinen protokolleri tutmadı. Kalan ' + kalan.length + ' protokol de denensin mi?', 'Hepsini dene')
            .then(e => { if (e) { adaylar = adaylar.concat(kalan); i++; gonder(); } });
        }
      }
    }
    function durOto() { oto = false; clearInterval(zam); otoBtn.textContent = '▶ Otomatik'; }
    otoBtn.addEventListener('click', () => {
      if (oto) return durOto();
      oto = true; otoBtn.textContent = '⏸ Durdur';
      zam = setInterval(sonraki, 3200);
    });

    el.append(
      h('div.kutu.ortala', null,
        h('div.not', { text: p.marka + ' — klimaya doğrultun' }), ad, sayac, ilerleme, durum),
      h('button.btn.yesil.blok', { text: '✓ Bip dedi / çalıştı', style: { padding: '18px', fontSize: '17px' }, on: { click: () => {
        durOto();
        const pr = adaylar[i];
        Senk.sahaKaydi({ calisti: true, notlar: 'Klima protokol bulundu: ' + p.marka + ' → ' + pr });
        Ekran.yigin[Ekran.sekme].pop();
        Ekran.ac(Panel, { protokol: pr, marka: p.marka === 'Bilinmeyen' ? '' : p.marka, yeniBulundu: true });
      } } }),
      h('div.btn-satir', null,
        h('button.btn', { text: '↻ Tekrar gönder', on: { click: gonder } }),
        h('button.btn.ana', { text: 'Sonraki ›', on: { click: () => { durOto(); sonraki(); } } })),
      h('div.btn-satir', null, otoBtn,
        h('button.btn', { text: '‹ Önceki', on: { click: () => { durOto(); if (i > 0) { i--; gonder(); } } } })),
      h('p.not', { style: { marginTop: '14px' }, text: 'İpucu: Klima kapalıyken deneyin. Doğru protokolde klima açılır ya da bip sesi verir. ' +
        'Sonra paneldeki model seçimini de deneyebilirsiniz.' }));
    setTimeout(gonder, 300);
    return { baslik: 'Protokol bul', el, ekranAcik: true, kapat: durOto };
  }

  // ------------------------------------------------------------ Kontrol paneli
  function Panel(p) {
    const anahtar = 'klima_' + p.protokol;
    const d = Object.assign({ protokol: p.protokol, model: p.model == null ? null : p.model, guc: false, mod: 1, derece: 24, fan: 0,
      swingv: -1, swingh: -1, sessiz: false, turbo: false, eko: false, isik: true, temizle: false }, Ayar.get(anahtar, {}));
    d.protokol = p.protokol;
    if (p.model != null) d.model = p.model;
    // Protokol bulunurken klimaya "Açık, soğutma, 24°C" gönderildi; panel o durumdan başlar
    if (p.yeniBulundu) Object.assign(d, { guc: true, mod: 1, derece: 24, fan: 0 });
    const el = h('div.kumanda');
    let zam = null;

    const derece = h('div.klima-derece');
    const durumSatiri = h('div.klima-durum');
    const ekran = h('div.klima-ekran', null, h('div.not', { text: (p.marka ? p.marka + ' · ' : '') + p.protokol.replace(/_/g, ' ') }), derece, durumSatiri);

    function guncelle() {
      ekran.classList.toggle('kapali', !d.guc);
      derece.innerHTML = '';
      derece.append(String(d.derece), h('small', { text: '°C' }));
      durumSatiri.innerHTML = '';
      const mod = IR.MODLAR.find(m => m[0] === String(d.mod));
      durumSatiri.append(...[
        h('span.rozet' + (d.guc ? '.yesil' : ''), { text: d.guc ? 'AÇIK' : 'KAPALI' }),
        h('span.rozet.hardal', { text: (mod ? mod[2] + ' ' + mod[1] : '') }),
        h('span.rozet', { text: 'Fan: ' + IR.FANLAR.find(f => f[0] === String(d.fan))[1] }),
        d.swingv !== -1 ? h('span.rozet', { text: 'Dikey: ' + (IR.SWINGV.find(s => s[0] === String(d.swingv)) || ['', '?'])[1] }) : null,
        d.turbo ? h('span.rozet', { text: 'Turbo' }) : null, d.sessiz ? h('span.rozet', { text: 'Sessiz' }) : null,
        d.eko ? h('span.rozet', { text: 'Eko' }) : null].filter(Boolean));
      grupGuncelle();
    }
    function gonder(hemen) {
      Ayar.set(anahtar, d);
      guncelle();
      clearTimeout(zam);
      const f = () => IR.klimaGonder(d);
      if (hemen) f(); else zam = setTimeout(f, 280);
      Yerel.titre(15);
    }

    const gucBtn = h('button.tus.guc', { text: '⏻', on: { click: () => { d.guc = !d.guc; gonder(true); } } });
    const grupGuncelleyiciler = [];
    function grup(baslik, secenekler, alan) {
      const kutu = h('div.secim-grup');
      const butonlar = secenekler.map(([v, ad, ikon]) => h('button.secim', { text: (ikon ? ikon + ' ' : '') + ad, on: { click: () => {
        d[alan] = Number(v); if (alan === 'mod') d.guc = true; gonder();
      } } }));
      kutu.append(...butonlar);
      grupGuncelleyiciler.push(() => butonlar.forEach((b, i) => b.classList.toggle('secili', String(d[alan]) === secenekler[i][0])));
      return h('div', null, h('div.bolum-baslik', { text: baslik }), kutu);
    }
    function anahtarBtn(ad, alan) {
      const b = h('button.secim', { text: ad, on: { click: () => { d[alan] = !d[alan]; gonder(); } } });
      grupGuncelleyiciler.push(() => b.classList.toggle('secili', !!d[alan]));
      return b;
    }
    function grupGuncelle() { grupGuncelleyiciler.forEach(f => f()); }

    const derecePanel = h('div.derece-tus', null,
      IR.bas(h('button.tus', { text: '−' }), () => () => { d.derece = Math.max(16, d.derece - 1); gonder(); }, { tekrar: true }),
      gucBtn,
      IR.bas(h('button.tus', { text: '+' }), () => () => { d.derece = Math.min(30, d.derece + 1); gonder(); }, { tekrar: true }));

    el.append(ekran, derecePanel,
      grup('Mod', IR.MODLAR, 'mod'),
      grup('Fan', IR.FANLAR, 'fan'),
      grup('Dikey kanat', IR.SWINGV, 'swingv'),
      grup('Yatay kanat', IR.SWINGH, 'swingh'),
      h('div.bolum-baslik', { text: 'Özellikler' }),
      h('div.secim-grup', null, anahtarBtn('Turbo', 'turbo'), anahtarBtn('Sessiz', 'sessiz'), anahtarBtn('Eko', 'eko'),
        anahtarBtn('Işık', 'isik'), anahtarBtn('Temizlik', 'temizle')));

    const modeller = IR.KLIMA_MODEL[p.protokol];
    if (modeller) {
      const s = h('select.giris', null, h('option', { value: '', text: 'Varsayılan' }),
        modeller.map(([v, ad]) => h('option', { value: String(v), text: ad, selected: String(d.model) === String(v) })));
      s.addEventListener('change', () => { d.model = s.value === '' ? null : Number(s.value); gonder(true); });
      el.append(h('label.alan', { text: 'Kumanda modeli (çalışmayan tuş varsa değiştirin)' }), s);
    }
    el.append(h('div.btn-satir', null,
      h('button.btn.ana', { text: '★ Kaydet', on: { click: () => Araclar.kaydetDiyalog({
        id: p.kayit ? p.kayit.id : null, kategori: 'klima', marka: p.marka || (p.kayit && p.kayit.marka) || '',
        model: p.kayit ? p.kayit.model : '', tuslar: [], klima: { protokol: p.protokol, model: d.model },
        kaynak: p.kayit ? p.kayit.kaynak : 'saha', notlar: p.kayit ? p.kayit.notlar : '', kisi_id: p.kayit ? p.kayit.kisi_id : null
      }) } }),
      h('button.btn', { text: '↻ Tekrar gönder', on: { click: () => gonder(true) } })));
    if (p.yeniBulundu) setTimeout(() => tost('Protokol bulundu: ' + p.protokol + '. Kaydetmeyi unutmayın.', 'basari'), 300);
    guncelle();
    return { baslik: 'Klima', el, ekranAcik: true, sesTuslari: true,
      fizikselSes: (t) => { d.derece = t === 'VOL_UP' ? Math.min(30, d.derece + 1) : Math.max(16, d.derece - 1); gonder(); } };
  }

  window.Klima = { MarkaSec, Bul, Panel };
})();
