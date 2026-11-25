/* Akıllı TV: keşif, eşleştirme, ağ kumandası, dokunmatik/havada fare, klavye, ses, uygulamalar,
   Bluetooth fare/klavye modu ve TV kimlik kartı */
(function () {
  'use strict';

  const PLATFORM = {
    androidtv: ['Android / Google TV', '🤖'], webos: ['LG webOS', '🅻'], tizen: ['Samsung Tizen', '🆂'],
    vestel: ['Vestel ailesi', '🆅'], sony: ['Sony Bravia', '🅢']
  };
  const tvler = () => Ayar.get('tvler', []);
  function tvKaydet(t) {
    const l = tvler().filter(x => x.host !== t.host);
    l.unshift(t);
    Ayar.set('tvler', l);
  }

  // ------------------------------------------------------------ Ana ekran
  function AkilliAna() {
    const el = h('div');
    const liste = h('div.liste');
    const bulunan = h('div');
    function ciz() {
      liste.innerHTML = '';
      const l = tvler();
      if (!l.length) liste.append(h('div.bos', { text: 'Henüz TV yok. Aynı Wi-Fi ağındaki TV\'leri aramak için "Ağda ara"ya dokunun.' }));
      for (const t of l) {
        liste.append(h('div.satir', null,
          h('button.s-ana', { style: { textAlign: 'left' }, on: { click: () => baglan(t) } },
            h('div.s-ad', { text: (PLATFORM[t.platform] || ['', '📺'])[1] + ' ' + (t.name || t.host) }),
            h('div.s-alt', { text: (PLATFORM[t.platform] || [t.platform])[0] + ' · ' + t.host + (t.model ? ' · ' + t.model : '') })),
          h('button.btn', { text: '⋯', on: { click: async () => {
            const s = await sec(t.name || t.host, [{ ad: 'Bağlan', deger: 'b' }, { ad: 'Ağdan aç (Wake-on-LAN)', deger: 'w' },
              { ad: 'Adını değiştir', deger: 'a' }, { ad: 'Listeden kaldır', deger: 's' }]);
            if (s === 'b') baglan(t);
            if (s === 'w') { const e = Yerel.cagri('tvWake', t.host); tost(e || 'Açma paketi gönderildi', e ? 'hata' : 'basari'); }
            if (s === 'a') { const a = await sor('TV adı', null, t.name); if (a) { t.name = a; tvKaydet(t); ciz(); } }
            if (s === 's') { Ayar.set('tvler', tvler().filter(x => x.host !== t.host)); ciz(); }
          } } })));
      }
    }
    async function ara() {
      bulunan.innerHTML = '';
      bulunan.append(h('div.not.ortala', { text: 'Aranıyor… (TV açık ve aynı ağda olmalı)' }));
      const r = await Yerel.sozlu('tvScan');
      bulunan.innerHTML = '';
      const kayitli = new Set(tvler().map(t => t.host));
      const yeni = (r || []).filter(t => !kayitli.has(t.host));
      if (!yeni.length) { bulunan.append(h('div.not.ortala', { text: (r && r.length ? 'Yeni TV yok.' : 'TV bulunamadı. IP ile eklemeyi deneyin.') })); return; }
      bulunan.append(h('div.bolum-baslik', { text: 'Bulunan TV\'ler' }), h('div.liste', null, yeni.map(t =>
        h('button.satir', { on: { click: () => { tvKaydet(t); ciz(); bulunan.innerHTML = ''; baglan(t); } } },
          h('div.s-ana', null, h('div.s-ad', { text: (PLATFORM[t.platform] || ['', '📺'])[1] + ' ' + (t.name || t.host) }),
            h('div.s-alt', { text: (PLATFORM[t.platform] || [t.platform])[0] + ' · ' + t.host })), h('div.s-sag', { text: '+' })))));
    }
    async function ipEkle() {
      const ip = await sor('TV IP adresi', 'TV ayarlarında Ağ > Durum bölümünde görünür.', '192.168.1.', { klavye: 'decimal' });
      if (!ip) return;
      tost('Kontrol ediliyor…');
      const r = await Yerel.sozlu('tvProbe', ip.trim());
      let platform = r && r.platform;
      if (!PLATFORM[platform]) {
        platform = await sec('TV türü bulunamadı, seçin', Object.entries(PLATFORM).map(([k, v]) => ({ ad: v[1] + ' ' + v[0], deger: k })));
        if (!platform) return;
      }
      const t = { host: ip.trim(), platform, name: (PLATFORM[platform] || [''])[0] };
      tvKaydet(t); ciz(); baglan(t);
    }
    el.append(
      h('div.btn-satir', null, h('button.btn.ana', { text: '📡 Ağda ara', on: { click: ara } }), h('button.btn', { text: '+ IP ile ekle', on: { click: ipEkle } })),
      bulunan, h('div.bolum-baslik', { text: 'TV\'lerim' }), liste,
      h('div.bolum-baslik', { text: 'Her TV ile' }),
      h('button.satir', { on: { click: () => Ekran.ac(BtModu) } },
        h('div.s-ana', null, h('div.s-ad', { text: '🖱️ Bluetooth fare ve klavye' }),
          h('div.s-alt', { text: 'Telefon TV\'ye Bluetooth fare/klavye olarak bağlanır; ağ gerekmez' })), h('div.s-sag', { text: '›' })),
      h('p.not', { style: { marginTop: '14px' }, text: 'Android TV\'lerde ağ üzerinden imleç için TV\'ye "Gün Kumanda TV Yardımcısı" kurulabilir (Ayarlar > Yardım).' }));
    ciz();
    return { baslik: 'Akıllı TV', el };
  }

  async function baglan(t) {
    if (t.platform === 'sony') {
      const psk = await sor('Sony ön paylaşımlı anahtar (PSK)', 'TV: Ayarlar > Ağ > Ev ağı > IP kontrolü > Önceden Paylaşılan Anahtar', Ayar.get('psk_' + t.host, '0000'));
      if (psk == null) return;
      Ayar.set('psk_' + t.host, psk);
      Yerel.cagri('tvSonyPsk', t.host, psk);
    }
    if (t.platform === 'androidtv' && !Ayar.get('eslesti_' + t.host, false)) return Ekran.ac(Eslestir, { tv: t });
    const kapat = sayfa('Bağlanıyor', h('div', null, h('p.not', { text: (t.name || t.host) + ' — ' +
      (t.platform === 'webos' || t.platform === 'tizen' ? 'TV ekranında çıkan izin isteğini onaylayın.' : 'lütfen bekleyin…') })), { zorunlu: true });
    const r = await Yerel.sozlu('tvConnect', t.host, t.platform);
    kapat();
    if (r && r.ok) { Ayar.set('sonTv', t.host); Ekran.ac(TvKumanda, { tv: t }); }
    else if (t.platform === 'androidtv' && /Eşleştirme/i.test((r && r.error) || '')) {
      Ayar.set('eslesti_' + t.host, false); Ekran.ac(Eslestir, { tv: t });
    } else tost((r && r.error) || 'Bağlanılamadı', 'hata');
  }

  // ------------------------------------------------------------ Android TV eşleştirme
  function Eslestir(p) {
    const t = p.tv;
    const el = h('div');
    const kod = h('input.giris', { placeholder: '3F9A1C', maxlength: '6', style: { fontSize: '26px', textAlign: 'center', letterSpacing: '6px', textTransform: 'uppercase' } });
    const durum = h('p.not.ortala', { text: 'TV\'ye eşleştirme isteği gönderiliyor…' });
    const tamam = h('button.btn.ana.blok', { text: 'Eşleştir', disabled: true });
    el.append(h('div.kutu.ortala', null, h('div', { style: { fontSize: '44px' }, text: '🤖' }),
      h('div', { style: { fontWeight: '700' }, text: t.name || t.host }), durum), kod, h('div', { style: { height: '12px' } }), tamam,
      h('button.btn.blok', { style: { marginTop: '10px' }, text: '↻ Kodu yeniden iste', on: { click: basla } }));
    async function basla() {
      durum.textContent = 'TV\'ye eşleştirme isteği gönderiliyor…';
      const r = await Yerel.sozlu('tvPairStart', t.host);
      if (r && r.ok) { durum.textContent = 'TV ekranındaki 6 haneli kodu yazın.'; tamam.disabled = false; kod.focus(); }
      else durum.textContent = 'Başlatılamadı: ' + ((r && r.error) || '') + ' — TV açık ve aynı ağda mı?';
    }
    tamam.addEventListener('click', async () => {
      tamam.disabled = true;
      const r = await Yerel.sozlu('tvPairFinish', t.host, kod.value.trim());
      if (r && r.ok) {
        Ayar.set('eslesti_' + t.host, true);
        tost('Eşleşti', 'basari');
        Ekran.yigin[Ekran.sekme].pop();
        baglan(t);
      } else { tamam.disabled = false; tost((r && r.error) || 'Eşleşmedi', 'hata'); }
    });
    setTimeout(basla, 200);
    return { baslik: 'Eşleştir', el };
  }

  // ------------------------------------------------------------ Ortak giriş bileşenleri
  /** Dokunmatik alan: sürükle = imleç, dokun = tıkla, iki parmak = kaydır, uzun bas = sağ tık (BT) */
  function dokunmatik(hedef) {
    const alan = h('div.dokunmatik', null, h('div.ipucu', { text: 'Sürükle: imleç · Dokun: tıkla · İki parmak: kaydır' }), h('div.iz'));
    const iz = alan.querySelector('.iz');
    const noktalar = new Map();
    let toplamHareket = 0, basZaman = 0, sonX = 0, sonY = 0, kalanX = 0, kalanY = 0;
    const hiz = () => Ayar.get('dokunHiz', 1.6);
    alan.addEventListener('pointerdown', e => {
      alan.setPointerCapture(e.pointerId);
      noktalar.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (noktalar.size === 1) { toplamHareket = 0; basZaman = Date.now(); }
      sonX = e.clientX; sonY = e.clientY;
      alan.classList.add('basili');
      const r = alan.getBoundingClientRect();
      iz.style.left = (e.clientX - r.left) + 'px'; iz.style.top = (e.clientY - r.top) + 'px';
    });
    alan.addEventListener('pointermove', e => {
      const n = noktalar.get(e.pointerId);
      if (!n) return;
      const dx = e.clientX - n.x, dy = e.clientY - n.y;
      n.x = e.clientX; n.y = e.clientY;
      toplamHareket += Math.abs(dx) + Math.abs(dy);
      const r = alan.getBoundingClientRect();
      iz.style.left = (e.clientX - r.left) + 'px'; iz.style.top = (e.clientY - r.top) + 'px';
      if (noktalar.size >= 2) { hedef.kaydir(-dy); return; }
      // ivmeli hareket
      const v = Math.sqrt(dx * dx + dy * dy);
      const k = hiz() * (1 + Math.min(v, 40) / 16);
      kalanX += dx * k; kalanY += dy * k;
      const ix = Math.trunc(kalanX), iy = Math.trunc(kalanY);
      if (ix || iy) { kalanX -= ix; kalanY -= iy; hedef.hareket(ix, iy); }
    });
    const bitir = e => {
      noktalar.delete(e.pointerId);
      if (noktalar.size === 0) {
        alan.classList.remove('basili');
        const sure = Date.now() - basZaman;
        if (toplamHareket < 12 && sure < 300) { Yerel.titre(12); hedef.tikla(1); }
        else if (toplamHareket < 12 && sure > 600 && hedef.sagTik) { Yerel.titre(30); hedef.sagTik(); }
      }
    };
    alan.addEventListener('pointerup', bitir);
    alan.addEventListener('pointercancel', bitir);
    return alan;
  }

  /** Basılı tutulunca havada fareyi devreye alan büyük düğme */
  function havaDugmesi(hedefAdi, tikla) {
    const b = h('button.hava-btn', { html: '✋ Basılı tutup telefonu oynatın<br><small>Bırakınca tıklamak için kısa dokunun</small>' });
    let bas = 0;
    b.addEventListener('pointerdown', e => {
      e.preventDefault(); b.setPointerCapture(e.pointerId);
      bas = Date.now(); b.classList.add('aktif');
      Yerel.cagri('airMode', 'fare'); Yerel.cagri('airEngage', true);
    });
    const birak = () => {
      b.classList.remove('aktif');
      Yerel.cagri('airEngage', false);
      if (Date.now() - bas < 220) { Yerel.titre(12); tikla(); }
    };
    b.addEventListener('pointerup', birak);
    b.addEventListener('pointercancel', birak);
    return b;
  }

  /** Telefonu ses düğmesi gibi çevirme alanı */
  function sesDugmesi() {
    const b = h('button.hava-btn', { style: { height: '76px' }, html: '🎚️ Basılı tutup telefonu düğme gibi çevirin (ses)' });
    b.addEventListener('pointerdown', e => {
      e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('aktif');
      Yerel.cagri('airMode', 'dugme'); Yerel.cagri('airEngage', true);
    });
    const birak = () => { b.classList.remove('aktif'); Yerel.cagri('airEngage', false); Yerel.cagri('airMode', 'fare'); };
    b.addEventListener('pointerup', birak); b.addEventListener('pointercancel', birak);
    return b;
  }

  function havaAyarlari() {
    const a = Ayar.get('hava', { hassasiyet: 1, ivme: 1, tersY: false, surekli: false, jestler: true });
    const uygula = () => { Ayar.set('hava', a); Yerel.cagri('airConfig', JSON.stringify(a)); };
    uygula();
    const kaydirici = (ad, alan, min, max, adim) => {
      const r = h('input', { type: 'range', min, max, step: adim, value: String(a[alan]) });
      r.addEventListener('input', () => { a[alan] = Number(r.value); uygula(); });
      return h('div', null, h('label.alan', { text: ad }), r);
    };
    const anahtarK = (ad, alan) => {
      const c = h('input', { type: 'checkbox', checked: !!a[alan] });
      c.addEventListener('change', () => { a[alan] = c.checked; uygula(); });
      return h('label.anahtar', null, h('span', { text: ad }), c);
    };
    const dh = h('input', { type: 'range', min: '0.6', max: '4', step: '0.1', value: String(Ayar.get('dokunHiz', 1.6)) });
    dh.addEventListener('input', () => Ayar.set('dokunHiz', Number(dh.value)));
    return h('div', null,
      kaydirici('Havada fare hassasiyeti', 'hassasiyet', '0.3', '3', '0.1'),
      kaydirici('Hızlanma (hızlı harekette daha uzağa gider)', 'ivme', '0', '2.5', '0.1'),
      h('div', null, h('label.alan', { text: 'Dokunmatik alan hızı' }), dh),
      anahtarK('Yukarı/aşağı ters', 'tersY'),
      anahtarK('Havada fare sürekli açık (düğmesiz)', 'surekli'),
      anahtarK('Hareket kısayolları (bilek fiskesi: kanal, ters çevir: sessiz)', 'jestler'));
  }

  // ------------------------------------------------------------ TV kumandası
  function TvKumanda(p) {
    const t = p.tv;
    let sekme = Ayar.get('tvSekme', 'kumanda');
    const el = h('div.kumanda');
    const govde = h('div');
    const tabs = h('div.mod-sekme');
    const baglanti = h('span.cip.var', { text: '● Bağlı' });
    const isaretci = () => Yerel.cagri('tvHasPointer');
    const bt = () => Yerel.cagri('hidConnected');

    const hedef = {
      hareket(dx, dy) { if (!Yerel.cagri('tvPointer', dx, dy) && bt()) Yerel.cagri('hidMove', dx, dy); },
      tikla() { if (!Yerel.cagri('tvClick')) { if (bt()) Yerel.cagri('hidClick', 1); else tus('OK'); } },
      kaydir(v) { if (!Yerel.cagri('tvScroll', 0, Math.round(v)) && bt()) Yerel.cagri('hidScroll', Math.round(-v / 8)); },
      sagTik() { if (bt()) Yerel.cagri('hidClick', 2); else tus('BACK'); }
    };
    function tus(ad) {
      Yerel.titre(14);
      if (!Yerel.cagri('tvKey', ad)) {
        if (bt() && Yerel.cagri('hidKey', ad)) return;
        tost('Bu TV bu tuşu desteklemiyor: ' + ad, 'hata');
      }
    }
    const T = (ad, etiket, sinif, tekrar) => {
      const b = h('button.tus' + (sinif ? '.' + sinif : ''), { text: etiket });
      return IR.bas(b, () => () => tus(ad), { tekrar });
    };

    const sekmeler = [['kumanda', 'Kumanda'], ['fare', 'Fare'], ['klavye', 'Klavye'], ['uygulama', 'Uygulamalar']];
    sekmeler.forEach(([k, ad]) => tabs.append(h('button' + (k === sekme ? '.secili' : ''), { text: ad, on: { click: e => {
      sekme = k; Ayar.set('tvSekme', k);
      tabs.querySelectorAll('button').forEach(b => b.classList.remove('secili')); e.target.classList.add('secili'); ciz();
    } } })));

    function ciz() {
      govde.innerHTML = '';
      Yerel.cagri('airStop');
      if (sekme === 'kumanda') {
        govde.append(
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0' } },
            T('POWER', '⏻', 'guc'),
            h('div', { style: { display: 'flex', gap: '8px' } }, T('HOME', '⌂', 'yuvarlak'), T('SOURCE', '⇄', 'yuvarlak'), T('MUTE', '🔇', 'yuvarlak'))),
          h('div.dpad', null, T('UP', '▲', 'yukari', true), T('DOWN', '▼', 'asagi', true), T('LEFT', '◀', 'sol', true),
            T('RIGHT', '▶', 'sag', true), T('OK', 'OK', 'ok')),
          h('div.tuslar4', null, T('BACK', '↩ Geri'), T('MENU', 'Menü'), T('SETTINGS', 'Ayarlar'), T('INFO', 'Bilgi')),
          h('div.rokerler', null,
            h('div.roker', null, T('VOL_UP', '+', '', true), h('div.r-ad', { text: 'SES' }), T('VOL_DOWN', '−', '', true)),
            h('div.orta-tuslar', null, T('PLAY_PAUSE', '⏯', 'yuvarlak'), T('EXIT', '✕', 'yuvarlak')),
            h('div.roker', null, T('CH_UP', '+', '', true), h('div.r-ad', { text: 'KANAL' }), T('CH_DOWN', '−', '', true))),
          h('div.tuslar4', null, T('REW', '⏪'), T('PLAY', '▶'), T('PAUSE', '⏸'), T('FF', '⏩')),
          h('div.tuslar4', null, T('RED', '', 'kirmizi'), T('GREEN', '', 'yesil'), T('YELLOW', '', 'sari'), T('BLUE', '', 'mavi')),
          sesDugmesi(),
          h('details', { style: { marginTop: '10px' } }, h('summary.not', { text: 'Rakamlar' }),
            h('div.tuslar3', null, ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'GUIDE', '0', 'LIST'].map(x =>
              T(x, x === 'GUIDE' ? 'Rehber' : x === 'LIST' ? 'Liste' : x)))));
        Yerel.cagri('airStart', 'tv');
      } else if (sekme === 'fare') {
        const hedefTur = isaretci() ? 'tv' : (bt() ? 'bt' : null);
        if (!hedefTur) {
          govde.append(h('div.uyari', { text: t.platform === 'androidtv'
            ? 'Bu TV\'de ağ üzerinden imleç için "Gün Kumanda TV Yardımcısı" kurulu değil. İsterseniz Bluetooth fare modunu açın (ağdan bağımsız).'
            : 'Bu TV ağ üzerinden imleç desteklemiyor. Bluetooth fare modunu kullanın.' }),
          h('button.btn.ana.blok', { text: '🖱️ Bluetooth fare modunu aç', on: { click: () => Ekran.ac(BtModu) } }));
        }
        Yerel.cagri('airStart', hedefTur || 'tv');
        govde.append(dokunmatik(hedef), h('div', { style: { height: '12px' } }), havaDugmesi(hedefTur, () => hedef.tikla()),
          h('div.tuslar4', null, T('BACK', '↩'), T('HOME', '⌂'), T('VOL_DOWN', '−', '', true), T('VOL_UP', '+', '', true)),
          h('details', null, h('summary.not', { text: 'Hassasiyet ve hareketler' }), havaAyarlari()));
      } else if (sekme === 'klavye') {
        govde.append(klavye(t));
      } else {
        const uyg = [['youtube', '▶️ YouTube'], ['netflix', '🎬 Netflix'], ['prime', '📦 Prime'], ['disney', '🏰 Disney+'],
          ['spotify', '🎵 Spotify'], ['browser', '🌐 Tarayıcı']];
        govde.append(h('div.uygulamalar', null, uyg.map(([k, ad]) => h('button.karo', { on: { click: () => {
          if (!Yerel.cagri('tvLaunch', k)) tost('Bu TV uygulama açmayı desteklemiyor', 'hata');
        } } }, h('div.k-ad', { text: ad })))),
        h('div.bolum-baslik', { text: 'TV kimlik kartı' }),
        h('button.btn.blok', { text: '🪪 Model, yazılım ve MAC bilgisini oku', on: { click: () => kimlikKarti(t) } }));
      }
    }
    const jest = Yerel.on('jest', v => {
      const n = v.name;
      if (n === 'fiske_sag') tus('CH_UP');
      else if (n === 'fiske_sol') tus('CH_DOWN');
      else if (n === 'ters') tus('MUTE');
      else if (n === 'ses_artir') tus('VOL_UP');
      else if (n === 'ses_azalt') tus('VOL_DOWN');
    });
    const kop = Yerel.on('tv', v => {
      if (v.host !== t.host) return;
      if (v.type === 'koptu') { baglanti.className = 'cip yok'; baglanti.textContent = '● Koptu'; }
      if (v.type === 'baglandi') { baglanti.className = 'cip var'; baglanti.textContent = '● Bağlı'; }
    });
    baglanti.addEventListener('click', () => baglan(t));
    el.append(h('div.k-ust', null, h('div', null, h('div', { style: { fontWeight: '700', color: 'var(--buz)' }, text: t.name || t.host }),
      h('div.not', { text: (PLATFORM[t.platform] || [t.platform])[0] })), baglanti), tabs, govde);
    havaAyarlari(); // ayarları native tarafa ilet
    ciz();
    return { baslik: t.name || 'Akıllı TV', el, ekranAcik: true, sesTuslari: true,
      fizikselSes: (k) => tus(k),
      onplan: () => ciz(),
      kapat: () => { jest(); kop(); Yerel.cagri('airStop'); } };
  }

  // ------------------------------------------------------------ Klavye
  function klavye(t, sadeceBt) {
    const kutu = h('div');
    const canli = h('textarea.giris', { placeholder: 'Yazdıkça TV\'ye gider (Wi-Fi şifresi, arama, e-posta…)', style: { minHeight: '90px', fontFamily: 'inherit', fontSize: '16px' } });
    let onceki = '';
    const yaz = (s) => {
      if (!sadeceBt && Yerel.cagri('tvText', s)) return true;
      if (Yerel.cagri('hidConnected')) { Yerel.cagri('hidText', s); return true; }
      tost('Bu TV metin almıyor; Bluetooth klavye modunu açın', 'hata');
      return false;
    };
    const sil = () => { if (sadeceBt || !Yerel.cagri('tvBackspace')) Yerel.cagri('hidKey', 'BACKSPACE'); };
    canli.addEventListener('input', () => {
      const yeni = canli.value;
      if (yeni.startsWith(onceki)) { const ek = yeni.slice(onceki.length); if (ek) yaz(ek); }
      else if (onceki.startsWith(yeni)) { for (let i = 0; i < onceki.length - yeni.length; i++) sil(); }
      else { for (let i = 0; i < onceki.length; i++) sil(); if (yeni) yaz(yeni); }
      onceki = yeni;
    });
    kutu.append(h('p.not', { text: 'TV\'de bir yazı alanı seçin, sonra buraya yazın. Türkçe karakterler Android TV, LG ve Samsung\'da desteklenir.' }), canli,
      h('div.btn-satir', null,
        h('button.btn.ana', { text: '⏎ Enter', on: { click: () => { if (sadeceBt || !Yerel.cagri('tvEnter')) Yerel.cagri('hidKey', 'ENTER'); } } }),
        h('button.btn', { text: '⌫ Sil', on: { click: () => { sil(); canli.value = canli.value.slice(0, -1); onceki = canli.value; } } }),
        h('button.btn', { text: 'Temizle', on: { click: () => { canli.value = ''; onceki = ''; } } })),
      h('button.btn.blok', { style: { marginTop: '10px', padding: '16px' }, text: '🎤 Sesle yaz', on: { click: async () => {
        const r = await Yerel.sozlu('speech');
        if (r && r.ok && r.text) { yaz(r.text); canli.value += r.text; onceki = canli.value; tost('Gönderildi: ' + r.text, 'basari'); }
        else if (r && r.error) tost(r.error, 'hata');
      } } }),
      h('div.bolum-baslik', { text: 'Hazır metinler' }),
      h('div.liste', null, Ayar.get('hazirMetin', []).map(m => h('div.satir', null,
        h('button.s-ana', { style: { textAlign: 'left' }, on: { click: () => yaz(m) } }, h('div.s-ad', { text: m.length > 2 && /şifre|sifre/i.test(m) ? m : m })),
        h('button.btn', { text: '✕', on: { click: () => { Ayar.set('hazirMetin', Ayar.get('hazirMetin', []).filter(x => x !== m)); Ekran.yenile(); } } })))),
      h('button.btn.blok', { style: { marginTop: '8px' }, text: '+ Hazır metin ekle (ör. Wi-Fi şifresi)', on: { click: async () => {
        const m = await sor('Hazır metin', 'Sık yazdığınız şifre, e-posta ya da adres', '');
        if (m) { Ayar.set('hazirMetin', Ayar.get('hazirMetin', []).concat([m])); Ekran.yenile(); }
      } } }));
    return kutu;
  }

  async function kimlikKarti(t) {
    const bilgi = await Yerel.sozlu('tvInfo');
    const satirlar = Object.entries(bilgi || {}).filter(([k, v]) => v !== '' && v != null);
    let kisiId = null;
    const kapat = sayfa('TV kimlik kartı', h('div', null,
      h('div.liste', null, satirlar.map(([k, v]) => h('div.satir', null, h('div.s-ana', null, h('div.s-alt', { text: k }), h('div.s-ad', { text: String(v) }))))),
      h('div.btn-satir', null,
        h('button.btn', { text: 'Müşteri seç', on: { click: async e => {
          if (!Senk.erpUye) return tost('ERP üyelerine açık', 'hata');
          const q = await sor('Müşteri ara', null, ''); if (q == null) return;
          const l = await Senk.kisiAra(q);
          const s = await sec('Müşteri', l.map(x => ({ ad: x.isim, alt: x.tel || '', deger: x.id })));
          if (s) { kisiId = s; e.target.textContent = '👤 ' + l.find(x => x.id === s).isim; }
        } } }),
        h('button.btn.ana', { text: 'ERP\'ye kaydet', on: { click: async () => {
          try {
            await Senk.tvKartiKaydet({ kisi_id: kisiId, platform: t.platform, marka: (PLATFORM[t.platform] || [''])[0],
              model: bilgi.model || bilgi.modelName || '', yazilim: bilgi.version || '', mac: bilgi.mac || '', ip: t.host, bilgi });
            tost('Kaydedildi', 'basari'); kapat();
          } catch (e) { tost(e.message, 'hata'); }
        } } }))));
  }

  // ------------------------------------------------------------ Bluetooth fare/klavye
  function BtModu() {
    const el = h('div.kumanda');
    const durum = h('div.kutu');
    const icerik = h('div');
    let hazir = false;
    function durumCiz(s) {
      durum.innerHTML = '';
      const bagli = Yerel.cagri('hidConnected');
      if (bagli) {
        durum.append(h('div', { style: { fontWeight: '700', color: 'var(--yesil)' }, text: '✓ Bağlı' + (s && s.device ? ': ' + s.device : '') }));
      } else {
        durum.append(h('div', { style: { fontWeight: '700' }, text: hazir ? 'Hazır — TV\'den bağlanın' : 'Başlatılıyor…' }),
          h('p.not', { text: 'TV\'nin Bluetooth ayarlarında (Uzaktan kumanda ve aksesuarlar) "Gün Kumanda" cihazını eşleştirin. ' +
            'Görünmüyorsa aşağıdan telefonu görünür yapın.' }),
          h('div.btn-satir', null,
            h('button.btn.ana', { text: '📶 Görünür yap', on: { click: () => Yerel.cagri('hidDiscoverable') } }),
            h('button.btn', { text: 'Eşleşmiş cihaza bağlan', on: { click: async () => {
              const l = Yerel.json('hidBonded') || [];
              const a = await sec('Cihaz', l.map(x => ({ ad: x.name, alt: x.address, deger: x.address })));
              if (a) { const e = Yerel.cagri('hidConnect', a); if (e) tost(e, 'hata'); }
            } } })));
      }
    }
    const hedef = {
      hareket: (dx, dy) => Yerel.cagri('hidMove', dx, dy),
      tikla: () => Yerel.cagri('hidClick', 1),
      kaydir: (v) => Yerel.cagri('hidScroll', Math.round(-v / 8)),
      sagTik: () => Yerel.cagri('hidClick', 2)
    };
    const K = (ad, etiket) => IR.bas(h('button.tus', { text: etiket }), () => () => Yerel.cagri('hidKey', ad));
    icerik.append(dokunmatik(hedef), h('div', { style: { height: '12px' } }), havaDugmesi('bt', hedef.tikla),
      h('div.tuslar4', null, K('BACK', '↩'), K('HOME', '⌂'), K('VOL_DOWN', '−'), K('VOL_UP', '+')),
      h('div.tuslar4', null, K('LEFT', '◀'), K('UP', '▲'), K('DOWN', '▼'), K('RIGHT', '▶')),
      h('div.tuslar4', null, K('OK', 'OK'), K('PLAY_PAUSE', '⏯'), K('MUTE', '🔇'), K('MENU', 'Menü')),
      h('div.bolum-baslik', { text: 'Klavye' }), klavye(null, true),
      h('details', null, h('summary.not', { text: 'Hassasiyet ve hareketler' }), havaAyarlari()));
    const e = Yerel.cagri('hidStart');
    if (e) { durum.append(h('div.uyari', { text: e })); } else hazir = true;
    const k1 = Yerel.on('hid', s => { hazir = s.state !== 'kapali'; durumCiz(s); });
    Yerel.cagri('airStart', 'bt');
    el.append(durum, icerik);
    durumCiz();
    return { baslik: 'Bluetooth fare/klavye', el, ekranAcik: true, sesTuslari: true,
      fizikselSes: (k) => Yerel.cagri('hidKey', k),
      onplan: () => Yerel.cagri('airStart', 'bt'),
      kapat: () => { k1(); Yerel.cagri('airStop'); } };
  }

  window.Akilli = { AkilliAna, TvKumanda, Eslestir, BtModu, baglan };
})();
