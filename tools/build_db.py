#!/usr/bin/env python3
"""Gün Kumanda - IR kod veritabanı oluşturucu.

Flipper-IRDB (.ir dosyaları) ve Flipper'ın evrensel listelerini uygulamanın
okuduğu sıkıştırılmış JSON paketlerine çevirir.

Kullanım:
  python3 build_db.py <Flipper-IRDB klasörü> <evrensel .ir klasörü> <çıkış klasörü>

Sinyal biçimi (JSON dizi):
  ["Ad", "PROTOKOL", "HEXDEĞER", bit]   -> native çekirdek (IRremoteESP8266) üretir
  ["Ad", frekans, [t0, t1, ...]]         -> ham zamanlama (mikrosaniye)
Protokol adları IRremoteESP8266 adlarıdır (NEC, SAMSUNG, RC5, RC5X, RC6, SONY,
PANASONIC, NIKAI, PIONEER).
"""
import hashlib
import json
import os
import re
import sys
from collections import defaultdict

# --- yardımcılar -----------------------------------------------------------


def rev(v, n=8):
    """n bitlik değerin bit sırasını ters çevir."""
    r = 0
    for i in range(n):
        if v & (1 << i):
            r |= 1 << (n - 1 - i)
    return r


def le_bytes(s):
    """'84 79 00 00' -> [0x84, 0x79, 0x00, 0x00]"""
    return [int(x, 16) for x in s.split()]


def le_int(s):
    b = le_bytes(s)
    return sum(v << (8 * i) for i, v in enumerate(b))


def nec_raw(bits_lsb_first, freq=38000):
    t = [9000, 4500]
    for bit in bits_lsb_first:
        t += [560, 1690 if bit else 560]
    t += [560]
    return freq, t


def bits_of(v, n):
    return [(v >> i) & 1 for i in range(n)]


def convert_parsed(proto, address, command):
    """Flipper ayrıştırılmış sinyalini bizim biçime çevirir.
    Dönüş: ("enc", PROTO, hex, bits) ya da ("raw", freq, t) ya da None.
    Eşleştirmeler Flipper'ın birim test vektörleriyle doğrulanmıştır
    (tests/verify_mapping.py)."""
    a = le_bytes(address)
    c = le_bytes(command)
    p = proto.strip()
    if p == 'NEC':
        b = [a[0], (~a[0]) & 0xFF, c[0], (~c[0]) & 0xFF]
        v = (rev(b[0]) << 24) | (rev(b[1]) << 16) | (rev(b[2]) << 8) | rev(b[3])
        return ('enc', 'NEC', '%08X' % v, 32)
    if p == 'NECext':
        b = [a[0], a[1], c[0], c[1]]
        v = (rev(b[0]) << 24) | (rev(b[1]) << 16) | (rev(b[2]) << 8) | rev(b[3])
        return ('enc', 'NEC', '%08X' % v, 32)
    if p == 'Samsung32':
        b = [a[0], a[0], c[0], (~c[0]) & 0xFF]
        v = (rev(b[0]) << 24) | (rev(b[1]) << 16) | (rev(b[2]) << 8) | rev(b[3])
        return ('enc', 'SAMSUNG', '%08X' % v, 32)
    if p == 'RC5':
        v = ((a[0] & 0x1F) << 6) | (c[0] & 0x3F)
        return ('enc', 'RC5', '%03X' % v, 12)
    if p == 'RC5X':
        cmd = c[0] & 0x7F
        v = ((((~cmd) >> 6) & 1) << 12) | ((a[0] & 0x1F) << 6) | (cmd & 0x3F)
        return ('enc', 'RC5X', '%04X' % v, 13)
    if p == 'RC6':
        v = (a[0] << 8) | c[0]
        return ('enc', 'RC6', '%05X' % v, 20)
    if p == 'SIRC':
        v = (rev(c[0] & 0x7F, 7) << 5) | rev(a[0] & 0x1F, 5)
        return ('enc', 'SONY', '%03X' % v, 12)
    if p == 'SIRC15':
        v = (rev(c[0] & 0x7F, 7) << 8) | rev(a[0], 8)
        return ('enc', 'SONY', '%04X' % v, 15)
    if p == 'SIRC20':
        addr = le_int(address) & 0x1FFF
        v = (rev(c[0] & 0x7F, 7) << 13) | rev(addr, 13)
        return ('enc', 'SONY', '%05X' % v, 20)
    if p == 'Kaseikyo':
        addr = le_int(address)
        cmd = le_int(command) & 0xFFFF
        ident = (addr >> 24) & 3
        vendor = (addr >> 8) & 0xFFFF
        g1 = (addr >> 4) & 0xF
        g2 = addr & 0xF
        d = [vendor & 0xFF, vendor >> 8, 0, 0, 0, 0]
        par = d[0] ^ d[1]
        par = (par & 0xF) ^ (par >> 4)
        d[2] = (par & 0xF) | (g1 << 4)
        d[3] = (g2 & 0xF) | ((cmd & 0xF) << 4)
        d[4] = ((ident << 6) | (cmd >> 4)) & 0xFF
        d[5] = d[2] ^ d[3] ^ d[4]
        v = 0
        for x in d:
            v = (v << 8) | rev(x)
        return ('enc', 'PANASONIC', '%012X' % v, 48)
    if p == 'RCA':
        aa = a[0] & 0xF
        cc = c[0]
        v = (rev((~aa) & 0xF, 4) << 20) | (rev((~cc) & 0xFF) << 12) | \
            (rev(aa, 4) << 8) | rev(cc)
        return ('enc', 'NIKAI', '%06X' % v, 24)
    if p == 'Pioneer':
        b = [a[0], (~a[0]) & 0xFF, c[0], (~c[0]) & 0xFF]
        v = (rev(b[0]) << 24) | (rev(b[1]) << 16) | (rev(b[2]) << 8) | rev(b[3])
        return ('enc', 'PIONEER', '%016X' % ((v << 32) | v), 64)
    if p == 'NEC42':
        addr = le_int(address) & 0x1FFF
        cmd = c[0]
        bits = bits_of(addr, 13) + bits_of((~addr) & 0x1FFF, 13) + \
            bits_of(cmd, 8) + bits_of((~cmd) & 0xFF, 8)
        f, t = nec_raw(bits)
        return ('raw', f, t)
    if p == 'NEC42ext':
        addr = le_int(address) & 0x3FFFFFF
        cmd = le_int(command) & 0xFFFF
        f, t = nec_raw(bits_of(addr, 26) + bits_of(cmd, 16))
        return ('raw', f, t)
    return None


# --- .ir ayrıştırma ----------------------------------------------------------

def parse_ir(path):
    sigs = []
    try:
        txt = open(path, encoding='utf-8', errors='replace').read()
    except OSError:
        return sigs
    cur = {}

    def flush():
        if 'name' in cur and 'type' in cur:
            sigs.append(dict(cur))
    for line in txt.splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if ':' not in line:
            continue
        k, v = line.split(':', 1)
        k = k.strip().lower()
        v = v.strip()
        if k == 'name':
            flush()
            cur.clear()
        cur[k] = v
    flush()
    out = []
    for s in sigs:
        name = s.get('name', '').strip()[:40] or '?'
        if s.get('type') == 'parsed':
            if 'protocol' not in s or 'address' not in s or 'command' not in s:
                continue
            try:
                r = convert_parsed(s['protocol'], s['address'], s['command'])
            except (ValueError, IndexError):
                r = None
            if not r:
                continue
            if r[0] == 'enc':
                out.append([name, r[1], r[2], r[3]])
            else:
                out.append([name, r[1], r[2]])
        elif s.get('type') == 'raw':
            try:
                f = int(float(s.get('frequency', '38000')))
                t = [abs(int(x)) for x in s.get('data', '').split()]
            except ValueError:
                continue
            if len(t) < 4 or f < 10000 or f > 60000:
                continue
            t = [min(x, 2000000) for x in t]
            out.append([name, f, t])
    return out


# --- kategoriler -------------------------------------------------------------

MAIN_CATS = {
    'ACs': 'klima', 'TVs': 'tv', 'Universal_TV_Remotes': 'tv',
    'Cable_Boxes': 'uydu', 'DVB-T': 'uydu', 'TV_Tuner': 'uydu',
    'SoundBars': 'ses', 'Audio_and_Video_Receivers': 'ses', 'Speakers': 'ses',
    'CD_Players': 'ses', 'Multimedia': 'ses', 'Car_Multimedia': 'ses',
    'Head_Units': 'ses', 'MiniDisc': 'ses',
    'Projectors': 'projektor', 'Streaming_Devices': 'tvbox',
    'Consoles': 'tvbox', 'LED_Lighting': 'aydinlatma', 'Fans': 'vantilator',
    'Heaters': 'isitici', 'Fireplaces': 'isitici', 'Air_Purifiers': 'hava',
    'Humidifiers': 'hava', 'Blu-Ray': 'medya', 'DVD_Players': 'medya',
    'VCR': 'medya', 'Laserdisc': 'medya', 'Monitors': 'ekran',
    'Touchscreen_Displays': 'ekran', 'Digital_Signs': 'ekran',
    'CCTV': 'dvr', 'Converters': 'diger', 'Cameras': 'diger',
}

CATEGORIES = [
    ('klima', 'Klima', 'ac'),
    ('tv', 'TV', 'tv'),
    ('uydu', 'Uydu alıcısı', 'sat'),
    ('ses', 'Ses sistemi', 'audio'),
    ('dvr', 'DVR / NVR', 'dvr'),
    ('projektor', 'Projektör', 'projector'),
    ('tvbox', 'TV box / IPTV', 'box'),
    ('aydinlatma', 'Aydınlatma', 'light'),
    ('vantilator', 'Vantilatör', 'fan'),
    ('isitici', 'Isıtıcı / şömine', 'heat'),
    ('hava', 'Hava temizleyici / nem', 'air'),
    ('medya', 'DVD / Blu-ray / video', 'media'),
    ('ekran', 'Monitör / ekran', 'screen'),
    ('diger', 'Diğer', 'other'),
]

KEYWORDS = [
    ('klima', r'air ?con|aircon|\bac\b|a/c|klima|conditioner|split'),
    ('dvr', r'\bdvr\b|\bnvr\b|cctv|hikvision|dahua'),
    ('uydu', r'sat\b|satellite|dss|cable|\bstb\b|set.?top|dvb|freeview|digibox'),
    ('projektor', r'projector|beamer|beam\b'),
    ('tv', r'\btv\b|television|plasma|lcd|\bled\b ?tv|tv\.ir'),
    ('ses', r'receiver|recv|amp|audio|\bcd\b|cassette|tape|surround|speaker|'
            r'sound|hi-?fi|stereo|tuner|radio|theat|deck|minisystem|mini.?system'),
    ('medya', r'dvd|blu|\bbd\b|vcr|vhs|video|\bpvr\b|media|laser'),
    ('aydinlatma', r'light|lamp|bulb|candle'),
    ('vantilator', r'\bfan\b|fans'),
    ('isitici', r'heater|fireplace'),
    ('tvbox', r'roku|apple ?tv|fire ?tv|android ?box|streaming|kodi|mibox'),
    ('ekran', r'monitor|display'),
]


def categorize_converted(parts):
    text = ' '.join(parts).lower().replace('_', ' ')
    for cat, rx in KEYWORDS:
        if re.search(rx, text):
            return cat
    return 'diger'


def nice(s):
    s = os.path.splitext(s)[0]
    s = s.replace('_', ' ').strip()
    s = re.sub(r'\s+', ' ', s)
    return s


def brand_key(b):
    return re.sub(r'[^a-z0-9]', '', b.lower())


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(1)
    root, univ_dir, out = sys.argv[1], sys.argv[2], sys.argv[3]
    os.makedirs(out, exist_ok=True)
    remotes = defaultdict(list)  # cat -> list
    seen = set()
    counts = defaultdict(int)
    brand_names = {}

    def add(cat, brand, model, src, sigs):
        if not sigs:
            return
        h = hashlib.sha1(json.dumps(sigs, separators=(',', ':')).encode()
                         ).hexdigest()[:16]
        if h in seen:
            return
        seen.add(h)
        bk = brand_key(brand) or 'bilinmiyor'
        # Aynı markanın farklı yazımlarını tek isimde topla
        if bk not in brand_names or (brand_names[bk].isupper() and
                                     not brand.isupper()):
            brand_names[bk] = brand
        remotes[cat].append({'b': bk, 'm': model, 's': src, 'k': sigs})
        counts[cat] += 1

    for dirpath, _, files in os.walk(root):
        if '/.git' in dirpath:
            continue
        rel = os.path.relpath(dirpath, root)
        parts = [] if rel == '.' else rel.split(os.sep)
        for fn in files:
            if not fn.endswith('.ir'):
                continue
            path = os.path.join(dirpath, fn)
            sigs = parse_ir(path)
            if not parts:
                continue
            if parts[0] == '_Converted_':
                if len(parts) < 3:
                    continue
                pack = parts[1]  # CSV / IR_Plus / Pronto / Other
                brand = nice(parts[3]) if len(parts) > 3 else nice(fn)
                dev = [re.sub(r'^Unknown[_ ]?', '', x) for x in parts[4:]]
                kod = os.path.splitext(fn)[0]
                if re.fullmatch(r'-?\d+[,_]-?\d+', kod):
                    kod = 'kod ' + re.split(r'[,_]', kod)[0]
                model = nice(' '.join([d for d in dev if d] + [kod])) or 'Genel'
                cat = categorize_converted(parts[3:] + [fn])
                if cat == 'diger' and pack not in ('CSV', 'IR_Plus'):
                    # Sınıflandırılamayan Pronto kayıtları ham sinyal olduğu
                    # için çok yer kaplıyor; atla.
                    continue
                src = {'CSV': 'irdb', 'IR_Plus': 'irplus',
                       'Pronto': 'pronto'}.get(pack, 'flipper')
                add(cat, brand, model, src, sigs)
            else:
                cat = MAIN_CATS.get(parts[0], 'diger')
                brand = nice(parts[1]) if len(parts) > 1 else 'Genel'
                model = nice(fn)
                if model.lower().startswith(brand.lower()):
                    model = model[len(brand):].strip(' -_') or model
                add(cat, brand, model, 'flipper', sigs)

    # Paketleri yaz
    index = {'version': 1, 'categories': []}
    for cid, cname, icon in CATEGORIES:
        lst = sorted(remotes.get(cid, []),
                     key=lambda r: (brand_names.get(r['b'], r['b']).lower(),
                                    r['m'].lower()))
        brands = defaultdict(list)
        pack = []
        for i, r in enumerate(lst):
            rid = '%s-%d' % (cid, i)
            brands[r['b']].append([rid, r['m'], len(r['k']), r['s']])
            pack.append([rid, r['k']])
        with open(os.path.join(out, 'cat_%s.json' % cid), 'w') as f:
            json.dump(pack, f, separators=(',', ':'), ensure_ascii=False)
        index['categories'].append({
            'id': cid, 'name': cname, 'icon': icon, 'count': len(lst),
            'brands': sorted(
                [{'k': k, 'n': brand_names.get(k, k), 'r': v}
                 for k, v in brands.items()],
                key=lambda b: b['n'].lower())})
    with open(os.path.join(out, 'index.json'), 'w') as f:
        json.dump(index, f, separators=(',', ':'), ensure_ascii=False)

    # Evrensel listeler (hızlı bulma)
    univ = {}
    for fn in sorted(os.listdir(univ_dir)):
        if not fn.endswith('.ir'):
            continue
        groups = defaultdict(list)
        for s in parse_ir(os.path.join(univ_dir, fn)):
            groups[s[0]].append(s[1:])
        univ[os.path.splitext(fn)[0]] = groups
    with open(os.path.join(out, 'universal.json'), 'w') as f:
        json.dump(univ, f, separators=(',', ':'), ensure_ascii=False)

    total = sum(counts.values())
    print('Toplam kumanda:', total)
    for cid, _, _ in CATEGORIES:
        print('  %-12s %d' % (cid, counts.get(cid, 0)))
    for k, v in univ.items():
        print('  evrensel %-10s %s' % (k, {n: len(x) for n, x in
                                            sorted(v.items())[:0]} or
                                         sum(len(x) for x in v.values())))


if __name__ == '__main__':
    main()
