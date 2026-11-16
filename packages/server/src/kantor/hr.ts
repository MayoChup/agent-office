/**
 * HR kantor: memastikan tidak ada AI yang menganggur.
 * - Statistik kinerja tiap AI dari Papan kerja (angka pasti, bukan karangan AI).
 * - Review berkala oleh HR Officer (membandingkan satu AI dengan yang lain) → dilaporkan ke Grup Kantor & Joni.
 * - Cek mingguan: AI tanpa pekerjaan seminggu → Joni menyusun usulan tugas → MINTA PERSETUJUAN Pak Rico (chat pribadi).
 *   Tugas baru benar-benar dikirim ke AI hanya setelah disetujui.
 * - Kalau seminggu Pak Rico belum memberi perintah, Joni bertanya.
 */
import fs from 'fs';
import path from 'path';
import type { Kerja } from './papan';

export interface StatAi { id: string; nama: string; peran: string; selesai: number; gagal: number; proses: number; todo: number; rataDetik: number | null; terakhir: number; perSumber: Record<string, number>; selesai7: number; menganggur: boolean; peringkat: number; nilai: number }
export interface Usulan { id: string; ai: string; nama: string; judul: string; isi: string; alasan: string; status: 'menunggu' | 'disetujui' | 'ditolak'; dibuat: number; diputus?: number; tugasId?: string }
export interface Review { at: number; oleh: string; hari: number; teks: string; stat: StatAi[] }
interface St { reviewAt: number; mingguKe: string; usulan: Usulan[]; review: Review[] }
export const ID_HR = 'hr', ID_JONI = 'default';
const gid = () => Math.random().toString(36).slice(2, 10);
/** Kunci minggu (Senin WIB) — untuk "sekali seminggu". */
export function kunciMinggu(t = Date.now()) { const d = new Date(t + 7 * 3600_000); const s = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400_000); return s.toISOString().slice(0, 10); }

export function statistik(items: Kerja[], anggota: Array<{ id: string; nama: string; peran: string }>, hari = 14, kini = Date.now()): StatAi[] {
    const sejak = kini - hari * 86400_000, sejak7 = kini - 7 * 86400_000;
    const out = anggota.map((a) => {
        const milik = items.filter((k) => k.ai === a.id);
        const dalam = milik.filter((k) => (k.selesai || k.mulai || k.dibuat) >= sejak);
        const selesai = dalam.filter((k) => k.status === 'selesai');
        const dur = selesai.filter((k) => k.mulai && k.selesai).map((k) => (k.selesai! - k.mulai!) / 1000);
        const perSumber: Record<string, number> = {}; for (const k of selesai) perSumber[k.sumber] = (perSumber[k.sumber] || 0) + 1;
        const proses = milik.filter((k) => k.status === 'proses').length, todo = milik.filter((k) => k.status === 'todo').length;
        const selesai7 = selesai.filter((k) => (k.selesai || 0) >= sejak7).length;
        const gagal = dalam.filter((k) => k.status === 'gagal').length;
        return {
            id: a.id, nama: a.nama, peran: a.peran, selesai: selesai.length, gagal, proses, todo,
            rataDetik: dur.length ? Math.round(dur.reduce((x, y) => x + y, 0) / dur.length) : null,
            terakhir: Math.max(0, ...milik.map((k) => k.selesai || k.mulai || 0)), perSumber, selesai7,
            // Menganggur = seminggu tidak menyelesaikan apa pun DAN tidak sedang mengerjakan / antre apa pun.
            menganggur: selesai7 === 0 && proses === 0 && todo === 0,
            nilai: selesai.length - gagal * 0.5, peringkat: 0
        };
    });
    [...out].sort((a, b) => b.nilai - a.nilai || b.terakhir - a.terakhir).forEach((s, i) => { s.peringkat = i + 1; });
    return out.sort((a, b) => a.peringkat - b.peringkat);
}
const lama = (d: number | null) => (d == null ? '–' : d < 90 ? `${d} dtk` : `${Math.round(d / 60)} mnt`);
export function tabelTeks(stat: StatAi[], hari: number) {
    return [`Kinerja ${hari} hari terakhir (dari Papan kerja):`, ...stat.map((s) => `${s.peringkat}. ${s.nama} (${s.peran || s.id}) — selesai ${s.selesai}, gagal ${s.gagal}, sedang dikerjakan ${s.proses}, antre ${s.todo}, rata-rata ${lama(s.rataDetik)}/pekerjaan, selesai 7 hari terakhir ${s.selesai7}${s.menganggur ? ' ← MENGANGGUR' : ''}`)].join('\n');
}

export class Hr {
    private file: string;
    st: St = { reviewAt: 0, mingguKe: '', usulan: [], review: [] };
    sibuk = '';
    constructor(dataDir: string, public hariReview = Math.max(7, Number(process.env.HR_HARI) || 14)) {
        this.file = path.join(dataDir, 'hr.json');
        try { this.st = { ...this.st, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) }; } catch { /* baru */ }
    }
    simpan() { if (this.st.usulan.length > 200) this.st.usulan = this.st.usulan.slice(-200); if (this.st.review.length > 12) this.st.review = this.st.review.slice(-12); fs.writeFileSync(this.file, JSON.stringify(this.st)); }
    get menunggu() { return this.st.usulan.filter((u) => u.status === 'menunggu'); }
    reviewBerikut() { return this.st.reviewAt ? this.st.reviewAt + this.hariReview * 86400_000 : Date.now(); }

    promptReview(stat: StatAi[]) {
        return [
            'Kamu HR Officer Kantor Virtual Pak Rico. Tugasmu menilai kinerja tim AI secara adil dan membandingkan satu AI dengan yang lain.',
            'Di bawah ini ANGKA PASTI dari Papan kerja. Jangan mengubah, menambah, atau mengarang angka.',
            'Tulis review dalam Bahasa Indonesia yang sopan dan lugas, maksimal 180 kata, tanpa tabel:',
            '1) siapa paling produktif dan kenapa (pakai angkanya), 2) siapa yang tertinggal / banyak gagal dibanding rekan sepantarannya,',
            '3) siapa yang MENGANGGUR (kalau ada) — sebut namanya jelas, 4) satu saran konkret untuk Joni (Kepala AI) agar beban kerja lebih merata.',
            'Jangan menyalahkan AI yang memang belum diberi tugas; sebut itu sebagai masalah pembagian kerja.',
            '', tabelTeks(stat, this.hariReview)
        ].join('\n');
    }
    /** Review cadangan tanpa AI (angka saja). */
    reviewPolos(stat: StatAi[]) {
        const atas = stat[0], ngg = stat.filter((s) => s.menganggur), gagal = [...stat].sort((a, b) => b.gagal - a.gagal)[0];
        return [
            `Review kinerja ${this.hariReview} hari.`,
            atas ? `Paling produktif: ${atas.nama} (${atas.selesai} pekerjaan selesai).` : '',
            gagal && gagal.gagal > 0 ? `Paling banyak gagal: ${gagal.nama} (${gagal.gagal} kali) — perlu dicek penyebabnya.` : '',
            ngg.length ? `Menganggur seminggu terakhir: ${ngg.map((s) => s.nama).join(', ')}. Joni perlu membagi tugas.` : 'Tidak ada yang menganggur seminggu terakhir.'
        ].filter(Boolean).join(' ');
    }
    promptUsulan(ngg: StatAi[], deskripsi: Map<string, string>) {
        return [
            'Kamu Joni, Kepala AI di Kantor Virtual Pak Rico. Beberapa anggota tim belum punya pekerjaan minggu ini.',
            'Susun SATU usulan tugas mingguan untuk tiap anggota di bawah, sesuai perannya, yang benar-benar berguna untuk Pak Rico (keuangan pribadi, trading saham AS, catatan, jadwal, riset).',
            'BATASAN: tugas hanya berupa riset/analisis/ringkasan/rapikan data/laporan. DILARANG: membeli/menjual, mengirim email atau pesan ke orang lain, memposting, menghapus data, mengubah keuangan.',
            'Tugas harus bisa selesai dalam ±30 menit dan hasilnya berupa laporan singkat.',
            'Jawab HANYA JSON valid: {"usulan":[{"id":"<id anggota>","judul":"maks 90 huruf","isi":"2–3 kalimat: apa yang dikerjakan dan bentuk hasilnya"}]}',
            '', 'ANGGOTA YANG MENGANGGUR:', ...ngg.map((s) => `- id: ${s.id} | nama: ${s.nama} | peran: ${s.peran} | ${deskripsi.get(s.id) || ''}`)
        ].join('\n');
    }
    /** Usulan cadangan menurut peran (kalau AI tidak menjawab). */
    usulanPolos(s: StatAi): { judul: string; isi: string } {
        const p = `${s.id} ${s.peran}`.toLowerCase();
        if (/berita|news/.test(p)) return { judul: 'Ringkasan berita pasar minggu ini untuk watchlist', isi: 'Rangkum berita penting 7 hari terakhir untuk saham di watchlist dan posisi, tandai yang berisiko. Hasil: laporan singkat per saham.' };
        if (/fundamental/.test(p)) return { judul: 'Cek kesehatan keuangan saham di watchlist', isi: 'Periksa pendapatan, laba, utang, dan arus kas tiap saham di watchlist. Hasil: daftar sehat / perlu diwaspadai beserta alasannya.' };
        if (/smart|whale|money/.test(p)) return { judul: 'Pantau transaksi investor besar & Kongres minggu ini', isi: 'Kumpulkan pembelian/penjualan besar terbaru yang menyangkut watchlist. Hasil: daftar singkat siapa membeli/menjual apa.' };
        if (/trad/.test(p)) return { judul: 'Evaluasi posisi & watchlist mingguan', isi: 'Tinjau posisi terbuka dan watchlist: mana yang mendekati target/stop, mana yang layak dikeluarkan. Hasil: ringkasan dengan saran tindak lanjut.' };
        if (/keu|finan|uang/.test(p)) return { judul: 'Ringkasan pengeluaran minggu ini', isi: 'Rangkum pengeluaran 7 hari terakhir per kategori dan bandingkan dengan anggaran. Hasil: 5 poin temuan dan saran hemat.' };
        return { judul: `Laporan mingguan ${s.peran || s.nama}`, isi: 'Susun laporan singkat: apa yang sudah dikerjakan di bidangmu, apa yang tertunda, dan 3 usulan perbaikan untuk minggu depan.' };
    }
    tambahUsulan(list: Array<{ s: StatAi; judul: string; isi: string; alasan: string }>) {
        const baru: Usulan[] = [];
        for (const x of list) {
            if (this.st.usulan.some((u) => u.ai === x.s.id && u.status === 'menunggu')) continue; // jangan menumpuk usulan untuk AI yang sama
            const u: Usulan = { id: gid(), ai: x.s.id, nama: x.s.nama, judul: x.judul.slice(0, 120), isi: x.isi.slice(0, 600), alasan: x.alasan, status: 'menunggu', dibuat: Date.now() };
            this.st.usulan.push(u); baru.push(u);
        }
        this.simpan();
        return baru;
    }
}
export function ambilUsulanJson(raw: string, ids: Set<string>): Map<string, { judul: string; isi: string }> {
    const m = new Map<string, { judul: string; isi: string }>();
    const a = (raw || '').indexOf('{'), b = (raw || '').lastIndexOf('}');
    if (a < 0 || b <= a) return m;
    try { for (const u of JSON.parse(raw.slice(a, b + 1)).usulan || []) if (ids.has(String(u.id)) && u.judul) m.set(String(u.id), { judul: String(u.judul).replace(/\s+/g, ' ').slice(0, 120), isi: String(u.isi || '').replace(/\s+/g, ' ').slice(0, 600) }); } catch { /* */ }
    return m;
}
