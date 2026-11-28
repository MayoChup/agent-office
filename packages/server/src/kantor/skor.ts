import fs from 'fs';
import path from 'path';

/**
 * Skor gabungan per saham dari 4 faktor (semua gratis, tanpa AI):
 *   Teknikal · Fundamental · Berita (sentimen judul berita) · Whales (aliran dana besar: CMF/OBV/volume,
 *   transaksi orang dalam Form 4 SEC, dan laporan Smart Money Sari).
 * Skala tiap faktor −1…+1 → label Jual kuat / Jual / Tahan / Beli / Beli kuat.
 * Plus proyeksi 20 sesi: target Konservatif/Moderat/Agresif dengan PELUANG historis tercapai.
 */

export type Label = 'Jual kuat' | 'Jual' | 'Tahan' | 'Beli' | 'Beli kuat';
export interface Faktor { skor: number; label: Label; alasan: string[]; /** faktor yang datanya belum siap (hanya di skor gabungan) */ kurang?: string[]; /** label sebelum ditahan karena data belum lengkap */ asli?: Label; /** skor sebelum ditahan */ skorAsli?: number }
export interface Target { nama: 'Konservatif' | 'Moderat' | 'Agresif'; harga: number; pct: number; /** % target tersentuh sebelum batas rugi */ peluang: number; /** = harapan (untuk memilih ★) */ nilai: number; rr?: number; /** rata-rata hasil per transaksi, % */ harapan?: number }
export interface Proyeksi { horizon: number; target: Target[]; stop: { harga: number; pct: number; peluang: number }; peluangNaik: number; terbaik: Target['nama']; rr: number }
export interface Ekstra {
    spark: number[]; mom: { w1: number; m1: number; m3: number }; atr: number; cmf: number; obv: number; trenLabel: string; proyeksi: Proyeksi | null;
}
export interface Berita { skor: number | null; n: number; judul: Array<{ t: string; s: number; tgl: string; url: string }>; at: number; sumber?: string }
export interface Orang { net: number; beli: number; jual: number; n: number; at: number }

export function label(s: number): Label {
    return s >= 0.45 ? 'Beli kuat' : s >= 0.15 ? 'Beli' : s > -0.15 ? 'Tahan' : s > -0.45 ? 'Jual' : 'Jual kuat';
}
const clamp = (x: number) => Math.max(-1, Math.min(1, x));
/** Batas "Beli kuat" untuk skor GABUNGAN — dikalibrasi dari uji mundur (kelompok skor terendah yang terbukti mengalahkan pasar). */
let ambangBeliKuat = 0.45;
export function setAmbangBeliKuat(t: number | null | undefined) { ambangBeliKuat = t != null && t >= 0.2 && t <= 0.45 ? t : 0.45; }
export const getAmbangBeliKuat = () => ambangBeliKuat;
export function labelGabung(s: number): Label { return s >= ambangBeliKuat ? 'Beli kuat' : label(s); }
const pct = (a: number, b: number) => (b ? (a / b - 1) * 100 : 0);

/* ── Ekstra dari OHLCV ─────────────────────────────────────── */
/** ringan = untuk uji mundur: proyeksi hanya menghitung peluangNaik (target & simulasi dilewati supaya cepat). */
export function ekstra(o: number[], h: number[], l: number[], c: number[], v: number[], ma50: number | null, ma200: number | null, ringan = false): Ekstra {
    const n = c.length;
    // ATR 14
    const tr: number[] = [];
    for (let i = 1; i < n; i++) tr.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
    const atr = tr.slice(-14).reduce((a, x) => a + x, 0) / Math.max(1, Math.min(14, tr.length));
    // Chaikin Money Flow 20
    let mfv = 0, vs = 0;
    for (let i = Math.max(0, n - 20); i < n; i++) {
        const rng = h[i] - l[i];
        if (rng > 0) mfv += (((c[i] - l[i]) - (h[i] - c[i])) / rng) * v[i];
        vs += v[i];
    }
    const cmf = vs ? mfv / vs : 0;
    // OBV 20 hari, dinormalkan dengan total volume 20 hari
    let obv = 0, vol20 = 0;
    for (let i = Math.max(1, n - 20); i < n; i++) { obv += c[i] > c[i - 1] ? v[i] : c[i] < c[i - 1] ? -v[i] : 0; vol20 += v[i]; }
    const obvN = vol20 ? obv / vol20 : 0;
    // Spark 60 hari (40 titik)
    const last60 = c.slice(-60);
    const step = Math.max(1, Math.floor(last60.length / 40));
    const spark = last60.filter((_, i) => i % step === 0 || i === last60.length - 1).map((x) => +x.toFixed(2));
    const mom = { w1: +pct(c[n - 1], c[n - 6] ?? c[0]).toFixed(1), m1: +pct(c[n - 1], c[n - 22] ?? c[0]).toFixed(1), m3: +pct(c[n - 1], c[n - 64] ?? c[0]).toFixed(1) };
    const last = c[n - 1];
    const trenLabel = ma50 && ma200 && last > ma50 && ma50 > ma200 ? 'Momentum'
        : ma50 && ma200 && last < ma50 && ma50 < ma200 ? 'Tren turun'
            : ma200 && last > ma200 && mom.m1 < -3 ? 'Koreksi'
                : ma200 && last < ma200 && mom.m1 > 3 ? 'Pemulihan' : 'Konsolidasi';
    return { spark, mom, atr: +atr.toFixed(3), cmf: +cmf.toFixed(3), obv: +obvN.toFixed(3), trenLabel, proyeksi: proyeksi(h, l, c, atr, 20, ringan) };
}

/**
 * Target & peluang historis.
 * Target dipasang dari volatilitas saham (kelipatan ATR, disesuaikan panjang horison), batas rugi dari titik terendah
 * belakangan (struktur harga), jadi R:R berbeda tiap saham. Lalu untuk tiap hari dalam ±1 tahun terakhir diuji:
 * kalau beli hari itu dengan target & batas rugi yang sama (dalam persen), mana yang tersentuh lebih dulu dalam H sesi?
 *   peluang = seberapa sering target tersentuh SEBELUM batas rugi
 *   harapan = rata-rata hasil per transaksi (target, batas rugi, atau harga penutupan di akhir horison)
 * Kalau target & batas rugi tersentuh di hari yang sama, dianggap kena batas rugi (konservatif).
 */
export function proyeksi(h: number[], l: number[], c: number[], atr: number, H = 20, ringan = false): Proyeksi | null {
    const n = c.length;
    const awal: number[] = []; let naik = 0;
    for (let i = Math.max(0, n - 1 - 250); i < n - H; i++) { awal.push(i); if (c[i + H] > c[i]) naik++; }
    if (awal.length < 60 || !(atr > 0)) return null;
    const last = c[n - 1];
    if (ringan) return { horizon: H, target: [], stop: { harga: last, pct: 0, peluang: 0 }, peluangNaik: Math.round((naik / awal.length) * 100), terbaik: 'Moderat', rr: 0 };
    // Batas rugi: di bawah titik terendah belakangan (min. 1 ATR di bawah harga), maksimal 25%.
    const jendela = Math.max(10, Math.min(60, H * 2));
    let rendah = Infinity; for (let i = Math.max(0, n - jendela); i < n; i++) rendah = Math.min(rendah, l[i]);
    const stopHarga = Math.min(last - atr, rendah - 0.25 * atr);
    const risk = Math.min(0.25, Math.max(0.005, 1 - stopHarga / last));
    // Satuan target: gerak wajar dalam H sesi ≈ ATR × √H × 0,6.
    const u = (atr / last) * Math.sqrt(H) * 0.6;
    const uji = (g: number) => {
        let kena = 0, jumlah = 0;
        for (const i of awal) {
            const up = c[i] * (1 + g), dn = c[i] * (1 - risk);
            let hasil: number | null = null;
            for (let k = i + 1; k <= i + H; k++) {
                if (l[k] <= dn) { hasil = -risk; break; }
                if (h[k] >= up) { hasil = g; kena++; break; }
            }
            jumlah += hasil ?? (c[i + H] / c[i] - 1);
        }
        return { peluang: kena / awal.length, harapan: jumlah / awal.length };
    };
    const mk = (nama: Target['nama'], m: number): Target => {
        const g = Math.max(0.005, u * m);
        const r = uji(g);
        return { nama, harga: +(last * (1 + g)).toFixed(2), pct: +(g * 100).toFixed(1), peluang: Math.round(r.peluang * 100), nilai: +(r.harapan * 100).toFixed(2), rr: +(g / risk).toFixed(2), harapan: +(r.harapan * 100).toFixed(2) };
    };
    const target = [mk('Konservatif', 0.75), mk('Moderat', 1.5), mk('Agresif', 2.5)];
    let stopKena = 0;
    for (const i of awal) { const dn = c[i] * (1 - risk); for (let k = i + 1; k <= i + H; k++) if (l[k] <= dn) { stopKena++; break; } }
    const terbaik = target.reduce((a, t) => (t.nilai > a.nilai ? t : a), target[0]);
    return {
        horizon: H, target,
        stop: { harga: +(last * (1 - risk)).toFixed(2), pct: +(-risk * 100).toFixed(1), peluang: Math.round((stopKena / awal.length) * 100) },
        peluangNaik: Math.round((naik / awal.length) * 100), terbaik: terbaik.nama, rr: terbaik.rr ?? +(terbaik.pct / (risk * 100)).toFixed(2)
    };
}

/* ── Skor per faktor ───────────────────────────────────────── */
/**
 * Teknikal menurut horison posisi (H = hari bursa):
 *   ≤2 hari  → yang menentukan: jenuh beli/jual, lonjakan volume, MACD barusan memotong, peluang historis H hari.
 *   ≤10 hari → swing: pola (double bottom/top), MACD, momentum seminggu; tren besar setengah bobot.
 *   >40 hari → tren besar (MA50/MA200, golden/death cross) paling berbobot; osilator hampir diabaikan.
 */
export function skorTeknikal(b: any, H = 20, pr: Proyeksi | null = null): Faktor {
    const s = b.sinyal, a: string[] = []; let x = 0;
    const kilat = H <= 2, swing = H <= 10, panjang = H > 40;
    const wTren = kilat ? 0.2 : swing ? 0.55 : panjang ? 1.3 : 1;
    const wOsc = kilat ? 1.7 : swing ? 1.3 : panjang ? 0.4 : 1;
    const wSilang = kilat ? 1.4 : swing ? 1.3 : panjang ? 0.5 : 1;
    const segar = (hari: number | null) => hari != null && hari <= Math.max(2, Math.ceil(H * 1.5));
    const add0 = (v: number, why: string) => { if (Math.abs(v) < 0.005) return; x += v; a.push(`${v > 0 ? '+' : '−'} ${why}`); };
    const add = add0;
    const tren = (v: number, why: string) => add0(v * wTren, why);
    const osc = (v: number, why: string) => add0(v * wOsc, why);
    if (s.tren === 'naik') tren(0.3, 'tren naik rapi (harga > MA50 > MA200 · grafik harian, ±10 bulan)'); else if (s.tren === 'turun') tren(-0.3, 'tren turun (harga < MA50 < MA200 · grafik harian, ±10 bulan)');
    if (s.diAtasMa200) tren(0.12, 'di atas MA200 (rata-rata 200 hari bursa)'); else if (b.ma200) tren(-0.12, 'di bawah MA200 (rata-rata 200 hari bursa)');
    if (s.goldenCross != null && (panjang || segar(s.goldenCross))) tren(0.25, `golden cross ${s.goldenCross} hari lalu (MA50 memotong MA200 · grafik harian)`);
    if (s.deathCross != null && (panjang || segar(s.deathCross))) tren(-0.25, `death cross ${s.deathCross} hari lalu (MA50 memotong MA200 · grafik harian)`);
    if (s.macdBullish != null && segar(s.macdBullish)) add(0.12 * wSilang, `MACD memotong naik ${s.macdBullish} hari lalu (MACD 12/26/9 · grafik harian)`); if (s.macdBearish != null && segar(s.macdBearish)) add(-0.12 * wSilang, `MACD memotong turun ${s.macdBearish} hari lalu (MACD 12/26/9 · grafik harian)`);
    if (s.doubleBottom) add((s.doubleBottom === 'terkonfirmasi' ? 0.3 : 0.15) * (kilat ? 0.6 : 1), `double bottom ${s.doubleBottom} (grafik harian · 2 lembah berjarak ≥10 hari dalam 6 bulan terakhir${s.doubleBottom === 'terkonfirmasi' ? ', harga sudah tembus garis leher' : ', belum tembus garis leher'})`);
    if (s.doubleTop) add((s.doubleTop === 'terkonfirmasi' ? -0.3 : -0.15) * (kilat ? 0.6 : 1), `double top ${s.doubleTop} (grafik harian · 2 puncak berjarak ≥10 hari dalam 6 bulan terakhir${s.doubleTop === 'terkonfirmasi' ? ', harga sudah jebol garis leher' : ', belum jebol garis leher'})`);
    if (swing && b.x?.mom) {
        if (b.x.mom.w1 < -7) osc(0.12, `turun ${Math.abs(b.x.mom.w1)}% dalam 5 hari bursa (rawan memantul)`);
        else if (b.x.mom.w1 > 10) osc(-0.1, `naik ${b.x.mom.w1}% dalam 5 hari bursa (rawan ambil untung)`);
        if (b.volX >= 2) add(b.chg1d >= 0 ? 0.15 : -0.15, `volume ${b.volX}× rata-rata, harga ${b.chg1d >= 0 ? 'naik' : 'turun'} (hari terakhir vs rata-rata 20 hari)`);
    }
    if (pr) add(((pr.peluangNaik - 50) / 50) * (kilat ? 0.35 : swing ? 0.3 : 0.2), `secara historis ${pr.peluangNaik}% periode ${H} hari berakhir naik`);
    if (s.breakout52) add(0.18, 'tembus tertinggi 52 minggu (grafik harian, 1 tahun)');
    if (s.dekat52Low) add(-0.08, 'dekat terendah 52 minggu (grafik harian, 1 tahun)');
    if (b.rsi != null && b.rsi < 30) osc(0.1, `RSI ${b.rsi} jenuh jual, peluang memantul (RSI-14 · grafik harian)`);
    if (b.rsi != null && b.rsi > 75) osc(-0.12, `RSI ${b.rsi} jenuh beli (RSI-14 · grafik harian)`);
    if (!kilat) { if (b.chg1m > 8) tren(0.08, `naik ${b.chg1m}% sebulan`); else if (b.chg1m < -8) tren(-0.08, `turun ${Math.abs(b.chg1m)}% sebulan`); }
    const sk = clamp(x);
    return { skor: +sk.toFixed(2), label: label(sk), alasan: a };
}

export function skorFundamental(b: any): Faktor | null {
    const f = b.f; if (!f) return null;
    const a: string[] = []; let x = 0;
    const add = (v: number, why: string) => { x += v; a.push(`${v > 0 ? '+' : '−'} ${why}`); };
    const bank = /keuangan|financ/i.test(b.sektor || '');
    if (f.roe != null) { if (f.roe >= 20) add(0.3, `ROE ${f.roe}% tinggi`); else if (f.roe >= 10) add(0.12, `ROE ${f.roe}% cukup`); else if (f.roe < 0) add(-0.3, `ROE negatif (rugi)`); }
    if (f.per != null) { if (f.per > 0 && f.per < 15) add(0.2, `PER ${f.per}× murah`); else if (f.per > 45) add(-0.15, `PER ${f.per}× mahal`); } else if (f.roe != null && f.roe < 0) add(-0.1, 'tidak ada PER (rugi)');
    if (f.pbv != null) { if (f.pbv < 1.5) add(0.15, `PBV ${f.pbv}× di bawah 1,5`); else if (f.pbv > 12 && (f.roe ?? 0) < 30) add(-0.12, `PBV ${f.pbv}× tinggi`); }
    if (f.der != null && !bank) { if (f.der < 1) add(0.12, `utang rendah (DER ${f.der}×)`); else if (f.der > 3) add(-0.15, `utang besar (DER ${f.der}×)`); }
    if (f.npm != null) { if (f.npm >= 20) add(0.15, `margin laba ${f.npm}%`); else if (f.npm < 0) add(-0.2, 'margin laba negatif'); }
    if (f.revGrowth != null) { if (f.revGrowth >= 15) add(0.2, `pendapatan tumbuh ${f.revGrowth}%`); else if (f.revGrowth < 0) add(-0.15, `pendapatan turun ${Math.abs(f.revGrowth)}%`); }
    if (!a.length) return null;
    const sk = clamp(x);
    return { skor: +sk.toFixed(2), label: label(sk), alasan: a };
}

export function skorBerita(br: Berita | undefined): Faktor | null {
    if (!br || br.skor == null || !br.n) return null;
    const sk = clamp(br.skor);
    const pos = br.judul.filter((j) => j.s > 0).length, neg = br.judul.filter((j) => j.s < 0).length;
    return { skor: +sk.toFixed(2), label: label(sk), alasan: [`${br.n} berita 7 hari: ${pos} positif, ${neg} negatif`, ...br.judul.filter((j) => j.s !== 0).slice(0, 3).map((j) => `${j.s > 0 ? '+' : '−'} ${j.t}`)] };
}

export function skorWhales(b: any, x: Ekstra | undefined, orang: Orang | undefined, sari: number): Faktor | null {
    if (!x) return null;
    const a: string[] = []; let s = 0;
    const add = (v: number, why: string) => { s += v; a.push(`${v > 0 ? '+' : '−'} ${why}`); };
    if (x.cmf > 0.08) add(Math.min(0.3, x.cmf * 1.5), `dana masuk (CMF ${x.cmf})`); else if (x.cmf < -0.08) add(Math.max(-0.3, x.cmf * 1.5), `dana keluar (CMF ${x.cmf})`);
    if (x.obv > 0.2) add(0.1, 'volume hari naik > hari turun (OBV naik)'); else if (x.obv < -0.2) add(-0.1, 'volume hari turun > hari naik (OBV turun)');
    if (b.volX >= 2) add(b.chg1d >= 0 ? 0.12 : -0.12, `volume ${b.volX}× rata-rata saat harga ${b.chg1d >= 0 ? 'naik' : 'turun'}`);
    if (orang && orang.n) {
        if (orang.net > 0) add(Math.min(0.4, 0.15 + Math.log10(1 + orang.net / 1e5) * 0.08), `orang dalam membeli bersih $${Math.round(orang.net).toLocaleString('en-US')} (Form 4, 30 hari)`);
        else if (orang.net < -1e6) add(-0.1, `orang dalam menjual bersih $${Math.round(-orang.net).toLocaleString('en-US')} (umumnya rutin)`);
    }
    if (sari > 0) add(0.25, 'masuk daftar DIBELI investor besar/Kongres (laporan Sari)');
    if (sari < 0) add(-0.2, 'masuk daftar DIJUAL investor besar/Kongres (laporan Sari)');
    if (!a.length) a.push('tidak ada aliran dana yang menonjol');
    const sk = clamp(s);
    return { skor: +sk.toFixed(2), label: label(sk), alasan: a };
}

/** Bobot faktor per horison: makin pendek, fundamental makin tidak relevan; berita & teknikal makin penting. */
/** Bobot faktor. Bila skor teknikal horison ini belum terbukti, pengaruhnya dipotong setengah dan sisanya dibagi ke faktor lain. */
export function bobot(H: number, mode = '', teknikalTerbukti = true): Record<string, number> {
    const W = bobotDasar(H, mode);
    if (teknikalTerbukti || !W.teknikal) return W;
    const t = W.teknikal / 2, sisa = 1 - W.teknikal, out: Record<string, number> = { teknikal: t };
    for (const k of Object.keys(W)) if (k !== 'teknikal') out[k] = sisa > 0 ? +(W[k] + (W[k] / sisa) * t).toFixed(3) : W[k];
    return out;
}
function bobotDasar(H: number, mode = ''): Record<string, number> {
    if (mode === 'scalping') return { teknikal: 0.65, fundamental: 0, berita: 0.25, whales: 0.1 };
    if (H <= 2) return { teknikal: 0.55, fundamental: 0, berita: 0.3, whales: 0.15 };
    if (H <= 5) return { teknikal: 0.5, fundamental: 0.05, berita: 0.25, whales: 0.2 };
    if (H <= 20) return { teknikal: 0.4, fundamental: 0.2, berita: 0.15, whales: 0.25 };
    if (H <= 60) return { teknikal: 0.3, fundamental: 0.4, berita: 0.1, whales: 0.2 };
    return { teknikal: 0.2, fundamental: 0.55, berita: 0.05, whales: 0.2 };
}
export function gabung(f: Record<string, Faktor | null>, H = 20, mode = '', teknikalTerbukti = true): Faktor {
    const W = bobot(H, mode, teknikalTerbukti);
    let s = 0, w = 0;
    // Berita & whales yang netral (skor ≈ 0) tidak boleh menyeret skor ke tengah: bobotnya diredam sampai 35%,
    // penuh lagi bila skornya tegas (|skor| ≥ 0,3) — positif maupun negatif.
    const efektif = (k: string, sk: number) => (k === 'berita' || k === 'whales' ? W[k] * (0.35 + 0.65 * Math.min(1, Math.abs(sk) / 0.3)) : W[k]);
    for (const k of Object.keys(W)) if (f[k]) { const we = efektif(k, f[k]!.skor); s += f[k]!.skor * we; w += we; }
    const sk = w ? clamp(s / w) : 0;
    const ada = Object.keys(W).filter((k) => f[k] && W[k] > 0).length;
    return { skor: +sk.toFixed(2), label: labelGabung(sk), alasan: [`gabungan ${ada} faktor untuk ${mode === 'scalping' ? 'scalping (hari ini)' : H === 1 ? 'day trading (hari ini)' : `posisi ≤${H} hari bursa`} (bobot${teknikalTerbukti ? '' : ', teknikal dikecilkan karena belum terbukti'}: ${Object.entries(W).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(', ')})`] };
}

/* ── Sentimen berita (kamus kata, tanpa AI) ───────────────────── */
const POS = ['beat', 'beats', 'surge', 'surges', 'soar', 'soars', 'jump', 'jumps', 'rally', 'rallies', 'record', 'upgrade', 'upgrades', 'upgraded', 'raise', 'raises', 'raised', 'boost', 'boosts', 'strong', 'stronger', 'growth', 'wins', 'win', 'approval', 'approved', 'buyback', 'outperform', 'bullish', 'expands', 'expansion', 'partnership', 'tops', 'exceeds', 'gains', 'rebound', 'rebounds', 'profit', 'profitable', 'breakthrough', 'launch', 'launches', 'higher', 'optimistic', 'accelerate', 'accelerates', 'dividend', 'overweight', 'buy'];
const NEG = ['miss', 'misses', 'plunge', 'plunges', 'fall', 'falls', 'drop', 'drops', 'slump', 'slumps', 'downgrade', 'downgrades', 'downgraded', 'cut', 'cuts', 'lawsuit', 'sued', 'sues', 'probe', 'investigation', 'recall', 'weak', 'weaker', 'loss', 'losses', 'layoff', 'layoffs', 'bearish', 'underperform', 'warning', 'warns', 'delay', 'delays', 'decline', 'declines', 'tumble', 'tumbles', 'sink', 'sinks', 'fraud', 'halt', 'halts', 'ban', 'bans', 'tariff', 'tariffs', 'fined', 'fine', 'resigns', 'bankruptcy', 'lower', 'slashes', 'concern', 'concerns', 'risk', 'selloff', 'sell-off', 'underweight', 'sell', 'curbs', 'crash'];
export function sentimen(t: string): number {
    const w = t.toLowerCase().replace(/[^a-z\s-]/g, ' ').split(/\s+/);
    let s = 0;
    for (const x of w) { if (POS.includes(x)) s++; else if (NEG.includes(x)) s--; }
    return Math.max(-1, Math.min(1, s / 2));
}
export const UA_BROWSER = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
let yahooRssIstirahat = 0;
/** RSS berita: Yahoo dulu; kalau server diblokir Yahoo, pakai Google News (gratis, tanpa kunci). */
export async function rssBerita(simbol: string): Promise<{ xml: string; sumber: string }> {
    if (yahooRssIstirahat < Date.now()) {
        try {
            const res = await fetch(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(simbol)}&region=US&lang=en-US`, { headers: { 'User-Agent': UA_BROWSER }, signal: AbortSignal.timeout(15_000) });
            if (res.ok) { const xml = await res.text(); if (/<item>/.test(xml)) return { xml, sumber: 'Yahoo' }; }
            else if (res.status === 429 || res.status === 403) yahooRssIstirahat = Date.now() + 20 * 60_000;
        } catch { /* coba cadangan */ }
    }
    const q = encodeURIComponent(`${simbol.replace('-', '.')} stock`);
    const res = await fetch(`https://news.google.com/rss/search?q=${q}+when:7d&hl=en-US&gl=US&ceid=US:en`, { headers: { 'User-Agent': UA_BROWSER }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Berita: Yahoo & Google News gagal (HTTP ${res.status})`);
    return { xml: await res.text(), sumber: 'Google News' };
}
export async function ambilBerita(simbol: string): Promise<Berita> {
    const { xml, sumber } = await rssBerita(simbol);
    const tag = (s: string, t: string) => (s.match(new RegExp(`<${t}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${t}>`)) || [])[1]?.trim() || '';
    const un = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
    const batas = Date.now() - 7 * 86400_000;
    const judul = (xml.match(/<item>[\s\S]*?<\/item>/g) || []).map((it) => {
        const t = un(tag(it, 'title')).replace(/\s+-\s+[^-]{2,60}$/, sumber === 'Google News' ? '' : '$&').slice(0, 200);
        const at = Date.parse(tag(it, 'pubDate')) || Date.now();
        return { t, s: sentimen(`${t} ${un(tag(it, 'description')).slice(0, 200)}`), tgl: new Date(at).toISOString().slice(0, 10), url: tag(it, 'link'), at };
    }).filter((j) => j.t && j.at >= batas).slice(0, 12);
    // Berita baru lebih berbobot.
    let sum = 0, w = 0;
    for (const j of judul) { const bobot = 1 + (j.at - batas) / (7 * 86400_000); sum += j.s * bobot; w += bobot; }
    return { skor: judul.length ? +(sum / w).toFixed(2) : null, n: judul.length, judul: judul.slice(0, 6).map(({ at, ...r }) => r), at: Date.now(), sumber };
}

/* ── Orang dalam (Form 4) ──────────────────────────────────── */
const SEC_UA = 'KantorRico research kantor-rico@users.noreply.github.com';
export async function ambilOrangDalam(cik: number): Promise<Orang> {
    const r = await fetch(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, '0')}.json`, { headers: { 'User-Agent': SEC_UA } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const f: any = (await r.json() as any)?.filings?.recent || {};
    const sejak = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    let beli = 0, jual = 0, n = 0;
    for (let i = 0; i < (f.form || []).length && n < 8; i++) {
        if (f.filingDate[i] < sejak) break;
        if (f.form[i] !== '4') continue;
        const acc = String(f.accessionNumber[i]).replace(/-/g, '');
        const doc = String(f.primaryDocument[i]).split('/').pop();
        try {
            const x = await fetch(`https://www.sec.gov/Archives/edgar/data/${cik}/${acc}/${doc}`, { headers: { 'User-Agent': SEC_UA } });
            if (!x.ok) continue;
            const xml = await x.text();
            for (const t of xml.match(/<nonDerivativeTransaction>[\s\S]*?<\/nonDerivativeTransaction>/g) || []) {
                const code = (t.match(/<transactionCode>\s*([A-Z])\s*</) || [])[1];
                const sh = Number((t.match(/<transactionShares>\s*<value>\s*([\d.]+)/) || [])[1] || 0);
                const px = Number((t.match(/<transactionPricePerShare>\s*<value>\s*([\d.]+)/) || [])[1] || 0);
                if (code === 'P') beli += sh * px; else if (code === 'S') jual += sh * px;
            }
            n++;
        } catch { /* lewati */ }
        await new Promise((res) => setTimeout(res, 200));
    }
    return { net: beli - jual, beli, jual, n, at: Date.now() };
}

/** Saham yang disebut di laporan Smart Money Sari terbaru: +1 = dibeli, −1 = dijual. */
export function bacaLaporanSari(deskDir: string): Map<string, number> {
    const m = new Map<string, number>();
    try {
        const dir = path.join(deskDir, 'laporan');
        const f = fs.readdirSync(dir).filter((x) => /-smartmoney\.md$/.test(x)).sort().pop();
        if (!f) return m;
        let arah = 0;
        for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
            if (/dibeli|beli|bought|buy/i.test(line) && /^#|^\*\*|:$/.test(line.trim())) arah = 1;
            if (/dijual|jual|sold|sell/i.test(line) && /^#|^\*\*|:$/.test(line.trim())) arah = -1;
            if (!arah) continue;
            for (const t of line.match(/\b[A-Z]{1,5}\b/g) || []) if (!m.has(t)) m.set(t, arah);
        }
    } catch { /* belum ada laporan */ }
    return m;
}
