#!/usr/bin/env bash
# Atur otak AI semua divisi Hermes (Joni + semua profil) sekaligus:
#   1. Utama   : model GRATIS OpenRouter (:free)
#   2. Cadangan: Gemini GRATIS (Google AI Studio)  — kalau model gratis OpenRouter sibuk
#   3. Terakhir: Claude Haiku (berbayar)           — hanya kalau 1 & 2 sama-sama gagal
#   + Tugas besar yang diserahkan ke "sub-agen" otomatis memakai Claude Sonnet (berbayar).
# Pengaturan lama disalin dulu ke config.yaml.bak-<waktu>.
# Jalankan sebagai user kantor:  bash atur-ai-hermes.sh
set -euo pipefail

HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
KANTOR_ENV="${KANTOR_ENV:-$HOME/kantor-virtual/.env}"
FREE_MODEL="${FREE_MODEL:-nvidia/nemotron-3-ultra-550b-a55b:free}"
PAID_FALLBACK="${PAID_FALLBACK:-anthropic/claude-haiku-5.5}"
BIG_TASK_MODEL="${BIG_TASK_MODEL:-anthropic/claude-sonnet-5.5}"

HERMES_BIN="$(command -v hermes || echo "$HOME/.local/bin/hermes")"
[ -x "$HERMES_BIN" ] || { echo "❌ Perintah hermes tidak ditemukan. Jalankan sebagai user kantor (sudo su - kantor)."; exit 1; }
PY="$(head -1 "$HERMES_BIN" | sed 's/^#!//' | awk '{print $1}')"
"$PY" -c 'import yaml' 2>/dev/null || PY=python3
"$PY" -c 'import yaml' 2>/dev/null || { echo "❌ Modul yaml tidak ada di Python Hermes. Kirim pesan ini ke Claude."; exit 1; }

# Ambil key Gemini dari .env kantor (tidak pernah ditampilkan).
GKEY="$(grep -E '^(GEMINI_API_KEY|GOOGLE_API_KEY)=' "$KANTOR_ENV" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"

HERMES_HOME="$HERMES_HOME" GKEY="$GKEY" FREE_MODEL="$FREE_MODEL" PAID_FALLBACK="$PAID_FALLBACK" BIG_TASK_MODEL="$BIG_TASK_MODEL" "$PY" - <<'PYEOF'
import os, glob, json, time, shutil, urllib.request, yaml

home = os.environ['HERMES_HOME']
gkey = os.environ.get('GKEY', '').strip()
free_model = os.environ['FREE_MODEL']
paid = os.environ['PAID_FALLBACK']
big = os.environ['BIG_TASK_MODEL']
stamp = time.strftime('%Y%m%d-%H%M%S')

# Pilih model Gemini gratis yang tersedia untuk key ini (flash-lite dulu, lalu flash).
gemini_model = None
if gkey:
    try:
        req = urllib.request.Request(f'https://generativelanguage.googleapis.com/v1beta/models?key={gkey}&pageSize=200')
        data = json.load(urllib.request.urlopen(req, timeout=20))
        names = [m['name'].split('/', 1)[1] for m in data.get('models', [])
                 if 'generateContent' in m.get('supportedGenerationMethods', [])]
        bad = ('image', 'tts', 'audio', 'live', 'embed', 'vision', 'thinking', 'learnlm', 'robotics', 'computer')
        names = [n for n in names if not any(b in n for b in bad)]
        for pref in (lambda n: 'flash-lite' in n and 'preview' not in n, lambda n: 'flash' in n and 'preview' not in n, lambda n: 'flash' in n):
            hits = sorted([n for n in names if pref(n)], reverse=True)
            if hits:
                gemini_model = hits[0]; break
    except Exception as e:
        print(f'⚠️  Key Gemini tidak bisa dicek ({e}). Cadangan Gemini dilewati.')
else:
    print('⚠️  GEMINI_API_KEY tidak ada di ~/kantor-virtual/.env — cadangan Gemini dilewati.')

homes = [home] + sorted(p for p in glob.glob(os.path.join(home, 'profiles', '*')) if os.path.isdir(p))
for h in homes:
    name = 'Joni (default)' if h == home else os.path.basename(h)
    cfg_path = os.path.join(h, 'config.yaml')
    if h != home and not any(os.path.exists(os.path.join(h, f)) for f in ('config.yaml', '.env', 'SOUL.md', 'profile.yaml')):
        continue
    cfg = {}
    if os.path.exists(cfg_path):
        shutil.copy2(cfg_path, f'{cfg_path}.bak-{stamp}')
        with open(cfg_path) as f:
            cfg = yaml.safe_load(f) or {}

    model = cfg.get('model')
    if not isinstance(model, dict):
        model = {}
    current = str(model.get('default') or '')
    model['provider'] = 'openrouter'
    model['default'] = current if current.endswith(':free') else free_model
    cfg['model'] = model

    chain = []
    if gemini_model:
        chain.append({'provider': 'gemini', 'model': gemini_model})
    chain.append({'provider': 'openrouter', 'model': paid})
    cfg['fallback_providers'] = chain
    cfg.pop('fallback_model', None)

    deleg = cfg.get('delegation') if isinstance(cfg.get('delegation'), dict) else {}
    deleg['model'] = big
    deleg['provider'] = 'openrouter'
    cfg['delegation'] = deleg

    with open(cfg_path, 'w') as f:
        yaml.safe_dump(cfg, f, sort_keys=False, allow_unicode=True)

    # Key Gemini juga harus ada di .env profil itu (Hermes membaca .env per profil).
    if gkey:
        env_path = os.path.join(h, '.env')
        text = open(env_path).read() if os.path.exists(env_path) else ''
        if 'GOOGLE_API_KEY=' not in text and 'GEMINI_API_KEY=' not in text:
            with open(env_path, 'a') as f:
                f.write(('' if text.endswith('\n') or not text else '\n') + f'GOOGLE_API_KEY={gkey}\n')
            os.chmod(env_path, 0o600)

    print(f'✅ {name}: utama {model["default"]}'
          + (f' → cadangan gemini/{gemini_model}' if gemini_model else '')
          + f' → terakhir {paid} · tugas besar {big}')
PYEOF

echo
echo "Memulai ulang Hermes…"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
"$HERMES_BIN" gateway restart >/dev/null 2>&1 && echo "✅ Hermes dimulai ulang." || echo "⚠️  Restart otomatis gagal. Jalankan manual: hermes gateway restart"
echo "Selesai. Pengaturan lama tersimpan sebagai config.yaml.bak-* di tiap profil."
