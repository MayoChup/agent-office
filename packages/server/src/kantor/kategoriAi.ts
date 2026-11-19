/**
 * Kategori transaksi oleh AI (gotong royong: dikerjakan Uang, Kepala Keuangan).
 * Masalah yang diselesaikan: transaksi QRIS/mutasi ("DONAT KENTANG PAKDE", "MIXUE CIPETE") jatuh ke "Lainnya"
 * karena aturan kata kunci tidak mengenal nama tenant.
 * Cara kerja:
 *  1. Ingatan tenant (data/kategori-tenant.json): koreksi Pak Rico menang, lalu tebakan AI sebelumnya.
 *  2. Aturan kata kunci lama (kantor.config.json → pencatat.kategori).
 *  3. Sisanya ditanyakan ke AI — yang dikirim HANYA nama tenant, tanpa nominal, rekening, atau tanggal.
 */
import fs from 'fs';
import path from 'path';

export interface IngatTenant { k: string; oleh: 'rico' | 'ai'; at: number }
type Tanya = (prompt: string, judul: string, detail: string) => Promise<string>;

export const normTenant = (s: string) => String(s || '').toUpperCase()
    .replace(/\b(QRIS|QR|PT|CV|TBK|TOKO|MERCHANT|ID|IDN|INDONESIA|JKT|JAKARTA)\b/g, ' ')
    .replace(/[^A-Z ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

export class KategoriAi {
    private file: string;
    private ingat: Record<string, IngatTenant> = {};
    constructor(dataDir: string, private tanya: Tanya) {
        this.file = path.join(dataDir, 'kategori-tenant.json');
        try { this.ingat = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { /* baru */ }
    }
    private simpan() { try { fs.writeFileSync(this.file, JSON.stringify(this.ingat)); } catch (e: any) { console.warn('[Kategori AI] simpan:', e?.message || e); } }
    /** Koreksi Pak Rico → diingat untuk tenant yang sama selamanya. */
    koreksi(pihak: string, kategori: string) {
        const n = normTenant(pihak); if (!n || !kategori) return;
        this.ingat[n] = { k: kategori, oleh: 'rico', at: Date.now() }; this.simpan();
    }
    dariIngatan(pihak: string): string | null { return this.ingat[normTenant(pihak)]?.k || null; }
    jumlah() { const v = Object.values(this.ingat); return { total: v.length, rico: v.filter((x) => x.oleh === 'rico').length }; }

    /** Tebak kategori banyak tenant sekaligus. Mengembalikan peta pihak asli → kategori (hanya yang yakin). */
    async tebak(pihak: string[], kategori: string[]): Promise<Record<string, string>> {
        const out: Record<string, string> = {};
        const tanyakan = new Map<string, string[]>(); // norm → pihak asli
        for (const p of pihak) {
            const n = normTenant(p); if (!n) continue;
            const ing = this.ingat[n]?.k;
            if (ing && kategori.includes(ing)) { out[p] = ing; continue; }
            tanyakan.set(n, [...(tanyakan.get(n) || []), p]);
        }
        const daftar = [...tanyakan.keys()].slice(0, 60);
        if (!daftar.length) return out;
        const pilihan = kategori.filter((k) => k !== 'Gaji/Pemasukan');
        const prompt = [
            'Tugas: tentukan kategori pengeluaran dari NAMA TENANT/MERCHANT (biasanya pembayaran QRIS atau transfer di Indonesia).',
            `Kategori yang boleh dipakai (persis): ${pilihan.join(' | ')}`,
            'Petunjuk: tebak dari arti nama. Contoh: donat, bakso, kopi, mixue, warung, resto, cafe, bakery → makanan/minuman. Indomaret/Alfamart → belanja kebutuhan. Gojek/Grab/KAI/Pertamina → transportasi. Apotek/klinik → kesehatan. Nama orang tanpa petunjuk → "Lainnya".',
            'Jawab HANYA JSON objek: {"NAMA TENANT": "Kategori", ...} untuk semua nama di bawah. Kalau benar-benar tidak tahu, pakai "Lainnya".',
            '',
            ...daftar.map((n) => `- ${n}`)
        ].join('\n');
        const raw = await this.tanya(prompt, `Mengkategorikan ${daftar.length} transaksi dari nama tenant`, daftar.slice(0, 6).join(', ') + (daftar.length > 6 ? ', …' : ''));
        const m = raw.match(/\{[\s\S]*\}/); if (!m) return out;
        let j: Record<string, string> = {};
        try { j = JSON.parse(m[0]); } catch { return out; }
        const peta = new Map(Object.entries(j).map(([k, v]) => [normTenant(k), String(v || '').trim()]));
        for (const n of daftar) {
            const k = peta.get(n); if (!k) continue;
            const cocok = pilihan.find((x) => x.toLowerCase() === k.toLowerCase());
            if (!cocok || cocok === 'Lainnya') continue;
            this.ingat[n] = { k: cocok, oleh: 'ai', at: Date.now() };
            for (const p of tanyakan.get(n) || []) out[p] = cocok;
        }
        this.simpan();
        return out;
    }
}
