import fs from 'fs';
import type { Faktor } from './skor';
import { label } from './skor';

/**
 * Skor teknikal berbasis data:
 *  - 26 ciri teknikal sederhana (ya/tidak) dari grafik harian.
 *  - Bobot tiap ciri dicari dengan regresi ridge pada data LATIH (sebelum 2025),
 *    lalu diuji pada data UJI (2025 dst.) yang tidak dipakai saat mencari bobot.
 *  - Model hanya dipakai untuk horison yang LULUS uji; selain itu skor lama + peringatan.
 */
export const FITUR: Array<{ k: string; t: string }> = [
    { k: 'trenNaik', t: 'tren naik rapi (harga > MA50 > MA200)' }, { k: 'trenTurun', t: 'tren turun (harga < MA50 < MA200)' },
    { k: 'atasMa200', t: 'harga di atas MA200' }, { k: 'golden', t: 'golden cross ≤20 hari lalu' }, { k: 'death', t: 'death cross ≤20 hari lalu' },
    { k: 'macdNaik', t: 'MACD memotong naik ≤5 hari lalu' }, { k: 'macdTurun', t: 'MACD memotong turun ≤5 hari lalu' },
    { k: 'dbKonf', t: 'double bottom terkonfirmasi' }, { k: 'dbBentuk', t: 'double bottom baru terbentuk' },
    { k: 'dtKonf', t: 'double top terkonfirmasi' }, { k: 'dtBentuk', t: 'double top baru terbentuk' },
    { k: 'breakout52', t: 'tembus tertinggi 52 minggu' }, { k: 'dekatPuncak', t: 'dalam 5% dari puncak 52 minggu' }, { k: 'dekatDasar', t: 'dekat terendah 52 minggu' },
    { k: 'rsiRendah', t: 'RSI-14 < 30 (jenuh jual)' }, { k: 'rsiTinggi', t: 'RSI-14 > 70 (jenuh beli)' },
    { k: 'naik1b', t: 'naik >8% sebulan' }, { k: 'turun1b', t: 'turun >8% sebulan' },
    { k: 'turun1m', t: 'turun >7% dalam 5 hari' }, { k: 'naik1m', t: 'naik >10% dalam 5 hari' },
    { k: 'volNaik', t: 'volume ≥2× saat harga naik' }, { k: 'volTurun', t: 'volume ≥2× saat harga turun' },
    { k: 'jauhMa50', t: 'harga >15% di atas MA50 (sudah melar)' }, { k: 'rsKuat', t: 'unggul >10% dari S&P 500 (6 bulan)' },
    { k: 'rsLemah', t: 'tertinggal >10% dari S&P 500 (6 bulan)' }, { k: 'volatil', t: 'sangat bergejolak (ATR > 3% harga)' }
];

/** Ciri teknikal → bitmask (bit i = FITUR[i] terpenuhi). */
export function fitur(b: any, ind: any): number {
    const s = b.sinyal || {}, x = b.x || {}, hrg = ind?.harga || b.harga;
    const v: boolean[] = [
        s.tren === 'naik', s.tren === 'turun', !!s.diAtasMa200,
        s.goldenCross != null && s.goldenCross <= 20, s.deathCross != null && s.deathCross <= 20,
        s.macdBullish != null && s.macdBullish <= 5, s.macdBearish != null && s.macdBearish <= 5,
        s.doubleBottom === 'terkonfirmasi', s.doubleBottom === 'terbentuk', s.doubleTop === 'terkonfirmasi', s.doubleTop === 'terbentuk',
        !!s.breakout52, !!(ind && hrg >= ind.hi52 * 0.95), !!s.dekat52Low,
        b.rsi != null && b.rsi < 30, b.rsi != null && b.rsi > 70,
        b.chg1m > 8, b.chg1m < -8,
        (x.mom?.w1 ?? 0) < -7, (x.mom?.w1 ?? 0) > 10,
        b.volX >= 2 && b.chg1d >= 0, b.volX >= 2 && b.chg1d < 0,
        !!(ind?.ma50 && hrg > ind.ma50 * 1.15), (ind?.rs6 ?? 0) > 10, (ind?.rs6 ?? 0) < -10,
        !!(x.atr && hrg && x.atr / hrg > 0.03)
    ];
    let m = 0; v.forEach((y, i) => { if (y) m |= 1 << i; }); return m;
}

/** Regresi ridge kecil (persamaan normal + eliminasi Gauss). */
export function ridge(mask: number[], y: number[], lambda: number): { w: number[]; c: number } {
    const K = FITUR.length, P = K + 1;
    const A = Array.from({ length: P }, () => new Float64Array(P)), r = new Float64Array(P);
    for (let n = 0; n < y.length; n++) {
        const idx: number[] = [K]; for (let i = 0; i < K; i++) if (mask[n] & (1 << i)) idx.push(i);
        for (const i of idx) { r[i] += y[n]; for (const j of idx) A[i][j] += 1; }
    }
    for (let i = 0; i < K; i++) A[i][i] += lambda; // intersep tidak dihukum
    // Gauss-Jordan
    const M = A.map((row, i) => [...row, r[i]]);
    for (let col = 0; col < P; col++) {
        let piv = col; for (let i = col + 1; i < P; i++) if (Math.abs(M[i][col]) > Math.abs(M[piv][col])) piv = i;
        [M[col], M[piv]] = [M[piv], M[col]];
        const d = M[col][col] || 1e-12;
        for (let j = col; j <= P; j++) M[col][j] /= d;
        for (let i = 0; i < P; i++) if (i !== col && M[i][col]) { const f = M[i][col]; for (let j = col; j <= P; j++) M[i][j] -= f * M[col][j]; }
    }
    const sol = M.map((row) => row[P]);
    return { w: sol.slice(0, K), c: sol[K] };
}
export const nilaiMask = (m: number, w: number[]) => { let s = 0; for (let i = 0; i < w.length; i++) if (m & (1 << i)) s += w[i]; return s; };

export interface Model { H: number; w: number[]; c: number; cut: number[]; lulus: boolean; latih: { dari: string; sampai: string; n: number }; uji: any; at: number }
/** Persentil skor mentah → skor −1..+1: 10% teratas = Beli kuat, 20% berikutnya = Beli, 40% tengah = Tahan, dst. */
export function keSkor(raw: number, cut: number[]) {
    let lo = 0, hi = cut.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (cut[m] <= raw) lo = m; else hi = m - 1; }
    const p = Math.max(0, Math.min(1, lo / (cut.length - 1)));
    const seg = (q: number) => (q <= 0.2 ? (q / 0.2) * 0.15 : q <= 0.4 ? 0.15 + ((q - 0.2) / 0.2) * 0.3 : 0.45 + ((q - 0.4) / 0.1) * 0.55);
    const d = p - 0.5; return +(Math.sign(d) * seg(Math.abs(d))).toFixed(2);
}

let cache: { at: number; m: Record<string, Model> } | null = null;
export function bacaModel(file: string): Record<string, Model> {
    try { const st = fs.statSync(file); if (cache && cache.at === st.mtimeMs) return cache.m; const m = JSON.parse(fs.readFileSync(file, 'utf8')); cache = { at: st.mtimeMs, m }; return m; } catch { return {}; }
}
export const hModel = (H: number) => (H <= 1 ? 1 : H <= 5 ? 5 : H <= 20 ? 20 : 60);

/** Status pemakaian model: 'lulus' = terbukti; 'lebihBaik' = belum terbukti, tapi di data uji jelas lebih baik dari rumus lama; null = pakai rumus lama. */
export function statusModel(m?: Model | null): 'lulus' | 'lebihBaik' | null {
    if (!m) return null;
    if (m.lulus) return 'lulus';
    const b = m.uji?.baru, l = m.uji?.lama;
    if (b && b.t >= 1 && (m.uji.ic ?? 0) > 0 && b.selisih > (l?.selisih ?? -Infinity) + (b.galat ?? Infinity)) return 'lebihBaik';
    return null;
}
/** Skor teknikal dari model data. */
export function skorModel(b: any, ind: any, m: Model): Faktor {
    const mask = fitur(b, ind);
    const raw = nilaiMask(mask, m.w);
    const sk = keSkor(raw, m.cut);
    const alasan = FITUR.map((f, i) => ({ f, w: m.w[i], on: !!(mask & (1 << i)) })).filter((x) => x.on && Math.abs(x.w) >= 0.0003)
        .sort((a, b2) => Math.abs(b2.w) - Math.abs(a.w))
        .map((x) => `${x.w > 0 ? '+' : '−'} ${x.f.t} (secara historis ${x.w > 0 ? '+' : '−'}${Math.abs(x.w * 100).toFixed(2)}% vs pasar dalam ${m.H} hari bursa)`);
    alasan.unshift(m.lulus
        ? `+ bobot dari uji mundur: dilatih ${m.latih.dari}–${m.latih.sampai}, lulus uji di data ${m.uji.dari}–${m.uji.sampai}`
        : `· belum terbukti: bobot dari uji mundur (dilatih ${m.latih.dari.slice(0, 4)}–${m.latih.sampai.slice(0, 4)}) belum lulus uji ${m.uji.dari.slice(0, 4)}–${m.uji.sampai.slice(0, 4)}, tapi di data uji lebih baik dari rumus lama — pengaruh teknikal dikecilkan`);
    if (alasan.length === 1) alasan.push('· tidak ada ciri teknikal yang menonjol hari ini');
    return { skor: sk, label: label(sk), alasan };
}
