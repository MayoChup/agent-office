#!/usr/bin/env bash
# Pekerjaan terjadwal Hermes (pengingat, laporan, Reels) dikirim ke aplikasi kantor, bukan Telegram:
# deliver yang berisi telegram / origin / all diganti "local"; kantor meneruskan hasilnya ke chat AI di aplikasi.
# Aman diulang. Tulis atomik (berkas sementara + rename) supaya tidak bentrok dengan penjadwal Hermes.
set -euo pipefail
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
HERMES_HOME="$HERMES_HOME" python3 - <<'PYEOF'
import os, glob, json
home = os.environ['HERMES_HOME']
dirs = [home] + sorted(p for p in glob.glob(os.path.join(home, 'profiles', '*')) if os.path.isdir(p))
n = 0
for h in dirs:
    f = os.path.join(h, 'cron', 'jobs.json')
    if not os.path.exists(f): continue
    try:
        with open(f) as fh: data = json.load(fh)
    except Exception:
        continue
    jobs = data if isinstance(data, list) else data.get('jobs', []) if isinstance(data, dict) else []
    ubah = 0
    for j in jobs:
        if not isinstance(j, dict): continue
        d = j.get('deliver')
        teks = ','.join(d) if isinstance(d, list) else str(d or '')
        if not teks or teks == 'local': continue
        token = [t.strip().split(':')[0] for t in teks.split(',')]
        if any(t in ('telegram', 'origin', 'all') for t in token):
            sisa = [t for t in teks.split(',') if t.strip().split(':')[0] not in ('telegram', 'origin', 'all')]
            j['deliver'] = ','.join(['local'] + sisa) if sisa else 'local'
            ubah += 1
    if ubah:
        tmp = f + '.kantor-tmp'
        with open(tmp, 'w') as fh: json.dump(data, fh, indent=2, ensure_ascii=False)
        os.replace(tmp, f)
        n += ubah
        print(f'{os.path.basename(h) if h != home else "Joni"}: {ubah} pekerjaan dipindah ke aplikasi')
print(f'JUMLAH {n}')
PYEOF
