import fs from 'fs';
import path from 'path';
import { extractJson } from './freeLlm';

/** Anggaran per kategori + awal periode gajian (mis. tanggal 25), disimpan di VPS. */
export interface Anggaran { mulai: number; batas: Record<string, number>; akun: string[] }
const BAWAAN: Anggaran = { mulai: 1, batas: {}, akun: ['Cash', 'BCA', 'Mandiri', 'Jago', 'Krom'] };

export class AnggaranStore {
    private file: string;
    constructor(dataDir: string) { this.file = path.join(dataDir, 'anggaran.json'); }
    get(): Anggaran { try { return { ...BAWAAN, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) }; } catch { return { ...BAWAAN }; } }
    set(x: any): Anggaran {
        const cur = this.get();
        const mulai = Math.min(28, Math.max(1, Math.round(Number(x?.mulai ?? cur.mulai)) || 1));
        const batas: Record<string, number> = {};
        for (const [k, v] of Object.entries(x?.batas ?? cur.batas)) { const n = Math.round(Number(v)); if (k && n > 0) batas[String(k).slice(0, 40)] = n; }
        const akun = Array.isArray(x?.akun) ? x.akun.map((a: any) => String(a).trim().slice(0, 30)).filter(Boolean).slice(0, 20) : cur.akun;
        const out = { mulai, batas, akun };
        fs.writeFileSync(this.file, JSON.stringify(out, null, 1));
        return out;
    }
}

type Llm = { complete(system: string, user: string, maxTokens?: number, attempts?: number): Promise<string | null> } | null;

/** "beli nasi goreng 20rb pakai bca" → draf transaksi (AI gratis), untuk dikonfirmasi Pak Rico sebelum disimpan. */
export async function bacaTransaksi(llm: Llm, teks: string, akun: string[], kategori: string[]) {
    // Cara cepat tanpa AI untuk pola umum.
    const n = (() => {
        const m = teks.toLowerCase().replace(/\./g, '').match(/(\d+(?:,\d+)?)\s*(rb|ribu|k|jt|juta)?\b/);
        if (!m) return null;
        const v = parseFloat(m[1].replace(',', '.'));
        return Math.round(m[2] === 'rb' || m[2] === 'ribu' || m[2] === 'k' ? v * 1e3 : m[2] === 'jt' || m[2] === 'juta' ? v * 1e6 : v);
    })();
    if (!llm) return null;
    const now = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
    const out = await llm.complete(
        `Kamu pencatat keuangan. Ubah kalimat Pak Rico menjadi transaksi. Jawab HANYA JSON:
{"transaksi":true/false,"jenis":"Keluar|Masuk|Antar Rekening","nominal":angka rupiah,"akun":"salah satu: ${akun.join(', ')}","kategori":"salah satu: ${kategori.join(', ')}","pihak":"tempat/merchant singkat","keterangan":"barang/catatan singkat","tanggal":"YYYY-MM-DD"}
"transaksi": false kalau kalimat bukan pencatatan transaksi (mis. pertanyaan). Sekarang: ${now} WIB. "kemarin" = tanggal kemarin. Akun tidak disebut → "Cash".`,
        teks.slice(0, 400), 200, 2
    ).catch(() => null);
    const j = extractJson(out || '');
    if (!j || j.transaksi === false) return { transaksi: false as const };
    const nominal = Math.round(Number(j.nominal) || n || 0);
    if (!nominal) return { transaksi: false as const };
    return {
        transaksi: true as const,
        jenis: ['Keluar', 'Masuk', 'Antar Rekening'].includes(j.jenis) ? j.jenis : 'Keluar',
        nominal, akun: akun.find((a) => a.toLowerCase() === String(j.akun || '').toLowerCase()) || String(j.akun || 'Cash'),
        kategori: kategori.includes(j.kategori) ? j.kategori : 'Lainnya',
        pihak: String(j.pihak || '').slice(0, 80), keterangan: String(j.keterangan || '').slice(0, 200),
        tanggal: /^\d{4}-\d{2}-\d{2}$/.test(j.tanggal) ? j.tanggal : now.slice(0, 10)
    };
}
