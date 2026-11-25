/* IR gönderme, tuş adlarını tanıma, klima ve özel paneller */
(function () {
  'use strict';

  // Tuş adı -> ortak anahtar
  const KALIP = [
    ['POWER', /^(power|pwr|güç|guc|standby|on[ _/-]?off|power[ _]?toggle|power[ _]?on[ _/]?off)$/i],
    ['POWER_ON', /^(power[ _]?on|on|aç|ac[ _]on)$/i],
    ['POWER_OFF', /^(power[ _]?off|off|kapat)$/i],
    ['VOL_UP', /^(vol(ume)?[ _]?(up|\+|plus)|v\+|vol\+|ses ?\+|ses art(ı|i)r)$/i],
    ['VOL_DOWN', /^(vol(ume)?[ _]?(dn|down|-|minus)|v-|vol-|ses ?[-−–]|ses azalt)$/i],
    ['MUTE', /^(mute|sessiz|muting)$/i],
    ['CH_UP', /^((ch|chan|channel|prog|p|page)[ _]?(up|\+|next)|ch\+|p\+|kanal ?\+)$/i],
    ['CH_DOWN', /^((ch|chan|channel|prog|p|page)[ _]?(dn|down|-|prev)|ch-|p-|kanal ?[-−–])$/i],
    ['UP', /^(up|yukarı|cursor[ _]?up|arrow[ _]?up|nav[ _]?up)$/i],
    ['DOWN', /^(down|dn|aşağı|cursor[ _]?down|arrow[ _]?down|nav[ _]?down)$/i],
    ['LEFT', /^(left|sol|cursor[ _]?left|arrow[ _]?left|nav[ _]?left)$/i],
    ['RIGHT', /^(right|sağ|cursor[ _]?right|arrow[ _]?right|nav[ _]?right)$/i],
    ['OK', /^(ok|enter|select|confirm|tamam)$/i],
    ['MENU', /^(menu|menü|setup)$/i],
    ['BACK', /^(back|return|geri|ret|recall|geri dön)$/i],
    ['EXIT', /^(exit|çık|cik|çıkış|cikis)$/i],
    ['HOME', /^(home|smart[ _]?home|smart|ana[ _]?sayfa)$/i],
    ['SOURCE', /^(source|input|src|av|tv[ _/]?av|input[ _]?select|kaynak)$/i],
    ['INFO', /^(info|display|disp|bilgi|i\+?)$/i],
    ['GUIDE', /^(guide|epg|p[ _]?guide|rehber)$/i],
    ['PLAY', /^(play|oynat)$/i], ['PAUSE', /^(pause|duraklat)$/i],
    ['PLAY_PAUSE', /^(play[ _/]?pause|pause[ _/]?play|oynat ?\/ ?duraklat)$/i],
    ['STOP', /^(stop|durdur)$/i], ['NEXT', /^(next|skip[ _]?(fwd|next|\+)|sonraki|ileri atla)$/i],
    ['PREV', /^(prev|previous|skip[ _]?(back|prev|-)|önceki)$/i],
    ['FF', /^(ff|fwd|fast[ _]?forward|forward|f[ _]?forward|fw|ileri sar)$/i],
    ['REW', /^(rew|rewind|fast[ _]?back|rw|geri sar)$/i], ['REC', /^(rec|record|kayıt)$/i],
    ['RED', /^(red|kırmızı)$/i], ['GREEN', /^(green|yeşil)$/i], ['YELLOW', /^(yellow|yelow|sarı)$/i],
    ['BLUE', /^(blue|mavi)$/i], ['SETTINGS', /^(settings|ayarlar|ayar)$/i], ['SUBTITLE', /^(subtitle|sub|cc|altyazı|altyazi)$/i]
  ];
  for (let i = 0; i <= 9; i++) KALIP.push([String(i), new RegExp('^(' + i + '|num[ _]?' + i + '|key[ _]?' + i + '|btn[ _]?' + i + ')$', 'i')]);

  function anahtar(ad) {
    const a = String(ad || '').trim();
    for (const [k, rx] of KALIP) if (rx.test(a)) return k;
    return null;
  }

  // Ortak anahtarın Türkçe kısa etiketi / sembolü
  const ETIKET = {
    POWER: '⏻', POWER_ON: 'Aç', POWER_OFF: 'Kapat', VOL_UP: '+', VOL_DOWN: '−', MUTE: '🔇', CH_UP: '▲', CH_DOWN: '▼',
    UP: '▲', DOWN: '▼', LEFT: '◀', RIGHT: '▶', OK: 'OK', MENU: 'Menü', BACK: '↩', EXIT: 'Çıkış', HOME: '⌂',
    SOURCE: 'Kaynak', INFO: 'Bilgi', GUIDE: 'Rehber', PLAY: '▶', PAUSE: '⏸', PLAY_PAUSE: '⏯', STOP: '⏹',
    NEXT: '⏭', PREV: '⏮', FF: '⏩', REW: '⏪', REC: '⏺', RED: '', GREEN: '', YELLOW: '', BLUE: '',
    SETTINGS: 'Ayarlar', SUBTITLE: 'Altyazı'
  };

  let sonGonderim = 0;

  /** Tek sinyal gönder. sinyal: ["Ad","PROTO","HEX",bit] ya da ["Ad",frekans,[t...]] */
  function gonder(sinyal, tekrar) {
    if (!sinyal) return 'Sinyal yok';
    let hata;
    if (typeof sinyal[1] === 'string') {
      hata = Yerel.cagri('irSendProto', sinyal[1], String(sinyal[2]), sinyal[3] | 0, tekrar | 0);
    } else {
      hata = Yerel.cagri('irSendRaw', sinyal[1] | 0, (sinyal[2] || []).join(','));
    }
    sonGonderim = Date.now();
    if (hata) tost(hata, 'hata');
    return hata || '';
  }

  /** Basılı tutunca tekrar eden tuş davranışı */
  function bas(el, sinyalFn, secenek) {
    let zam = null, ilk = null;
    const tekrarla = secenek && secenek.tekrar;
    const durdur = () => {
      el.classList.remove('basili');
      clearTimeout(ilk); clearInterval(zam); ilk = zam = null;
    };
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      el.classList.add('basili');
      Yerel.titre(15);
      const s = sinyalFn();
      if (typeof s === 'function') s(); else gonder(s);
      el.classList.remove('gonderdi'); void el.offsetWidth; el.classList.add('gonderdi');
      if (tekrarla) {
        ilk = setTimeout(() => {
          zam = setInterval(() => { const t = sinyalFn(); if (typeof t === 'function') t(); else gonder(t); }, 170);
        }, 420);
      }
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(o => el.addEventListener(o, durdur));
    return el;
  }

  // -------------------------------------------------------------- Klima
  const MODLAR = [['1', 'Soğutma', '❄️'], ['2', 'Isıtma', '☀️'], ['3', 'Nem alma', '💧'], ['4', 'Fan', '🌀'], ['0', 'Otomatik', 'A']];
  const FANLAR = [['0', 'Oto'], ['1', 'En düşük'], ['2', 'Düşük'], ['3', 'Orta'], ['4', 'Yüksek'], ['5', 'En yüksek']];
  const SWINGV = [['-1', 'Kapalı'], ['0', 'Salınım'], ['1', 'En üst'], ['3', 'Orta'], ['5', 'En alt']];
  const SWINGH = [['-1', 'Kapalı'], ['0', 'Salınım'], ['3', 'Orta'], ['6', 'Geniş']];

  // Marka -> denenecek klima protokolleri (Türk pazarı üretici eşleştirmesi)
  const MIDEA = ['MIDEA', 'COOLIX'];
  const KLIMA_MARKA = [
    ['Arçelik', ['COOLIX', 'LG', 'LG2', 'GREE', 'MIDEA']], ['Beko', ['COOLIX', 'LG', 'LG2', 'GREE', 'MIDEA']],
    ['Altus', ['COOLIX', 'LG', 'LG2', 'GREE']], ['Grundig', ['COOLIX', 'LG', 'LG2', 'GREE']],
    ['Vaillant', ['COOLIX', 'GREE', 'LG']], ['Demirdöküm', ['COOLIX', 'GREE', 'LG', 'ELECTRA_AC']],
    ['Vestel', ['VESTEL_AC', 'COOLIX', 'MIDEA']], ['Regal', ['VESTEL_AC', 'COOLIX']], ['Daewoo', ['VESTEL_AC', 'COOLIX']],
    ['SEG', ['VESTEL_AC', 'COOLIX']], ['Vestfrost', ['VESTEL_AC', 'COOLIX']], ['Finlux', ['VESTEL_AC', 'COOLIX']],
    ['Baymak', ['ELECTRA_AC', 'COOLIX', 'MIDEA']], ['De Dietrich', ['ELECTRA_AC']], ['Dolce Vita', ['ELECTRA_AC']], ['AUX', ['ELECTRA_AC']],
    ['Airfel', MIDEA], ['Daylux', MIDEA], ['Kaira', MIDEA], ['Midea', MIDEA], ['Bosch', MIDEA.concat(['BOSCH144'])],
    ['Siemens', MIDEA], ['Profilo', MIDEA], ['Electrolux', MIDEA.concat(['ELECTRA_AC', 'TCL112AC'])], ['Dijitsu', MIDEA],
    ['Dayrelax', MIDEA], ['Kumtel', MIDEA], ['Luxell', MIDEA], ['Rota', MIDEA], ['Teka', MIDEA], ['Uğur', MIDEA],
    ['Jeriyan', MIDEA], ['Diamond Electric', MIDEA], ['Comfee', MIDEA],
    ['Gree', ['GREE', 'KELVINATOR']], ['Tosot', ['GREE']],
    ['Haier', ['HAIER_AC', 'HAIER_AC_YRW02', 'HAIER_AC176', 'HAIER_AC160']], ['ECA', ['HAIER_AC', 'HAIER_AC_YRW02', 'HAIER_AC176']],
    ['Sunny', ['HAIER_AC', 'HAIER_AC_YRW02']], ['Sigma', ['HAIER_AC', 'HAIER_AC_YRW02', 'HAIER_AC176', 'GREE']],
    ['Viessmann', ['GREE', 'HAIER_AC', 'HAIER_AC_YRW02', 'HAIER_AC176']],
    ['Daikin', ['DAIKIN', 'DAIKIN2', 'DAIKIN216', 'DAIKIN160', 'DAIKIN176', 'DAIKIN128', 'DAIKIN152', 'DAIKIN64', 'DAIKIN312']],
    ['Mitsubishi Electric', ['MITSUBISHI_AC', 'MITSUBISHI136', 'MITSUBISHI112']],
    ['Mitsubishi Heavy', ['MITSUBISHI_HEAVY_88', 'MITSUBISHI_HEAVY_152']],
    ['Toshiba', ['TOSHIBA_AC', 'CARRIER_AC64']], ['Alarko Carrier', ['TOSHIBA_AC', 'CARRIER_AC64', 'MIDEA', 'COOLIX']],
    ['Carrier', ['CARRIER_AC64', 'TOSHIBA_AC', 'MIDEA']], ['York', MIDEA],
    ['Fujitsu', ['FUJITSU_AC']], ['FJ Therma', ['FUJITSU_AC']], ['General', ['FUJITSU_AC']],
    ['Samsung', ['SAMSUNG_AC', 'MIDEA', 'COOLIX']], ['LG', ['LG', 'LG2']],
    ['Panasonic', ['PANASONIC_AC', 'PANASONIC_AC32']], ['Hitachi', ['HITACHI_AC', 'HITACHI_AC1', 'HITACHI_AC424', 'HITACHI_AC344', 'HITACHI_AC264', 'HITACHI_AC296']],
    ['Sharp', ['SHARP_AC', 'KELVINATOR']], ['Hisense', ['KELON', 'TCL112AC']], ['Rose Air', ['KELON', 'TCL112AC']],
    ['TCL', ['TCL112AC', 'TEKNOPOINT']], ['Hantech', ['TCL112AC']],
    ['Fuji Plus', ['MIDEA', 'COOLIX', 'GREE', 'TCL112AC', 'KELON', 'ELECTRA_AC', 'HAIER_AC_YRW02']],
    ['Copa', ['COOLIX', 'GREE', 'TCL112AC', 'MIDEA']]
  ];

  // Modeli olan protokoller: [değer, ad]
  const KLIMA_MODEL = {
    FUJITSU_AC: [[1, 'AR-RAH2E (varsayılan)'], [2, 'AR-DB1'], [3, 'AR-REB1E'], [4, 'AR-JW2'], [5, 'AR-RY4'], [6, 'AR-REW4E']],
    GREE: [[1, 'YAW1F (varsayılan)'], [2, 'YBOFB'], [3, 'YX1FSF']],
    LG: [[1, 'GE6711AR2853M (varsayılan)'], [2, 'AKB75215403'], [3, 'AKB74955603'], [4, 'AKB73757604'], [5, 'LG6711A20083V']],
    PANASONIC_AC: [[1, 'LKE'], [2, 'NKE'], [3, 'DKE'], [4, 'JKE'], [5, 'CKP'], [6, 'RKR']],
    HITACHI_AC1: [[1, 'R-LT0541-HTA-A'], [2, 'R-LT0541-HTA-B']],
    SHARP_AC: [[1, 'A907'], [2, 'A705'], [3, 'A903']],
    WHIRLPOOL_AC: [[1, 'DG11J13A'], [2, 'DG11J191']],
    HAIER_AC176: [[1, 'V9014557-A'], [2, 'V9014557-B']],
    TCL112AC: [[1, 'TAC09CHSD'], [2, 'GZ055BE1']],
    VOLTAS: [[1, '122LZF']]
  };

  function klimaAdaylari(marka) {
    const q = Arac.sade(marka);
    for (const [m, p] of KLIMA_MARKA) if (Arac.sade(m) === q || q.startsWith(Arac.sade(m))) return p.slice();
    return [];
  }

  /** Klima durumunu gönder. d: {protokol, model, guc, mod, derece, fan, swingv, swingh, sessiz, turbo, eko, isik, temizle} */
  function klimaGonder(d) {
    const alanlar = [d.guc ? 1 : 0, d.guc ? (d.mod | 0) : -1, 1, d.fan | 0, d.swingv == null ? -1 : d.swingv | 0,
      d.swingh == null ? -1 : d.swingh | 0, d.sessiz ? 1 : 0, d.turbo ? 1 : 0, d.eko ? 1 : 0, d.isik ? 1 : 0,
      0, d.temizle ? 1 : 0, 0, -1, -1];
    const hata = Yerel.cagri('irSendAc', d.protokol, d.model == null ? -1 : d.model | 0, alanlar.join(','), Number(d.derece) || 24);
    if (hata) tost(hata, 'hata');
    return hata || '';
  }

  // -------------------------------------------------------------- Özel paneller
  const N = (ad, hex) => [ad, 'NEC', hex, 32];
  const LED24 = {
    ad: '24 tuşlu RGB (standart)', sutun: 4,
    tuslar: [
      [N('Parlak +', '00F700FF'), 'hardal'], [N('Parlak −', '00F7807F'), 'hardal'], [N('Kapat', '00F740BF'), 'koyu'], [N('Aç', '00F7C03F'), 'yesil'],
      [N('Kırmızı', '00F720DF'), '#d33'], [N('Yeşil', '00F7A05F'), '#2a5'], [N('Mavi', '00F7609F'), '#36c'], [N('Beyaz', '00F7E01F'), '#eee'],
      [N('Turuncu', '00F710EF'), '#e72'], [N('Açık yeşil', '00F7906F'), '#4c8'], [N('Lacivert', '00F750AF'), '#24a'], [N('Flaş', '00F7D02F'), 'koyu'],
      [N('Koyu turuncu', '00F730CF'), '#e52'], [N('Camgöbeği', '00F7B04F'), '#2bb'], [N('Mor', '00F7708F'), '#73b'], [N('Çakar', '00F7F00F'), 'koyu'],
      [N('Sarı-turuncu', '00F708F7'), '#f93'], [N('Turkuaz', '00F78877'), '#1aa'], [N('Eflatun', '00F748B7'), '#93c'], [N('Geçiş', '00F7C837'), 'koyu'],
      [N('Sarı', '00F728D7'), '#ec3'], [N('Deniz', '00F7A857'), '#29b'], [N('Pembe', '00F76897'), '#d4a'], [N('Yumuşak', '00F7E817'), 'koyu']
    ]
  };
  const LED44 = {
    ad: '44 tuşlu RGB (standart)', sutun: 4,
    tuslar: [
      [N('Parlak +', '00FF3AC5'), 'hardal'], [N('Parlak −', '00FFBA45'), 'hardal'], [N('Oynat/Durdur', '00FF827D'), 'koyu'], [N('Güç', '00FF02FD'), 'kirmizi'],
      [N('Kırmızı', '00FF1AE5'), '#d33'], [N('Yeşil', '00FF9A65'), '#2a5'], [N('Mavi', '00FFA25D'), '#36c'], [N('Beyaz', '00FF22DD'), '#eee'],
      [N('Renk 1', '00FF2AD5'), '#e72'], [N('Renk 2', '00FFAA55'), '#4c8'], [N('Renk 3', '00FF926D'), '#24a'], [N('Renk 4', '00FF12ED'), '#fcc'],
      [N('Renk 5', '00FF0AF5'), '#e52'], [N('Renk 6', '00FF8A75'), '#2bb'], [N('Renk 7', '00FFB24D'), '#73b'], [N('Renk 8', '00FF32CD'), '#fdd'],
      [N('Renk 9', '00FF38C7'), '#f93'], [N('Renk 10', '00FFB847'), '#1aa'], [N('Renk 11', '00FF7887'), '#93c'], [N('Renk 12', '00FFF807'), '#cef'],
      [N('Renk 13', '00FF18E7'), '#ec3'], [N('Renk 14', '00FF9867'), '#29b'], [N('Renk 15', '00FF58A7'), '#d4a'], [N('Renk 16', '00FFD827'), '#cef'],
      [N('Kırmızı +', '00FF28D7'), 'koyu'], [N('Yeşil +', '00FFA857'), 'koyu'], [N('Mavi +', '00FF6897'), 'koyu'], [N('Hızlı', '00FFE817'), 'koyu'],
      [N('Kırmızı −', '00FF08F7'), 'koyu'], [N('Yeşil −', '00FF8877'), 'koyu'], [N('Mavi −', '00FF48B7'), 'koyu'], [N('Yavaş', '00FFC837'), 'koyu'],
      [N('DIY 1', '00FF30CF'), 'koyu'], [N('DIY 2', '00FFB04F'), 'koyu'], [N('DIY 3', '00FF708F'), 'koyu'], [N('Otomatik', '00FFF00F'), 'koyu'],
      [N('DIY 4', '00FF10EF'), 'koyu'], [N('DIY 5', '00FF906F'), 'koyu'], [N('DIY 6', '00FF50AF'), 'koyu'], [N('Flaş', '00FFD02F'), 'koyu'],
      [N('Atla 3', '00FF20DF'), 'koyu'], [N('Atla 7', '00FFA05F'), 'koyu'], [N('Geçiş 3', '00FF609F'), 'koyu'], [N('Geçiş 7', '00FFE01F'), 'koyu']
    ]
  };

  const S = (ad, hex) => [ad, 'SAMSUNG', hex, 32];
  const L = (ad, hex) => [ad, 'NEC', hex, 32];
  const V = (ad, hex) => [ad, 'RC5', hex, 12];
  const P = (ad, hex) => [ad, 'RC6', hex, 20];
  const Y = (ad, hex) => [ad, 'SONY', hex, 12];
  // Servis / otel menüsü makroları (sıralı tuş dizileri)
  const SERVIS = [
    { marka: 'Samsung', ad: 'Servis menüsü', not: 'TV bekleme modundayken (kapalı, kırmızı ışık) gönderin.',
      dizi: [S('Info', 'E0E0F807'), S('Menu', 'E0E058A7'), S('Mute', 'E0E0F00F'), S('Power', 'E0E040BF')] },
    { marka: 'Samsung', ad: 'Otel menüsü (Hotel mode)', not: 'TV açıkken gönderin: Mute, 1, 1, 9, Enter.',
      dizi: [S('Mute', 'E0E0F00F'), S('1', 'E0E020DF'), S('1', 'E0E020DF'), S('9', 'E0E0708F'), S('Enter', 'E0E016E9')] },
    { marka: 'LG', ad: 'Kurulum menüsü (IN-START)', not: 'Servis kumandasının IN-START tuşu. Şifre sorarsa genelde 0413 ya da 0000.',
      dizi: [L('IN-START', '20DFDF20')] },
    { marka: 'LG', ad: 'Servis ayarı (EZ-ADJUST)', not: 'Servis kumandasının EZ-ADJUST tuşu. Dikkatli kullanın.', dizi: [L('EZ-ADJUST', '20DFFF00')] },
    { marka: 'LG', ad: 'IN-STOP', not: 'Fabrika çıkış modu tuşu.', dizi: [L('IN-STOP', '20DF5FA0')] },
    { marka: 'Vestel ailesi', ad: 'Servis menüsü', not: 'Vestel, Regal, Finlux, Telefunken, Toshiba (Vestel üretimi): Menü/Home, sonra 4 7 2 5.',
      dizi: [V('Menü', '070'), V('4', '044'), V('7', '047'), V('2', '042'), V('5', '045')] },
    { marka: 'Philips', ad: 'Servis menüsü (SAM)', not: 'TV açıkken: 0 6 2 5 9 6 ardından Menü ya da Bilgi.',
      dizi: [P('0', '00000'), P('6', '00006'), P('2', '00002'), P('5', '00005'), P('9', '00009'), P('6', '00006'), P('Menü', '00054')] },
    { marka: 'Sony', ad: 'Servis menüsü', not: 'TV bekleme modundayken: Display, 5, Ses+, Power.',
      dizi: [Y('Display', '5D0'), Y('5', '210'), Y('Ses+', '490'), Y('Power', 'A90')] }
  ];

  async function diziGonder(dizi, araMs) {
    for (const s of dizi) {
      const hata = gonder(s);
      if (hata) return hata;
      await Arac.bekle(araMs || 650);
    }
    return '';
  }

  window.IR = {
    anahtar, ETIKET, gonder, bas, diziGonder,
    MODLAR, FANLAR, SWINGV, SWINGH, KLIMA_MARKA, KLIMA_MODEL, klimaAdaylari, klimaGonder,
    LED24, LED44, SERVIS,
    durum() { return Yerel.json('irStatus') || { builtin: false, module: false, active: 'none' }; },
    acProtokoller() { return Yerel.json('irAcProtocols') || []; }
  };
})();
