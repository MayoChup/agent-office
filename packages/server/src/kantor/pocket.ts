import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Pocket = tabungan bertarget milik Pak Rico. Disimpan di VPS (bukan Google Sheets) supaya tidak tercampur transaksi.
 * sumber 'manual': saldo = jumlah riwayat Tambah/Ambil dana (catatan alokasi, saldo rekening tidak berubah).
 * sumber 'akun'  : saldo = saldo rekening tertaut (dihitung di aplikasi dari mutasi + transaksi).
 */
export interface Gerak { id: string; at: number; n: number; ket: string }
export interface Pocket { id: string; nama: string; target: number; tenggat: string; warna: string; ikon: string; sumber: 'manual' | 'akun'; akun: string; dibuat: number; riwayat: Gerak[] }

const WARNA = ['#f97316', '#0ea5e9', '#22c55e', '#a855f7', '#ec4899', '#eab308', '#14b8a6', '#6366f1'];
const IKON = ['house', 'shield', 'plane', 'car', 'graduation-cap', 'heart', 'gift', 'laptop', 'piggy-bank', 'target', 'star', 'wallet'];

export class PocketStore {
    private file: string;
    constructor(dataDir: string) { this.file = path.join(dataDir, 'pocket.json'); }
    daftar(): Pocket[] { try { const x = JSON.parse(fs.readFileSync(this.file, 'utf8')); return Array.isArray(x) ? x : []; } catch { return []; } }
    private tulis(xs: Pocket[]) { fs.writeFileSync(this.file, JSON.stringify(xs, null, 1)); }
    private cari(xs: Pocket[], id: string) { const p = xs.find((x) => x.id === id); if (!p) throw new Error('Pocket tidak ditemukan.'); return p; }

    simpan(x: any): Pocket {
        const xs = this.daftar();
        const nama = String(x?.nama || '').replace(/\s+/g, ' ').trim().slice(0, 40);
        if (!nama) throw new Error('Isi nama pocket dulu.');
        const target = Math.round(Number(x?.target));
        if (!(target > 0) || target > 1e13) throw new Error('Target tidak valid.');
        const tenggat = /^\d{4}-\d{2}-\d{2}$/.test(String(x?.tenggat || '')) ? String(x.tenggat) : '';
        const sumber: Pocket['sumber'] = x?.sumber === 'akun' ? 'akun' : 'manual';
        const akun = sumber === 'akun' ? String(x?.akun || '').trim().slice(0, 30) : '';
        if (sumber === 'akun' && !akun) throw new Error('Pilih rekening yang ditautkan.');
        const warna = /^#[0-9a-f]{6}$/i.test(String(x?.warna || '')) ? String(x.warna) : WARNA[xs.length % WARNA.length];
        const ikon = IKON.includes(String(x?.ikon)) ? String(x.ikon) : 'target';
        if (x?.id) {
            const p = this.cari(xs, String(x.id));
            Object.assign(p, { nama, target, tenggat, sumber, akun, warna, ikon });
            this.tulis(xs); return p;
        }
        if (xs.length >= 30) throw new Error('Maksimal 30 pocket.');
        const p: Pocket = { id: crypto.randomBytes(5).toString('hex'), nama, target, tenggat, warna, ikon, sumber, akun, dibuat: Date.now(), riwayat: [] };
        xs.push(p); this.tulis(xs); return p;
    }
    /** Tambah (n > 0) atau ambil (n < 0) dana di pocket manual. */
    gerak(id: string, n: number, ket: string): Pocket {
        const xs = this.daftar(); const p = this.cari(xs, id);
        if (p.sumber !== 'manual') throw new Error('Pocket ini mengikuti saldo rekening, tidak bisa diisi manual.');
        const v = Math.round(Number(n));
        if (!v || Math.abs(v) > 1e13) throw new Error('Nominal tidak valid.');
        const saldo = p.riwayat.reduce((a, g) => a + g.n, 0);
        if (saldo + v < 0) throw new Error(`Saldo pocket hanya Rp${saldo.toLocaleString('id-ID')}.`);
        p.riwayat.push({ id: crypto.randomBytes(4).toString('hex'), at: Date.now(), n: v, ket: String(ket || '').slice(0, 80) });
        p.riwayat = p.riwayat.slice(-500);
        this.tulis(xs); return p;
    }
    hapus(id: string) { const xs = this.daftar(); this.cari(xs, id); this.tulis(xs.filter((x) => x.id !== id)); }
}
