#!/usr/bin/env bash
# Otak chat semua AI Hermes lewat FreeLLM (router gratis di VPS, 127.0.0.1) — atau kembalikan seperti semula.
#   bash atur-otak-freellm.sh nyala   → model utama = FreeLLM "auto"; model lama jadi cadangan pertama
#   bash atur-otak-freellm.sh mati    → pulihkan config.yaml dari salinan sebelum-freellm
# Dijalankan oleh kantor (tombol di Tugas → Model AI). Kunci FreeLLM dibaca lewat key_cmd dari berkas 600, tidak ditulis ke config.
set -euo pipefail
MODE="${1:-nyala}"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
KUNCI_FILE="${FREELLM_KUNCI_FILE:?}"
PORT="${FREELLM_PORT:-3001}"

HERMES_BIN="$(command -v hermes || echo "$HOME/.local/bin/hermes")"
[ -x "$HERMES_BIN" ] || { echo "Perintah hermes tidak ditemukan."; exit 1; }
PY="$(head -1 "$HERMES_BIN" | sed 's/^#!//' | awk '{print $1}')"
"$PY" -c 'import yaml' 2>/dev/null || PY=python3
"$PY" -c 'import yaml' 2>/dev/null || { echo "Modul yaml tidak ada di Python Hermes."; exit 1; }
[ "$MODE" = "mati" ] || [ -s "$KUNCI_FILE" ] || { echo "FreeLLM belum siap (kunci belum ada). Tunggu FreeLLM berjalan lalu coba lagi."; exit 1; }

MODE="$MODE" HERMES_HOME="$HERMES_HOME" KUNCI_FILE="$KUNCI_FILE" PORT="$PORT" "$PY" - <<'PYEOF'
import os, glob, shutil, yaml, shlex
mode = os.environ['MODE']; home = os.environ['HERMES_HOME']
kunci = os.environ['KUNCI_FILE']; port = os.environ['PORT']
homes = [home] + sorted(p for p in glob.glob(os.path.join(home, 'profiles', '*')) if os.path.isdir(p))
n = 0
for h in homes:
    cfg_path = os.path.join(h, 'config.yaml')
    salinan = cfg_path + '.sebelum-freellm'
    nama = 'Joni' if h == home else os.path.basename(h)
    if mode == 'mati':
        if os.path.exists(salinan):
            shutil.copy2(salinan, cfg_path); os.remove(salinan); n += 1
            print(f'{nama}: dikembalikan')
        continue
    if h != home and not any(os.path.exists(os.path.join(h, f)) for f in ('config.yaml', '.env', 'SOUL.md', 'profile.yaml')):
        continue
    cfg = {}
    if os.path.exists(cfg_path):
        with open(cfg_path) as f: cfg = yaml.safe_load(f) or {}
        if not os.path.exists(salinan): shutil.copy2(cfg_path, salinan)
    model = cfg.get('model') if isinstance(cfg.get('model'), dict) else {}
    lama_p = str(model.get('provider') or ''); lama_m = str(model.get('default') or model.get('model') or '')
    prov = cfg.get('providers') if isinstance(cfg.get('providers'), dict) else {}
    prov['freellm'] = {
        'name': 'FreeLLM (router gratis kantor)', 'api': f'http://127.0.0.1:{port}/v1',
        'key_cmd': f'cat {shlex.quote(kunci)}', 'transport': 'chat_completions',
        'default_model': 'auto', 'models': ['auto'], 'context_length': 131072, 'discover_models': False,
    }
    cfg['providers'] = prov
    if lama_p != 'freellm':
        cadangan = [{'provider': lama_p, 'model': lama_m}] if lama_p and lama_m else []
        for x in (cfg.get('fallback_providers') or []):
            if isinstance(x, dict) and x.get('provider') and x.get('model') and x not in cadangan and x.get('provider') != 'freellm':
                cadangan.append(x)
        cfg['fallback_providers'] = cadangan
        cfg.pop('fallback_model', None)
    cfg['model'] = {**{k: v for k, v in model.items() if k not in ('base_url', 'api_key', 'key_env', 'model')}, 'provider': 'freellm', 'default': 'auto'}
    aux = cfg.get('auxiliary') if isinstance(cfg.get('auxiliary'), dict) else {}
    vis = aux.get('vision') if isinstance(aux.get('vision'), dict) else {}
    vis.update({'provider': 'main'}); vis.pop('model', None)  # gambar ikut lewat FreeLLM (memilih model visi sendiri)
    aux['vision'] = vis; cfg['auxiliary'] = aux
    with open(cfg_path, 'w') as f: yaml.safe_dump(cfg, f, sort_keys=False, allow_unicode=True)
    n += 1
    print(f'{nama}: utama FreeLLM, cadangan ' + (', '.join(f"{c['provider']}/{c['model']}" for c in cfg['fallback_providers'][:2]) or '-'))
print(f'JUMLAH {n}')
PYEOF

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
"$HERMES_BIN" gateway restart >/dev/null 2>&1 || true
