/**
 * Antrean impor mutasi PDF: Pak Rico bisa mengunggah banyak PDF (campur bank) lalu menutup aplikasi.
 * Server membaca satu per satu di belakang layar, lalu mengabari bila siap ditinjau.
 *
 * Privasi: isi PDF hanya ada di MEMORI selama menunggu/dibaca (tidak ditulis ke disk) dan tidak dikirim ke AI.
 * Yang disimpan ke disk hanya HASIL BACA (daftar transaksi) sampai ditinjau, paling lama 14 hari.
 * PDF yang gagal karena kata sandi / bank tidak dikenali disimpan di memori paling lama 1 jam supaya bisa dicoba lagi.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export type StatusAntre = 'antre' | 'proses' | 'siap' | 'gagal' | 'disimpan';
export interface ItemAntre {
    id: string; nama: string; akun: string; akunOtomatis: boolean; status: StatusAntre; dibuat: number; selesai?: number;
    error?: string; butuhSandi?: boolean; butuhAkun?: boolean; pola?: string; ringkas?: { total: number; baru: number; cocok: number; pindah: number; dari: string; sampai: string };
    hasil?: any;
}
type Proses = (buf: Buffer, akun: string, sandi: string) => Promise<any & { akun: string }>;

const HARI = 86400_000;

export class AntreMutasi {
    private file: string;
    private items: ItemAntre[] = [];
    private isi = new Map<string, { buf: Buffer; sandi: string; sampai: number }>();
    private jalan = false;

    constructor(dataDir: string, private proses: Proses, private kabar: (teks: string) => void) {
        this.file = path.join(dataDir, 'mutasi-antre.json');
        try { this.items = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.items = []; }
        // Server dimulai ulang: PDF di memori hilang → yang belum selesai ditandai gagal.
        for (const x of this.items) if (x.status === 'antre' || x.status === 'proses') { x.status = 'gagal'; x.error = 'Server dimulai ulang sebelum PDF ini selesai dibaca. Unggah lagi PDF-nya.'; }
        this.rapikan(); this.simpan();
        setInterval(() => { this.rapikan(); this.simpan(); }, 3600_000).unref();
    }
    private simpan() { try { fs.writeFileSync(this.file, JSON.stringify(this.items)); } catch (e: any) { console.warn('[Mutasi antre] simpan:', e?.message || e); } }
    private rapikan() {
        const kini = Date.now();
        this.items = this.items.filter((x) => (x.status === 'disimpan' ? kini - (x.selesai || x.dibuat) < 2 * HARI : kini - x.dibuat < 14 * HARI));
        for (const [id, v] of this.isi) if (v.sampai < kini) this.isi.delete(id);
    }

    daftar() { return this.items.map(({ hasil: _h, pola: _p, ...x }) => x).sort((a, b) => b.dibuat - a.dibuat); }
    ambil(id: string) { const x = this.items.find((i) => i.id === id); if (!x) throw new Error('Mutasi tidak ditemukan (mungkin sudah lewat 14 hari).'); return x; }

    tambah(buf: Buffer, nama: string, akun: string, sandi: string): ItemAntre {
        if (!Buffer.isBuffer(buf) || buf.length < 100 || buf.subarray(0, 5).toString() !== '%PDF-') throw new Error(`${nama || 'Berkas'} bukan PDF.`);
        if (this.items.filter((x) => x.status === 'antre').length >= 40) throw new Error('Antrean penuh (40 PDF). Tunggu yang lain selesai dulu.');
        const x: ItemAntre = { id: crypto.randomBytes(6).toString('hex'), nama: String(nama || 'mutasi.pdf').slice(0, 80), akun: String(akun || '').slice(0, 30), akunOtomatis: !akun, status: 'antre', dibuat: Date.now() };
        this.items.push(x); this.isi.set(x.id, { buf, sandi: String(sandi || ''), sampai: Date.now() + 3 * 3600_000 });
        this.simpan(); void this.putar();
        return x;
    }
    /** Coba lagi PDF yang gagal karena kata sandi / bank belum dipilih. */
    ulangi(id: string, ubah: { sandi?: string; akun?: string }) {
        const x = this.ambil(id); const v = this.isi.get(id);
        if (!v) throw new Error('PDF-nya sudah tidak ada di server (disimpan paling lama 1 jam). Unggah lagi PDF-nya.');
        if (ubah.sandi !== undefined) v.sandi = String(ubah.sandi);
        if (ubah.akun) { x.akun = String(ubah.akun).slice(0, 30); x.akunOtomatis = false; }
        x.status = 'antre'; x.error = undefined; x.butuhSandi = undefined; x.butuhAkun = undefined;
        this.simpan(); void this.putar();
        return x;
    }
    tandaiDisimpan(id: string) { const x = this.ambil(id); x.status = 'disimpan'; x.selesai = Date.now(); x.hasil = undefined; this.simpan(); }
    hapus(id: string) { this.items = this.items.filter((x) => x.id !== id); this.isi.delete(id); this.simpan(); }

    private async putar() {
        if (this.jalan) return;
        this.jalan = true;
        try {
            for (;;) {
                const x = this.items.find((i) => i.status === 'antre'); if (!x) break;
                const v = this.isi.get(x.id);
                if (!v) { x.status = 'gagal'; x.error = 'PDF-nya sudah tidak ada di server. Unggah lagi.'; this.simpan(); continue; }
                x.status = 'proses'; this.simpan();
                try {
                    const h = await this.proses(v.buf, x.akunOtomatis ? '' : x.akun, v.sandi);
                    x.akun = h.akun; x.hasil = h; x.status = 'siap'; x.selesai = Date.now();
                    const t: any[] = h.transaksi || [];
                    x.ringkas = { total: t.length, baru: t.filter((i) => i.status === 'baru').length, cocok: t.filter((i) => i.status === 'cocok').length, pindah: t.filter((i) => i.jenis === 'Antar Rekening').length, dari: h.periode?.dari || '', sampai: h.periode?.sampai || '' };
                    this.isi.delete(x.id); // PDF tidak diperlukan lagi
                    this.kabar(`📥 Mutasi ${x.akun}${x.ringkas.dari ? ` ${x.ringkas.dari} s/d ${x.ringkas.sampai}` : ''} siap ditinjau: ${x.ringkas.baru} baru, ${x.ringkas.cocok} sudah tercatat${x.ringkas.pindah ? `, ${x.ringkas.pindah} pindah dana` : ''}. Buka Keuangan → Beranda → "Mutasi menunggu ditinjau".`);
                } catch (e: any) {
                    x.status = 'gagal'; x.error = String(e?.message || e).slice(0, 300); x.butuhSandi = !!e?.butuhSandi; x.butuhAkun = !!e?.butuhAkun; x.pola = e?.pola; x.selesai = Date.now();
                    if (x.butuhSandi || x.butuhAkun) { v.sampai = Date.now() + 3600_000; } else this.isi.delete(x.id);
                    this.kabar(`⚠️ Mutasi "${x.nama}" belum bisa dibaca: ${x.error}${x.butuhSandi ? ' Masukkan kata sandinya di Keuangan → Beranda.' : x.butuhAkun ? ' Pilih banknya di Keuangan → Beranda.' : ''}`);
                }
                this.simpan();
            }
        } finally { this.jalan = false; }
    }
}

/** Tebak bank dari isi PDF, dicocokkan dengan daftar rekening Pak Rico. */
export function deteksiBank(halaman: Array<Array<Array<{ s: string }>>>, akun: string[]): string {
    const teks = halaman.slice(0, 2).flat().slice(0, 80).map((b) => b.map((t) => t.s).join(' ')).join('\n');
    const ciri: Array<[RegExp, string[]]> = [
        [/\bBank Central Asia\b|\bBCA\b|KlikBCA|myBCA/i, ['bca']],
        [/\bmandiri\b|Livin'? by Mandiri/i, ['mandiri']],
        [/\bBank Jago\b|\bjago\b/i, ['jago']],
        [/\bkrom\b|Krom Bank/i, ['krom']],
        [/\bBank Rakyat Indonesia\b|\bBRI\b|BRImo/i, ['bri']],
        [/\bBank Negara Indonesia\b|\bBNI\b/i, ['bni']],
        [/\bSeaBank\b/i, ['seabank']], [/\bblu\b.*BCA Digital|BCA Digital/i, ['blu']], [/\bCIMB\b/i, ['cimb', 'cimb niaga']], [/\bPermata\b/i, ['permata']]
    ];
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
    for (const [re, nama] of ciri) {
        if (!re.test(teks)) continue;
        const a = akun.find((x) => nama.some((n) => norm(x) === norm(n) || norm(x).includes(norm(n))));
        if (a) return a;
    }
    return '';
}
