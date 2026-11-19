/**
 * U18 · Riwayat notifikasi: semua kabar yang dikirim kantor (Telegram & notifikasi HP) dicatat di VPS,
 * supaya Pak Rico bisa melihat lagi yang terlewat dari lonceng di aplikasi.
 * Hanya teks pesannya yang disimpan (tanpa token/kunci). 400 terakhir di data/notifikasi-riwayat.json.
 */
import fs from 'fs';
import path from 'path';

export interface Notif { id: string; at: number; saluran: 'telegram' | 'hp'; judul: string; isi: string; url?: string; jenis: string }
let file = ''; let st: { item: Notif[]; dibacaAt: number } = { item: [], dibacaAt: 0 };
let tunda: ReturnType<typeof setTimeout> | null = null; let seq = 0;

export function mulaiRiwayatNotif(dataDir: string) {
    file = path.join(dataDir, 'notifikasi-riwayat.json');
    try { st = { ...st, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* baru */ }
}
const simpan = () => { if (!file || tunda) return; tunda = setTimeout(() => { tunda = null; try { fs.writeFileSync(file, JSON.stringify(st)); } catch { /* */ } }, 1500); };

/** Tebak jenis dari isi supaya bisa difilter (trading, keuangan, konten, tim, jadwal, chat). */
export function jenisNotif(teks: string, saluran: Notif['saluran']) {
    const t = teks.toLowerCase();
    if (saluran === 'hp') return 'chat';
    if (/saham|sinyal|target|stop|posisi|trading|portofolio|\$[A-Z]/i.test(teks)) return 'trading';
    if (/rp\s?\d|keuangan|anggaran|pengeluaran|transaksi|tagihan/.test(t)) return 'keuangan';
    if (/konten|instagram|tiktok|youtube|posting|komentar|dm\b/.test(t)) return 'konten';
    if (/jadwal|agenda|rapat|kalender|pengingat/.test(t)) return 'jadwal';
    return 'tim';
}

export function catatNotif(n: { saluran: Notif['saluran']; judul?: string; isi: string; url?: string }) {
    const isi = String(n.isi || '').trim(); if (!isi) return;
    const baris = isi.split('\n');
    const judul = (n.judul || baris[0]).replace(/\s+/g, ' ').trim().slice(0, 120);
    const badan = (n.judul ? isi : baris.slice(1).join('\n')).trim().slice(0, 1500);
    // Gabungkan duplikat beruntun (mis. pesan yang sama dikirim ulang dalam 1 menit).
    const akhir = st.item[st.item.length - 1];
    if (akhir && akhir.judul === judul && akhir.isi === badan && Date.now() - akhir.at < 60_000) return;
    st.item.push({ id: `n${Date.now().toString(36)}${(seq++).toString(36)}`, at: Date.now(), saluran: n.saluran, judul, isi: badan, url: n.url, jenis: jenisNotif(isi, n.saluran) });
    st.item = st.item.slice(-400); simpan();
}
export function daftarNotif(n = 100, jenis = '') {
    const item = st.item.filter((x) => !jenis || x.jenis === jenis).slice(-n).reverse();
    return { item, dibacaAt: st.dibacaAt, belum: st.item.filter((x) => x.at > st.dibacaAt).length };
}
export function tandaiNotifDibaca() { st.dibacaAt = Date.now(); simpan(); }
