/* Ortak veritabanı (ERP Supabase projesi) ile eşitleme */
(function () {
  'use strict';
  const URL = 'https://zfflnrerdevnflchscqe.supabase.co';
  const ANAHTAR = 'sb_publishable_CNriZk-LAigz43GdbD5Q6w_twNXre3T';

  let sb = null;
  try {
    sb = window.supabase.createClient(URL, ANAHTAR, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'gk_oturum' }
    });
  } catch (e) { console.error('Supabase yüklenemedi', e); }

  let kullanici = null;
  let uye = false;
  let erpUye = false;
  let zamanlayici = null;
  let calisiyor = false;

  const ALANLAR = ['id', 'kategori', 'marka', 'model', 'kumanda_kodu', 'uyumlu', 'notlar', 'tuslar', 'duzen', 'klima', 'kaynak', 'etiket_foto', 'kisi_id', 'silindi'];

  const Senk = {
    get hazir() { return !!sb; },
    get kullanici() { return kullanici; },
    get uye() { return uye; },
    get erpUye() { return erpUye; },

    async baslat() {
      if (!sb) return;
      const { data } = await sb.auth.getSession();
      kullanici = data && data.session ? data.session.user : null;
      sb.auth.onAuthStateChange((_o, oturum) => { kullanici = oturum ? oturum.user : null; });
      if (kullanici) {
        await this.yetkiKontrol();
        this.esitle();
      }
      window.addEventListener('online', () => this.esitle());
    },

    async yetkiKontrol() {
      if (!sb || !kullanici) { uye = erpUye = false; return; }
      try {
        const a = await sb.rpc('kumanda_uye');
        uye = !!a.data;
        const b = await sb.rpc('erp_uye');
        erpUye = !!b.data;
      } catch (e) { /* çevrimdışı: son bilinen durumu koru */
        uye = Ayar.get('uye', false); erpUye = Ayar.get('erpUye', false);
      }
      Ayar.set('uye', uye); Ayar.set('erpUye', erpUye);
    },

    async giris(eposta, sifre) {
      const { data, error } = await sb.auth.signInWithPassword({ email: eposta.trim(), password: sifre });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'E-posta ya da şifre hatalı' : error.message);
      kullanici = data.user;
      await this.yetkiKontrol();
      this.esitle();
      return { uye, erpUye };
    },

    async kayitOl(eposta, sifre) {
      const { data, error } = await sb.auth.signUp({ email: eposta.trim(), password: sifre });
      if (error) throw new Error(error.message);
      kullanici = data.user;
      if (data.session) await this.yetkiKontrol();
      return !!data.session;
    },

    async cikis() {
      if (sb) await sb.auth.signOut();
      kullanici = null; uye = erpUye = false;
    },

    /** Birkaç saniye sonra eşitle (art arda değişiklikleri birleştirir) */
    yakinda() {
      clearTimeout(zamanlayici);
      zamanlayici = setTimeout(() => this.esitle(), 2500);
    },

    async esitle() {
      if (!sb || !kullanici || !uye || calisiyor || !navigator.onLine) return false;
      calisiyor = true;
      try {
        // 1) Yerel değişiklikleri gönder
        const degisen = Kayit.tumu().filter(k => k.degisti);
        if (degisen.length) {
          const satirlar = degisen.map(k => {
            const s = {};
            for (const a of ALANLAR) if (k[a] !== undefined) s[a] = k[a];
            s.silindi = !!k.silindi;
            return s;
          });
          const { error } = await sb.from('ir_kumandalar').upsert(satirlar, { onConflict: 'id' });
          if (error) throw error;
          const liste = Kayit.tumu();
          for (const k of liste) if (degisen.find(d => d.id === k.id)) k.degisti = false;
          Ayar.set('kayitlar', liste);
        }
        // 2) Uzaktaki yenileri al
        const son = Ayar.get('sonEsitleme', '1970-01-01T00:00:00Z');
        const { data, error } = await sb.from('ir_kumandalar').select('*').gt('guncelleme', son)
          .order('guncelleme', { ascending: true }).limit(1000);
        if (error) throw error;
        if (data && data.length) {
          Kayit.birlestir(data.map(r => Object.assign({}, r, { bulut: true })));
          Ayar.set('sonEsitleme', data[data.length - 1].guncelleme);
        }
        // 3) Bekleyen saha kayıtları
        const bekleyen = Ayar.get('sahaKuyruk', []);
        if (bekleyen.length) {
          const { error: e2 } = await sb.from('ir_saha_kayit').insert(bekleyen);
          if (!e2) Ayar.set('sahaKuyruk', []);
        }
        Ayar.set('sonBasariliEsitleme', new Date().toISOString());
        document.dispatchEvent(new CustomEvent('esitlendi'));
        return true;
      } catch (e) {
        console.warn('Eşitleme hatası', e);
        return false;
      } finally {
        calisiyor = false;
      }
    },

    /** "Çalıştı / çalışmadı" kaydı (çevrimdışıysa kuyruğa) */
    sahaKaydi(k) {
      const satir = {
        kumanda_id: k.kumanda_id || null, veritabani_id: k.veritabani_id || null,
        calisti: !!k.calisti, notlar: k.notlar || null, kisi_id: k.kisi_id || null
      };
      const kuyruk = Ayar.get('sahaKuyruk', []);
      kuyruk.push(satir);
      Ayar.set('sahaKuyruk', kuyruk);
      this.yakinda();
    },

    async fotoYukle(dosya, kumandaId) {
      if (!sb || !kullanici) throw new Error('Fotoğraf için giriş yapın');
      const uzanti = (dosya.name.split('.').pop() || 'jpg').toLowerCase();
      const yol = kumandaId + '/' + Date.now() + '.' + uzanti;
      const { error } = await sb.storage.from('ir-foto').upload(yol, dosya, { upsert: true, contentType: dosya.type || 'image/jpeg' });
      if (error) throw error;
      return yol;
    },

    async fotoAdres(yol) {
      if (!sb || !yol) return null;
      const { data } = await sb.storage.from('ir-foto').createSignedUrl(yol, 3600);
      return data ? data.signedUrl : null;
    },

    /** ERP müşterileri (yalnız ERP üyeleri görür) */
    async kisiAra(metin) {
      if (!sb || !erpUye) return [];
      let q = sb.from('kisiler').select('id,isim,tel,adres').order('isim').limit(30);
      if (metin) q = q.ilike('isim', '%' + metin + '%');
      const { data } = await q;
      return data || [];
    },

    async kisiAdi(id) {
      if (!sb || !erpUye || !id) return '';
      const { data } = await sb.from('kisiler').select('isim').eq('id', id).maybeSingle();
      return data ? data.isim : '';
    },

    async tvKartiKaydet(k) {
      if (!sb || !uye) throw new Error('Kaydetmek için giriş yapın');
      const { error } = await sb.from('tv_kartlari').insert(k);
      if (error) throw error;
    },

    async uyeler() {
      const { data, error } = await sb.from('kumanda_uyeler').select('*').order('eklendi');
      if (error) throw error;
      return data || [];
    },
    async uyeEkle(eposta, ad) {
      const { error } = await sb.from('kumanda_uyeler').upsert({ eposta: eposta.trim().toLowerCase(), ad });
      if (error) throw error;
    },
    async uyeSil(eposta) {
      const { error } = await sb.from('kumanda_uyeler').delete().eq('eposta', eposta);
      if (error) throw error;
    }
  };

  window.Senk = Senk;
})();
