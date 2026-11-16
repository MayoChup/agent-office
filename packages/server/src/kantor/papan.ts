/**
 * Papan kerja AI: catatan apa saja yang dikerjakan tim AI (To do → Proses → Selesai).
 * - Disimpan di VPS (data/papan-kerja.json), jadi bisa dilihat kapan saja sebagai riwayat.
 * - Dibersihkan otomatis tiap ganti bulan (WIB); isi bulan lalu dipindah ke arsip (data/papan-arsip/BBBB-BB.json).
 *   Pekerjaan yang belum selesai ikut terbawa ke bulan baru.
 */
import fs from 'fs';
import path from 'path';

export type StatusKerja = 'todo' | 'proses' | 'selesai' | 'gagal';
export type SumberKerja = 'chat' | 'tugas' | 'sistem' | 'trading' | 'laporan';
export interface Kerja {
    id: string; ai: string; nama: string; judul: string; detail?: string; hasil?: string;
    sumber: SumberKerja; status: StatusKerja; dibuat: number; mulai?: number; selesai?: number;
}
const bulanWib = (t = Date.now()) => new Date(t + 7 * 3600_000).toISOString().slice(0, 7);
const pendek = (s: any, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export class Papan {
    private file: string; private arsipDir: string;
    private st: { bulan: string; items: Kerja[] } = { bulan: bulanWib(), items: [] };
    private kotor: NodeJS.Timeout | null = null;
    private seq = 0;

    constructor(dataDir: string) {
        this.file = path.join(dataDir, 'papan-kerja.json');
        this.arsipDir = path.join(dataDir, 'papan-arsip');
        try { const d = JSON.parse(fs.readFileSync(this.file, 'utf8')); if (d?.bulan && Array.isArray(d.items)) this.st = d; } catch { /* baru */ }
        // Pekerjaan yang masih "proses" saat server mati tidak mungkin masih jalan → tandai terputus.
        for (const k of this.st.items) if (k.status === 'proses' || (k.status === 'todo' && k.sumber !== 'tugas')) { k.status = 'gagal'; k.selesai = Date.now(); k.hasil = k.hasil || 'Terputus karena server dimulai ulang.'; }
        this.gantiBulan();
    }
    private simpan() {
        if (this.kotor) return;
        this.kotor = setTimeout(() => { this.kotor = null; try { fs.writeFileSync(this.file, JSON.stringify(this.st)); } catch (e: any) { console.warn('[Papan]', e?.message || e); } }, 800);
    }
    /** Ganti bulan → arsipkan bulan lalu, mulai papan bersih (yang belum selesai ikut terbawa). */
    private gantiBulan() {
        const kini = bulanWib();
        if (this.st.bulan === kini) return;
        try {
            fs.mkdirSync(this.arsipDir, { recursive: true });
            const f = path.join(this.arsipDir, `${this.st.bulan}.json`);
            let lama: Kerja[] = []; try { lama = JSON.parse(fs.readFileSync(f, 'utf8')).items || []; } catch { /* */ }
            fs.writeFileSync(f, JSON.stringify({ bulan: this.st.bulan, items: [...lama, ...this.st.items] }));
        } catch (e: any) { console.warn('[Papan] arsip gagal:', e?.message || e); }
        this.st = { bulan: kini, items: this.st.items.filter((k) => k.status === 'todo' || k.status === 'proses') };
        this.simpan();
    }

    catat(x: { ai: string; nama: string; judul: string; detail?: string; sumber: SumberKerja; status?: StatusKerja }): string {
        this.gantiBulan();
        const id = `k${Date.now().toString(36)}${(this.seq++).toString(36)}`;
        const status = x.status || 'todo';
        this.st.items.push({ id, ai: x.ai, nama: x.nama, judul: pendek(x.judul, 140), detail: x.detail ? pendek(x.detail, 300) : undefined, sumber: x.sumber, status, dibuat: Date.now(), mulai: status === 'proses' ? Date.now() : undefined, selesai: status === 'selesai' || status === 'gagal' ? Date.now() : undefined });
        if (this.st.items.length > 4000) this.st.items.splice(0, this.st.items.length - 4000);
        this.simpan();
        return id;
    }
    ubah(id: string | undefined, status: StatusKerja, hasil?: string) {
        if (!id) return;
        const k = this.st.items.find((x) => x.id === id);
        if (!k) return;
        k.status = status;
        if (status === 'proses' && !k.mulai) k.mulai = Date.now();
        if (status === 'selesai' || status === 'gagal') k.selesai = Date.now();
        if (hasil) k.hasil = pendek(hasil, 300);
        this.simpan();
    }
    /** Bungkus pekerjaan sistem: otomatis Proses → Selesai/Gagal. */
    async jalankan<T>(x: { ai?: string; nama?: string; judul: string; detail?: string; sumber?: SumberKerja }, fn: () => Promise<T>, hasil?: (r: T) => string | undefined): Promise<T> {
        const id = this.catat({ ai: x.ai || 'sistem', nama: x.nama || 'Sistem kantor', judul: x.judul, detail: x.detail, sumber: x.sumber || 'sistem', status: 'proses' });
        try { const r = await fn(); this.ubah(id, 'selesai', hasil?.(r)); return r; } catch (e: any) { this.ubah(id, 'gagal', String(e?.message || e)); throw e; }
    }

    /** Seperti jalankan(), tapi hanya dicatat kalau pekerjaannya benar-benar berjalan > 4 detik (pengecekan singkat tidak memenuhi papan). */
    async jalankanLama<T>(x: { judul: string; detail?: string; sumber?: SumberKerja }, fn: () => Promise<T>): Promise<T> {
        let id: string | undefined;
        const mulai = Date.now();
        const t = setTimeout(() => { id = this.catat({ ai: 'sistem', nama: 'Sistem kantor', judul: x.judul, detail: x.detail, sumber: x.sumber || 'sistem', status: 'proses' }); const k = this.st.items.find((i) => i.id === id); if (k) k.dibuat = k.mulai = mulai; }, 4000);
        try { const r = await fn(); clearTimeout(t); this.ubah(id, 'selesai'); return r; } catch (e: any) { clearTimeout(t); this.ubah(id, 'gagal', String(e?.message || e)); throw e; }
    }

    bulanIni() { this.gantiBulan(); return this.st.bulan; }
    daftarBulan(): string[] {
        let arsip: string[] = []; try { arsip = fs.readdirSync(this.arsipDir).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 7)); } catch { /* */ }
        return Array.from(new Set([this.bulanIni(), ...arsip])).sort().reverse();
    }
    daftar(bulan?: string): Kerja[] {
        this.gantiBulan();
        if (!bulan || bulan === this.st.bulan) return this.st.items;
        if (!/^\d{4}-\d{2}$/.test(bulan)) return [];
        try { return JSON.parse(fs.readFileSync(path.join(this.arsipDir, `${bulan}.json`), 'utf8')).items || []; } catch { return []; }
    }
}
export { bulanWib };
