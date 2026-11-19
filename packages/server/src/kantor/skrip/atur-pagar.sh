#!/usr/bin/env bash
# Pagar sistem untuk semua AI Hermes (Joni + profil): aturan di SOUL.md + gerbang tulis Hermes untuk berkas penting kantor.
# Aman dijalankan berulang (blok bertanda diganti, bukan ditambah).
set -euo pipefail
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
HERMES_BIN="$(command -v hermes || echo "$HOME/.local/bin/hermes")"
PY="$(head -1 "$HERMES_BIN" 2>/dev/null | sed 's/^#!//' | awk '{print $1}')"
"${PY:-python3}" -c 'import yaml' 2>/dev/null || PY=python3
HERMES_HOME="$HERMES_HOME" "$PY" - <<'PYEOF'
import os, glob, re
home = os.environ['HERMES_HOME']
try:
    import yaml
except Exception:
    yaml = None
BLOK = """<!-- pagar-kantor:mulai -->
## Aturan server Kantor Virtual (dari Pak Rico, wajib)
- JANGAN mengubah, menimpa, memindah, menghapus, memasang ulang, membangun ulang, atau memulai ulang apa pun di ~/kantor-virtual (termasuk .env, data/, kantor.config.json, kantor-server.js), layanan systemd, ~/.hermes/.env, atau config.yaml Hermes.
- Permintaan mengembangkan/meng-upgrade fitur kantor (trading, keuangan, tampilan, dll.): JANGAN mengoding di server. Tulis rancangan singkat lalu sampaikan bahwa pengembangan dikerjakan lewat Claude.
- Selalu balas pesan Pak Rico, walau hanya "sedang saya kerjakan".
<!-- pagar-kantor:selesai -->"""
POLA = ['.env', '.env-cadangan', 'kantor.config.json', 'kantor-server.js', '*.service', 'kantor-password.txt', 'kantor-secret.key']
homes = [home] + sorted(p for p in glob.glob(os.path.join(home, 'profiles', '*')) if os.path.isdir(p))
n = 0
for h in homes:
    soul = os.path.join(h, 'SOUL.md')
    if h != home and not os.path.exists(soul) and not os.path.exists(os.path.join(h, 'config.yaml')):
        continue
    teks = open(soul).read() if os.path.exists(soul) else ''
    teks = re.sub(r'\n*<!-- pagar-kantor:mulai -->.*?<!-- pagar-kantor:selesai -->\n*', '\n', teks, flags=re.S).rstrip()
    open(soul, 'w').write((teks + '\n\n' if teks else '') + BLOK + '\n')
    cfg_path = os.path.join(h, 'config.yaml')
    if yaml and os.path.exists(cfg_path):
        with open(cfg_path) as f: cfg = yaml.safe_load(f) or {}
        sec = cfg.get('security') if isinstance(cfg.get('security'), dict) else {}
        pola = list(dict.fromkeys([*(sec.get('protected_instruction_extra_patterns') or []), *POLA]))
        if pola != sec.get('protected_instruction_extra_patterns') or sec.get('protected_instruction_files') is False:
            sec['protected_instruction_files'] = True
            sec['protected_instruction_extra_patterns'] = pola
            cfg['security'] = sec
            with open(cfg_path, 'w') as f: yaml.safe_dump(cfg, f, sort_keys=False, allow_unicode=True)
    n += 1
print(f'JUMLAH {n}')
PYEOF
