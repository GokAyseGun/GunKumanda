/* Küçük arayüz yardımcıları: öğe oluşturma, ekran yığını, bildirim, alt sayfa */
(function () {
  'use strict';

  function h(etiket, ozel, ...cocuklar) {
    const [ad, ...siniflar] = etiket.split('.');
    const el = document.createElement(ad || 'div');
    if (siniflar.length) el.className = siniflar.join(' ');
    if (ozel) {
      for (const [k, v] of Object.entries(ozel)) {
        if (v == null || v === false) continue;
        if (k === 'on') for (const [o, f] of Object.entries(v)) el.addEventListener(o, f);
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k in el && typeof v !== 'string') el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    ekle(el, cocuklar);
    return el;
  }
  function ekle(el, cocuklar) {
    for (const c of cocuklar.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
  }

  // Kalıcı ayarlar
  const Ayar = {
    get(k, v) { try { const x = localStorage.getItem('gk_' + k); return x == null ? v : JSON.parse(x); } catch (e) { return v; } },
    set(k, v) { try { localStorage.setItem('gk_' + k, JSON.stringify(v)); } catch (e) {} }
  };

  function tost(mesaj, tur) {
    const kutu = document.getElementById('bildirim');
    const t = h('div.tost' + (tur ? '.' + tur : ''), { text: mesaj });
    kutu.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 2300);
    setTimeout(() => t.remove(), 2700);
  }

  /** Alt sayfa aç. icerik: Node ya da (kapat)=>Node. Dönüş: kapat fonksiyonu */
  function sayfa(baslik, icerik, secenek) {
    const katman = document.getElementById('katman');
    const perde = h('div.perde');
    const kutu = h('div.sayfa', null, h('div.tutamak'), baslik ? h('h3', { text: baslik }) : null);
    let acik = true;
    const kapat = () => {
      if (!acik) return; acik = false;
      perde.remove(); kutu.remove();
      Ekran._sayfaYigini = Ekran._sayfaYigini.filter(x => x !== kapat);
      secenek && secenek.kapaninca && secenek.kapaninca();
    };
    kutu.appendChild(typeof icerik === 'function' ? icerik(kapat) : icerik);
    perde.addEventListener('click', () => { if (!(secenek && secenek.zorunlu)) kapat(); });
    katman.append(perde, kutu);
    Ekran._sayfaYigini.push(kapat);
    return kapat;
  }

  function sor(baslik, aciklama, varsayilan, secenek) {
    return new Promise(res => {
      let deger = null;
      const giris = h(secenek && secenek.cok ? 'textarea.giris' : 'input.giris', {
        value: varsayilan || '', placeholder: (secenek && secenek.ipucu) || '',
        type: (secenek && secenek.tur) || 'text', inputmode: secenek && secenek.klavye
      });
      const kapat = sayfa(baslik, h('div', null,
        aciklama ? h('p.not', { text: aciklama }) : null,
        giris,
        h('div.btn-satir', null,
          h('button.btn', { text: 'Vazgeç', on: { click: () => kapat() } }),
          h('button.btn.ana', { text: (secenek && secenek.tamam) || 'Tamam', on: { click: () => { deger = giris.value; kapat(); } } })
        )), { kapaninca: () => res(deger) });
      setTimeout(() => giris.focus(), 150);
    });
  }

  function onay(baslik, aciklama, evet, tehlike) {
    return new Promise(res => {
      let sonuc = false;
      const kapat = sayfa(baslik, h('div', null,
        aciklama ? h('p.not', { text: aciklama }) : null,
        h('div.btn-satir', null,
          h('button.btn', { text: 'Vazgeç', on: { click: () => kapat() } }),
          h('button.btn' + (tehlike ? '.tehlike' : '.ana'), { text: evet || 'Evet', on: { click: () => { sonuc = true; kapat(); } } })
        )), { kapaninca: () => res(sonuc) });
    });
  }

  /** Seçim listesi: [{ad, alt, deger}] */
  function sec(baslik, secenekler) {
    return new Promise(res => {
      let sonuc = null;
      const kapat = sayfa(baslik, h('div.liste', null, secenekler.map(s =>
        h('button.satir', { on: { click: () => { sonuc = s.deger; kapat(); } } },
          h('div.s-ana', null, h('div.s-ad', { text: s.ad }), s.alt ? h('div.s-alt', { text: s.alt }) : null))
      )), { kapaninca: () => res(sonuc) });
    });
  }

  // Ekran yığını: her sekmenin kendi geçmişi vardır
  const Ekran = {
    sekme: 'saha',
    yigin: { saha: [], akilli: [], kayitlar: [], ayarlar: [] },
    kokler: {},
    _sayfaYigini: [],
    _aktif: null,

    kok(sekme, fn) { this.kokler[sekme] = fn; },

    sekmeyeGec(sekme) {
      this.sekme = sekme;
      document.querySelectorAll('.sekme').forEach(b => b.classList.toggle('aktif', b.dataset.sekme === sekme));
      if (!this.yigin[sekme].length) this.yigin[sekme].push({ fn: this.kokler[sekme], p: {} });
      this.ciz();
    },

    ac(fn, p) {
      this.yigin[this.sekme].push({ fn, p: p || {} });
      this.ciz();
    },

    /** Yığının tepesini yeniden çiz (ör. veri değişince) */
    yenile() { this.ciz(true); },

    geri() {
      if (this._sayfaYigini.length) { this._sayfaYigini[this._sayfaYigini.length - 1](); return true; }
      const y = this.yigin[this.sekme];
      if (y.length > 1) { y.pop(); this.ciz(); return true; }
      if (this.sekme !== 'saha') { this.sekmeyeGec('saha'); return true; }
      return false;
    },

    koke() { const y = this.yigin[this.sekme]; y.length = 1; this.ciz(); },

    ciz() {
      const y = this.yigin[this.sekme];
      const ust = y[y.length - 1];
      if (this._aktif && this._aktif.kapat) { try { this._aktif.kapat(); } catch (e) {} }
      const ekran = document.getElementById('ekran');
      ekran.innerHTML = '';
      const r = ust.fn(ust.p) || {};
      this._aktif = r;
      ekran.classList.toggle('tam', !!r.tam);
      document.getElementById('baslik').textContent = r.baslik || 'Gün Kumanda';
      document.getElementById('geri').hidden = y.length <= 1;
      if (r.el) ekran.appendChild(r.el);
      ekran.scrollTop = 0;
      Yerel.cagri('volumeKeys', !!r.sesTuslari);
      Yerel.cagri('keepScreenOn', !!r.ekranAcik);
    }
  };

  window.h = h;
  window.Ayar = Ayar;
  window.tost = tost;
  window.sayfa = sayfa;
  window.sor = sor;
  window.onay = onay;
  window.sec = sec;
  window.Ekran = Ekran;
})();
