/**
 * Preset screener ala "guru" (teknikal & fundamental).
 * Tiap preset = daftar kriteria. Kepatuhan = kriteria lolos ÷ kriteria yang datanya ada.
 * Kalau preset dipakai, skor faktornya ikut turun/naik sesuai kepatuhan (tidak harus 100% lolos).
 */

/* ── Indikator tambahan dari harga harian (dihitung saat ↻ data pasar) ── */
export interface Ind {
    ma5: number | null; ma20: number | null; ma50: number | null; ma150: number | null; ma200: number | null; ema20: number | null;
    ma150naik: boolean | null; ma200naik: boolean | null; ema20naik: boolean | null;
    hi52: number; lo52: number; hi20prev: number; lo20: number; rentang20: number;
    rs3: number | null; rs6: number | null; rsi2: number | null; rsi14: number | null; adx: number | null;
    posisiHari: number | null; chg1d: number; volX: number; harga: number; pasarNaik: boolean | null;
    /** Tambahan untuk Preset by AI (boleh kosong di data lama). */
    bbPctB?: number | null; bbSqueeze?: boolean | null; stochK?: number | null; mfi?: number | null; gapPct?: number | null; ekorBawah?: boolean | null;
}
const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const smaAt = (c: number[], n: number, back = 0) => (c.length - back >= n ? avg(c.slice(c.length - back - n, c.length - back)) : null);
function emaSeri(c: number[], n: number) { const k = 2 / (n + 1); const out: number[] = []; c.forEach((x, i) => out.push(i ? x * k + out[i - 1] * (1 - k) : x)); return out; }
function rsiN(c: number[], n: number): number | null {
    if (c.length < n + 2) return null;
    let up = 0, dn = 0;
    for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; if (d > 0) up += d; else dn -= d; }
    up /= n; dn /= n;
    for (let i = n + 1; i < c.length; i++) { const d = c[i] - c[i - 1]; up = (up * (n - 1) + Math.max(0, d)) / n; dn = (dn * (n - 1) + Math.max(0, -d)) / n; }
    return dn === 0 ? 100 : +(100 - 100 / (1 + up / dn)).toFixed(1);
}
function adxN(h: number[], l: number[], c: number[], n = 14): number | null {
    if (c.length < n * 3) return null;
    const tr: number[] = [], pdm: number[] = [], ndm: number[] = [];
    for (let i = 1; i < c.length; i++) {
        const up = h[i] - h[i - 1], dn = l[i - 1] - l[i];
        pdm.push(up > dn && up > 0 ? up : 0); ndm.push(dn > up && dn > 0 ? dn : 0);
        tr.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
    }
    const wild = (a: number[]) => { const o: number[] = []; let s = a.slice(0, n).reduce((x, y) => x + y, 0); o.push(s); for (let i = n; i < a.length; i++) { s = s - s / n + a[i]; o.push(s); } return o; };
    const t = wild(tr), p = wild(pdm), m = wild(ndm);
    const dx = t.map((x, i) => { const pd = (100 * p[i]) / x, nd = (100 * m[i]) / x; return pd + nd ? (100 * Math.abs(pd - nd)) / (pd + nd) : 0; });
    let adx = avg(dx.slice(0, n));
    for (let i = n; i < dx.length; i++) adx = (adx * (n - 1) + dx[i]) / n;
    return +adx.toFixed(1);
}
export function hitungInd(d: { h: number[]; l: number[]; c: number[]; v: number[]; o?: number[] }, spy: { c: number[] } | null, pasarNaik: boolean | null): Ind {
    const { h, l, c, v } = d; const n = c.length; const last = c[n - 1];
    const tambahan = indTambahan(d);
    const e20 = emaSeri(c, 20);
    const ret = (x: number[], k: number) => (x.length > k ? (x[x.length - 1] / x[x.length - 1 - k] - 1) * 100 : null);
    const rs = (k: number) => { const a = ret(c, k), b = spy ? ret(spy.c, k) : null; return a != null && b != null ? +(a - b).toFixed(1) : null; };
    const hi20 = Math.max(...h.slice(Math.max(0, n - 21), n - 1)), lo20 = Math.min(...l.slice(Math.max(0, n - 20)));
    const ma150 = smaAt(c, 150), ma200 = smaAt(c, 200);
    const avgV = avg(v.slice(Math.max(0, n - 21), n - 1));
    return {
        ma5: smaAt(c, 5), ma20: smaAt(c, 20), ma50: smaAt(c, 50), ma150, ma200, ema20: +e20[n - 1].toFixed(3),
        ma150naik: ma150 != null && smaAt(c, 150, 20) != null ? ma150 > (smaAt(c, 150, 20) as number) : null,
        ma200naik: ma200 != null && smaAt(c, 200, 22) != null ? ma200 > (smaAt(c, 200, 22) as number) : null,
        ema20naik: n > 6 ? e20[n - 1] > e20[n - 6] : null,
        hi52: Math.max(...h.slice(Math.max(0, n - 252))), lo52: Math.min(...l.slice(Math.max(0, n - 252))),
        hi20prev: hi20, lo20, rentang20: +((Math.max(...h.slice(Math.max(0, n - 20))) / lo20 - 1) * 100).toFixed(1),
        rs3: rs(63), rs6: rs(126), rsi2: rsiN(c.slice(-60), 2), rsi14: rsiN(c, 14), adx: adxN(h, l, c),
        posisiHari: h[n - 1] > l[n - 1] ? +((last - l[n - 1]) / (h[n - 1] - l[n - 1])).toFixed(2) : null,
        chg1d: +((last / c[n - 2] - 1) * 100).toFixed(2), volX: avgV ? +(v[n - 1] / avgV).toFixed(2) : 0, harga: last, pasarNaik,
        ...tambahan
    };
}

/** Bollinger %B & "squeeze", Stochastic %K, MFI, gap pembukaan, ekor bawah candle (untuk Preset by AI). */
function indTambahan(d: { h: number[]; l: number[]; c: number[]; v: number[]; o?: number[] }) {
    const { h, l, c, v, o } = d; const n = c.length;
    const out: { bbPctB: number | null; bbSqueeze: boolean | null; stochK: number | null; mfi: number | null; gapPct: number | null; ekorBawah: boolean | null } = { bbPctB: null, bbSqueeze: null, stochK: null, mfi: null, gapPct: null, ekorBawah: null };
    const sd = (a: number[]) => { const m = avg(a); return Math.sqrt(avg(a.map((x) => (x - m) ** 2))); };
    if (n >= 20) {
        const w = c.slice(-20), m = avg(w), s = sd(w);
        out.bbPctB = s > 0 ? +((c[n - 1] - (m - 2 * s)) / (4 * s)).toFixed(3) : null;
        if (n >= 140) {
            const lebar: number[] = [];
            for (let k = n - 120; k <= n; k++) { const ww = c.slice(k - 20, k), mm = avg(ww); if (mm > 0) lebar.push((4 * sd(ww)) / mm); }
            const kini = lebar[lebar.length - 1], urut = [...lebar].sort((a, b) => a - b);
            out.bbSqueeze = kini <= urut[Math.floor(urut.length * 0.2)];
        }
    }
    if (n >= 16) {
        const k3: number[] = [];
        for (let k = n - 3; k < n; k++) { const hh = Math.max(...h.slice(k - 13, k + 1)), ll = Math.min(...l.slice(k - 13, k + 1)); k3.push(hh > ll ? ((c[k] - ll) / (hh - ll)) * 100 : 50); }
        out.stochK = +avg(k3).toFixed(1);
    }
    if (n >= 16) {
        let pos = 0, neg = 0;
        for (let k = n - 14; k < n; k++) { const tp = (h[k] + l[k] + c[k]) / 3, tp0 = (h[k - 1] + l[k - 1] + c[k - 1]) / 3, mf = tp * v[k]; if (tp > tp0) pos += mf; else if (tp < tp0) neg += mf; }
        out.mfi = neg === 0 ? 100 : +(100 - 100 / (1 + pos / neg)).toFixed(1);
    }
    if (o && o.length === n && n >= 2) {
        out.gapPct = +((o[n - 1] / c[n - 2] - 1) * 100).toFixed(2);
        const rng = h[n - 1] - l[n - 1];
        out.ekorBawah = rng > 0 ? (Math.min(o[n - 1], c[n - 1]) - l[n - 1]) / rng >= 0.35 && (c[n - 1] - l[n - 1]) / rng >= 0.5 : null;
    }
    return out;
}

/* ── Fundamental (dari Nasdaq; cadangan SEC) ── */
export interface Fund {
    roe: number | null; roa: number | null; roaPrev: number | null; per: number | null; pbv: number | null; ps: number | null; der: number | null;
    npm: number | null; npmRata: number | null; gm: number | null; gmPrev: number | null; revGrowth: number | null; epsCagr3: number | null;
    fcf: number | null; cfo: number | null; ni: number | null; cr: number | null; crPrev: number | null; lev: number | null; levPrev: number | null;
    at: number | null; atPrev: number | null; labaPositifSemua: boolean | null; dividen: number | null; mcap: number | null; sumber: string;
}

/* ── Definisi preset ── */
type Cek = { t: string; f: (x: any) => boolean | null };
export interface Preset { id: string; jenis: 'teknikal' | 'fundamental'; nama: string; guru: string; ringkas: string; info: string; cocok: string[]; kriteria: Cek[] }
const ada = (...v: any[]) => v.every((x) => x != null && Number.isFinite(x));
const T = (t: string, f: (i: Ind) => boolean | null): Cek => ({ t, f });
const F = (t: string, f: (x: Fund) => boolean | null): Cek => ({ t, f });

export const PRESET: Preset[] = [
    /* Teknikal */
    { id: 'minervini', jenis: 'teknikal', nama: 'Trend Template', guru: 'Mark Minervini', ringkas: 'Saham pemimpin dalam tren naik kuat (tahap 2).', cocok: ['swing', 'posisi'],
        info: 'Juara US Investing Championship. Hanya membeli saham yang sudah dalam tren naik rapi: harga di atas MA50/150/200 yang tersusun & menanjak, dekat puncak 52 minggu, dan lebih kuat dari pasar. Grafik harian.',
        kriteria: [
            T('Harga > MA150 & MA200', (i) => (ada(i.ma150, i.ma200) ? i.harga > i.ma150! && i.harga > i.ma200! : null)),
            T('MA150 > MA200', (i) => (ada(i.ma150, i.ma200) ? i.ma150! > i.ma200! : null)),
            T('MA200 naik ≥1 bulan', (i) => i.ma200naik),
            T('MA50 > MA150 & MA200', (i) => (ada(i.ma50, i.ma150, i.ma200) ? i.ma50! > i.ma150! && i.ma50! > i.ma200! : null)),
            T('Harga > MA50', (i) => (ada(i.ma50) ? i.harga > i.ma50! : null)),
            T('≥30% di atas terendah 52 minggu', (i) => i.harga >= i.lo52 * 1.3),
            T('Maks. 25% di bawah puncak 52 minggu', (i) => i.harga >= i.hi52 * 0.75),
            T('Lebih kuat dari S&P 500 (6 bulan)', (i) => (i.rs6 == null ? null : i.rs6 > 0))
        ] },
    { id: 'oneil', jenis: 'teknikal', nama: 'CAN SLIM (teknikal)', guru: "William O'Neil", ringkas: 'Saham kuat yang tembus dengan volume besar saat pasar naik.', cocok: ['swing', 'posisi'],
        info: "Pendiri Investor's Business Daily. Bagian teknikal CAN SLIM: dekat puncak baru (N), permintaan besar terlihat dari volume (S), pemimpin sektor (L), dan arah pasar mendukung (M). Grafik harian.",
        kriteria: [
            T('Maks. 15% dari puncak 52 minggu', (i) => i.harga >= i.hi52 * 0.85),
            T('Harga > MA50', (i) => (ada(i.ma50) ? i.harga > i.ma50! : null)),
            T('Volume ≥1,5× rata-rata 20 hari', (i) => i.volX >= 1.5),
            T('Mengungguli S&P 500 ≥10% (6 bulan)', (i) => (i.rs6 == null ? null : i.rs6 >= 10)),
            T('Pasar sedang naik (S&P 500 > MA50)', (i) => i.pasarNaik)
        ] },
    { id: 'weinstein', jenis: 'teknikal', nama: 'Stage 2 Breakout', guru: 'Stan Weinstein', ringkas: 'Baru masuk "tahap 2": di atas MA 30 minggu yang menanjak.', cocok: ['posisi', 'investasi', 'swing'],
        info: 'Dari buku "Secrets for Profiting in Bull and Bear Markets". Beli saat harga keluar dari fase datar ke atas MA 30 minggu (±MA150 harian) yang mulai naik, dengan kekuatan relatif positif. Grafik harian/mingguan.',
        kriteria: [
            T('Harga > MA150 (≈MA 30 minggu)', (i) => (ada(i.ma150) ? i.harga > i.ma150! : null)),
            T('MA150 sedang naik', (i) => i.ma150naik),
            T('Lebih kuat dari S&P 500 (3 bulan)', (i) => (i.rs3 == null ? null : i.rs3 > 0)),
            T('Belum terlalu jauh: ≤25% di atas MA150', (i) => (ada(i.ma150) ? i.harga <= i.ma150! * 1.25 : null)),
            T('Volume menguat saat naik', (i) => i.volX >= 1.2 && i.chg1d > 0)
        ] },
    { id: 'darvas', jenis: 'teknikal', nama: 'Darvas Box', guru: 'Nicolas Darvas', ringkas: 'Konsolidasi rapat dekat puncak, lalu tembus kotak dengan volume.', cocok: ['swingpendek', 'swing'],
        info: 'Penari yang mengubah $10 ribu jadi $2 juta. Saham dekat puncak barunya membentuk "kotak" (rentang sempit); beli saat kotak ditembus ke atas dengan volume besar. Grafik harian, kotak 20 hari.',
        kriteria: [
            T('Maks. 5% dari puncak 52 minggu', (i) => i.harga >= i.hi52 * 0.95),
            T('Kotak 20 hari rapat (rentang ≤15%)', (i) => i.rentang20 <= 15),
            T('Tembus atas kotak 20 hari', (i) => i.harga > i.hi20prev),
            T('Volume ≥1,5× rata-rata', (i) => i.volX >= 1.5)
        ] },
    { id: 'connors', jenis: 'teknikal', nama: 'RSI-2 Pullback', guru: 'Larry Connors', ringkas: 'Tren besar naik, tapi baru turun tajam 1–3 hari → beli pantulan.', cocok: ['daytrade', 'swingpendek', 'scalping'],
        info: 'Strategi "mean reversion" jangka sangat pendek dari "Short Term Trading Strategies That Work": hanya saham di atas MA200, beli saat RSI-2 sangat jenuh jual (<10) dan harga di bawah MA5; biasanya keluar saat menutup di atas MA5 (1–5 hari).',
        kriteria: [
            T('Harga > MA200 (tren besar naik)', (i) => (ada(i.ma200) ? i.harga > i.ma200! : null)),
            T('RSI-2 < 10 (jenuh jual ekstrem)', (i) => (i.rsi2 == null ? null : i.rsi2 < 10)),
            T('Harga < MA5', (i) => (ada(i.ma5) ? i.harga < i.ma5! : null)),
            T('Bukan di dasar 52 minggu', (i) => i.harga > i.lo52 * 1.05)
        ] },
    { id: 'raschke', jenis: 'teknikal', nama: 'Holy Grail', guru: 'Linda Raschke', ringkas: 'Tren kuat (ADX>30) yang sedang mundur ke EMA20 → ikut lanjutan tren.', cocok: ['daytrade', 'swingpendek'],
        info: 'Pola Linda Raschke ("Street Smarts"): saat tren sangat kuat (ADX-14 > 30), tunggu harga mundur menyentuh EMA20, lalu ikut arah tren saat memantul. Grafik harian (juga dipakai di grafik jam-an).',
        kriteria: [
            T('ADX-14 > 30 (tren kuat)', (i) => (i.adx == null ? null : i.adx > 30)),
            T('EMA20 menanjak', (i) => i.ema20naik),
            T('Mundur ke EMA20 (±2%)', (i) => (ada(i.ema20) ? Math.abs(i.harga / i.ema20! - 1) <= 0.02 : null)),
            T('Harga tetap di atas MA50', (i) => (ada(i.ma50) ? i.harga > i.ma50! : null))
        ] },
    { id: 'momentum', jenis: 'teknikal', nama: 'Momentum Hari Ini', guru: 'Gaya scalper/momentum', ringkas: 'Saham yang sedang "hidup": volume meledak & menutup dekat harga tertinggi hari itu.', cocok: ['scalping', 'daytrade'],
        info: 'Pola yang dicari trader momentum harian: volume ≥2× normal, naik >2%, menutup di sepertiga atas rentang harian, RSI kuat tapi belum ekstrem. Cocok untuk masuk-keluar cepat; tidak untuk dipegang lama.',
        kriteria: [
            T('Volume ≥2× rata-rata', (i) => i.volX >= 2),
            T('Naik >2% hari ini', (i) => i.chg1d > 2),
            T('Tutup di ⅓ atas rentang harian', (i) => (i.posisiHari == null ? null : i.posisiHari >= 0.67)),
            T('RSI-14 antara 55–80', (i) => (i.rsi14 == null ? null : i.rsi14 >= 55 && i.rsi14 <= 80))
        ] },
    /* Fundamental */
    { id: 'fisher', jenis: 'fundamental', nama: 'Price to Sales', guru: 'Kenneth Fisher', ringkas: 'Murah dibanding penjualan, arus kas positif, laba tumbuh, utang kecil.', cocok: ['posisi', 'investasi'],
        info: 'Dari buku "Super Stocks" (1984): cari perusahaan dengan rasio harga/penjualan (P/S) rendah tetapi sehat — arus kas bebas positif, laba tumbuh, margin wajar, utang rendah.',
        kriteria: [
            F('P/S < 0,75', (x) => (x.ps == null ? null : x.ps < 0.75)),
            F('Arus kas bebas > 0', (x) => (x.fcf == null ? null : x.fcf > 0)),
            F('Pertumbuhan laba 3 tahun > 15%/th', (x) => (x.epsCagr3 == null ? null : x.epsCagr3 > 15)),
            F('Rata-rata margin laba > 5%', (x) => (x.npmRata == null ? null : x.npmRata > 5)),
            F('DER < 0,4', (x) => (x.der == null ? null : x.der < 0.4))
        ] },
    { id: 'piotroski', jenis: 'fundamental', nama: 'F-Score', guru: 'Joseph Piotroski', ringkas: '9 tes kesehatan keuangan: laba, arus kas, utang, efisiensi membaik.', cocok: ['posisi', 'investasi', 'swing'],
        info: 'Profesor Stanford (2000). 9 tes sederhana apakah keuangan perusahaan membaik dari tahun lalu. Skor ≥7 dianggap kuat. (Tes jumlah saham beredar dilewati kalau datanya tidak ada.)',
        kriteria: [
            F('ROA positif', (x) => (x.roa == null ? null : x.roa > 0)),
            F('Arus kas operasi positif', (x) => (x.cfo == null ? null : x.cfo > 0)),
            F('ROA naik dari tahun lalu', (x) => (ada(x.roa, x.roaPrev) ? x.roa! > x.roaPrev! : null)),
            F('Arus kas operasi > laba bersih', (x) => (ada(x.cfo, x.ni) ? x.cfo! > x.ni! : null)),
            F('Rasio utang turun', (x) => (ada(x.lev, x.levPrev) ? x.lev! < x.levPrev! : null)),
            F('Current ratio naik', (x) => (ada(x.cr, x.crPrev) ? x.cr! > x.crPrev! : null)),
            F('Margin kotor naik', (x) => (ada(x.gm, x.gmPrev) ? x.gm! > x.gmPrev! : null)),
            F('Perputaran aset naik', (x) => (ada(x.at, x.atPrev) ? x.at! > x.atPrev! : null))
        ] },
    { id: 'buffett', jenis: 'fundamental', nama: 'Buffettology', guru: 'Warren Buffett', ringkas: 'Bisnis berkualitas: ROE tinggi konsisten, utang rendah, margin tebal.', cocok: ['investasi', 'posisi'],
        info: 'Gaya Warren Buffett (dirangkum Mary Buffett, "Buffettology"): perusahaan dengan "parit" — ROE tinggi tanpa banyak utang, margin laba tebal, laba bertumbuh & arus kas bebas positif.',
        kriteria: [
            F('ROE > 15%', (x) => (x.roe == null ? null : x.roe > 15)),
            F('DER < 0,5', (x) => (x.der == null ? null : x.der < 0.5)),
            F('Margin laba > 10%', (x) => (x.npm == null ? null : x.npm > 10)),
            F('Laba 3 tahun tumbuh > 7%/th', (x) => (x.epsCagr3 == null ? null : x.epsCagr3 > 7)),
            F('Arus kas bebas > 0', (x) => (x.fcf == null ? null : x.fcf > 0))
        ] },
    { id: 'greenblatt', jenis: 'fundamental', nama: 'Magic Formula', guru: 'Joel Greenblatt', ringkas: 'Bisnis bagus (ROE tinggi) di harga murah (PER rendah).', cocok: ['investasi', 'posisi'],
        info: 'Dari "The Little Book That Beats the Market": gabungkan kualitas (pengembalian modal tinggi) dan harga murah (imbal hasil laba tinggi). Di sini ROE dipakai sebagai pengganti ROIC.',
        kriteria: [
            F('Imbal hasil laba > 6% (PER < 16,7)', (x) => (x.per == null ? null : x.per > 0 && x.per < 16.7)),
            F('ROE > 20%', (x) => (x.roe == null ? null : x.roe > 20)),
            F('Kapitalisasi > $1 miliar', (x) => (x.mcap == null ? null : x.mcap > 1000))
        ] },
    { id: 'lynch', jenis: 'fundamental', nama: 'Growth (PEG)', guru: 'Peter Lynch', ringkas: 'Laba tumbuh cepat tapi harga masih wajar (PEG < 1), utang kecil.', cocok: ['swing', 'posisi', 'investasi'],
        info: 'Manajer Fidelity Magellan (29%/tahun). "Fast grower" dengan PER tidak lebih mahal dari pertumbuhannya: PEG = PER ÷ pertumbuhan laba < 1, pertumbuhan 15–50%, utang rendah.',
        kriteria: [
            F('PEG < 1', (x) => (ada(x.per, x.epsCagr3) && x.epsCagr3! > 0 && x.per! > 0 ? x.per! / x.epsCagr3! < 1 : null)),
            F('Laba tumbuh 15–50%/th', (x) => (x.epsCagr3 == null ? null : x.epsCagr3 >= 15 && x.epsCagr3 <= 50)),
            F('DER < 0,5', (x) => (x.der == null ? null : x.der < 0.5)),
            F('Pendapatan tumbuh > 10%', (x) => (x.revGrowth == null ? null : x.revGrowth > 10))
        ] },
    { id: 'graham', jenis: 'fundamental', nama: 'Defensive Investor', guru: 'Benjamin Graham', ringkas: 'Murah & aman: PER×PBV < 22,5, likuid, laba selalu positif, bayar dividen.', cocok: ['investasi'],
        info: 'Guru Warren Buffett, "The Intelligent Investor". Kriteria investor defensif: harga wajar (PER < 15, PER×PBV < 22,5), keuangan kuat (current ratio > 2, utang wajar), laba positif tiap tahun, dan membagi dividen.',
        kriteria: [
            F('PER < 15', (x) => (x.per == null ? null : x.per > 0 && x.per < 15)),
            F('PER × PBV < 22,5', (x) => (ada(x.per, x.pbv) ? x.per! > 0 && x.per! * x.pbv! < 22.5 : null)),
            F('Current ratio > 2', (x) => (x.cr == null ? null : x.cr > 2)),
            F('DER < 1', (x) => (x.der == null ? null : x.der < 1)),
            F('Laba positif tiap tahun (data ±4 th)', (x) => x.labaPositifSemua),
            F('Membagi dividen', (x) => (x.dividen == null ? null : x.dividen > 0))
        ] }
];

/** Rekomendasi preset per rencana pegang posisi, beserta alasannya. */
export const REKOMENDASI: Record<string, { teknikal: string[]; fundamental: string[]; alasan: string }> = {
    scalping: { teknikal: ['momentum', 'connors'], fundamental: [], alasan: 'Dalam hitungan menit–jam yang menggerakkan harga adalah momentum & volume, bukan laporan keuangan. Momentum Hari Ini mencari saham yang sedang "hidup"; RSI-2 untuk pantulan cepat.' },
    daytrade: { teknikal: ['raschke', 'momentum', 'connors'], fundamental: [], alasan: 'Satu hari bursa: ikuti tren kuat yang sedang mundur (Holy Grail) atau saham dengan volume meledak. Fundamental tidak berpengaruh dalam sehari.' },
    swingpendek: { teknikal: ['connors', 'darvas', 'raschke'], fundamental: ['piotroski'], alasan: '2–5 hari: pantulan dari jenuh jual (RSI-2) atau tembus kotak (Darvas). F-Score opsional sebagai saringan supaya tidak terjebak saham yang keuangannya memburuk.' },
    swing: { teknikal: ['minervini', 'oneil'], fundamental: ['lynch', 'piotroski'], alasan: '1–4 minggu: ikut saham pemimpin dalam tren naik (Minervini/O\'Neil); Peter Lynch memastikan pertumbuhan labanya mendukung kenaikan.' },
    posisi: { teknikal: ['weinstein', 'minervini'], fundamental: ['buffett', 'greenblatt', 'lynch'], alasan: '1–3 bulan: masuk di awal tren besar (Stage 2) dan pilih bisnis berkualitas dengan harga wajar.' },
    investasi: { teknikal: ['weinstein'], fundamental: ['buffett', 'graham', 'piotroski'], alasan: '6 bulan+: kualitas & harga wajar paling menentukan; teknikal hanya untuk memilih waktu masuk yang tidak di puncak.' }
};

export function evaluasi(p: Preset, data: any) {
    const hasil = p.kriteria.map((k) => { let ok: boolean | null = null; try { ok = data ? k.f(data) : null; } catch { ok = null; } return { t: k.t, ok }; });
    const dinilai = hasil.filter((h) => h.ok != null);
    const lolos = dinilai.filter((h) => h.ok).length;
    const cukup = dinilai.length >= Math.ceil(p.kriteria.length / 2);
    return { id: p.id, hasil, lolos, dinilai: dinilai.length, total: p.kriteria.length, persen: cukup ? Math.round((lolos / dinilai.length) * 100) : null };
}
export const presetInfo = () => PRESET.map(({ kriteria, ...p }) => ({ ...p, kriteria: kriteria.map((k) => k.t) }));
