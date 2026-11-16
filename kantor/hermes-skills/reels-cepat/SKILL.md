---
name: reels-cepat
description: Ubah satu ide menjadi paket konten Reels/TikTok/Shorts lengkap — pilih sudut terkuat (dengan skor), lalu tulis hook, naskah (hook-masalah-solusi-CTA), naskah voiceover, shot list, subtitle, dan caption + hashtag per platform. Gunakan saat pengguna bilang "bikin reels", "buat naskah reels", "ide konten", "naskah voice over", "shot list", atau memberi ide video pendek.
---

# Reels Cepat

Dari **satu ide** jadi **satu paket siap syuting**: sudut terkuat, hook, naskah, naskah voiceover, shot list, subtitle, dan caption untuk tiap platform. Skill ini hanya menulis konten. Untuk mengedit/render videonya, lanjutkan dengan skill `shortform-edit` (jika terpasang).

Bahasa default: Indonesia santai (lu/gua), kalimat pendek, seperti ngomong ke teman. Kalau pengguna meminta gaya lain, ikuti gaya itu. Kalau pengguna menulis dalam bahasa lain, balas dalam bahasa itu.

## Alur

### 1. Kumpulkan input

Butuh empat hal. Kalau pengguna sudah menyebutnya, jangan ditanya lagi.

| Input | Keterangan | Default |
|---|---|---|
| Ide/topik | Wajib. Contoh: "3 kesalahan pemula pas ngedit reels" | — |
| Audiens/niche | Siapa yang ditarget | Tanyakan |
| Durasi | 15 / 30 / 45 / 60 detik | 30 detik |
| Gaya bahasa | Santai, edukatif, lucu, tegas, dll. | Santai (lu/gua) |

Gunakan AskUserQuestion jika tersedia (pilihan + rekomendasi). Jika tidak, tanya satu pesan singkat berisi semua pertanyaan yang belum terjawab. Jangan menebak audiens.

### 2. Pilih sudut terkuat

Tulis **3 sudut** (cara berbeda membingkai ide yang sama). Nilai tiap sudut 0–100% dengan dua kriteria saja:

- **Daya tahan scroll (hook):** seberapa kuat membuat orang berhenti dalam 3 detik pertama.
- **Relevansi ke audiens:** seberapa dekat dengan masalah nyata audiens itu.

Skor akhir = rata-rata kedua kriteria, dibulatkan. Tampilkan sebagai tabel urut dari tertinggi. Rincian cara menilai ada di `references/sudut-dan-skor.md`.

Skor ini **penilaian perkiraan berdasarkan pola konten**, bukan data performa nyata. Katakan itu dalam satu kalimat singkat. Lanjutkan dengan sudut tertinggi, lalu tawarkan menukar ke sudut lain jika pengguna mau.

### 3. Tulis paket konten

Gunakan struktur **Hook → Masalah → Solusi → CTA**. Urutan dan isi tiap bagian ada di `references/struktur-naskah.md`. Hasilkan lima keluaran ini:

1. **Hook:** satu pilihan utama + dua alternatif. Hook utama harus bisa diucapkan dalam ≤3 detik.
2. **Naskah:** isi lengkap per bagian (Hook, Masalah, Solusi, CTA), dibaca sebagai tulisan.
3. **Naskah voiceover:** versi untuk **diucapkan** dari naskah yang sama. Kalimat pendek, ritme lisan, tanda jeda dan penekanan. Format di `references/format-keluaran.md`.
4. **Shot list:** tabel `Waktu (detik) | Teks di layar & subtitle | SFX/transisi`. Tambahkan kolom visual hanya jika pengguna memintanya.
5. **Subtitle:** pecahan teks 1–3 kata per baris, urut sesuai voiceover, dengan kata kunci yang disorot (tandai dengan **tebal**).

Anggaran kata: bicara santai Indonesia ≈ 2,5–3 kata per detik. Untuk 30 detik, targetkan 70–85 kata voiceover. Hitung dan laporkan jumlah kata serta perkiraan durasi.

### 4. Caption per platform

Videonya sama; yang berbeda hanya teks. Buat tiga blok:

- **Caption Instagram** + hashtag
- **Caption TikTok** + hashtag
- **Judul + deskripsi YouTube Shorts** + hashtag

Aturan panjang dan hashtag ada di `references/format-keluaran.md`.

### 5. CTA (opsional)

Tambahkan CTA hanya jika pengguna memintanya atau CTA sudah ada di idenya. Kalau perlu CTA "komen kata tertentu", tanyakan **kata kuncinya** dan **apa yang dijanjikan** (mis. "Komen PANDUAN → nanti gua kirim templatenya"). Jangan menjanjikan sesuatu yang tidak jelas bisa dipenuhi pengguna. Jika tidak ada CTA, tutup naskah dengan penutup ringan (rangkuman satu kalimat atau pertanyaan).

### 6. Serahkan

- Susun semuanya sebagai **satu dokumen** sesuai `references/format-keluaran.md`. Gunakan tool/skill dokumen yang tersedia di sesi (Docs, `docx`, atau artifact). Jika tidak ada, tulis file `.md` dan kirim ke pengguna.
- Di chat, beri ringkasan singkat: sudut terpilih + skornya, hook utama, jumlah kata/durasi, dan satu langkah lanjut.
- Tawarkan: revisi hook, ganti sudut, versi durasi lain, atau lanjut mengedit video dengan `shortform-edit` bila pengguna punya footage.

## Aturan kualitas

- **Jangan mengarang klaim.** Angka, statistik, nama alat, atau hasil yang disebut di naskah harus berasal dari pengguna atau diverifikasi. Kalau ragu, tulis versi tanpa angka atau tandai `[cek: …]` untuk diisi pengguna.
- **Hook tidak boleh menipu.** Isi harus memenuhi janji hook.
- **Satu ide per video.** Kalau idenya terlalu lebar, usulkan memecahnya jadi beberapa video.
- **Cek ulang sebelum menyerahkan:** jumlah kata sesuai durasi, voiceover sinkron dengan shot list dan subtitle (urutan sama), tidak ada kalimat yang terlalu panjang untuk satu tarikan napas.
- **Revisi:** ubah hanya bagian yang diminta; jaga bagian lain agar tetap sinkron (mis. ganti hook → perbarui voiceover, shot list, dan subtitle).

## Referensi

- `references/sudut-dan-skor.md`: cara membuat 3 sudut dan menghitung skor.
- `references/struktur-naskah.md`: rumus Hook → Masalah → Solusi → CTA dan rumus hook.
- `references/format-keluaran.md`: format dokumen, voiceover, shot list, subtitle, dan caption.
