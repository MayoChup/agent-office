import fs from 'fs';
import path from 'path';
import { Ekstra, Berita, Orang, ekstra, skorTeknikal, skorFundamental, skorBerita, skorWhales, gabung, ambilBerita, ambilOrangDalam, bacaLaporanSari, Faktor } from './skor';

/**
 * Penyaring saham AS (S&P 500 + watchlist) — data GRATIS, dihitung di VPS tanpa AI:
 *  - Fundamental (mingguan): laporan resmi SEC (XBRL "frames"): laba, pendapatan, ekuitas, aset, utang, jumlah saham.
 *    → ROE, ROA, PBV, PER, DER, margin laba, pertumbuhan pendapatan, kapitalisasi pasar.
 *  - Teknikal (tiap sesi): harga harian Yahoo 1 tahun → MA, RSI, MACD, golden/death cross, double top/bottom,
 *    breakout 52 minggu, lonjakan volume.
 */

import { UA, yahooChart, hargaHarian, statusHarga, cnbcChart } from './harga';
export { yahooChart, statusHarga };
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
    x?: Ekstra; vol?: number;
}
interface Spark { s: string; tgl: string[]; c: number[]; ma50: (number | null)[]; ma200: (number | null)[] }
interface Simpanan { baris: Baris[]; teknikalSesi: string; teknikalAt: number; fundamentalAt: number; gagal: string[]; berita?: Record<string, Berita>; beritaAt?: number; orang?: Record<string, Orang>; tape?: Array<{ s: string; nama: string; harga: number; chg: number }>; galatAt?: number }

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
    const { rows, nama } = await hargaHarian(s);
    if (rows.length < 60) throw new Error('data kurang');
    const col = (k: string) => rows.map((x: any) => x[k]) as number[];
    return { tgl: col('t') as unknown as string[], o: col('o'), h: col('h'), l: col('l'), c: col('c'), v: col('v'), nama };
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
    sibuk: '' | 'teknikal' | 'fundamental' | 'berita' = '';
    progres = '';

    constructor(dataDir: string, private watchlist: () => string[], private deskDir = '') {
        const dir = path.join(dataDir, 'screener');
        fs.mkdirSync(path.join(dir, 'spark'), { recursive: true });
        this.file = path.join(dir, 'data.json');
        this.sparkDir = path.join(dir, 'spark');
        try { this.st = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.st = { baris: [], teknikalSesi: '', teknikalAt: 0, fundamentalAt: 0, gagal: [] }; }
    }
    private simpan() { fs.writeFileSync(this.file, JSON.stringify(this.st)); }

    /** Skor 4 faktor + gabungan untuk satu saham. */
    skor(b: Baris, sari = bacaLaporanSari(this.deskDir)): Record<string, Faktor | null> {
        const f: Record<string, Faktor | null> = {
            teknikal: skorTeknikal(b), fundamental: skorFundamental(b), berita: skorBerita(this.st.berita?.[b.s]),
            whales: skorWhales(b, b.x, this.st.orang?.[b.s], sari.get(b.s) || 0)
        };
        return { semua: gabung(f), ...f };
    }

    data() {
        const sari = bacaLaporanSari(this.deskDir);
        const baris = this.st.baris.map((b) => {
            const sk = this.skor(b, sari);
            const ringkas: Record<string, { skor: number; label: string } | null> = {};
            for (const k of Object.keys(sk)) ringkas[k] = sk[k] ? { skor: sk[k]!.skor, label: sk[k]!.label } : null;
            return { ...b, skor: ringkas };
        });
        // Ikhtisar pasar
        const naik = baris.filter((b) => b.chg1d > 0.05).length, turun = baris.filter((b) => b.chg1d < -0.05).length;
        const sek = new Map<string, { w: number; s: number; n: number }>();
        let mcap = 0;
        for (const b of baris) {
            const w = b.f?.mcap || 1; mcap += b.f?.mcap || 0;
            const k = b.sektor || 'Lainnya'; const e = sek.get(k) || { w: 0, s: 0, n: 0 };
            e.w += w; e.s += b.chg1d * w; e.n++; sek.set(k, e);
        }
        const sektor = Array.from(sek.entries()).map(([k, e]) => ({ nama: k, n: e.n, chg: +(e.s / e.w).toFixed(2) })).sort((a, b) => b.chg - a.chg);
        const pasar = { naik, turun, tetap: baris.length - naik - turun, mcap, sektor, tape: this.st.tape || [] };
        return { baris, pasar, beritaAt: this.st.beritaAt || 0, teknikalAt: this.st.teknikalAt, teknikalSesi: this.st.teknikalSesi, fundamentalAt: this.st.fundamentalAt, sibuk: this.sibuk, progres: this.progres, gagal: this.st.gagal.length, galat: statusHarga.galat, sumber: statusHarga.sumber };
    }
    /** Detail lengkap satu saham: alasan tiap faktor, berita, orang dalam. */
    detail(s: string) {
        const b = this.st.baris.find((x) => x.s === s);
        if (!b) return null;
        return { baris: b, skor: this.skor(b), berita: this.st.berita?.[s] || null, orang: this.st.orang?.[s] || null };
    }

    /** Peta berita: berita (unik) ↔ saham yang terkait, untuk tampilan "tata surya". */
    petaBerita() {
        const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
        // Nama perusahaan → kode (kata pertama yang khas), untuk menangkap saham yang disebut di judul.
        const UMUM = new Set(['the', 'american', 'united', 'general', 'first', 'international', 'global', 'national', 'southern', 'american', 'news', 'corp', 'group', 'bank', 'energy', 'health', 'capital', 'financial', 'public', 'digital', 'west', 'east', 'north']);
        const namaKe = new Map<string, string>();
        for (const b of this.st.baris) {
            const w = (b.nama || '').toLowerCase().replace(/[^a-z0-9 &-]/g, ' ').split(/\s+/)[0];
            if (w && w.length >= 4 && !UMUM.has(w) && !namaKe.has(w)) namaKe.set(w, b.s);
        }
        const kode = new Set(this.st.baris.map((b) => b.s));
        const berita = new Map<string, { id: string; t: string; tgl: string; url: string; sent: number; saham: Set<string> }>();
        for (const [s, br] of Object.entries(this.st.berita || {})) {
            for (const j of br.judul || []) {
                const k = norm(j.t);
                if (!k) continue;
                let n = berita.get(k);
                if (!n) { n = { id: `b${berita.size}`, t: j.t, tgl: j.tgl, url: j.url, sent: j.s, saham: new Set() }; berita.set(k, n); }
                n.saham.add(s);
                for (const w of k.split(' ')) { const x = namaKe.get(w); if (x) n.saham.add(x); }
                for (const m of j.t.match(/\b[A-Z]{2,5}\b/g) || []) if (kode.has(m) && !['CEO', 'AI', 'US', 'IPO', 'ETF', 'EPS', 'FDA', 'SEC'].includes(m)) n.saham.add(m);
            }
        }
        const list = Array.from(berita.values()).sort((a, b) => b.saham.size - a.saham.size || b.tgl.localeCompare(a.tgl)).slice(0, 90);
        const hitung = new Map<string, number>();
        for (const n of list) n.saham.forEach((s) => hitung.set(s, (hitung.get(s) || 0) + 1));
        const info = new Map(this.st.baris.map((b) => [b.s, b]));
        const saham = Array.from(hitung.entries()).sort((a, b) => b[1] - a[1]).slice(0, 80).map(([s, n]) => ({ s, n, nama: info.get(s)?.nama || s, chg: info.get(s)?.chg1d ?? 0, sektor: info.get(s)?.sektor || '' }));
        const ada = new Set(saham.map((x) => x.s));
        return {
            total: berita.size, at: this.st.beritaAt || 0,
            berita: list.map((n) => ({ id: n.id, t: n.t, tgl: n.tgl, url: n.url, sent: n.sent, saham: Array.from(n.saham).filter((s) => ada.has(s)) })).filter((n) => n.saham.length),
            saham
        };
    }

    spark(s: string): Spark | null {
        try { return JSON.parse(fs.readFileSync(path.join(this.sparkDir, `${s.replace(/[^A-Z0-9-]/gi, '')}.json`), 'utf8')); } catch { return null; }
    }

    /** Saham di luar daftar (mis. saham kecil): hitung sinyal teknikal saat diminta. */
    async satu(simbol: string): Promise<Baris> {
        const s = simbol.toUpperCase().replace(/[^A-Z0-9.^-]/g, '').slice(0, 12);
        const ada = this.st.baris.find((b) => b.s === s);
        if (ada) return ada;
        const d = await harian(s);
        const a = analisis(d.c, d.v);
        const b: Baris = { s, nama: d.nama || s, sektor: '', harga: +d.c[d.c.length - 1].toFixed(2), chg1d: a.chg1d, chg1m: a.chg1m, chg3m: a.chg3m, chg1y: a.chg1y, rsi: a.rsi, ma50: a.ma50 != null ? +a.ma50.toFixed(2) : null, ma200: a.ma200 != null ? +a.ma200.toFixed(2) : null, volX: a.volX, sinyal: a.sinyal, f: null, x: ekstra(d.o, d.h, d.l, d.c, d.v, a.ma50, a.ma200), vol: d.v[d.v.length - 1] };
        return b;
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
        this.progres = 'menghubungi sumber harga…';
        try {
            let spy: Awaited<ReturnType<typeof harian>>;
            try { spy = await harian('SPY'); } catch (e: any) { statusHarga.galat = `Harga saham belum bisa diambil: ${e?.message || e}`; this.st.galatAt = Date.now(); throw e; }
            const sesi = spy.tgl[spy.tgl.length - 1];
            if (!paksa && this.st.teknikalSesi === sesi && this.st.baris.length) return;
            const semesta = await this.semesta();
            const lama = new Map(this.st.baris.map((b) => [b.s, b]));
            const baru: Baris[] = []; const gagal: string[] = []; let contohGalat = '';
            let i = 0;
            const kerja = async () => {
                while (i < semesta.length) {
                    const u = semesta[i++];
                    this.progres = `teknikal ${i}/${semesta.length}`;
                    try {
                        const d = await harian(u.s);
                        const a = analisis(d.c, d.v);
                        baru.push({ s: u.s, nama: u.nama || d.nama || u.s, sektor: u.sektor, harga: +d.c[d.c.length - 1].toFixed(2), chg1d: a.chg1d, chg1m: a.chg1m, chg3m: a.chg3m, chg1y: a.chg1y, rsi: a.rsi, ma50: a.ma50 != null ? +a.ma50.toFixed(2) : null, ma200: a.ma200 != null ? +a.ma200.toFixed(2) : null, volX: a.volX, sinyal: a.sinyal, f: lama.get(u.s)?.f || null, x: ekstra(d.o, d.h, d.l, d.c, d.v, a.ma50, a.ma200), vol: d.v[d.v.length - 1] });
                        const k = Math.max(0, d.c.length - 130);
                        const r2 = (x: number | null) => (x == null ? null : +x.toFixed(2));
                        fs.writeFileSync(path.join(this.sparkDir, `${u.s}.json`), JSON.stringify({ s: u.s, tgl: d.tgl.slice(k), c: d.c.slice(k).map((x) => +x.toFixed(2)), ma50: a.m50.slice(k).map(r2), ma200: a.m200.slice(k).map(r2) }));
                    } catch (e: any) { gagal.push(u.s); if (!contohGalat) contohGalat = String(e?.message || e); }
                    await new Promise((r) => setTimeout(r, 150));
                }
            };
            await Promise.all([kerja(), kerja(), kerja()]);
            if (baru.length) {
                this.st.baris = baru.sort((a, b) => a.s.localeCompare(b.s));
                this.st.teknikalSesi = sesi; this.st.teknikalAt = Date.now(); this.st.gagal = gagal;
                this.simpan();
            }
            statusHarga.galat = !baru.length ? `Semua ${semesta.length} saham gagal diambil: ${contohGalat}` : gagal.length > semesta.length * 0.3 ? `${gagal.length} dari ${semesta.length} saham gagal diambil (${contohGalat}). Coba ↻ lagi nanti.` : '';
            // Pita indeks (S&P 500, Nasdaq 100, Dow, Russell 2000, VIX)
            const tape: Array<{ s: string; nama: string; harga: number; chg: number }> = [];
            for (const [s, nama] of [['SPY', 'S&P 500'], ['QQQ', 'Nasdaq 100'], ['DIA', 'Dow Jones'], ['IWM', 'Russell 2000'], ['^VIX', 'VIX']]) {
                try { const d = await harian(s); const n = d.c.length; tape.push({ s, nama, harga: +d.c[n - 1].toFixed(2), chg: +((d.c[n - 1] / d.c[n - 2] - 1) * 100).toFixed(2) }); } catch { /* lewati */ }
            }
            if (tape.length) { this.st.tape = tape; this.simpan(); }
            // Fundamental lebih dari 7 hari → perbarui juga. Berita & orang dalam tiap sesi.
            if (Date.now() - this.st.fundamentalAt > 7 * 86400_000) { this.sibuk = ''; await this.perbaruiFundamental(); }
            this.sibuk = ''; await this.perbaruiBerita();
        } finally { this.sibuk = ''; this.progres = ''; }
    }

    /** Sentimen berita semua saham + transaksi orang dalam untuk watchlist (±4 menit). */
    async perbaruiBerita() {
        if (this.sibuk) return;
        this.sibuk = 'berita';
        try {
            const daftar = this.st.baris.map((b) => b.s);
            const out: Record<string, Berita> = { ...(this.st.berita || {}) };
            let i = 0;
            const kerja = async () => {
                while (i < daftar.length) {
                    const s = daftar[i++];
                    this.progres = `berita ${i}/${daftar.length}`;
                    try { out[s] = await ambilBerita(s); } catch { /* lewati */ }
                    await new Promise((r) => setTimeout(r, 200));
                }
            };
            await Promise.all([kerja(), kerja(), kerja()]);
            this.st.berita = out; this.st.beritaAt = Date.now();
            this.simpan();
            // Orang dalam (Form 4) — hanya watchlist/posisi supaya hemat permintaan ke SEC.
            const map = await secJson('https://www.sec.gov/files/company_tickers.json');
            if (map) {
                const cikOf = new Map<string, number>();
                for (const k of Object.keys(map)) cikOf.set(String(map[k].ticker).toUpperCase(), Number(map[k].cik_str));
                const orang: Record<string, Orang> = { ...(this.st.orang || {}) };
                const wl = this.watchlist().slice(0, 25);
                for (let j = 0; j < wl.length; j++) {
                    this.progres = `orang dalam ${j + 1}/${wl.length}`;
                    const cik = cikOf.get(wl[j]);
                    if (!cik) continue;
                    try { orang[wl[j]] = await ambilOrangDalam(cik); } catch { /* lewati */ }
                }
                this.st.orang = orang;
                this.simpan();
            }
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

/* ── Candle untuk grafik (langsung dari Yahoo, cache 3 menit) ── */
const RENTANG: Record<string, { range: string; interval: string; tampil: number; harian: boolean }> = {
    '1H': { range: '1d', interval: '5m', tampil: 80, harian: false },
    '5H': { range: '5d', interval: '15m', tampil: 140, harian: false },
    '1B': { range: '2y', interval: '1d', tampil: 22, harian: true },
    '3B': { range: '2y', interval: '1d', tampil: 64, harian: true },
    '6B': { range: '2y', interval: '1d', tampil: 126, harian: true },
    '1T': { range: '2y', interval: '1d', tampil: 252, harian: true },
    '5T': { range: '10y', interval: '1wk', tampil: 261, harian: true }
};
const candleCache = new Map<string, { at: number; data: any }>();
export async function ambilCandle(simbol: string, rentang: string) {
    const s = simbol.toUpperCase().replace(/[^A-Z0-9.^-]/g, '').slice(0, 12);
    const r = RENTANG[rentang] || RENTANG['6B'];
    const key = `${s}|${r.range}|${r.interval}`;
    const hit = candleCache.get(key);
    if (hit && Date.now() - hit.at < 180_000) return { ...hit.data, tampil: r.tampil };
    let j: any;
    try { j = await yahooChart(s, r.range, r.interval); } catch (e: any) {
        // Yahoo diblokir → CNBC (menit / mingguan) atau harga harian dari sumber cadangan.
        if (r.interval !== '1d') { j = await cnbcChart(s, r.range === '1d' ? '1D' : r.range === '5d' ? '5D' : '5Y'); }
        else {
        const h = await hargaHarian(s);
        j = { meta: { currency: 'USD', longName: h.nama || s }, timestamp: h.rows.map((x) => Date.parse(x.t + 'T00:00:00Z') / 1000), indicators: { quote: [{ open: h.rows.map((x) => x.o), high: h.rows.map((x) => x.h), low: h.rows.map((x) => x.l), close: h.rows.map((x) => x.c), volume: h.rows.map((x) => x.v) }] } };
        }
    }
    const q = j.indicators?.quote?.[0] || {};
    const candles = (j.timestamp || []).map((t: number, i: number) => ({
        t: r.harian ? new Date((t + (j.meta?.gmtoffset || 0)) * 1000).toISOString().slice(0, 10) : t + 7 * 3600, // intraday ditampilkan dalam WIB
        o: q.open?.[i], h: q.high?.[i], l: q.low?.[i], c: q.close?.[i], v: q.volume?.[i] || 0
    })).filter((k: any) => [k.o, k.h, k.l, k.c].every((x) => Number.isFinite(x)));
    // Hapus tanggal ganda (Yahoo kadang mengirim baris hari ini dua kali).
    const uniq: any[] = [];
    for (const k of candles) { if (uniq.length && uniq[uniq.length - 1].t === k.t) uniq[uniq.length - 1] = k; else uniq.push(k); }
    const closes = uniq.map((k) => k.c);
    const r2 = (x: number | null) => (x == null ? null : +x.toFixed(4));
    const data = {
        s, nama: String(j.meta?.longName || j.meta?.shortName || s), mataUang: j.meta?.currency || 'USD', bursa: j.meta?.fullExchangeName || j.meta?.exchangeName || '',
        harian: r.harian, interval: r.interval,
        candles: uniq.map((k) => ({ ...k, o: +k.o.toFixed(4), h: +k.h.toFixed(4), l: +k.l.toFixed(4), c: +k.c.toFixed(4) })),
        ma20: sma(closes, 20).map(r2), ma50: sma(closes, 50).map(r2), ma200: sma(closes, 200).map(r2)
    };
    candleCache.set(key, { at: Date.now(), data });
    if (candleCache.size > 200) candleCache.delete(candleCache.keys().next().value as string);
    return { ...data, tampil: r.tampil };
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
