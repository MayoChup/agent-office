import fs from 'fs';
import path from 'path';
import { Ekstra, Berita, Orang, ekstra, skorTeknikal, skorFundamental, skorBerita, skorWhales, gabung, bobot, proyeksi, Proyeksi, ambilBerita, ambilOrangDalam, bacaLaporanSari, Faktor, label } from './skor';

/**
 * Penyaring saham AS (S&P 500 + watchlist) — data GRATIS, dihitung di VPS tanpa AI:
 *  - Fundamental (mingguan): laporan resmi SEC (XBRL "frames"): laba, pendapatan, ekuitas, aset, utang, jumlah saham.
 *    → ROE, ROA, PBV, PER, DER, margin laba, pertumbuhan pendapatan, kapitalisasi pasar.
 *  - Teknikal (tiap sesi): harga harian Yahoo 1 tahun → MA, RSI, MACD, golden/death cross, double top/bottom,
 *    breakout 52 minggu, lonjakan volume.
 */

import { UA, yahooChart, hargaHarian, statusHarga, cnbcChart } from './harga';
import { hitungInd, Ind, Fund, PRESET, evaluasi } from './preset';
import { fundamentalNasdaq } from './nasdaq';
import { bacaModel, hModel, skorModel, statusModel } from './bobot';
import { BeritaTerkait, gabungBerita } from './beritaTerkait';
export { yahooChart, statusHarga };
const SEC_UA = 'KantorRico research kantor-rico@users.noreply.github.com';
const SP500_CSV = 'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv';

export type Fundamental = { roe: number | null; roa: number | null; pbv: number | null; per: number | null; der: number | null; npm: number | null; revGrowth: number | null; mcap: number | null; tahun: string } & Partial<Fund>;
export interface Sinyal {
    goldenCross: number | null; deathCross: number | null; // berapa hari lalu
    doubleTop: 'terbentuk' | 'terkonfirmasi' | null; doubleBottom: 'terbentuk' | 'terkonfirmasi' | null;
    breakout52: boolean; dekat52Low: boolean; rsiOversold: boolean; rsiOverbought: boolean;
    macdBullish: number | null; macdBearish: number | null; diAtasMa200: boolean; volumeSpike: boolean; tren: 'naik' | 'turun' | 'datar';
}
export interface Baris {
    s: string; nama: string; sektor: string; harga: number; chg1d: number; chg1m: number; chg3m: number; chg1y: number;
    rsi: number | null; ma50: number | null; ma200: number | null; volX: number; sinyal: Sinyal; f: Fundamental | null;
    x?: Ekstra; vol?: number; ind?: Ind;
    industri?: string; mcap?: number | null; // mcap: juta USD (dari Nasdaq; cadangan dari SEC)
}
interface StatusLangkah { at: number; n: number; galat: string }
interface Spark { s: string; tgl: string[]; c: number[]; ma50: (number | null)[]; ma200: (number | null)[] }
interface Simpanan { baris: Baris[]; teknikalSesi: string; teknikalAt: number; fundamentalAt: number; gagal: string[]; berita?: Record<string, Berita>; beritaAt?: number; orang?: Record<string, Orang>; tape?: Array<{ s: string; nama: string; harga: number; chg: number }>; galatAt?: number; status?: Record<string, StatusLangkah> }

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

let secGalat = '';
async function secJson(url: string): Promise<any | null> {
    try {
        const res = await fetch(url, { headers: { 'User-Agent': SEC_UA, Accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
        if (!res.ok) { if (res.status !== 404) secGalat = `SEC HTTP ${res.status}${res.status === 403 || res.status === 429 ? ' (server diblokir/dibatasi SEC)' : ''}`; return null; }
        return await res.json();
    } catch (e: any) { secGalat = `SEC tidak bisa dihubungi (${e?.cause?.code || e?.name || e?.message || e})`; return null; }
}

/** Kapitalisasi pasar semua saham AS dalam SATU permintaan (Nasdaq screener). */
export async function kapNasdaq(): Promise<Map<string, { mcap: number; industri: string }>> {
    const res = await fetch('https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=25&offset=0&download=true', { headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' }, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`Nasdaq screener HTTP ${res.status}`);
    const rows = ((await res.json()) as any)?.data?.rows;
    if (!Array.isArray(rows) || !rows.length) throw new Error('Nasdaq screener: kosong');
    const m = new Map<string, { mcap: number; industri: string }>();
    for (const r of rows) {
        const mc = Number(String(r.marketCap ?? '').replace(/[$,]/g, ''));
        if (r.symbol && Number.isFinite(mc) && mc > 0) m.set(String(r.symbol).trim().toUpperCase().replace(/[/.^]/g, '-'), { mcap: mc, industri: String(r.industry || '') });
    }
    return m;
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

    private fileBobot: string;
    /** Berita terkait (global/tidak langsung) — dipasang dari index.ts. */
    terkait?: BeritaTerkait;
    bersihkanCache() { this.cacheData.clear(); }
    constructor(dataDir: string, private watchlist: () => string[], private deskDir = '') {
        this.fileBobot = path.join(dataDir, 'bobot-teknikal.json');
        const dir = path.join(dataDir, 'screener');
        fs.mkdirSync(path.join(dir, 'spark'), { recursive: true });
        this.file = path.join(dir, 'data.json');
        this.sparkDir = path.join(dir, 'spark');
        try { this.st = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.st = { baris: [], teknikalSesi: '', teknikalAt: 0, fundamentalAt: 0, gagal: [] }; }
    }
    private simpan() { fs.writeFileSync(this.file, JSON.stringify(this.st)); this.cacheData.clear(); }
    /** Hasil data() per kombinasi horison/preset — dihitung sekali, dipakai ulang sampai data berubah (maks. 2 menit). */
    private cacheData = new Map<string, { at: number; v: any }>();
    private langkah(k: string, n: number, galat: string) { this.st.status = { ...(this.st.status || {}), [k]: { at: Date.now(), n, galat } }; }

    /* ── Horison: proyeksi & skor dihitung ulang untuk H hari bursa ── */
    private seri = new Map<string, { h: number[]; l: number[]; c: number[]; o?: number[] } | null>();
    private proyCache = new Map<number, Map<string, Proyeksi | null>>();
    private seriDari(s: string) {
        if (!this.seri.has(s)) { try { this.seri.set(s, JSON.parse(fs.readFileSync(path.join(this.sparkDir, `${s}.hlc.json`), 'utf8'))); } catch { this.seri.set(s, null); } }
        return this.seri.get(s) || null;
    }
    proyeksiH(b: Baris, H: number): Proyeksi | null {
        if (H === 20 || !b.x) return b.x?.proyeksi || null;
        let m = this.proyCache.get(H);
        if (!m) { m = new Map(); this.proyCache.set(H, m); if (this.proyCache.size > 12) this.proyCache.delete(this.proyCache.keys().next().value as number); }
        if (!m.has(b.s)) { const d = this.seriDari(b.s); m.set(b.s, d ? proyeksi(d.h, d.l, d.c, b.x.atr, H) : null); }
        return m.get(b.s) || null;
    }
    /** Seri harga harian (h,l,c[,o]) untuk simulasi. */
    seriHarian(s: string) { return this.seriDari(s); }
    daftarSimbol() { return this.st.baris.map((b) => b.s); }
    /** Nama sektor & industri yang ada di semesta saham (untuk pemetaan berita terkait). */
    kelompok() {
        const hit = (k: 'sektor' | 'industri') => { const m = new Map<string, number>(); for (const b of this.st.baris) { const v = (b as any)[k]; if (v) m.set(v, (m.get(v) || 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n); };
        return { sektor: hit('sektor'), industri: hit('industri').slice(0, 70) };
    }
    hargaTerakhir(s: string) { return this.st.baris.find((b) => b.s === s) || null; }
    private segarkanHorison() { this.seri.clear(); this.proyCache.clear(); }

    /** Status bukti skor teknikal untuk horison H: bobot dari data (lulus uji) atau rumus lama (belum terbukti). */
    teknikalTerbukti(H: number, mode = '') {
        const hm = mode === 'scalping' ? 1 : hModel(H);
        const m = bacaModel(this.fileBobot)[hm], sm = statusModel(m);
        const uji = m ? { dari: m.uji.dari, sampai: m.uji.sampai, selisih: m.uji.baru?.selisih, lama: m.uji.lama?.selisih, galat: m.uji.baru?.galat, t: m.uji.baru?.t } : undefined;
        if (sm === 'lulus') return { terbukti: true, sumber: 'data', H: hm, latih: m!.latih, uji };
        if (sm === 'lebihBaik') return { terbukti: false, sumber: 'data-belum', H: hm, latih: m!.latih, uji, alasan: m!.uji.alasan || [] };
        return { terbukti: false, sumber: m ? 'gagal-uji' : 'belum-diuji', H: hm, alasan: m?.uji?.alasan || [] };
    }
    private teknikalDasar(b: Baris, H: number, mode: string, pr: Proyeksi | null): Faktor {
        const hm = mode === 'scalping' ? 1 : hModel(H);
        const m = bacaModel(this.fileBobot)[hm];
        if (statusModel(m) && b.ind) return skorModel({ ...b }, b.ind, m);
        const f = skorTeknikal(b, H, pr);
        const ket = m ? `· belum terbukti: rumus teknikal untuk ±${hm} hari bursa tidak lulus uji mundur 2025–2026 — anggap sebagai gambaran grafik, bukan ramalan` : `· belum terbukti: jalankan Uji mundur untuk menguji skor teknikal horison ini`;
        return { ...f, alasan: [ket, ...f.alasan] };
    }

    /** Skor 4 faktor + gabungan untuk satu saham, untuk posisi ≤H hari bursa. */
    skor(b: Baris, sari = bacaLaporanSari(this.deskDir), H = 20, mode = '', pt = '', pf = ''): Record<string, Faktor | null> {
        const pr = this.proyeksiH(b, H);
        const f: Record<string, Faktor | null> = {
            teknikal: this.teknikalDasar(b, H, mode, pr), fundamental: skorFundamental(b), berita: this.terkait ? gabungBerita(skorBerita(this.st.berita?.[b.s]), this.terkait.skor(b), this.terkait.atur) : skorBerita(this.st.berita?.[b.s]),
            whales: skorWhales(b, b.x, this.st.orang?.[b.s], sari.get(b.s) || 0)
        };
        // Preset guru aktif: skor faktor ikut kepatuhan preset (tidak harus lolos semua kriteria).
        for (const [k, id, data] of [['teknikal', pt, b.ind], ['fundamental', pf, b.f]] as const) {
            const p = id && PRESET.find((x) => x.id === id && x.jenis === k);
            if (!p) continue;
            const ev = evaluasi(p, data);
            if (ev.persen == null) continue;
            const base = f[k]?.skor ?? 0;
            const sk = Math.max(-1, Math.min(1, 0.55 * (ev.persen / 50 - 1) + 0.45 * base));
            f[k] = { skor: +sk.toFixed(2), label: label(sk), alasan: [`${ev.persen >= 50 ? '+' : '−'} preset ${p.guru} — ${p.nama}: lolos ${ev.lolos}/${ev.dinilai} kriteria (${ev.persen}%), bobot 55% dari skor ini`, ...(f[k]?.alasan || []).map((a) => (/^[+−]/.test(a) ? `${a[0]} ${a.slice(1).trim()}` : a))] };
        }
        return { semua: gabung(f, H, mode, this.teknikalTerbukti(H, mode).terbukti), ...f };
    }
    /** Kepatuhan semua preset untuk satu saham (untuk daftar centang di halaman detail). */
    presetSaham(b: Baris) { return PRESET.map((p) => ({ ...evaluasi(p, p.jenis === 'teknikal' ? b.ind : b.f), jenis: p.jenis })); }

    data(H = 20, mode = '', pt = '', pf = '') {
        H = Math.max(1, Math.min(120, Math.round(H) || 20));
        const kunci = `${H}|${mode}|${pt}|${pf}|${this.sibuk}|${this.progres}`;
        const c = this.cacheData.get(kunci);
        if (c && Date.now() - c.at < 120_000) return c.v;
        const v = this.hitungData(H, mode, pt, pf);
        if (this.cacheData.size > 40) this.cacheData.clear();
        this.cacheData.set(kunci, { at: Date.now(), v });
        return v;
    }
    private hitungData(H: number, mode: string, pt: string, pf: string) {
        const sari = bacaLaporanSari(this.deskDir);
        const pT = PRESET.find((x) => x.id === pt), pF = PRESET.find((x) => x.id === pf);
        const baris = this.st.baris.map((b) => {
            const sk = this.skor(b, sari, H, mode, pt, pf);
            const ringkas: Record<string, { skor: number; label: string } | null> = {};
            for (const k of Object.keys(sk)) ringkas[k] = sk[k] ? { skor: sk[k]!.skor, label: sk[k]!.label } : null;
            const preset: Record<string, { lolos: number; dinilai: number; persen: number | null }> = {};
            if (pT) { const e = evaluasi(pT, b.ind); preset.teknikal = { lolos: e.lolos, dinilai: e.dinilai, persen: e.persen }; }
            if (pF) { const e = evaluasi(pF, b.f); preset.fundamental = { lolos: e.lolos, dinilai: e.dinilai, persen: e.persen }; }
            const { ind, ...tanpaInd } = b;
            return { ...tanpaInd, x: b.x ? { ...b.x, proyeksi: this.proyeksiH(b, H) } : b.x, skor: ringkas, preset };
        });
        // Ikhtisar pasar
        const naik = baris.filter((b) => b.chg1d > 0.05).length, turun = baris.filter((b) => b.chg1d < -0.05).length;
        const sek = new Map<string, { w: number; s: number; n: number }>();
        let mcap = 0;
        for (const b of baris) {
            const mc = b.mcap ?? b.f?.mcap ?? 0; const w = mc || 1; mcap += mc;
            const k = b.sektor || 'Lainnya'; const e = sek.get(k) || { w: 0, s: 0, n: 0 };
            e.w += w; e.s += b.chg1d * w; e.n++; sek.set(k, e);
        }
        const sektor = Array.from(sek.entries()).map(([k, e]) => ({ nama: k, n: e.n, chg: +(e.s / e.w).toFixed(2) })).sort((a, b) => b.chg - a.chg);
        const pasar = { naik, turun, tetap: baris.length - naik - turun, mcap, sektor, tape: this.st.tape || [] };
        return { horizon: H, mode, bobot: bobot(H, mode, this.teknikalTerbukti(H, mode).terbukti), teknikalBukti: this.teknikalTerbukti(H, mode), baris, pasar, beritaAt: this.st.beritaAt || 0, teknikalAt: this.st.teknikalAt, teknikalSesi: this.st.teknikalSesi, fundamentalAt: this.st.fundamentalAt, sibuk: this.sibuk, progres: this.progres, gagal: this.st.gagal.length, galat: [statusHarga.galat, ...['fundamental', 'berita', 'kap'].map((k) => (this.st.baris.length ? this.st.status?.[k]?.galat : '') || '')].filter(Boolean).join('\n'), sumber: statusHarga.sumber, status: this.st.status || {} };
    }
    /** Detail lengkap satu saham: alasan tiap faktor, berita, orang dalam. */
    detail(s: string, H = 20, mode = '', pt = '', pf = '') {
        const b0 = this.st.baris.find((x) => x.s === s);
        if (!b0) return null;
        const b = { ...b0, x: b0.x ? { ...b0.x, proyeksi: this.proyeksiH(b0, H) } : b0.x };
        return { horizon: H, teknikalBukti: this.teknikalTerbukti(H, mode), bobot: bobot(H, mode, this.teknikalTerbukti(H, mode).terbukti), baris: b, skor: this.skor(b0, undefined, H, mode, pt, pf), preset: this.presetSaham(b0), berita: this.st.berita?.[s] || null, orang: this.st.orang?.[s] || null };
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

    private async semesta(): Promise<Array<{ s: string; nama: string; sektor: string; industri?: string }>> {
        const list: Array<{ s: string; nama: string; sektor: string; industri?: string }> = [];
        try {
            const res = await fetch(SP500_CSV, { headers: { 'User-Agent': UA } });
            if (res.ok) {
                const lines = (await res.text()).trim().split(/\r?\n/);
                const head = parseCsv(lines[0]);
                const iS = head.indexOf('Symbol'), iN = head.indexOf('Security'), iSec = head.findIndex((h) => /sector/i.test(h)), iInd = head.findIndex((h) => /sub-industry/i.test(h));
                for (const l of lines.slice(1)) {
                    const c = parseCsv(l);
                    if (c[iS]) list.push({ s: c[iS].replace('.', '-').toUpperCase(), nama: c[iN] || '', sektor: SEKTOR[c[iSec]] || c[iSec] || '', industri: iInd >= 0 ? c[iInd] || '' : '' });
                }
            }
        } catch { /* pakai cadangan */ }
        if (!list.length) for (const b of this.st.baris) list.push({ s: b.s, nama: b.nama, sektor: b.sektor, industri: b.industri });
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
            const spyMa50 = spy.c.slice(-50).reduce((a, x) => a + x, 0) / 50;
            const pasarNaik = spy.c[spy.c.length - 1] > spyMa50;
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
                        baru.push({ s: u.s, nama: u.nama || d.nama || u.s, sektor: u.sektor, harga: +d.c[d.c.length - 1].toFixed(2), chg1d: a.chg1d, chg1m: a.chg1m, chg3m: a.chg3m, chg1y: a.chg1y, rsi: a.rsi, ma50: a.ma50 != null ? +a.ma50.toFixed(2) : null, ma200: a.ma200 != null ? +a.ma200.toFixed(2) : null, volX: a.volX, sinyal: a.sinyal, f: lama.get(u.s)?.f || null, industri: u.industri || lama.get(u.s)?.industri || '', mcap: lama.get(u.s)?.mcap ?? null, x: ekstra(d.o, d.h, d.l, d.c, d.v, a.ma50, a.ma200), vol: d.v[d.v.length - 1], ind: hitungInd(d, spy, pasarNaik) });
                        const k = Math.max(0, d.c.length - 130);
                        const r2 = (x: number | null) => (x == null ? null : +x.toFixed(2));
                        fs.writeFileSync(path.join(this.sparkDir, `${u.s}.hlc.json`), JSON.stringify({ h: d.h.slice(-270).map((x) => +x.toFixed(3)), l: d.l.slice(-270).map((x) => +x.toFixed(3)), c: d.c.slice(-270).map((x) => +x.toFixed(3)), o: d.o.slice(-270).map((x) => +x.toFixed(3)) }));
                        fs.writeFileSync(path.join(this.sparkDir, `${u.s}.json`), JSON.stringify({ s: u.s, tgl: d.tgl.slice(k), c: d.c.slice(k).map((x) => +x.toFixed(2)), ma50: a.m50.slice(k).map(r2), ma200: a.m200.slice(k).map(r2) }));
                    } catch (e: any) { gagal.push(u.s); if (!contohGalat) contohGalat = String(e?.message || e); }
                    await new Promise((r) => setTimeout(r, 150));
                }
            };
            await Promise.all([kerja(), kerja(), kerja()]);
            if (baru.length) {
                this.st.baris = baru.sort((a, b) => a.s.localeCompare(b.s));
                this.st.teknikalSesi = sesi; this.st.teknikalAt = Date.now(); this.st.gagal = gagal;
                this.segarkanHorison();
                this.simpan();
            }
            statusHarga.galat = !baru.length ? `Semua ${semesta.length} saham gagal diambil: ${contohGalat}` : gagal.length > semesta.length * 0.3 ? `${gagal.length} dari ${semesta.length} saham gagal diambil (${contohGalat}). Coba ↻ lagi nanti.` : '';
            // Pita indeks (S&P 500, Nasdaq 100, Dow, Russell 2000, VIX)
            const tape: Array<{ s: string; nama: string; harga: number; chg: number }> = [];
            for (const [s, nama] of [['SPY', 'S&P 500'], ['QQQ', 'Nasdaq 100'], ['DIA', 'Dow Jones'], ['IWM', 'Russell 2000'], ['^VIX', 'VIX']]) {
                try { const d = await harian(s); const n = d.c.length; tape.push({ s, nama, harga: +d.c[n - 1].toFixed(2), chg: +((d.c[n - 1] / d.c[n - 2] - 1) * 100).toFixed(2) }); } catch { /* lewati */ }
            }
            if (tape.length) { this.st.tape = tape; this.simpan(); }
            // Kapitalisasi (1 permintaan ke Nasdaq) — untuk ukuran kotak peta panas.
            this.progres = 'kapitalisasi pasar';
            try {
                const kap = await kapNasdaq();
                let n = 0;
                for (const b of this.st.baris) { const k = kap.get(b.s); if (k) { b.mcap = Math.round(k.mcap / 1e6); if (!b.industri) b.industri = k.industri; n++; } }
                this.langkah('kap', n, n ? '' : 'Nasdaq tidak punya data kapitalisasi untuk saham-saham ini');
                this.simpan();
            } catch (e: any) { this.langkah('kap', 0, String(e?.message || e)); }
            // Fundamental: kalau lebih dari 7 hari ATAU percobaan terakhir kosong. Berita & orang dalam tiap sesi.
            // Masing-masing berdiri sendiri: kalau satu gagal, yang lain tetap jalan.
            const fs0 = this.st.status?.fundamental;
            if (Date.now() - this.st.fundamentalAt > 7 * 86400_000 || !fs0?.n) { this.sibuk = ''; await this.perbaruiFundamental().catch((e) => console.warn('[Screener] fundamental', e?.message || e)); }
            this.sibuk = ''; await this.perbaruiBerita().catch((e) => console.warn('[Screener] berita', e?.message || e));
        } finally { this.sibuk = ''; this.progres = ''; }
    }

    /** Sentimen berita semua saham + transaksi orang dalam untuk watchlist (±4 menit). */
    async perbaruiBerita() {
        if (this.sibuk) return;
        this.sibuk = 'berita';
        try {
            const daftar = this.st.baris.map((b) => b.s);
            const out: Record<string, Berita> = { ...(this.st.berita || {}) };
            let i = 0, ok = 0, berjudul = 0, galat = '', gagalBeruntun = 0;
            const kerja = async () => {
                while (i < daftar.length) {
                    if (gagalBeruntun >= 25) return; // sumber berita sedang menolak semua → berhenti, jangan buang waktu
                    const s = daftar[i++];
                    this.progres = `berita ${i}/${daftar.length}`;
                    try { out[s] = await ambilBerita(s); ok++; if (out[s].n) berjudul++; gagalBeruntun = 0; } catch (e: any) { gagalBeruntun++; if (!galat) galat = String(e?.message || e); }
                    await new Promise((r) => setTimeout(r, 350));
                }
            };
            await Promise.all([kerja(), kerja()]);
            this.st.berita = out; this.st.beritaAt = Date.now();
            this.langkah('berita', berjudul, !ok ? `Berita gagal diambil: ${galat}` : ok < daftar.length * 0.5 ? `Berita hanya ${ok}/${daftar.length} saham (${galat})` : '');
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
            // Sumber utama: Nasdaq.com (SEC sering memblokir IP server/cloud).
            {
                let i = 0, ok = 0, galat = '', gagalBeruntun = 0;
                const daftar = this.st.baris;
                const kerja = async () => {
                    while (i < daftar.length) {
                        if (gagalBeruntun >= 30) return;
                        const b = daftar[i++];
                        this.progres = `fundamental ${i}/${daftar.length}`;
                        try {
                            const { _cek, ...f } = await fundamentalNasdaq(b.s, b.mcap ?? null);
                            b.f = { ...f, tahun: '' } as Fundamental;
                            if (b.mcap == null && f.mcap) b.mcap = f.mcap;
                            ok++; gagalBeruntun = 0;
                        } catch (e: any) { gagalBeruntun++; if (!galat) galat = String(e?.message || e); }
                        await new Promise((r) => setTimeout(r, 250));
                    }
                };
                await Promise.all([kerja(), kerja()]);
                if (ok >= Math.max(10, daftar.length * 0.3)) {
                    this.langkah('fundamental', ok, ok < daftar.length * 0.7 ? `Fundamental hanya ${ok}/${daftar.length} saham (${galat})` : '');
                    this.st.fundamentalAt = Date.now();
                    this.simpan();
                    return;
                }
                console.warn('[Screener] fundamental Nasdaq kurang:', ok, galat);
            }
            secGalat = '';
            const map = await secJson('https://www.sec.gov/files/company_tickers.json');
            if (!map) { const g = `Fundamental gagal: daftar perusahaan SEC tidak bisa diambil (${secGalat || 'tanpa keterangan'})`; this.langkah('fundamental', 0, g); this.simpan(); throw new Error(g); }
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
            const n = this.st.baris.filter((b) => b.f && (b.f.roe != null || b.f.per != null || b.f.pbv != null)).length;
            for (const b of this.st.baris) if (b.mcap == null && b.f?.mcap) b.mcap = b.f.mcap;
            if (!n) { const g = `Fundamental kosong: laporan keuangan SEC tidak terbaca (${secGalat || 'data tidak tersedia'})`; this.langkah('fundamental', 0, g); this.simpan(); throw new Error(g); }
            this.langkah('fundamental', n, '');
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
