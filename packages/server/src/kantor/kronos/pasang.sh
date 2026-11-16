#!/usr/bin/env bash
# Memasang Kronos di VPS (sekali saja): lingkungan Python terpisah + PyTorch versi CPU + kode Kronos + bobot model.
# Tidak menyentuh Hermes atau paket sistem. Butuh ±1,5 GB disk.
set -euo pipefail
DIR="$1"; MODEL="${2:-NeoQuasar/Kronos-small}"; TOKENIZER="${3:-NeoQuasar/Kronos-Tokenizer-base}"
mkdir -p "$DIR"; cd "$DIR"
echo "[1/5] Menyiapkan Python…"
PY=""; for c in python3.12 python3.11 python3.10 python3; do if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'; then PY="$c"; break; fi; done
[ -n "$PY" ] || { echo "GAGAL: butuh Python 3.10 atau lebih baru."; exit 2; }
if [ ! -x venv/bin/python ]; then
  "$PY" -m venv venv 2>/dev/null || { command -v uv >/dev/null 2>&1 && uv venv --seed venv; } || { "$PY" -m pip install --user --break-system-packages -q virtualenv && "$PY" -m virtualenv venv; } \
    || { echo "GAGAL: tidak bisa membuat lingkungan Python. Jalankan sekali: sudo apt install -y python3-venv"; exit 3; }
fi
echo "[2/5] Memasang PyTorch (CPU, ±200 MB unduhan)…"
venv/bin/python -m pip install -q --upgrade pip
venv/bin/python -m pip install -q torch --index-url https://download.pytorch.org/whl/cpu
echo "[3/5] Memasang pustaka pendukung…"
venv/bin/python -m pip install -q numpy pandas einops huggingface_hub safetensors tqdm
echo "[4/5] Mengambil kode Kronos…"
if [ ! -d repo/model ]; then rm -rf repo; git clone -q --depth 1 https://github.com/shiyu-coder/Kronos repo; fi
echo "[5/5] Mengunduh bobot model $MODEL…"
venv/bin/python - "$MODEL" "$TOKENIZER" <<'PY'
import sys
from huggingface_hub import snapshot_download
for m in sys.argv[1:]:
    snapshot_download(m)
print("bobot siap")
PY
date -u +%FT%TZ > terpasang
echo "SELESAI: Kronos terpasang."
