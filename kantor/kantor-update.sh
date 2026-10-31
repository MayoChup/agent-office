#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  Update otomatis Kantor Virtual dari GitHub.
#
#  Dijalankan oleh timer setiap beberapa menit. Cara kerjanya:
#  1. Cek rilis "kantor-latest" di GitHub (repo publik, tanpa token).
#  2. Kalau ada versi baru: unduh, simpan cadangan versi lama, pasang.
#  3. Restart service, lalu cek apakah kantor hidup.
#     Kalau gagal: otomatis kembali ke versi lama.
#  4. Kirim kabar ke Telegram lewat bot Hermes (kalau tersedia).
#
#  VPS yang MENARIK update dari GitHub, bukan GitHub yang masuk ke VPS.
#  Jadi tidak ada kunci VPS yang disimpan di GitHub.
#
#  kantor.config.json, .env, dan folder data/ tidak pernah disentuh.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

REPO="${KANTOR_REPO:-MayoChup/agent-office}"
TAG="${KANTOR_TAG:-kantor-latest}"
ASSET="kantor-virtual-linux-x64.tar.gz"
DIR="${KANTOR_DIR:-$HOME/kantor-virtual}"
PORT="${PORT:-3000}"
STATE="$DIR/.deployed"
HERMES_ENV="${HERMES_HOME:-$HOME/.hermes}/.env"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

notify() {
  # Kabar singkat ke Telegram pemilik, memakai bot Hermes. Token tidak pernah dicetak.
  [ -f "$HERMES_ENV" ] || return 0
  local token chat
  token="$(grep -E '^TELEGRAM_BOT_TOKEN=' "$HERMES_ENV" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")" || true
  chat="$(grep -E '^TELEGRAM_HOME_CHANNEL=' "$HERMES_ENV" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")" || true
  if [ -z "$chat" ]; then
    chat="$(grep -E '^TELEGRAM_ALLOWED_USERS=' "$HERMES_ENV" | head -1 | cut -d= -f2- | cut -d, -f1 | tr -d '"' | tr -d "' ")" || true
  fi
  [ -n "$token" ] && [ -n "$chat" ] || return 0
  curl -fsS -m 15 "https://api.telegram.org/bot${token}/sendMessage" \
    --data-urlencode "chat_id=${chat}" --data-urlencode "text=$1" > /dev/null || true
}

json="$(curl -fsSL -m 30 -H 'Accept: application/vnd.github+json' \
  "https://api.github.com/repos/${REPO}/releases/tags/${TAG}")" || { log "Tidak bisa cek GitHub, coba lagi nanti."; exit 0; }

read -r asset_id url commit < <(printf '%s' "$json" | python3 -c '
import sys, json
d = json.load(sys.stdin)
a = [x for x in d.get("assets", []) if x.get("name") == sys.argv[1]]
print(a[0]["id"] if a else "", a[0]["browser_download_url"] if a else "", (d.get("target_commitish") or "")[:7])
' "$ASSET")

if [ -z "${asset_id:-}" ]; then log "Rilis belum punya paket, lewati."; exit 0; fi
if [ -f "$STATE" ] && [ "$(cat "$STATE")" = "$asset_id" ]; then exit 0; fi

log "Versi baru ditemukan (${commit}). Mengunduh..."
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL -m 300 "$url" -o "$tmp/paket.tgz"
mkdir -p "$tmp/baru"
tar xzf "$tmp/paket.tgz" -C "$tmp/baru"
[ -f "$tmp/baru/kantor-server.js" ] || { log "Paket rusak, batal."; exit 1; }

# Cadangan versi yang sedang jalan.
rm -rf "$DIR/.previous"
mkdir -p "$DIR/.previous"
for item in kantor-server.js ui node_modules package.json package-lock.json kantor-update.sh; do
  [ -e "$DIR/$item" ] && cp -a "$DIR/$item" "$DIR/.previous/"
done

# Hentikan dulu supaya file tidak diganti saat sedang dipakai.
systemctl --user stop kantor-virtual || true

# Pasang versi baru (paket tidak berisi config, .env, maupun data).
rm -rf "$DIR/ui"
cp -a "$tmp/baru/." "$DIR/"
chmod +x "$DIR/kantor-update.sh" 2>/dev/null || true

systemctl --user start kantor-virtual
ok=""
for _ in $(seq 1 15); do
  sleep 2
  if curl -fsS -m 5 "http://127.0.0.1:${PORT}/api/kantor/status" > /dev/null 2>&1; then ok=1; break; fi
done

if [ -n "$ok" ]; then
  echo "$asset_id" > "$STATE"
  log "Update berhasil ke versi ${commit}."
  notify "✅ Kantor Virtual diperbarui ke versi ${commit}."
else
  log "Versi baru gagal jalan. Kembali ke versi lama..."
  systemctl --user stop kantor-virtual || true
  rm -rf "$DIR/ui"
  cp -a "$DIR/.previous/." "$DIR/"
  systemctl --user start kantor-virtual
  # Tandai versi ini supaya tidak dicoba berulang-ulang.
  echo "$asset_id" > "$STATE"
  notify "⚠️ Update Kantor Virtual ke versi ${commit} gagal jalan, otomatis kembali ke versi lama. Cek log: journalctl --user -u kantor-virtual"
  exit 1
fi
