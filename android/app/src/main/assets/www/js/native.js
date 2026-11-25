/* Android köprüsü sarmalayıcısı. Tarayıcıda test için sahte (mock) köprü sağlar. */
(function () {
  'use strict';
  const bekleyen = {};
  let sayac = 0;
  const dinleyiciler = {};

  window.__nativeCb = function (id, veri) {
    const f = bekleyen[id];
    if (f) { delete bekleyen[id]; f(veri); }
  };
  window.__nativeEvent = function (tur, veri) {
    (dinleyiciler[tur] || []).slice().forEach(f => { try { f(veri); } catch (e) { console.error(e); } });
    (dinleyiciler['*'] || []).forEach(f => { try { f(tur, veri); } catch (e) {} });
  };

  const gercek = typeof window.Native !== 'undefined';

  // Tarayıcıda deneme için sahte köprü
  const sahte = {
    info: () => JSON.stringify({ version: 'tarayıcı', sdk: 0, model: 'Tarayıcı', gyro: false, hid: false }),
    vibrate() {}, keepScreenOn() {}, volumeKeys() {}, requestPermissions() {},
    shareText(t, x) { console.log('PAYLAŞ', t, x); }, saveText(n, x) { console.log('KAYDET', n, x.length); },
    openUrl(u) { window.open(u); }, speech(cb) { setTimeout(() => __nativeCb(cb, { ok: true, text: 'deneme yazısı' }), 400); },
    irStatus: () => JSON.stringify({ builtin: true, module: false, moduleName: '', active: 'builtin', canLearn: false }),
    irSetOutput() {},
    irSendRaw(f, t) { console.log('IR ham', f, t.split(',').length); return ''; },
    irSendProto(p, h, b) { console.log('IR', p, h, b); return ''; },
    irEncode: (p, h, b) => JSON.stringify({ f: 38000, t: [9000, 4500, 560, 560] }),
    irSendAc(p, m, f, d) { console.log('KLİMA', p, m, f, d); return ''; },
    irEncodeAc: () => JSON.stringify({ f: 38000, t: [] }),
    irAcProtocols: () => JSON.stringify(['COOLIX', 'MIDEA', 'GREE', 'LG', 'DAIKIN', 'TOSHIBA_AC', 'MITSUBISHI_AC',
      'MITSUBISHI_HEAVY_88', 'FUJITSU_AC', 'SAMSUNG_AC', 'HAIER_AC', 'ELECTRA_AC', 'VESTEL_AC', 'TCL112AC', 'KELON',
      'PANASONIC_AC', 'HITACHI_AC', 'SHARP_AC', 'CARRIER_AC64']),
    irProtocols: () => '[]',
    irDecode: () => JSON.stringify({ ok: true, protocol: 'NEC', bits: 32, value: '0x00FFA25D' }),
    moduleConnect: () => 'Tarayıcıda modül yok', moduleForget() {}, learnStart: () => 'Tarayıcıda modül yok', learnStop() {},
    tvScan(cb) { setTimeout(() => __nativeCb(cb, [{ host: '192.168.1.40', platform: 'webos', name: 'LG TV', model: 'OLED55' },
      { host: '192.168.1.41', platform: 'androidtv', name: 'TCL Google TV', model: '' }]), 700); },
    tvProbe(ip, cb) { setTimeout(() => __nativeCb(cb, { platform: 'webos' }), 300); },
    tvConnect(h, p, cb) { setTimeout(() => __nativeCb(cb, { ok: true, error: '' }), 500); },
    tvPairStart(h, cb) { setTimeout(() => __nativeCb(cb, { ok: true, error: '' }), 300); },
    tvPairFinish(h, c, cb) { setTimeout(() => __nativeCb(cb, { ok: true, error: '' }), 300); },
    tvSonyPsk() {}, tvKey: (n) => { console.log('TV', n); return true; }, tvText: () => true, tvEnter: () => true,
    tvBackspace: () => true, tvLaunch: () => true, tvPointer: () => true, tvClick: () => true, tvScroll: () => true,
    tvHasPointer: () => true, tvWake: () => '', tvDisconnect() {},
    tvInfo(cb) { setTimeout(() => __nativeCb(cb, { platform: 'webos', model: 'OLED55C1', version: '05.10', mac: 'aa:bb:cc:dd:ee:ff' }), 300); },
    hidStart: () => '', hidStop() {}, hidBonded: () => '[]', hidConnect: () => '', hidDiscoverable() {},
    hidConnected: () => false, hidMove() {}, hidScroll() {}, hidClick() {}, hidButton() {}, hidKey: () => true, hidText() {},
    airStart: () => false, airStop() {}, airEngage() {}, airMode() {}, airConfig() {}
  };

  const N = gercek ? window.Native : sahte;

  function cagri(ad, ...arg) {
    try { return N[ad](...arg); } catch (e) { console.error('Köprü hatası', ad, e); return null; }
  }

  function json(ad, ...arg) {
    const r = cagri(ad, ...arg);
    if (r == null || r === '') return null;
    try { return JSON.parse(r); } catch (e) { return null; }
  }

  function sozlu(ad, ...arg) {
    return new Promise(resolve => {
      const id = 'c' + (++sayac);
      bekleyen[id] = resolve;
      cagri(ad, ...arg, id);
    });
  }

  window.Yerel = {
    gercek,
    cagri, json, sozlu,
    on(tur, f) { (dinleyiciler[tur] = dinleyiciler[tur] || []).push(f); return () => Yerel.off(tur, f); },
    off(tur, f) { dinleyiciler[tur] = (dinleyiciler[tur] || []).filter(x => x !== f); },
    titre(ms) { if (Ayar.get('titresim', true)) cagri('vibrate', ms || 18); }
  };
})();
