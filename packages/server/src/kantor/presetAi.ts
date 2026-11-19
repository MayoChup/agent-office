/**
 * Preset by AI — kombinasi indikator yang dipilih dari data, per gaya posisi, diperbarui otomatis tiap uji mundur mingguan.
 *
 * "AI" di sini = pencarian statistik, bukan chatbot:
 *  1. Tiap aturan sederhana (mis. "RSI-14 < 30", "di atas MA200", "PBV < 1,5") dihitung untuk setiap saham di setiap tanggal lampau.
 *  2. Semua pasangan & trio aturan (dari kelompok berbeda) diuji: hasil H hari bursa sesudahnya vs S&P 500 (disesuaikan beta).
 *  3. Kombinasi dipilih di data LATIH (sebelum BATAS), lalu harus tetap unggul di data UJI (sesudah BATAS) yang tidak dipakai memilih.
 *  4. Juara vs penantang: penantang baru menggantikan juara kalau menang di data uji 3 kali uji mundur berturut-turut,
 *     dan tidak kalah di sinyal nyata yang tercatat di History (arsip sinyal) bila datanya sudah cukup.
 * Juara awal teknikal = bobot dari data (skor teknikal yang sudah ada); juara awal fundamental = rumus fundamental yang sudah ada.
 */
import fs from 'fs';
import path from 'path';
import type { Ind } from './preset';

export type JenisAi = 'teknikal' | 'fundamental';
export interface Aturan<X> { k: string; t: string; grp: string; f: (x: X) => boolean | null }
export interface RasioF { per: number | null; pbv: number | null; roe: number | null; der: number | null; npm: number | null; revGrowth: number | null }

/* ── Aturan teknikal: dihitung dari Ind + data analisis harian (b: sinyal, rsi, x, volX, chg1d, chg1m) ── */
type CtxT = { ind: Ind; b: any };
const ok = (v: any) => v != null && Number.isFinite(+v);
export const ATURAN_T: Array<Aturan<CtxT>> = [
    { k: 'trenNaik', grp: 'tren', t: 'tren naik rapi (harga > MA50 > MA200)', f: ({ b }) => b?.sinyal ? b.sinyal.tren === 'naik' : null },
    { k: 'atasMa200', grp: 'tren', t: 'harga di atas MA200', f: ({ ind }) => (ok(ind.ma200) ? ind.harga > (ind.ma200 as number) : null) },
    { k: 'ma200naik', grp: 'tren2', t: 'MA200 menanjak (sebulan terakhir)', f: ({ ind }) => ind.ma200naik ?? null },
    { k: 'adxKuat', grp: 'tren2', t: 'tren kuat (ADX > 25)', f: ({ ind }) => (ok(ind.adx) ? (ind.adx as number) > 25 : null) },
    { k: 'macdNaik', grp: 'momentum', t: 'MACD memotong naik ≤5 hari lalu', f: ({ b }) => (b?.sinyal ? b.sinyal.macdBullish != null && b.sinyal.macdBullish <= 5 : null) },
    { k: 'rsKuat', grp: 'momentum', t: 'unggul >10% dari S&P 500 (6 bulan)', f: ({ ind }) => (ok(ind.rs6) ? (ind.rs6 as number) > 10 : null) },
    { k: 'naik1b', grp: 'momentum', t: 'naik >8% sebulan', f: ({ b }) => (ok(b?.chg1m) ? b.chg1m > 8 : null) },
    { k: 'rsi30', grp: 'jenuhJual', t: 'RSI-14 < 30 (jenuh jual)', f: ({ ind }) => (ok(ind.rsi14) ? (ind.rsi14 as number) < 30 : null) },
    { k: 'rsi40', grp: 'jenuhJual', t: 'RSI-14 < 40', f: ({ ind }) => (ok(ind.rsi14) ? (ind.rsi14 as number) < 40 : null) },
    { k: 'rsi2', grp: 'jenuhJual2', t: 'RSI-2 < 10 (koreksi tajam jangka sangat pendek)', f: ({ ind }) => (ok(ind.rsi2) ? (ind.rsi2 as number) < 10 : null) },
    { k: 'stoch20', grp: 'jenuhJual2', t: 'Stochastic %K < 20', f: ({ ind }) => (ok(ind.stochK) ? (ind.stochK as number) < 20 : null) },
    { k: 'mfi30', grp: 'jenuhJual3', t: 'MFI < 30 (jenuh jual versi volume)', f: ({ ind }) => (ok(ind.mfi) ? (ind.mfi as number) < 30 : null) },
    { k: 'bbBawah', grp: 'jenuhJual3', t: 'harga di bawah pita Bollinger bawah (%B < 0)', f: ({ ind }) => (ok(ind.bbPctB) ? (ind.bbPctB as number) < 0 : null) },
    { k: 'turun5h', grp: 'koreksi', t: 'turun >7% dalam 5 hari', f: ({ b }) => (ok(b?.x?.mom?.w1) ? b.x.mom.w1 < -7 : null) },
    { k: 'breakout52', grp: 'tembus', t: 'tembus tertinggi 52 minggu', f: ({ b }) => (b?.sinyal ? !!b.sinyal.breakout52 : null) },
    { k: 'dekatPuncak', grp: 'tembus', t: 'dalam 5% dari puncak 52 minggu', f: ({ ind }) => (ok(ind.hi52) ? ind.harga >= ind.hi52 * 0.95 : null) },
    { k: 'tembus20', grp: 'tembus2', t: 'tembus tertinggi 20 hari', f: ({ ind }) => (ok(ind.hi20prev) ? ind.harga > ind.hi20prev : null) },
    { k: 'squeeze', grp: 'tembus2', t: 'pita Bollinger sedang menyempit (20% tersempit 6 bulan)', f: ({ ind }) => ind.bbSqueeze ?? null },
    { k: 'volNaik', grp: 'volume', t: 'volume ≥2× rata-rata saat harga naik', f: ({ b }) => (ok(b?.volX) ? b.volX >= 2 && b.chg1d >= 0 : null) },
    { k: 'cmfMasuk', grp: 'volume2', t: 'dana masuk (CMF > 0,08)', f: ({ b }) => (ok(b?.x?.cmf) ? b.x.cmf > 0.08 : null) },
    { k: 'obvNaik', grp: 'volume2', t: 'OBV naik (volume hari naik > hari turun)', f: ({ b }) => (ok(b?.x?.obv) ? b.x.obv > 0.2 : null) },
    { k: 'ekorBawah', grp: 'candle', t: 'candle berekor bawah panjang (≥35%), tutup di separuh atas', f: ({ ind }) => ind.ekorBawah ?? null },
    { k: 'gapNaik', grp: 'candle', t: 'buka gap naik >2%', f: ({ ind }) => (ok(ind.gapPct) ? (ind.gapPct as number) > 2 : null) },
    { k: 'pasarNaik', grp: 'pasar', t: 'S&P 500 di atas MA50 (pasar sedang naik)', f: ({ ind }) => ind.pasarNaik ?? null }
];

/* ── Aturan fundamental (rasio pada tanggal itu, dari laporan yang SUDAH terbit saat itu) ── */
export const ATURAN_F: Array<Aturan<RasioF>> = [
    { k: 'per15', grp: 'murahLaba', t: 'PER < 15', f: (r) => (ok(r.per) ? (r.per as number) > 0 && (r.per as number) < 15 : null) },
    { k: 'per25', grp: 'murahLaba', t: 'PER < 25', f: (r) => (ok(r.per) ? (r.per as number) > 0 && (r.per as number) < 25 : null) },
    { k: 'pbv15', grp: 'murahAset', t: 'PBV < 1,5', f: (r) => (ok(r.pbv) ? (r.pbv as number) > 0 && (r.pbv as number) < 1.5 : null) },
    { k: 'pbv3', grp: 'murahAset', t: 'PBV < 3', f: (r) => (ok(r.pbv) ? (r.pbv as number) > 0 && (r.pbv as number) < 3 : null) },
    { k: 'roe15', grp: 'kualitas', t: 'ROE > 15%', f: (r) => (ok(r.roe) ? (r.roe as number) > 15 : null) },
    { k: 'roe25', grp: 'kualitas', t: 'ROE > 25%', f: (r) => (ok(r.roe) ? (r.roe as number) > 25 : null) },
    { k: 'der1', grp: 'utang', t: 'utang rendah (DER < 1)', f: (r) => (ok(r.der) ? (r.der as number) < 1 : null) },
    { k: 'npm10', grp: 'margin', t: 'margin laba > 10%', f: (r) => (ok(r.npm) ? (r.npm as number) > 10 : null) },
    { k: 'npm20', grp: 'margin', t: 'margin laba > 20%', f: (r) => (ok(r.npm) ? (r.npm as number) > 20 : null) },
    { k: 'tumbuh10', grp: 'tumbuh', t: 'pendapatan tumbuh > 10%', f: (r) => (ok(r.revGrowth) ? (r.revGrowth as number) > 10 : null) },
    { k: 'tumbuh20', grp: 'tumbuh', t: 'pendapatan tumbuh > 20%', f: (r) => (ok(r.revGrowth) ? (r.revGrowth as number) > 20 : null) },
    { k: 'labaPositif', grp: 'laba', t: 'perusahaan untung (laba bersih positif)', f: (r) => (ok(r.npm) ? (r.npm as number) > 0 : ok(r.per) ? (r.per as number) > 0 : null) }
];

export const aturanDari = (jenis: JenisAi) => (jenis === 'teknikal' ? ATURAN_T : ATURAN_F) as Array<Aturan<any>>;
/** Bitmask aturan yang terpenuhi (bit i = aturan i benar). Aturan tanpa data dianggap tidak terpenuhi. */
export function maskDari(jenis: JenisAi, x: any): number {
    const A = aturanDari(jenis); let m = 0;
    for (let i = 0; i < A.length; i++) { let v: boolean | null = null; try { v = A[i].f(x); } catch { v = null; } if (v) m |= 1 << i; }
    return m >>> 0;
}
export const maskTeknikal = (ind: Ind | null | undefined, b: any) => (ind ? maskDari('teknikal', { ind, b }) : 0);
export const maskFundamental = (r: RasioF | null | undefined) => (r ? maskDari('fundamental', r) : 0);

/* ── Pencarian kombinasi ── */
export interface Stat { n: number; tanggal: number; rataEx: number; galat: number; t: number }
export interface Kandidat { aturan: string[]; latih: Stat; uji: Stat; unggulUji: number; lulus: boolean; alasan: string[] }
export interface HasilCari { H: number; dasar: { latih: Stat; uji: Stat }; teratas: Kandidat[]; terbaik: Kandidat | null; juaraLama?: Kandidat | null; sampel: number }
const MIN_N: Record<number, number> = { 1: 600, 5: 400, 20: 300, 60: 200 };

/**
 * Statistik dengan galat "jujur": rata-rata per TANGGAL dulu (saham di hari yang sama saling berkorelasi),
 * lalu galat antar-tanggal diperbesar √(H/langkah) karena periode H hari tumpang tindih.
 */
function stat(idx: Int32Array | number[], tglIdx: Int32Array, ex: Float64Array, nTgl: number, H: number, langkah: number, buf: { s: Float64Array; c: Int32Array }): Stat {
    buf.s.fill(0); buf.c.fill(0);
    let n = 0;
    for (let k = 0; k < idx.length; k++) { const i = idx[k]; buf.s[tglIdx[i]] += ex[i]; buf.c[tglIdx[i]]++; n++; }
    let m = 0, d = 0; const per: number[] = [];
    for (let j = 0; j < nTgl; j++) if (buf.c[j]) { per.push(buf.s[j] / buf.c[j]); }
    d = per.length; if (!d) return { n, tanggal: 0, rataEx: 0, galat: Infinity, t: 0 };
    m = per.reduce((a, x) => a + x, 0) / d;
    const sd = Math.sqrt(per.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, d - 1));
    const galat = d > 3 ? (sd / Math.sqrt(d)) * Math.sqrt(Math.max(1, H / langkah)) : Infinity;
    return { n, tanggal: d, rataEx: +(m * 100).toFixed(3), galat: +(galat * 100).toFixed(3), t: galat > 0 && Number.isFinite(galat) ? +((m * 100 - 0) / (galat * 100)).toFixed(2) : 0 };
}

/** Cari kombinasi 1–3 aturan terbaik untuk satu gaya posisi. batas = tanggal pemisah data latih/uji. */
export function cariKombinasi(jenis: JenisAi, z: { tgl: string[]; ex: number[]; mask: number[] }, H: number, langkah: number, batas: string, juaraLama?: string[] | null): HasilCari | null {
    const A = aturanDari(jenis);
    const N = z.tgl.length; if (N < 1000) return null;
    const tglUnik = [...new Set(z.tgl)].sort(); const posTgl = new Map(tglUnik.map((t, i) => [t, i]));
    const tglIdx = new Int32Array(N), ex = new Float64Array(N), mask = new Uint32Array(N);
    const L: number[] = [], U: number[] = [];
    for (let i = 0; i < N; i++) { tglIdx[i] = posTgl.get(z.tgl[i])!; ex[i] = z.ex[i]; mask[i] = z.mask[i] >>> 0; (z.tgl[i] < batas ? L : U).push(i); }
    if (L.length < 1000 || U.length < 300) return null;
    const buf = { s: new Float64Array(tglUnik.length), c: new Int32Array(tglUnik.length) };
    const dasarL = stat(L, tglIdx, ex, tglUnik.length, H, langkah, buf), dasarU = stat(U, tglIdx, ex, tglUnik.length, H, langkah, buf);
    const pilih = (ix: number[], m: number) => { const out: number[] = []; for (const i of ix) if ((mask[i] & m) === m) out.push(i); return out; };
    // Semua kombinasi 1–3 aturan dari kelompok berbeda.
    const kombo: number[][] = [];
    for (let a = 0; a < A.length; a++) {
        kombo.push([a]);
        for (let b = a + 1; b < A.length; b++) {
            if (A[b].grp === A[a].grp) continue;
            kombo.push([a, b]);
            for (let c = b + 1; c < A.length; c++) { if (A[c].grp === A[a].grp || A[c].grp === A[b].grp) continue; kombo.push([a, b, c]); }
        }
    }
    const minN = MIN_N[H] ?? 300;
    const latih: Array<{ k: number[]; m: number; s: Stat }> = [];
    for (const k of kombo) {
        const m = k.reduce((acc, i) => acc | (1 << i), 0) >>> 0;
        const ix = pilih(L, m); if (ix.length < minN) continue;
        const s = stat(ix, tglIdx, ex, tglUnik.length, H, langkah, buf);
        if (s.tanggal < 30) continue;
        const tUnggul = (s.rataEx - Math.max(0, dasarL.rataEx)) / (s.galat || Infinity);
        if (tUnggul > 2) latih.push({ k, m, s });
    }
    // 15 terbaik di data latih (urut keyakinan), lalu diuji di data uji.
    latih.sort((a, b) => (b.s.rataEx - dasarL.rataEx) / b.s.galat - (a.s.rataEx - dasarL.rataEx) / a.s.galat);
    const nilai = (k: number[], m: number, s: Stat): Kandidat => {
        const ix = pilih(U, m); const u = stat(ix, tglIdx, ex, tglUnik.length, H, langkah, buf);
        const unggul = +(u.rataEx - Math.max(0, dasarU.rataEx)).toFixed(3);
        const alasan: string[] = [];
        if (u.n < Math.ceil(minN / 3)) alasan.push(`di data uji hanya muncul ${u.n} kali (perlu ≥${Math.ceil(minN / 3)})`);
        if (!(u.rataEx > 0)) alasan.push(`di data uji tidak mengalahkan S&P 500 (${u.rataEx}%)`);
        if (!(unggul > 2 * u.galat)) alasan.push(`keunggulan di data uji ${unggul}% belum > 2× galat (${u.galat}%)`);
        return { aturan: k.map((i) => A[i].k), latih: s, uji: u, unggulUji: unggul, lulus: !alasan.length, alasan };
    };
    const teratas = latih.slice(0, 15).map((x) => nilai(x.k, x.m, x.s));
    // Dipilih menurut urutan data LATIH; data uji hanya gerbang lulus/tidak (memilih menurut data uji = menyontek data uji).
    const terbaik = teratas.find((x) => x.lulus) || null;
    // Nilai ulang juara lama (kombinasi) dengan data terbaru.
    let jl: Kandidat | null = null;
    if (juaraLama?.length) {
        const k = juaraLama.map((x) => A.findIndex((a) => a.k === x));
        if (k.every((i) => i >= 0)) { const m = k.reduce((acc, i) => acc | (1 << i), 0) >>> 0; const ix = pilih(L, m); jl = nilai(k, m, stat(ix, tglIdx, ex, tglUnik.length, H, langkah, buf)); }
    }
    return { H, dasar: { latih: dasarL, uji: dasarU }, teratas: teratas.slice(0, 8), terbaik, juaraLama: jl, sampel: N };
}

/* ── Juara vs penantang (berkas data/preset-ai.json) ── */
export interface Juara { jenis: 'dasar' | 'kombinasi'; aturan?: string[]; unggulUji: number; uji?: Stat; sejak: number }
export interface SlotAi {
    juara: Juara;
    penantang: (Kandidat & { menang: number }) | null;
    terakhir: number; dasarUnggul: number; catatan: string;
    riwayat: Array<{ at: number; peristiwa: string }>;
    arsip?: { n: number; rataEx: number | null };
}
export type StatusAi = Record<JenisAi, Record<string, SlotAi>>;
const MENANG_BERTURUT = 3;

export class PresetAi {
    private file: string;
    private st: StatusAi;
    constructor(private dataDir: string) {
        this.file = path.join(dataDir, 'preset-ai.json');
        try { this.st = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.st = { teknikal: {}, fundamental: {} }; }
        this.st.teknikal ||= {}; this.st.fundamental ||= {};
    }
    private simpan() { fs.writeFileSync(this.file, JSON.stringify(this.st)); try { this.mtime = fs.statSync(this.file).mtimeMs; } catch { /* */ } }
    private mtime = 0; private cekAt = 0;
    /** Baca ulang kalau berkas diubah proses lain (uji mundur). Dicek paling sering tiap 30 detik. */
    private segarkan() {
        if (Date.now() - this.cekAt < 30_000) return; this.cekAt = Date.now();
        try { const m = fs.statSync(this.file).mtimeMs; if (m !== this.mtime) { this.st = JSON.parse(fs.readFileSync(this.file, 'utf8')); this.st.teknikal ||= {}; this.st.fundamental ||= {}; this.mtime = m; } } catch { /* belum ada */ }
    }
    status() { this.cekAt = 0; this.segarkan(); return this.st; }
    /** Kombinasi aktif untuk dipakai di skor (null = juara masih rumus dasar). */
    aktif(jenis: JenisAi, H: number): string[] | null {
        this.segarkan();
        const j = this.st[jenis][String(H)]?.juara;
        return j?.jenis === 'kombinasi' && j.aturan?.length ? j.aturan : null;
    }
    /**
     * Perbarui satu slot setelah uji mundur.
     * dasarUnggul = keunggulan juara dasar di data uji (mis. "Beli kuat" bobot data − rata-rata semua saham; 0 kalau dasar tidak lulus).
     * arsip = hasil kombinasi penantang di sinyal nyata tercatat (History), kalau sudah ada datanya.
     */
    perbarui(jenis: JenisAi, H: number, cari: HasilCari | null, dasarUnggul: number, arsip?: (aturan: string[]) => { n: number; rataEx: number | null }) {
        const k = String(H), now = Date.now();
        const s: SlotAi = this.st[jenis][k] ||= { juara: { jenis: 'dasar', unggulUji: dasarUnggul, sejak: now }, penantang: null, terakhir: 0, dasarUnggul, catatan: '', riwayat: [] };
        s.terakhir = now; s.dasarUnggul = +dasarUnggul.toFixed(3);
        const catat = (p: string) => { s.riwayat.unshift({ at: now, peristiwa: p }); s.riwayat = s.riwayat.slice(0, 30); };
        const nama = (a?: string[]) => (a || []).map((x) => aturanDari(jenis).find((r) => r.k === x)?.t || x).join(' + ');
        if (!cari) { s.catatan = 'Data uji mundur belum cukup untuk mencari kombinasi.'; this.simpan(); return s; }
        // 1) Juara kombinasi yang tidak lagi lulus di data terbaru → turun takhta ke rumus dasar.
        if (s.juara.jenis === 'kombinasi') {
            const jl = cari.juaraLama;
            if (!jl || !jl.lulus) {
                catat(`Juara "${nama(s.juara.aturan)}" tidak lagi lulus di data uji (${jl?.alasan.join('; ') || 'tidak ditemukan'}). Kembali ke rumus dasar.`);
                s.juara = { jenis: 'dasar', unggulUji: dasarUnggul, sejak: now };
            } else s.juara = { ...s.juara, unggulUji: jl.unggulUji, uji: jl.uji };
        } else s.juara = { ...s.juara, unggulUji: dasarUnggul };
        // 2) Penantang terbaik minggu ini.
        const p = cari.terbaik;
        const unggulJuara = s.juara.unggulUji;
        if (!p) { s.penantang = null; s.catatan = 'Tidak ada kombinasi yang lulus di data uji minggu ini. Juara tetap.'; this.simpan(); return s; }
        const sama = s.juara.jenis === 'kombinasi' && s.juara.aturan?.join() === p.aturan.join();
        if (sama) { s.penantang = null; s.catatan = 'Kombinasi terbaik minggu ini sama dengan juara. Juara bertahan.'; this.simpan(); return s; }
        const lebih = p.unggulUji > unggulJuara + Math.max(p.uji.galat, 0.05);
        const lanjut = s.penantang && s.penantang.aturan.join() === p.aturan.join();
        const menang = lebih ? (lanjut ? (s.penantang!.menang || 0) + 1 : 1) : 0;
        s.penantang = { ...p, menang };
        const nyata = arsip ? arsip(p.aturan) : { n: 0, rataEx: null };
        s.arsip = nyata;
        const nyataBuruk = nyata.n >= 30 && (nyata.rataEx ?? 0) < 0;
        if (!lebih) s.catatan = `Penantang "${nama(p.aturan)}" belum lebih baik dari juara (unggul ${p.unggulUji}% vs ${unggulJuara}%).`;
        else if (nyataBuruk) s.catatan = `Penantang "${nama(p.aturan)}" unggul di uji mundur, tapi di sinyal nyata (History, ${nyata.n} kejadian) rata-ratanya ${nyata.rataEx}% vs S&P 500. Belum diangkat.`;
        else if (menang < MENANG_BERTURUT) s.catatan = `Penantang "${nama(p.aturan)}" unggul (${p.unggulUji}% vs ${unggulJuara}%), menang ${menang}/${MENANG_BERTURUT} uji berturut-turut.`;
        else {
            catat(`"${nama(p.aturan)}" menggantikan ${s.juara.jenis === 'kombinasi' ? `"${nama(s.juara.aturan)}"` : 'rumus dasar'} setelah unggul ${MENANG_BERTURUT} uji berturut-turut (${p.unggulUji}% di atas rata-rata, ${p.uji.n} kejadian di data uji).`);
            s.juara = { jenis: 'kombinasi', aturan: p.aturan, unggulUji: p.unggulUji, uji: p.uji, sejak: now };
            s.penantang = null;
            s.catatan = 'Juara baru diangkat minggu ini.';
        }
        this.simpan();
        return s;
    }
}

/** Uji kombinasi di sinyal nyata yang tercatat (arsip sinyal harian): masuk di penutupan hari itu, keluar H sesi arsip kemudian. */
export function ujiArsip(dataDir: string, jenis: JenisAi, aturan: string[], H: number): { n: number; rataEx: number | null } {
    const A = aturanDari(jenis);
    const idx = aturan.map((k) => A.findIndex((a) => a.k === k)); if (idx.some((i) => i < 0)) return { n: 0, rataEx: null };
    const m = idx.reduce((acc, i) => acc | (1 << i), 0) >>> 0;
    const dir = path.join(dataDir, 'arsip-sinyal');
    let hari: string[] = []; try { hari = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort(); } catch { return { n: 0, rataEx: null }; }
    const baca = (f: string) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; } };
    const kunci = jenis === 'teknikal' ? 'a' : 'fa';
    let n = 0, sum = 0;
    for (let i = 0; i + H < hari.length; i++) {
        const p0 = baca(hari[i]), p1 = baca(hari[i + H]); if (!p0 || !p1 || !p0.spy || !p1.spy) continue;
        const harga1 = new Map((p1.baris || []).map((b: any) => [b.s, b.c]));
        for (const b of p0.baris || []) {
            if (b[kunci] == null || ((b[kunci] >>> 0) & m) !== m) continue;
            const c1 = harga1.get(b.s) as number | undefined; if (!c1 || !b.c) continue;
            sum += (c1 / b.c - 1) - (p1.spy / p0.spy - 1); n++;
        }
    }
    return { n, rataEx: n ? +((sum / n) * 100).toFixed(3) : null };
}

/** Teks aturan untuk ditampilkan. */
export const teksAturan = (jenis: JenisAi, aturan: string[]) => aturan.map((k) => aturanDari(jenis).find((a) => a.k === k)?.t || k);
