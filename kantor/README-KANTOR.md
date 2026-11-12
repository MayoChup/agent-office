# Kantor Virtual: panduan pasang di VPS

Kantor pixel yang menampilkan tim Hermes kamu (Joni, Uang, Eca, dan seterusnya) sebagai karakter yang hidup.

- **Karakter = divisi Hermes.** Kalau Joni merekrut divisi baru, karakternya otomatis muncul.
- **Kerja nyata dari papan Kanban Hermes.** Saat sebuah divisi mengerjakan tugas, karakternya duduk di meja (💻). Tugas selesai ditandai ✅, tugas yang tertahan ⚠️.
- **"Kehidupan kantor" memakai model AI gratis OpenRouter (`:free`).** Agen berjalan, mengobrol, dan mengusulkan tugas. Tidak memotong saldo.
- **Hanya bisa dibuka lewat SSH tunnel.** Server mendengarkan `127.0.0.1`, tidak terbuka ke internet.

Semua perintah di bawah dijalankan di VPS sebagai user **`kantor`** (`sudo -iu kantor`).

---

## 1. Pasang Node.js 22 (sekali saja)

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version
```

## 2. Unduh paket kantor

Paketnya sudah di-build otomatis oleh GitHub, jadi VPS tidak perlu build apa-apa.

```bash
mkdir -p ~/kantor-virtual && cd ~/kantor-virtual
curl -fsSL https://github.com/MayoChup/agent-office/releases/download/kantor-latest/kantor-virtual-linux-x64.tar.gz | tar xz
ls
```

## 3. Atur nama, divisi, dan kunci AI

```bash
cd ~/kantor-virtual
cp kantor.config.example.json kantor.config.json
nano kantor.config.json
```

Di bagian `agents`, kuncinya adalah **nama profil Hermes** (`default` = Kepala), dan isinya adalah nama panggilan yang tampil di kantor. Divisi yang tidak ditulis di sini tetap muncul, dengan nama dari profilnya.

Lalu salin kunci OpenRouter dari Hermes **tanpa menampilkannya di layar**:

```bash
grep '^OPENROUTER_API_KEY=' ~/.hermes/.env > ~/kantor-virtual/.env
chmod 600 ~/kantor-virtual/.env
grep -c OPENROUTER_API_KEY ~/kantor-virtual/.env   # harus 1
```

### Kuota AI gratis (penting)

| Total pembelian kredit OpenRouter (sepanjang waktu) | Kuota model `:free` | Isi `dailyRequestLimit` |
|---|---|---|
| Kurang dari $10 | 50 permintaan/hari | `45` |
| $10 atau lebih | 1.000 permintaan/hari | `900` |

Dengan 5 agen dan `thinkIntervalMinutes: 10`, pemakaiannya sekitar 720 permintaan per hari. Kalau kuotamu masih 50 per hari, naikkan `thinkIntervalMinutes` (misalnya `60`) atau top up sampai total pembelian $10.

## 4. Coba jalankan

```bash
cd ~/kantor-virtual
node kantor-server.js
```

Seharusnya muncul `Kantor Virtual Pak Rico siap. Anggota: Joni, ...`. Tekan **Ctrl+C** untuk berhenti.

## 5. Jalankan otomatis sebagai service

```bash
mkdir -p ~/.config/systemd/user
cp ~/kantor-virtual/kantor-virtual.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now kantor-virtual
systemctl --user status kantor-virtual
```

Log: `journalctl --user -u kantor-virtual -f`

Service ini tetap hidup walaupun kamu logout, karena `loginctl enable-linger kantor` sudah diaktifkan saat setup Hermes.

## 6. Buka dari laptop

Di PowerShell laptop:

```powershell
ssh -L 3000:localhost:3000 kantor@IP_VPS
```

Biarkan jendela itu terbuka, lalu buka **http://localhost:3000** di browser.

## 7. Update otomatis dari GitHub

VPS mengecek GitHub setiap 3 menit. Kalau ada versi baru, VPS mengunduh dan memasangnya sendiri, lalu mengirim kabar ke Telegram kamu lewat bot Joni. Kalau versi baru gagal jalan, VPS otomatis kembali ke versi lama.

```bash
cp ~/kantor-virtual/kantor-update.service ~/kantor-virtual/kantor-update.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now kantor-update.timer
systemctl --user list-timers | grep kantor
```

- Cek sekarang juga (tanpa menunggu 3 menit): `systemctl --user start kantor-update`
- Log update: `journalctl --user -u kantor-update -n 30`
- `kantor.config.json`, `.env`, dan folder `data/` tidak pernah tertimpa.
- VPS yang **menarik** update dari GitHub, jadi tidak ada kunci VPS yang disimpan di GitHub.

---

## Cara memakai

- **Papan Tugas (kiri atas):** tugas yang ditulis di sini adalah **kerja nyata**. Tugas itu dikirim ke divisi lewat Hermes, sama seperti perintah dari Telegram.
- **Obrolan Kantor (kanan bawah):** ngobrol santai. `@Eca halo` untuk menyapa divisi tertentu. Tanpa `@`, pesan diterima Kepala. Obrolan di sini memakai AI gratis dan **bukan** perintah kerja.
- **Kotak kiri bawah:** klik untuk melihat pemakaian kuota AI gratis, model yang sedang dipakai, dan sisa jatah tugas otomatis.

## Kunci pengaman

1. Agen kantor **tidak bisa** mengirim email/pesan ke luar, posting, mengubah data keuangan, atau menghapus apa pun.
2. Tugas otomatis yang menyentuh hal sensitif (email, posting, transfer, hapus, saham, dan sejenisnya), atau yang ditujukan ke divisi di `protectedProfiles` (bawaan: `keuangan`), **dialihkan ke Kepala** dengan label `[Perlu izin Pak Rico]`.
3. Tugas otomatis dibatasi `dailyAutonomousTaskLimit` (bawaan: 3 per hari). Usulan rekrut dibatasi `dailyHireProposalLimit` (bawaan: 1 per hari) dan **selalu lewat Kepala**, yang wajib meminta OK kamu (sesuai SOP Joni).
4. Jumlah divisi yang tampil dibatasi `maxAgents` (bawaan: 8).
5. Hanya model `:free` yang dipakai. Model berbayar diabaikan kecuali kamu sendiri mengisi `KANTOR_ALLOW_PAID=1` di `.env`.
6. Database Hermes hanya **dibaca**. Tugas dibuat lewat perintah resmi `hermes kanban create`.

Mau mematikan tugas otomatis sepenuhnya? Ubah `"allowAutonomousTasks": false`, lalu jalankan `systemctl --user restart kantor-virtual`.

---

## 8. Kata sandi kantor (wajib sejak versi bagan divisi)

Kantor sekarang selalu minta login. Atur kata sandi di VPS:

```bash
nano ~/kantor-virtual/.env        # tambahkan baris: KANTOR_PASSWORD=isi-sandi-kamu
systemctl --user restart kantor-virtual
```

Kalau tidak diisi, kantor membuat sandi acak sendiri. Lihat dengan:
`cat ~/kantor-virtual/data/kantor-password.txt`

## 9. Buka dari mana saja (Vercel + Tailscale Funnel)

Tampilan kantor ada di Vercel, tapi datanya tetap dari VPS. Supaya HP/laptop
mana pun bisa menyambung ke VPS lewat HTTPS, nyalakan Tailscale Funnel di VPS:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up                  # buka link yang muncul, login
sudo tailscale funnel --bg 3000    # catat alamat https://....ts.net yang muncul
```

Lalu buka https://kantornyarico.vercel.app, isi **Alamat server** dengan alamat `https://….ts.net`
tadi dan kata sandi kantor. Browser mengingat login 30 hari.

Matikan akses publik kapan saja: `sudo tailscale funnel --bg 3000 off`

## 10. Bagan divisi

- Setiap profil Hermes (kecuali `default`) = satu divisi dengan ruangan sendiri.
- Anggota tambahan sebuah divisi: beri nama profil `divisi-nama`, misalnya
  `keuangan-pajak` otomatis masuk ruang Keuangan.
- Bagan & ruangan berubah sendiri (±30 detik) saat profil dibuat atau dihapus.
- Nama/ikon/warna divisi bisa diatur di `kantor.config.json`:
  `"divisions": { "keuangan": { "name": "Keuangan Pribadi", "icon": "💰", "color": "#22c55e" } }`

Aset pixel (lantai, dinding, furnitur, karakter) dari proyek *pixel-agents* oleh Pablo De Lucca (lisensi MIT).

## 11. Pencatat transaksi otomatis (tanpa AI)

Membaca email notifikasi BCA, Livin' (Mandiri), Krom, dan Jago dari Gmail lalu menambah baris ke
tab "Transaksi" di Google Sheets. Memakai izin Google milik Hermes (`~/.hermes/google_token.json`).

Atur di `kantor.config.json` bagian `pencatat` (`spreadsheetId` wajib). Uji dulu tanpa menulis apa pun:

```bash
cd ~/kantor-virtual && node kantor-server.js --uji-pencatat
```

Kategori bisa ditambah, misalnya `"kategori": { "Makan & Minum": ["NAMA WARUNG LANGGANAN"] }`.
