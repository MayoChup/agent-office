import fs from 'fs';
import path from 'path';

/**
 * Uji kertas (forward test) sinyal kantor, tanpa uang & tanpa mengintip masa depan:
 * setiap sesi bursa baru, saham berskor gabungan terkuat (≥ Beli kuat) dan terlemah (≤ Jual kuat) dicatat bersama harganya & harga SPY.
 * ±20 dan ±60 hari bursa kemudian (28 / 84 hari kalender) hasilnya dinilai dengan harga nyata, sebagai selisih vs S&P 500.
 * Satu-satunya bukti yang tidak bisa "dicurangi" data lampau.
 */
interface Catat { tgl: string; at: number; s: string; kel: 'beli' | 'jual'; skor: number; h: number; spy: number; r20?: number; r60?: number }
interface St { sesi: string; catat: Catat[] }
const HARI_H: Record<20 | 60, number> = { 20: 28, 60: 84 };

export class UjiKertas {
    private file: string; private st: St;
    constructor(dataDir: string, private o: { sesi: () => string; spy: () => number | null; baris: () => Array<{ s: string; harga: number; skor?: { semua?: { skor: number; skorAsli?: number } | null } }> }) {
        this.file = path.join(dataDir, 'uji-kertas.json');
        try { this.st = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.st = { sesi: '', catat: [] }; }
        setInterval(() => this.jalan(), 30 * 60_000);
        setTimeout(() => this.jalan(), 5 * 60_000);
    }
    private simpan() { try { fs.writeFileSync(this.file, JSON.stringify(this.st)); } catch { /* */ } }
    /** Catat sesi baru + nilai catatan yang sudah cukup umur. */
    jalan() {
        try {
            const sesi = this.o.sesi(), spy = this.o.spy(); if (!sesi || !spy) return;
            const baris = this.o.baris(), harga = new Map(baris.map((b) => [b.s, b.harga]));
            let ubah = false;
            // Nilai: selisih hasil saham vs SPY sejak dicatat.
            for (const c of this.st.catat) for (const H of [20, 60] as const) {
                const k = H === 20 ? 'r20' : 'r60'; if (c[k] != null || Date.now() - c.at < HARI_H[H] * 86400_000) continue;
                const h = harga.get(c.s); if (!h) continue;
                c[k] = +((h / c.h - 1 - (spy / c.spy - 1)) * 100).toFixed(3); ubah = true;
            }
            if (sesi !== this.st.sesi) {
                const skor = (b: (typeof baris)[number]) => b.skor?.semua?.skorAsli ?? b.skor?.semua?.skor;
                const ada = baris.filter((b) => skor(b) != null && b.harga > 0);
                const beli = ada.filter((b) => skor(b)! >= 0.45).sort((a, b) => skor(b)! - skor(a)!).slice(0, 30);
                const jual = ada.filter((b) => skor(b)! <= -0.45).sort((a, b) => skor(a)! - skor(b)!).slice(0, 30);
                const at = Date.now();
                // Saham yang sama tidak dicatat ulang dalam 20 hari (supaya sampel tidak berulang-ulang).
                const baru = new Set(this.st.catat.filter((c) => at - c.at < 28 * 86400_000).map((c) => `${c.kel}|${c.s}`));
                for (const [kel, xs] of [['beli', beli], ['jual', jual]] as const) for (const b of xs) if (!baru.has(`${kel}|${b.s}`)) this.st.catat.push({ tgl: sesi, at, s: b.s, kel, skor: +skor(b)!.toFixed(3), h: b.harga, spy });
                this.st.sesi = sesi; ubah = true;
                // Simpan ±1 tahun saja.
                this.st.catat = this.st.catat.filter((c) => Date.now() - c.at < 400 * 86400_000);
            }
            if (ubah) this.simpan();
        } catch (e: any) { console.warn('[Uji kertas]', e?.message || e); }
    }
    ringkas() {
        const out: Record<string, Record<string, { n: number; rata: number | null; kalahPasar: number | null; galatStd: number | null; terbukti: boolean }>> = {};
        for (const kel of ['beli', 'jual'] as const) {
            out[kel] = {};
            for (const H of [20, 60] as const) {
                const xs = this.st.catat.filter((c) => c.kel === kel).map((c) => (H === 20 ? c.r20 : c.r60)).filter((x): x is number => x != null);
                const n = xs.length, rata = n ? xs.reduce((a, b) => a + b, 0) / n : null;
                const sd = n > 1 && rata != null ? Math.sqrt(xs.reduce((a, b) => a + (b - rata) ** 2, 0) / (n - 1)) : null;
                const gs = sd != null ? sd / Math.sqrt(n) : null;
                out[kel][H] = { n, rata: rata == null ? null : +rata.toFixed(2), kalahPasar: n ? +((xs.filter((x) => x < 0).length / n) * 100).toFixed(1) : null, galatStd: gs == null ? null : +gs.toFixed(2),
                    terbukti: n >= 60 && rata != null && gs != null && (kel === 'jual' ? rata < -2 * gs : rata > 2 * gs) };
            }
        }
        const pertama = this.st.catat[0]?.at || null;
        return { mulai: pertama, dicatat: this.st.catat.length, hasil: out };
    }
}
