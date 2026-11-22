/**
 * "Peluang pantul" (balik arah) — satu fitur untuk dua arah, dipakai SAMA PERSIS di penyaring (hari ini) dan uji mundur (data lampau):
 *
 * Pantul NAIK (peluang beli) — satu saham masuk salah satu jenis:
 *   koreksi → tren panjang masih naik (di atas MA200) tapi sedang turun tajam sebentar (RSI < 40 atau −8% sebulan); fundamental minimal Tahan
 *   diskon  → fundamental kuat (Beli/Beli kuat) dan harga sedang turun (di bawah MA50 atau ≥15% di bawah puncak setahun)
 * Pantul TURUN (ambil untung sebagian, bukan short) → naik terlalu kencang: RSI > 72 dan ≥10% di atas MA50.
 *
 * Tahap: pantau → zona (dekat penyangga / sangat jenuh) → balik (tanda pertama berbalik). Prediksi statistik, bukan saran beli/jual.
 */
export type Tahap = 'pantau' | 'zona' | 'balik';
export type Jenis = 'koreksi' | 'diskon';
export const URUT_TAHAP: Tahap[] = ['pantau', 'zona', 'balik'];
export interface Diskon { tahap: Tahap; jenis: Jenis; dariPuncak: number; alasan: string[] }
export interface AmbilUntung { tahap: Tahap; diAtasMa50: number; alasan: string[] }
interface Masukan { harga?: number; rsi?: number | null; ma50?: number | null; ma200?: number | null; chg1d?: number; chg1m?: number; volX?: number; sinyal?: any }

const fmt = (x: number) => String(Math.round(x));

/** Pantul naik. skorFund: skor fundamental −1..1 (null = belum ada data). */
export function cekDiskon(b: Masukan, skorFund: number | null | undefined): Diskon | null {
    const h = Number(b.harga), s = b.sinyal || {};
    if (!(h > 0)) return null;
    const hi = Number(s.hi52), lo = Number(s.lo52);
    const dariPuncak = hi > 0 ? Math.max(0, (1 - h / hi) * 100) : 0;
    const rsi = b.rsi ?? null, m1 = b.chg1m ?? 0;
    const diAtas200 = b.ma200 != null && h > b.ma200;
    const fundOk = skorFund == null || skorFund > -0.15; // minimal Tahan
    const fundKuat = skorFund != null && skorFund >= 0.15;
    let jenis: Jenis | null = null;
    if (diAtas200 && fundOk && ((rsi != null && rsi < 40) || m1 <= -8)) jenis = 'koreksi';
    else if (fundKuat && ((b.ma50 != null && h < b.ma50) || dariPuncak >= 15)) jenis = 'diskon';
    if (!jenis) return null;
    const alasan: string[] = [];
    if (jenis === 'koreksi') alasan.push(`tren panjang masih naik (di atas MA200), turun ${fmt(Math.abs(Math.min(0, m1)))}% sebulan`);
    if (dariPuncak >= 1) alasan.push(`${fmt(dariPuncak)}% di bawah puncak setahun`);
    // Tanda berbalik (lebih awal daripada menunggu tren pulih penuh).
    const macdBaru = s.macdAtas === true && s.macdHari != null && s.macdHari <= 5;
    const naikRamai = (b.chg1d ?? 0) >= 1.5 && (b.volX ?? 0) >= 1.5 && rsi != null && rsi < 50;
    if (macdBaru || naikRamai) {
        if (macdBaru) alasan.unshift(`MACD memotong naik ${s.macdHari === 0 ? 'hari ini' : `${s.macdHari} hari lalu`}`);
        if (naikRamai) alasan.unshift(`naik ${b.chg1d}% dengan volume ${b.volX}× rata-rata`);
        return { tahap: 'balik', jenis, dariPuncak: +dariPuncak.toFixed(1), alasan };
    }
    const dekatMa200 = b.ma200 != null && h <= b.ma200 * 1.03 && h >= b.ma200 * 0.95;
    const dekatLow = lo > 0 && h <= lo * 1.05;
    if ((rsi != null && rsi < 35) || dekatMa200 || dekatLow || m1 <= -12) {
        if (rsi != null && rsi < 35) alasan.unshift(`RSI ${Math.round(rsi)} (jenuh jual)`);
        if (dekatMa200) alasan.unshift('dekat MA200 (penyangga jangka panjang)');
        if (dekatLow) alasan.unshift('dekat terendah setahun');
        return { tahap: 'zona', jenis, dariPuncak: +dariPuncak.toFixed(1), alasan };
    }
    return { tahap: 'pantau', jenis, dariPuncak: +dariPuncak.toFixed(1), alasan };
}

/** Pantul turun → tanda "Ambil untung sebagian" untuk yang memegang (bukan perintah short). */
export function cekAmbilUntung(b: Masukan): AmbilUntung | null {
    const h = Number(b.harga), s = b.sinyal || {}, rsi = b.rsi ?? null;
    if (!(h > 0) || rsi == null || b.ma50 == null) return null;
    const jarak = (h / b.ma50 - 1) * 100;
    if (!(rsi > 72 && jarak >= 10)) return null;
    const alasan = [`RSI ${Math.round(rsi)} (jenuh beli)`, `${fmt(jarak)}% di atas MA50`];
    const macdTurun = s.macdAtas === false && s.macdHari != null && s.macdHari <= 3;
    const turunRamai = (b.chg1d ?? 0) <= -1.5 && (b.volX ?? 0) >= 1.5;
    if (macdTurun || turunRamai) {
        if (macdTurun) alasan.unshift('MACD mulai memotong turun');
        if (turunRamai) alasan.unshift(`turun ${Math.abs(b.chg1d!)}% dengan volume ${b.volX}× rata-rata`);
        return { tahap: 'balik', diAtasMa50: +jarak.toFixed(1), alasan };
    }
    return { tahap: rsi > 78 ? 'zona' : 'pantau', diAtasMa50: +jarak.toFixed(1), alasan };
}
