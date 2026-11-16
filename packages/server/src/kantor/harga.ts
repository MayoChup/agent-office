import { execFile } from 'child_process';

/**
 * Harga saham AS dari beberapa sumber gratis (tanpa kunci API), bergantian otomatis:
 *   1. Yahoo (fetch Node)      2. Yahoo lewat curl (sidik TLS berbeda, sering lolos saat Node kena 429)
 *   3. CNBC                    4. Nasdaq.com               5. Stooq
 * Sumber yang barusan gagal "diistirahatkan" 20 menit supaya 500 saham tidak menunggu sumber yang memblokir.
 */

export const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Bar { t: string; o: number; h: number; l: number; c: number; v: number }
export interface Harian { rows: Bar[]; nama: string; sumber: string }

type Jawab = { status: number; body: string };

async function ambilFetch(url: string, headers: Record<string, string> = {}): Promise<Jawab> {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*', 'Accept-Language': 'en-US,en;q=0.9', ...headers }, signal: AbortSignal.timeout(15_000) });
    return { status: res.status, body: await res.text() };
}
function ambilCurl(url: string, headers: Record<string, string> = {}): Promise<Jawab> {
    const args = ['-sS', '--compressed', '-m', '20', '-A', UA, '-H', 'Accept: application/json, text/plain, */*', '-H', 'Accept-Language: en-US,en;q=0.9'];
    for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
    args.push('-w', '\n%{http_code}', url);
    return new Promise((resolve, reject) => execFile('curl', args, { timeout: 25_000, maxBuffer: 20 * 1024 * 1024 }, (e, out) => {
        if (e && !out) { reject(new Error((e as any).code === 'ENOENT' ? 'curl tidak terpasang' : e.message)); return; }
        const i = out.lastIndexOf('\n');
        resolve({ status: Number(out.slice(i + 1)) || 0, body: out.slice(0, i) });
    }));
}

/* ── Pemutus: sumber yang gagal berturut-turut diistirahatkan sebentar ── */
const istirahat = new Map<string, number>();
const gagalBeruntun = new Map<string, number>();
const galatSumber = new Map<string, string>();
function catatGagal(sumber: string, pesan: string, keras: boolean) {
    galatSumber.set(sumber, pesan);
    const n = (gagalBeruntun.get(sumber) || 0) + 1;
    gagalBeruntun.set(sumber, n);
    if (keras || n >= 3) istirahat.set(sumber, Date.now() + 20 * 60_000);
}
function catatBerhasil(sumber: string) { gagalBeruntun.set(sumber, 0); istirahat.delete(sumber); galatSumber.delete(sumber); }
const sedangIstirahat = (sumber: string) => (istirahat.get(sumber) || 0) > Date.now();

class Galat extends Error { constructor(msg: string, public keras = false, public tetap = false) { super(msg); } }
const httpGalat = (nama: string, st: number) => new Galat(st === 429 ? `${nama} membatasi permintaan (HTTP 429)` : `${nama} HTTP ${st}`, st === 429 || st === 403 || st === 401);

/* ── Yahoo ── */
async function yahooMentah(lewat: 'fetch' | 'curl', s: string, range: string, interval: string) {
    let terakhir: Galat | null = null;
    for (const host of ['query1', 'query2']) {
        const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=${range}&interval=${interval}&includePrePost=false`;
        const j = await (lewat === 'fetch' ? ambilFetch(url) : ambilCurl(url));
        if (j.status === 404) throw new Galat(`Saham ${s} tidak ditemukan`, false, true);
        if (j.status !== 200) { terakhir = httpGalat(lewat === 'fetch' ? 'Yahoo' : 'Yahoo (curl)', j.status); await tidur(400); continue; }
        const r = JSON.parse(j.body)?.chart?.result?.[0];
        if (!r) throw new Galat(`Saham ${s} tidak ditemukan`, false, true);
        return r;
    }
    throw terakhir || new Galat('Yahoo gagal');
}

/** Grafik Yahoo mentah (dipakai candle & harga terkini): fetch dulu, lalu curl. */
export async function yahooChart(s: string, range: string, interval: string): Promise<any> {
    const pesan: string[] = [];
    for (const lewat of ['fetch', 'curl'] as const) {
        const nama = lewat === 'fetch' ? 'Yahoo' : 'Yahoo (curl)';
        if (sedangIstirahat(nama)) { pesan.push(`${nama}: ${galatSumber.get(nama) || 'diistirahatkan'}`); continue; }
        try { const r = await yahooMentah(lewat, s, range, interval); catatBerhasil(nama); return r; } catch (e: any) {
            if (e?.tetap) throw e;
            const m = e?.name === 'TimeoutError' ? `${nama} tidak menjawab` : e?.cause?.code ? `${nama} tidak bisa dihubungi (${e.cause.code})` : String(e?.message || e);
            catatGagal(nama, m, !!e?.keras); pesan.push(m);
        }
    }
    throw new Error(pesan.join('; '));
}

function dariYahoo(r: any): { rows: Bar[]; nama: string } {
    const q = r?.indicators?.quote?.[0] || {};
    const rows = (r?.timestamp || []).map((t: number, i: number) => ({ t: new Date(t * 1000).toISOString().slice(0, 10), o: q.open?.[i], h: q.high?.[i], l: q.low?.[i], c: q.close?.[i], v: q.volume?.[i] || 0 }))
        .filter((x: Bar) => [x.o, x.h, x.l, x.c].every((y) => Number.isFinite(y)));
    return { rows, nama: String(r?.meta?.longName || r?.meta?.shortName || '') };
}

/* ── Nasdaq.com ── */
const ETF = new Set(['SPY', 'QQQ', 'DIA', 'IWM', 'VOO', 'VTI', 'IVV', 'GLD', 'TLT', 'XLK', 'XLF', 'XLE', 'ARKK', 'SMH', 'SOXX']);
const angka = (x: any) => Number(String(x ?? '').replace(/[$,\s]/g, ''));
async function nasdaq(s: string): Promise<{ rows: Bar[]; nama: string }> {
    if (s.startsWith('^')) throw new Galat('Nasdaq: indeks tidak tersedia', false, true);
    const dari = new Date(Date.now() - 400 * 86400_000).toISOString().slice(0, 10);
    const sym = s.replace('-', '.');
    const kelas = ETF.has(s) ? ['etf', 'stocks'] : ['stocks', 'etf'];
    let terakhir: Galat | null = null;
    for (const k of kelas) {
        const j = await ambilFetch(`https://api.nasdaq.com/api/quote/${encodeURIComponent(sym)}/historical?assetclass=${k}&fromdate=${dari}&limit=9999`, { Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' });
        if (j.status !== 200) { terakhir = httpGalat('Nasdaq', j.status); if (terakhir.keras) break; continue; }
        const d = JSON.parse(j.body);
        const rowsRaw = d?.data?.tradesTable?.rows;
        if (!Array.isArray(rowsRaw) || !rowsRaw.length) { terakhir = new Galat('Nasdaq: tidak ada data'); continue; }
        const rows = rowsRaw.map((x: any) => {
            const [mm, dd, yy] = String(x.date).split('/');
            return { t: `${yy}-${mm}-${dd}`, o: angka(x.open), h: angka(x.high), l: angka(x.low), c: angka(x.close), v: angka(x.volume) || 0 };
        }).filter((x: Bar) => /^\d{4}-\d{2}-\d{2}$/.test(x.t) && [x.o, x.h, x.l, x.c].every((y) => Number.isFinite(y) && y > 0)).reverse();
        return { rows, nama: '' };
    }
    throw terakhir || new Galat('Nasdaq gagal');
}

/* ── CNBC ── */
async function cnbcBars(s: string, kode: '1D' | '5D' | '1Y' | '5Y'): Promise<any[]> {
    const sym = s === '^VIX' ? '.VIX' : s.replace('-', '.');
    const j = await ambilFetch(`https://ts-api.cnbc.com/harmony/app/charts/${kode}.json?symbol=${encodeURIComponent(sym)}`, { Referer: 'https://www.cnbc.com/' });
    if (j.status !== 200) throw httpGalat('CNBC', j.status);
    const bars = JSON.parse(j.body)?.barData?.priceBars;
    if (!Array.isArray(bars) || !bars.length) throw new Galat('CNBC: tidak ada data');
    return bars.filter((b: any) => [b.open, b.high, b.low, b.close].every((y) => Number.isFinite(angka(y)) && angka(y) > 0));
}
async function cnbc(s: string): Promise<{ rows: Bar[]; nama: string }> {
    const rows = (await cnbcBars(s, '1Y')).map((b: any) => {
        const tt = String(b.tradeTime || '');
        const t = /^\d{8}/.test(tt) ? `${tt.slice(0, 4)}-${tt.slice(4, 6)}-${tt.slice(6, 8)}` : new Date(Number(b.tradeTimeinMills)).toISOString().slice(0, 10);
        return { t, o: angka(b.open), h: angka(b.high), l: angka(b.low), c: angka(b.close), v: angka(b.volume) || 0 };
    });
    return { rows, nama: '' };
}
/** Grafik CNBC dalam bentuk mirip Yahoo (untuk candle saat Yahoo diblokir). */
export async function cnbcChart(s: string, kode: '1D' | '5D' | '5Y'): Promise<any> {
    const bars = await cnbcBars(s, kode);
    return {
        meta: { currency: 'USD', longName: s, gmtoffset: 0 },
        timestamp: bars.map((b: any) => Math.round(Number(b.tradeTimeinMills) / 1000)),
        indicators: { quote: [{ open: bars.map((b: any) => angka(b.open)), high: bars.map((b: any) => angka(b.high)), low: bars.map((b: any) => angka(b.low)), close: bars.map((b: any) => angka(b.close)), volume: bars.map((b: any) => angka(b.volume) || 0) }] }
    };
}

/* ── Stooq ── */
async function stooq(s: string): Promise<{ rows: Bar[]; nama: string }> {
    if (s.startsWith('^')) throw new Galat('Stooq: indeks tidak tersedia', false, true);
    const j = await ambilFetch(`https://stooq.com/q/d/l/?s=${encodeURIComponent(s.toLowerCase())}.us&i=d`);
    if (j.status !== 200) throw httpGalat('Stooq', j.status);
    const lines = j.body.trim().split(/\r?\n/);
    if (!/^Date,/i.test(lines[0] || '')) throw new Galat('Stooq: tidak ada data');
    const rows = lines.slice(1).map((l) => l.split(',')).filter((c) => c.length >= 5).slice(-260)
        .map((c) => ({ t: c[0], o: +c[1], h: +c[2], l: +c[3], c: +c[4], v: +(c[5] || 0) })).filter((x) => [x.o, x.h, x.l, x.c].every(Number.isFinite));
    return { rows, nama: '' };
}

const SUMBER: Array<[string, (s: string) => Promise<{ rows: Bar[]; nama: string }>]> = [
    ['Yahoo', async (s) => dariYahoo(await yahooMentah('fetch', s, '1y', '1d'))],
    ['Yahoo (curl)', async (s) => dariYahoo(await yahooMentah('curl', s, '1y', '1d'))],
    ['CNBC', cnbc],
    ['Nasdaq', nasdaq],
    ['Stooq', stooq]
];

/** Status untuk layar & diagnosa. */
export const statusHarga = { galat: '', sumber: '' };

/** Harga harian ±1 tahun dari sumber pertama yang berhasil. */
export async function hargaHarian(s: string): Promise<Harian> {
    const pesan: string[] = [];
    for (const [nama, fn] of SUMBER) {
        if (sedangIstirahat(nama)) { pesan.push(`${nama}: ${galatSumber.get(nama) || 'diistirahatkan'}`); continue; }
        try {
            const r = await fn(s);
            if (r.rows.length < 60) throw new Galat(`${nama}: data kurang (${r.rows.length} hari)`);
            catatBerhasil(nama); statusHarga.sumber = nama;
            return { ...r, sumber: nama };
        } catch (e: any) {
            const m = e?.name === 'TimeoutError' ? `${nama} tidak menjawab` : e?.cause?.code ? `${nama} tidak bisa dihubungi (${e.cause.code})` : String(e?.message || e);
            pesan.push(m);
            if (!e?.tetap) catatGagal(nama, m, !!e?.keras);
        }
    }
    throw new Error(pesan.join('; '));
}

/** Diagnosa: `node kantor-server.js --cek-harga [SIMBOL]` — coba semua sumber satu per satu. */
export async function cekHargaCli(simbol = 'AAPL') {
    console.log(`Cek sumber harga untuk ${simbol} (dari server ini):\n`);
    for (const [nama, fn] of SUMBER) {
        const t0 = Date.now();
        try { const r = await fn(simbol); const z = r.rows[r.rows.length - 1]; console.log(`✅ ${nama.padEnd(13)} ${r.rows.length} hari, terakhir ${z?.t} tutup ${z?.c}  (${Date.now() - t0} ms)`); }
        catch (e: any) { console.log(`❌ ${nama.padEnd(13)} ${e?.cause?.code || e?.message || e}  (${Date.now() - t0} ms)`); }
    }
    try { const r = await cnbcChart(simbol, '1D'); console.log(`✅ CNBC menit   ${r.timestamp.length} batang hari ini`); } catch (e: any) { console.log(`❌ CNBC menit   ${e?.message || e}`); }
    const { ambilBerita } = await import('./skor');
    const { kapNasdaq } = await import('./screener');
    try { const k = await kapNasdaq(); const a = k.get(simbol); console.log(`✅ Kapitalisasi ${k.size} saham dari Nasdaq${a ? ` — ${simbol} ${(a.mcap / 1e9).toFixed(0)} miliar USD` : ''}`); } catch (e: any) { console.log(`❌ Kapitalisasi ${e?.message || e}`); }
    for (const [nama, url] of [['SEC daftar', 'https://www.sec.gov/files/company_tickers.json'], ['SEC laporan', `https://data.sec.gov/api/xbrl/frames/us-gaap/NetIncomeLoss/USD/CY${new Date().getUTCFullYear() - 1}.json`]]) {
        try { const r = await fetch(url, { headers: { 'User-Agent': 'KantorRico research kantor-rico@users.noreply.github.com', Accept: 'application/json' }, signal: AbortSignal.timeout(30_000) }); const t = await r.text(); console.log(`${r.ok ? '✅' : '❌'} ${nama.padEnd(12)} HTTP ${r.status}, ${(t.length / 1024).toFixed(0)} KB`); } catch (e: any) { console.log(`❌ ${nama.padEnd(12)} ${e?.cause?.code || e?.message || e}`); }
    }
    try { const b = await ambilBerita(simbol); console.log(`✅ Berita       ${b.n} judul 7 hari terakhir (${b.sumber})${b.judul[0] ? ` — "${b.judul[0].t.slice(0, 60)}"` : ''}`); } catch (e: any) { console.log(`❌ Berita       ${e?.message || e}`); }
}

/** Riwayat panjang (±5 tahun) untuk uji mundur: Nasdaq (harian), cadangan Yahoo. */
export async function hargaPanjang(s: string, tahun = 5): Promise<Bar[]> {
    const pesan: string[] = [];
    if (!s.startsWith('^')) {
        try {
            const dari = new Date(Date.now() - tahun * 365.25 * 86400_000).toISOString().slice(0, 10);
            for (const k of ETF.has(s) ? ['etf', 'stocks'] : ['stocks', 'etf']) {
                const j = await ambilFetch(`https://api.nasdaq.com/api/quote/${encodeURIComponent(s.replace('-', '.'))}/historical?assetclass=${k}&fromdate=${dari}&limit=9999`, { Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' });
                if (j.status !== 200) { pesan.push(`Nasdaq HTTP ${j.status}`); continue; }
                const rows = JSON.parse(j.body)?.data?.tradesTable?.rows;
                if (!Array.isArray(rows) || rows.length < 300) { pesan.push('Nasdaq: data pendek'); continue; }
                return rows.map((x: any) => { const [mm, dd, yy] = String(x.date).split('/'); return { t: `${yy}-${mm}-${dd}`, o: angka(x.open), h: angka(x.high), l: angka(x.low), c: angka(x.close), v: angka(x.volume) || 0 }; })
                    .filter((x: Bar) => /^\d{4}-\d{2}-\d{2}$/.test(x.t) && [x.o, x.h, x.l, x.c].every((y) => Number.isFinite(y) && y > 0)).reverse();
            }
        } catch (e: any) { pesan.push(`Nasdaq: ${e?.cause?.code || e?.message || e}`); }
    }
    try { const r = await yahooChart(s, `${tahun}y`, '1d'); const d = dariYahoo(r); if (d.rows.length > 300) return d.rows; } catch (e: any) { pesan.push(String(e?.message || e)); }
    throw new Error(pesan.join('; ') || 'riwayat panjang tidak tersedia');
}
