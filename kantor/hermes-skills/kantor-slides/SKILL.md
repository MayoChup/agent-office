---
name: kantor-slides
description: Membuat presentasi Google Slides dari kerangka (judul, poin, catatan pembicara) untuk Pak Rico. Pakai saat diminta membuat slide, presentasi, deck, atau bahan paparan.
---

# Google Slides Kantor

Presentasi dibuat lewat program kantor (tanpa AI tambahan), memakai akun Google Pak Rico.

## Langkah

1. Pahami permintaan: topik, untuk siapa, berapa slide (default 6–10). Kalau ada bahan (Docs, Sheets, email, catatan Obsidian), baca dulu.
2. Tulis kerangka ke file `~/kantor-virtual/data/slides/<nama-pendek>.md` dengan format persis ini:

```
# Judul Presentasi
Subjudul singkat (opsional)

## Judul slide 1
- poin pendek (maks ±12 kata)
- poin pendek
> catatan pembicara (opsional, boleh beberapa baris berawalan >)

## Judul bagian tanpa poin
```

   Aturan isi: 3–5 poin per slide, kalimat pendek, angka pakai hasil nyata (jangan mengarang). Slide tanpa poin jadi slide pembatas bagian.
3. Jalankan:

```
mkdir -p ~/kantor-virtual/data/slides
cd ~/kantor-virtual && node kantor-server.js --slides buat data/slides/<nama-pendek>.md
```

4. Kirim tautan hasilnya ke Pak Rico, plus ringkasan 1–2 baris isi slide.

## Kalau gagal

- "Google Slides API belum diaktifkan" → teruskan pesannya apa adanya ke Pak Rico (berisi tautan untuk mengaktifkan). Jangan coba cara lain.
- "Izin Google" → minta Pak Rico login ulang Google Workspace lewat Joni.
- Cek kesiapan kapan saja: `cd ~/kantor-virtual && node kantor-server.js --slides cek`

## Batasan

- Jangan membagikan (share) presentasi ke orang lain tanpa izin Pak Rico.
- Jangan menghapus presentasi atau file Drive apa pun.
