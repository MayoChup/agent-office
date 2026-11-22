/**
 * "Fundamental kuat · lagi diskon": saham dengan fundamental Beli/Beli kuat yang harganya sedang turun,
 * dibagi tiga tahap supaya tidak "menangkap pisau jatuh":
 *   pantau → harga sedang turun, belum ada tanda berhenti
 *   zona   → mendekati penyangga (MA200 / terendah setahun) atau RSI < 35
 *   balik  → tanda pertama berbalik: MACD memotong naik ≤5 hari, atau hari naik dengan volume ramai saat RSI masih rendah
 * Dipakai sama persis di penyaring (hari ini) dan di uji mundur (data lampau), supaya hasil ujinya jujur.
 * Prediksi statistik, bukan saran beli/jual.
 */
export type Tahap = 'pantau' | 'zona' | 'balik';
export const URUT_TAHAP: Tahap[] = ['pantau', 'zona', 'balik'];
export interface Diskon { tahap: Tahap; dariPuncak: number; alasan: string[] }

/** Ambang: fundamental minimal "Beli" (skor ≥ 0,15) dan harga di bawah MA50 atau ≥15% di bawah puncak setahun. */
export function cekDiskon(b: { harga?: number; rsi?: number | null; ma50?: number | null; ma200?: number | null; chg1d?: number; volX?: number; sinyal?: any }, skorFund: number | null | undefined): Diskon | null {
    if (skorFund == null || skorFund < 0.15) return null;
    const h = Number(b.harga), s = b.sinyal || {};
    if (!(h > 0)) return null;
    const hi = Number(s.hi52), lo = Number(s.lo52);
    const dariPuncak = hi > 0 ? Math.max(0, (1 - h / hi) * 100) : 0;
    const diBawahMa50 = b.ma50 != null && h < b.ma50;
    if (!diBawahMa50 && dariPuncak < 15) return null;
    const alasan: string[] = [];
    if (dariPuncak >= 1) alasan.push(`${dariPuncak.toFixed(0)}% di bawah puncak setahun`);
    if (diBawahMa50) alasan.push('di bawah MA50');
    const rsi = b.rsi ?? null;
    // Tanda berbalik (lebih awal daripada menunggu tren pulih penuh).
    const macdBaru = s.macdAtas === true && s.macdHari != null && s.macdHari <= 5;
    const naikRamai = (b.chg1d ?? 0) >= 1.5 && (b.volX ?? 0) >= 1.5 && rsi != null && rsi < 50;
    if (macdBaru || naikRamai) {
        if (macdBaru) alasan.unshift(`MACD memotong naik ${s.macdHari === 0 ? 'hari ini' : `${s.macdHari} hari lalu`}`);
        if (naikRamai) alasan.unshift(`naik ${b.chg1d}% dengan volume ${b.volX}× rata-rata`);
        return { tahap: 'balik', dariPuncak: +dariPuncak.toFixed(1), alasan };
    }
    const dekatMa200 = b.ma200 != null && h <= b.ma200 * 1.03 && h >= b.ma200 * 0.95;
    const dekatLow = lo > 0 && h <= lo * 1.05;
    if ((rsi != null && rsi < 35) || dekatMa200 || dekatLow) {
        if (rsi != null && rsi < 35) alasan.unshift(`RSI ${Math.round(rsi)} (jenuh jual)`);
        if (dekatMa200) alasan.unshift('dekat MA200 (penyangga jangka panjang)');
        if (dekatLow) alasan.unshift('dekat terendah setahun');
        return { tahap: 'zona', dariPuncak: +dariPuncak.toFixed(1), alasan };
    }
    return { tahap: 'pantau', dariPuncak: +dariPuncak.toFixed(1), alasan };
}
