/* Uygulama başlangıcı */
(function () {
  'use strict';

  Ekran.kok('saha', Saha.SahaAna);
  Ekran.kok('akilli', Akilli.AkilliAna);
  Ekran.kok('kayitlar', Ayarlar.KayitlarAna);
  Ekran.kok('ayarlar', Ayarlar.AyarlarAna);

  document.querySelectorAll('.sekme').forEach(b => b.addEventListener('click', () => {
    if (Ekran.sekme === b.dataset.sekme) Ekran.koke(); else Ekran.sekmeyeGec(b.dataset.sekme);
  }));
  document.getElementById('geri').addEventListener('click', () => Ekran.geri());
  window.__onBack = () => Ekran.geri();

  // IR durum çipi
  const cip = document.getElementById('ir-durum');
  function cipGuncelle() {
    const d = IR.durum();
    cip.className = 'cip ' + (d.active === 'none' ? 'yok' : 'var');
    cip.textContent = d.active === 'module' ? 'IR · Modül' : d.active === 'builtin' ? 'IR · Dahili' : 'IR yok';
  }
  cip.addEventListener('click', () => { Ekran.sekmeyeGec('ayarlar'); });
  Yerel.on('modul', cipGuncelle);

  // Telefonun ses tuşları -> aktif ekrana
  Yerel.on('fizikselTus', v => {
    const a = Ekran._aktif;
    if (a && a.fizikselSes) a.fizikselSes(v.tus);
  });

  // "Birlikte aç" ile gelen irplus dosyaları
  Yerel.on('dosyaAc', v => Araclar.irplusAc(v.text, v.name));

  Yerel.on('arkaplan', () => { Yerel.cagri('airStop'); });
  Yerel.on('onplan', () => {
    cipGuncelle();
    const a = Ekran._aktif;
    if (a && a.onplan) a.onplan();
    Senk.esitle();
  });

  Yerel.cagri('irSetOutput', Ayar.get('irCikis', 'auto'));
  const hava = Ayar.get('hava', null);
  if (hava) Yerel.cagri('airConfig', JSON.stringify(hava));

  cipGuncelle();
  Ekran.sekmeyeGec('saha');
  Senk.baslat().catch(e => console.warn(e));
})();
