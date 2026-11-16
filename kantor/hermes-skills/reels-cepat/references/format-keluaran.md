# Format keluaran

Susun semua dalam **satu dokumen** dengan urutan berikut. Gunakan heading yang sama agar mudah dipindai.

```
# [Judul video / ide]
Audiens: … · Durasi: … detik · Gaya: … · Sudut terpilih: … (skor …%)

## 1. Sudut (3 pilihan)
Tabel: Sudut | Hook | Scroll | Relevansi | Skor
Catatan: skor = perkiraan berdasarkan pola konten, bukan data performa.

## 2. Hook
- Utama: …
- Alternatif A: …
- Alternatif B: …

## 3. Naskah
**Hook** …
**Masalah** …
**Solusi** …
**CTA / Penutup** …

## 4. Naskah voiceover
(lihat format di bawah) + jumlah kata + perkiraan durasi

## 5. Shot list
Tabel: Waktu (dtk) | Teks di layar / subtitle | SFX / transisi

## 6. Subtitle
Daftar baris 1–3 kata, kata kunci **ditebalkan**

## 7. Caption per platform
Instagram · TikTok · YouTube Shorts
```

## Naskah voiceover
Versi lisan dari naskah. Aturan:
- Satu baris = satu tarikan napas. Kalimat pendek.
- `/` = jeda pendek (±0,3 dtk), `//` = jeda panjang (±0,6 dtk).
- **KAPITAL** = kata yang ditekan (maksimal 1 per kalimat).
- Tulis angka dan singkatan seperti diucapkan ("tiga", "Claude").
- Beri penanda bagian dalam kurung siku: `[HOOK]`, `[MASALAH]`, `[SOLUSI]`, `[CTA]`.
- Di akhir: `Jumlah kata: N · Perkiraan durasi: ~X dtk (2,5–3 kata/dtk)`.

Contoh:
```
[HOOK]
Lu pasti pernah bikin kesalahan NOMOR DUA. //
[MASALAH]
Reels udah diedit lama, / tapi tetap sepi.
```

## Shot list
Kolom wajib: `Waktu (dtk)`, `Teks di layar & subtitle`, `SFX/transisi`.
- Waktu berurutan tanpa celah, total = durasi video.
- Waktu dihitung dari voiceover (jumlah kata ÷ 2,5–3). Tandai bahwa angka waktu adalah perkiraan sampai suara direkam.
- Teks di layar ≤ 6 kata per layar.
- SFX/transisi: kata kerja singkat (mis. "pop saat angka muncul", "whoosh ke poin 2"). Jangan menyebut file tertentu.
- Tambahkan kolom `Visual` hanya jika pengguna memintanya.

## Subtitle
- 1–3 kata per baris, huruf kecil kecuali nama/istilah.
- Urutan persis mengikuti voiceover.
- Sorot 1 kata kunci per baris yang penting dengan **tebal**.
- Koreksi ejaan nama dan istilah (mis. "Claude", "Reels").

## Caption per platform
Videonya sama; hanya teks yang berbeda. Default (ubah jika pengguna menentukan lain):

| Platform | Isi | Panjang | Hashtag |
|---|---|---|---|
| Instagram | Baris pertama = hook ulang (muncul sebelum "selengkapnya"). Satu–dua kalimat nilai. Ajakan simpan/komen. | ±150–300 karakter | 5–8 |
| TikTok | Singkat, satu kalimat + ajakan. | ≤150 karakter | 3–5 |
| YouTube Shorts | Judul ≤ 100 karakter (hook ringkas). Deskripsi 1–2 kalimat. | judul ≤100 | 2–3 (sertakan #Shorts) |

Hashtag: campur 1–2 luas, sisanya spesifik niche. Tanpa hashtag yang tidak relevan.
Emoji: secukupnya (0–2), sesuai gaya pengguna.
Jika ada CTA kata kunci, ulangi kata kuncinya persis sama di ketiga caption.

## Ringkasan di chat
Setelah dokumen jadi, kirim ringkasan ≤6 baris:
1. Sudut terpilih + skor.
2. Hook utama.
3. Jumlah kata / perkiraan durasi.
4. Hal yang perlu dicek pengguna (angka, klaim, janji CTA).
5. Satu langkah lanjut.

## Jika tidak ada tool dokumen
Tulis ke `reels-<slug-ide>.md` dengan struktur di atas dan kirim sebagai file.
