/* Yerleşik kod veritabanı ve yerel kayıtlar */
(function () {
  'use strict';

  const IKON = {
    klima: '❄️', tv: '📺', uydu: '📡', ses: '🔊', dvr: '📹', projektor: '📽️', tvbox: '📦',
    aydinlatma: '💡', vantilator: '🌀', isitici: '🔥', hava: '💨', medya: '💿', ekran: '🖥️', diger: '🔧'
  };

  let indeks = null;
  const paketler = {};
  let evrensel = null;

  async function jsonGetir(yol) {
    const r = await fetch(yol);
    if (!r.ok) throw new Error('Yüklenemedi: ' + yol);
    return r.json();
  }

  const DB = {
    IKON,
    async indeks() {
      if (!indeks) indeks = await jsonGetir('db/index.json');
      return indeks;
    },
    async kategori(id) {
      if (!paketler[id]) {
        const p = await jsonGetir('db/cat_' + id + '.json');
        const m = new Map();
        for (const [rid, k] of p) m.set(rid, k);
        paketler[id] = m;
      }
      return paketler[id];
    },
    async kategoriBilgi(id) {
      const i = await this.indeks();
      return i.categories.find(c => c.id === id);
    },
    /** Yerleşik kumandayı getir: {id, kategori, marka, model, tuslar, kaynak} */
    async kumanda(rid) {
      const kat = rid.split('-')[0];
      const [paket, bilgi] = await Promise.all([this.kategori(kat), this.kategoriBilgi(kat)]);
      let marka = '', model = '', kaynak = '';
      for (const b of bilgi.brands) {
        const r = b.r.find(x => x[0] === rid);
        if (r) { marka = b.n; model = r[1]; kaynak = r[3]; break; }
      }
      return { id: rid, kategori: kat, marka, model, kaynak, tuslar: paket.get(rid) || [], yerlesik: true };
    },
    /** Tüm kategorilerde marka/model ara */
    async ara(metin, kategori) {
      const i = await this.indeks();
      const q = Arac.sade(metin);
      if (!q) return [];
      const sonuc = [];
      for (const c of i.categories) {
        if (kategori && c.id !== kategori) continue;
        for (const b of c.brands) {
          const bAd = Arac.sade(b.n + ' ' + (b.a || []).join(' '));
          const markaUyar = bAd.includes(q);
          for (const r of b.r) {
            if (markaUyar || Arac.sade(r[1]).includes(q) || Arac.sade(b.n + ' ' + r[1]).includes(q)) {
              sonuc.push({ id: r[0], kategori: c.id, marka: b.n, model: r[1], tus: r[2], kaynak: r[3] });
              if (sonuc.length > 300) return sonuc;
            }
          }
        }
      }
      return sonuc;
    },
    async evrensel() {
      if (!evrensel) evrensel = await jsonGetir('db/universal.json');
      return evrensel;
    }
  };

  // Yerel kayıtlar (bulutla eşitlenir, internetsiz de çalışır)
  const Kayit = {
    hepsi() { return Ayar.get('kayitlar', []).filter(k => !k.silindi); },
    tumu() { return Ayar.get('kayitlar', []); },
    getir(id) { return this.tumu().find(k => k.id === id); },
    kaydet(k) {
      const liste = this.tumu();
      k.guncelleme = new Date().toISOString();
      k.degisti = true;
      if (!k.id) k.id = Arac.uuid();
      const i = liste.findIndex(x => x.id === k.id);
      if (i >= 0) liste[i] = Object.assign(liste[i], k); else liste.unshift(k);
      Ayar.set('kayitlar', liste);
      window.Senk && Senk.yakinda();
      return k;
    },
    sil(id) {
      const liste = this.tumu();
      const k = liste.find(x => x.id === id);
      if (k) { k.silindi = true; k.degisti = true; k.guncelleme = new Date().toISOString(); }
      Ayar.set('kayitlar', liste);
      window.Senk && Senk.yakinda();
    },
    /** Buluttan gelenleri birleştir */
    birlestir(uzak) {
      const liste = this.tumu();
      const harita = new Map(liste.map(k => [k.id, k]));
      for (const u of uzak) {
        const y = harita.get(u.id);
        // Yerelde gönderilmemiş değişiklik varsa yereli koru; yoksa daha yeni olanı al
        if (!y || (!y.degisti && (u.guncelleme || '') >= (y.guncelleme || ''))) {
          harita.set(u.id, Object.assign({}, u, { degisti: false }));
        }
      }
      const yeni = Array.from(harita.values()).sort((a, b) => (b.guncelleme || '').localeCompare(a.guncelleme || ''));
      Ayar.set('kayitlar', yeni);
    },
    sonKullanilan(ekle) {
      let s = Ayar.get('son', []);
      if (ekle) {
        s = s.filter(x => x.id !== ekle.id);
        s.unshift(ekle);
        s = s.slice(0, 12);
        Ayar.set('son', s);
      }
      return s;
    }
  };

  const Arac = {
    sade(s) {
      return String(s || '').toLocaleLowerCase('tr').replace(/[ıi̇]/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
        .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/[^a-z0-9]+/g, ' ').trim();
    },
    uuid() {
      if (crypto && crypto.randomUUID) return crypto.randomUUID();
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
      });
    },
    bekle(ms) { return new Promise(r => setTimeout(r, ms)); },
    tarih(s) {
      if (!s) return '';
      const d = new Date(s);
      return d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    }
  };

  window.DB = DB;
  window.Kayit = Kayit;
  window.Arac = Arac;
})();
