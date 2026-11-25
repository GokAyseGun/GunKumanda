#!/usr/bin/env python3
"""Flipper ayrıştırılmış -> IRremoteESP8266 eşleştirmesini Flipper'ın kendi
test vektörleriyle doğrular. Kullanım: verify_mapping.py <decode_tool> <irtest klasörü>"""
import json, re, subprocess, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'tools'))
from build_db import convert_parsed
tool, d = sys.argv[1], sys.argv[2]
proc = subprocess.Popen([tool], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
def ask(l):
    proc.stdin.write(l + "\n"); proc.stdin.flush(); return json.loads(proc.stdout.readline())
MASK = {'RC5': 0x7FF, 'RC5X': 0xFFF, 'RC6': 0xFFFF}
ok = bad = skip = 0
for fn in sorted(os.listdir(d)):
    txt = open(os.path.join(d, fn)).read()
    items = re.findall(r'name: (\w+)\ntype: (\w+)\n(.*?)(?=\nname: |\Z)', txt, re.S)
    raw, exp = {}, {}
    for name, typ, body in items:
        m = re.match(r'(decoder_input|encoder_expected|decoder_expected|encoder_input)(\d+)', name)
        if not m: continue
        k, n = m.groups()
        if typ == 'raw':
            dm = re.search(r'data:([ \d-]+)', body)
            if dm and dm.group(1).strip(): raw[(k, n)] = dm.group(1)
        else:
            pm = re.findall(r'protocol: (\S+)\naddress: ([0-9A-F ]+)\ncommand: ([0-9A-F ]+)', body)
            if pm: exp[(k, n)] = pm[0]
    for (k, n), data in raw.items():
        e = exp.get(('decoder_expected', n)) if k == 'decoder_input' else exp.get(('encoder_input', n))
        if not e: continue
        conv = convert_parsed(*e)
        if not conv or conv[0] != 'enc': skip += 1; continue
        a = ask("RAW " + data)
        enc = ask("ENC %s %s %d" % (conv[1], conv[2], conv[3]))
        b = ask("RAW " + " ".join(str(x) for x in enc.get('t', [])))
        if not a.get('ok') or not b.get('ok'):
            bad += 1; print("DECODE?", fn, e, a.get('protocol'), b.get('protocol')); continue
        va, vb = int(a.get('value', '0'), 16), int(b.get('value', '0'), 16)
        msk = MASK.get(conv[1], (1 << 64) - 1)
        if conv[1] == 'PIONEER':
            vb = vb & 0xFFFFFFFF if b['protocol'] == 'PIONEER' else vb
        if (va & msk) == (vb & msk): ok += 1
        else:
            bad += 1; print("FARK", fn, e, conv, a.get('protocol'), hex(va), b.get('protocol'), hex(vb))
print("dogru=%d hatali=%d atlanan=%d" % (ok, bad, skip))
