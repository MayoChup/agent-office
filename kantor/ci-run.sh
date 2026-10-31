#!/usr/bin/env bash
# Menjalankan satu langkah CI. Kalau gagal, 40 baris terakhir log dikirim sebagai
# anotasi error, supaya penyebabnya terlihat tanpa membuka log lengkap.
# Pemakaian: bash kantor/ci-run.sh "Judul langkah" perintah argumen...
title="$1"; shift
log="$(mktemp)"
if "$@" >"$log" 2>&1; then
  cat "$log"
else
  code=$?
  cat "$log"
  msg="$(tail -40 "$log" | sed -e 's/%/%25/g' -e 's/\r//g' | sed ':a;N;$!ba;s/\n/%0A/g')"
  echo "::error title=${title}::${msg}"
  exit "$code"
fi
