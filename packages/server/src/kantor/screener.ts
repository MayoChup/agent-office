import fs from 'fs';
import path from 'path';

/**
 * Penyaring saham AS (S&P 500 + watchlist) — data GRATIS, dihitung di VPS tanpa AI:
 *  - Fundamental (mingguan): laporan resmi SEC (XBRL "frames"): laba, pendapatan, ekuitas, aset, utang, jumlah saham.
 *    → ROE, ROA, PBV, PER, DER, margin laba, pertumbuhan pendapatan, kapitalisasi pasar.
 *  - Teknikal (tiap sesi): harga harian Yahoo 1 tahun → MA, RSI, MACD, golden/death cross, double top/bottom,
 *    breakout 52 minggu, lonjakan volume.
 */

const UA = 'Mozilla/5.0 (KantorRico; screener)';
const SEC_UA = 'KantorRico research kantor-rico@users.noreply.github.com';
const SP500_CSV = 'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv';

export interface Fundamental { roe: number | null; roa: number | null; pbv: number | null; per: number | null; der: number | null; npm: number | null; revGrowth: number | null; mcap: number | null; tahun: string }
export interface Sinyal {
    goldenCross: number | null; deathCross: number | null; // berapa hari lalu
    doubleTop: 'terbentuk' | 'terkonfirmasi' | null; doubleBottom: 'terbentuk' | 'terkonfirmasi' | null;
    breakout52: boolean; dekat52Low: boolean; rsiOversold: boolean; rsiOverbought: boolean;
    macdBullish: number | null; macdBearish: number | null; diAtasMa200: boolean; volumeSpike: boolean; tren: 'naik' | 'turun' | 'datar';
}
export interface Baris {
    s: string; nama: string; sektor: string; harga: number; chg1d: number; chg1m: number; chg3m: number; chg1y: number;
    rsi: number | null; ma50: number | null; ma200: number | null; volX: number; sinyal: Sinyal; f: Fundamental | null;
}
interface Spark { s: string; tgl: string[]; c: number[]; ma50: (number | null)[]; ma200: (number | null)[] }
interface Simpanan { baris: Baris[]; teknikalSesi: string; teknikalAt: number; fundamentalAt: number; gagal: string[] }

/* ── Indikator ─────────────────────────────────────────────── */
export function sma(x: number[], n: number): (number | null)[] {
    const out: (number | null)[] = []; let sum = 0;
    for (let i = 0; i < x.length; i++) { sum += x[i]; if (i >= n) sum -= x[i - n]; out.push(i >= n - 1 ? sum / n : null); }
    return out;
}
function ema(x: number[], n: number): number[] {
    const k = 2 / (n + 1); const out: number[] = [];
    x.forEach((v, i) => out.push(i === 0 ? v : v * k + out[i - 1] * (1 - k)));
    return out;
}
export function rsi(c: number[], n = 14): number | null {
    if (c.length <= n) return null;
    let g = 0, l = 0;
    for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; if (d >= 0) g += d; else l -= d; }
    g /= n; l /= n;
    for (let i = n + 1; i < c.length; i++) { const d = c[i] - c[i - 1]; g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n; }
    return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}
function crossAgo(a: (number | null)[], b: (number | null)[], up: boolean, within: number): number | null {
    for (let k = 0; k < within; k++) {
        const i = a.length - 1 - k;
        if (i < 1) break;
        const a0 = a[i - 1], b0 = b[i - 1], a1 = a[i], b1 = b[i];
        if (a0 == null || b0 == null || a1 == null || b1 == null) continue;
        if (up ? a0 <= b0 && a1 > b1 : a0 >= b0 && a1 < b1) return k;
    }
    return null;
}
/** Double top / bottom sederhana: dua puncak (lembah) setara ±3%, berjarak ≥10 hari, dipisah koreksi ≥5%. */
export function polaGanda(c: number[], atas: boolean): 'terbentuk' | 'terkonfirmasi' | null {
    const n = c.length, w = 5, start = Math.max(w, n - 120);
    const piv: number[] = [];
    for (let i = start; i < n - w; i++) {
        const win = c.slice(i - w, i + w + 1);
        if (c[i] === (atas ? Math.max(...win) : Math.min(...win))) piv.push(i);
    }
    if (piv.length < 2) return null;
    const p2 = piv[piv.length - 1];
    if (n - 1 - p2 > 40) return null;
    for (let j = piv.length - 2; j >= 0; j--) {
        const p1 = piv[j];
        if (p2 - p1 < 10) continue;
        const v1 = c[p1], v2 = c[p2];
        if (Math.abs(v1 - v2) / Math.max(v1, v2) > 0.03) continue;
        const mid = c.slice(p1, p2 + 1);
        const neck = atas ? Math.min(...mid) : Math.max(...mid);
        const lebar = atas ? 1 - neck / Math.max(v1, v2) : neck / Math.min(v1, v2) - 1;
        if (lebar < 0.05) continue;
        const now = c[n - 1];
        if (atas ? now < neck : now > neck) return 'terkonfirmasi';
        if (atas ? now < v2 * 0.97 : now > v2 * 1.03) return 'terbentuk';
        return null;
    }
    return null;
}

export function analisis(c: number[], v: number[]) {
    const n = c.length;
    const m20 = sma(c, 20), m50 = sma(c, 50), m200 = sma(c, 200);
    const e26 = ema(c, 26);
    const macd = ema(c, 12).map((x, i) => x - e26[i]);
    const sig = ema(macd, 9);
    const r = rsi(c);
    const prior = c.slice(Math.max(0, n - 252), n - 1);
    const avgV = v.slice(Math.max(0, n - 21), n - 1).reduce((a, x) => a + x, 0) / Math.max(1, Math.min(20, n - 1));
    const last = c[n - 1], ma50 = m50[n - 1], ma200 = m200[n - 1];
    const slope = ma50 != null && m50[n - 21] != null ? ma50 / (m50[n - 21] as number) - 1 : 0;
    const sinyal: Sinyal = {
        goldenCross: crossAgo(m50, m200, true, 10),
        deathCross: crossAgo(m50, m200, false, 10),
        doubleTop: polaGanda(c, true),
        doubleBottom: polaGanda(c, false),
        breakout52: prior.length > 100 && last >= Math.max(...prior),
        dekat52Low: prior.length > 100 && last <= Math.min(...prior) * 1.03,
        rsiOversold: r != null && r < 30,
        rsiOverbought: r != null && r > 70,
        macdBullish: crossAgo(macd, sig, true, 5),
        macdBearish: crossAgo(macd, sig, false, 5),
        diAtasMa200: ma200 != null && last > ma200,
        volumeSpike: avgV > 0 && v[n - 1] >= avgV * 2,
        tren: ma50 != null && ma200 != null && last > ma50 && ma50 > ma200 && slope > 0.01 ? 'naik' : ma50 != null && ma200 != null && last < ma50 && ma50 < ma200 && slope < -0.01 ? 'turun' : 'datar'
    };
    const pct = (k: number) => (n > k ? +((last / c[n - 1 - k] - 1) * 100).toFixed(2) : 0);
    return { sinyal, rsi: r != null ? +r.toFixed(1) : null, ma20: m20[n - 1], ma50, ma200, m50, m200, chg1d: pct(1), chg1m: pct(21), chg3m: pct(63), chg1y: pct(Math.min(n - 1, 251)), volX: avgV ? +(v[n - 1] / avgV).toFixed(2) : 1 };
}

/* ── Pengambil data ─────────────────────────────────────────── */
async function harian(s: string) {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=1y&interval=1d`, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const r: any = (await res.json() as any)?.chart?.result?.[0];
    const q = r?.indicators?.quote?.[0] || {};
    const rows = (r?.timestamp || []).map((t: number, i: number) => ({ t: new Date(t * 1000).toISOString().slice(0, 10), c: q.close?.[i], v: q.volume?.[i] || 0 }))
        .filter((x: any) => Number.isFinite(x.c));
    if (rows.length < 60) throw new Error('data kurang');
    return { tgl: rows.map((x: any) => x.t) as string[], c: rows.map((x: any) => x.c) as number[], v: rows.map((x: any) => x.v) as number[], nama: String(r?.meta?.longName || r?.meta?.shortName || '') };
}

async function secJson(url: string): Promise<any | null> {
    try {
        const res = await fetch(url, { headers: { 'User-Agent': SEC_UA, Accept: 'application/json' } });
        if (!res.ok) return null;
        return await res.json();
    } catch { return null; }
}
/** Satu konsep untuk semua perusahaan dalam satu periode → Map<CIK, nilai>. */
async function frame(tax: string, konsep: string, unit: string, periode: string): Promise<Map<number, number>> {
    const j = await secJson(`https://data.sec.gov/api/xbrl/frames/${tax}/${konsep}/${unit}/${periode}.json`);
    const m = new Map<number, number>();
    for (const d of j?.data || []) if (Number.isFinite(d.val)) m.set(Number(d.cik), Number(d.val));
    await new Promise((r) => setTimeout(r, 250)); // sopan ke SEC (maks 10 permintaan/detik)
    return m;
}

export class Screener {
    private file: string;
    private sparkDir: string;
    private st: Simpanan;
    sibuk: '' | 'teknikal' | 'fundamental' = '';
    progres = '';

    constructor(dataDir: string, private watchlist: () => string[]) {
        const dir = path.join(dataDir, 'screener');
        fs.mkdirSync(path.join(dir, 'spark'), { recursive: true });
        this.file = path.join(dir, 'data.json');
        this.sparkDir = path.join(dir, 'spark');
        try { this.st = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.st = { baris: [], teknikalSesi: '', teknikalAt: 0, fundamentalAt: 0, gagal: [] }; }
    }
    private simpan() { fs.writeFileSync(this.file, JSON.stringify(this.st)); }

    data() {
        return { baris: this.st.baris, teknikalAt: this.st.teknikalAt, teknikalSesi: this.st.teknikalSesi, fundamentalAt: this.st.fundamentalAt, sibuk: this.sibuk, progres: this.progres, gagal: this.st.gagal.length };
    }
    spark(s: string): Spark | null {
        try { return JSON.parse(fs.readFileSync(path.join(this.sparkDir, `${s.replace(/[^A-Z0-9-]/gi, '')}.json`), 'utf8')); } catch { return null; }
    }

    private async semesta(): Promise<Array<{ s: string; nama: string; sektor: string }>> {
        const list: Array<{ s: string; nama: string; sektor: string }> = [];
        try {
            const res = await fetch(SP500_CSV, { headers: { 'User-Agent': UA } });
            if (res.ok) {
                const lines = (await res.text()).trim().split(/\r?\n/);
                const head = parseCsv(lines[0]);
                const iS = head.indexOf('Symbol'), iN = head.indexOf('Security'), iSec = head.findIndex((h) => /sector/i.test(h));
                for (const l of lines.slice(1)) {
                    const c = parseCsv(l);
                    if (c[iS]) list.push({ s: c[iS].replace('.', '-').toUpperCase(), nama: c[iN] || '', sektor: SEKTOR[c[iSec]] || c[iSec] || '' });
                }
            }
        } catch { /* pakai cadangan */ }
        if (!list.length) for (const b of this.st.baris) list.push({ s: b.s, nama: b.nama, sektor: b.sektor });
        for (const s of this.watchlist()) if (!list.some((x) => x.s === s)) list.push({ s, nama: '', sektor: '' });
        return list;
    }

    /** Harga & sinyal teknikal semua saham (±3–6 menit). */
    async perbaruiTeknikal(paksa = false) {
        if (this.sibuk) return;
        this.sibuk = 'teknikal';
        try {
            const spy = await harian('SPY');
            const sesi = spy.tgl[spy.tgl.length - 1];
            if (!paksa && this.st.teknikalSesi === sesi && this.st.baris.length) return;
            const semesta = await this.semesta();
            const lama = new Map(this.st.baris.map((b) => [b.s, b]));
            const baru: Baris[] = []; const gagal: string[] = [];
            let i = 0;
            const kerja = async () => {
                while (i < semesta.length) {
                    const u = semesta[i++];
                    this.progres = `teknikal ${i}/${semesta.length}`;
                    try {
                        const d = await harian(u.s);
                        const a = analisis(d.c, d.v);
                        baru.push({ s: u.s, nama: u.nama || d.nama || u.s, sektor: u.sektor, harga: +d.c[d.c.length - 1].toFixed(2), chg1d: a.chg1d, chg1m: a.chg1m, chg3m: a.chg3m, chg1y: a.chg1y, rsi: a.rsi, ma50: a.ma50 != null ? +a.ma50.toFixed(2) : null, ma200: a.ma200 != null ? +a.ma200.toFixed(2) : null, volX: a.volX, sinyal: a.sinyal, f: lama.get(u.s)?.f || null });
                        const k = Math.max(0, d.c.length - 130);
                        const r2 = (x: number | null) => (x == null ? null : +x.toFixed(2));
                        fs.writeFileSync(path.join(this.sparkDir, `${u.s}.json`), JSON.stringify({ s: u.s, tgl: d.tgl.slice(k), c: d.c.slice(k).map((x) => +x.toFixed(2)), ma50: a.m50.slice(k).map(r2), ma200: a.m200.slice(k).map(r2) }));
                    } catch { gagal.push(u.s); }
                    await new Promise((r) => setTimeout(r, 150));
                }
            };
            await Promise.all([kerja(), kerja(), kerja()]);
            if (baru.length) {
                this.st.baris = baru.sort((a, b) => a.s.localeCompare(b.s));
                this.st.teknikalSesi = sesi; this.st.teknikalAt = Date.now(); this.st.gagal = gagal;
                this.simpan();
            }
            // Fundamental lebih dari 7 hari → perbarui juga.
            if (Date.now() - this.st.fundamentalAt > 7 * 86400_000) { this.sibuk = ''; await this.perbaruiFundamental(); }
        } finally { this.sibuk = ''; this.progres = ''; }
    }

    /** Fundamental dari laporan resmi SEC (±1–2 menit, seminggu sekali). */
    async perbaruiFundamental() {
        if (this.sibuk) return;
        this.sibuk = 'fundamental';
        try {
            const map = await secJson('https://www.sec.gov/files/company_tickers.json');
            if (!map) throw new Error('Daftar SEC gagal diambil');
            const cikOf = new Map<string, number>();
            for (const k of Object.keys(map)) cikOf.set(String(map[k].ticker).toUpperCase(), Number(map[k].cik_str));

            const now = new Date(Date.now() + 7 * 3600_000);
            const y = now.getUTCFullYear();
            // Tahunan: tahun lalu (cadangan: 2 tahun lalu) — pembanding pertumbuhan: tahun sebelumnya.
            this.progres = 'fundamental: laba & pendapatan';
            const tahunan = async (konsep: string, tahun: number) => frame('us-gaap', konsep, 'USD', `CY${tahun}`);
            const gabung = (a: Map<number, number>, b: Map<number, number>) => { const m = new Map(b); a.forEach((v, k) => m.set(k, v)); return m; };
            const ni1 = await tahunan('NetIncomeLoss', y - 1), ni2 = await tahunan('NetIncomeLoss', y - 2);
            const rev1 = gabung(await tahunan('Revenues', y - 1), await tahunan('RevenueFromContractWithCustomerExcludingAssessedTax', y - 1));
            const rev2 = gabung(await tahunan('Revenues', y - 2), await tahunan('RevenueFromContractWithCustomerExcludingAssessedTax', y - 2));
            const rev3 = gabung(await tahunan('Revenues', y - 3), await tahunan('RevenueFromContractWithCustomerExcludingAssessedTax', y - 3));
            // Neraca: kuartal terbaru yang tersedia.
            this.progres = 'fundamental: neraca';
            const qs: string[] = [];
            for (let k = 1; k <= 4; k++) { const d = new Date(Date.UTC(y, now.getUTCMonth() - 3 * k, 1)); qs.push(`CY${d.getUTCFullYear()}Q${Math.floor(d.getUTCMonth() / 3) + 1}I`); }
            const terbaru = async (tax: string, konsep: string, unit: string) => {
                const m = new Map<number, number>();
                for (const q of qs) { const f = await frame(tax, konsep, unit, q); f.forEach((v, k) => { if (!m.has(k)) m.set(k, v); }); }
                return m;
            };
            const ekuitas = await terbaru('us-gaap', 'StockholdersEquity', 'USD');
            const aset = await terbaru('us-gaap', 'Assets', 'USD');
            const utang = await terbaru('us-gaap', 'Liabilities', 'USD');
            const saham = await terbaru('dei', 'EntityCommonStockSharesOutstanding', 'shares');

            const pct = (a: number | undefined, b: number | undefined) => (a != null && b ? +((a / b) * 100).toFixed(1) : null);
            for (const b of this.st.baris) {
                const cik = cikOf.get(b.s);
                if (!cik) { b.f = null; continue; }
                const ni = ni1.get(cik) ?? ni2.get(cik);
                const rv = rev1.has(cik) ? rev1.get(cik) : rev2.get(cik);
                const rvPrev = rev1.has(cik) ? rev2.get(cik) : rev3.get(cik);
                const eq = ekuitas.get(cik), as = aset.get(cik), li = utang.get(cik), sh = saham.get(cik);
                const mcap = sh ? b.harga * sh : null;
                b.f = {
                    roe: eq && eq > 0 && ni != null ? pct(ni, eq) : null,
                    roa: ni != null ? pct(ni, as) : null,
                    pbv: mcap && eq && eq > 0 ? +(mcap / eq).toFixed(2) : null,
                    per: mcap && ni && ni > 0 ? +(mcap / ni).toFixed(1) : null,
                    der: li != null && eq && eq > 0 ? +(li / eq).toFixed(2) : null,
                    npm: ni != null && rv ? pct(ni, rv) : null,
                    revGrowth: rv && rvPrev ? +((rv / rvPrev - 1) * 100).toFixed(1) : null,
                    mcap: mcap ? Math.round(mcap / 1e6) : null, // juta USD
                    tahun: ni1.has(cik) ? String(y - 1) : String(y - 2)
                };
            }
            this.st.fundamentalAt = Date.now();
            this.simpan();
        } finally { this.sibuk = ''; this.progres = ''; }
    }

    start(isClosed: () => boolean) {
        const tick = () => { if (isClosed()) this.perbaruiTeknikal().catch((e) => console.warn('[Screener]', e?.message || e)); };
        setTimeout(tick, 3 * 60_000);
        setInterval(tick, 60 * 60_000).unref();
    }
}

const SEKTOR: Record<string, string> = {
    'Information Technology': 'Teknologi', 'Health Care': 'Kesehatan', Financials: 'Keuangan', 'Consumer Discretionary': 'Konsumen sekunder',
    'Communication Services': 'Komunikasi', Industrials: 'Industri', 'Consumer Staples': 'Konsumen primer', Energy: 'Energi',
    Utilities: 'Utilitas', 'Real Estate': 'Properti', Materials: 'Bahan baku'
};

function parseCsv(line: string): string[] {
    const out: string[] = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
        else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out;
}
