import fs from 'node:fs';
import path from 'node:path';
import { j as nasdaq, sym, tabel, cari, nilai } from './nasdaq';
import { yahooChart, hargaPanjang } from './harga';
import { sentimen, UA_BROWSER } from './skor';

/**
 * Data tambahan halaman saham (tab Overview / Fundamentals / News / Seasonality):
 *  - statistik pasar & fundamental tambahan (EPS, PEG, EBITDA, dividend yield, rata-rata volume, beta) — Nasdaq
 *  - pendapat analis Wall Street (Buy/Hold/Sell, target harga, rating per bank) — Nasdaq
 *  - sentimen berita 7/14/30 hari — Google News, dinilai penilai berita kantor
 *  - musiman (return per bulan 5 tahun terakhir) — Yahoo bulanan, cadangan harga harian panjang
 * Semua di-cache di memori; kegagalan satu bagian tidak menggagalkan bagian lain.
 */
const cache = new Map<string, { at: number; v: any }>();
async function simpan<T>(kunci: string, umur: number, fn: () => Promise<T>): Promise<T> {
    const h = cache.get(kunci); if (h && Date.now() - h.at < umur) return h.v;
    const v = await fn(); cache.set(kunci, { at: Date.now(), v });
    if (cache.size > 600) cache.delete(cache.keys().next().value as string);
    return v;
}
const r2 = (x: number | null | undefined, k = 2) => (x == null || !Number.isFinite(x) ? null : +x.toFixed(k));

/* ── Statistik pasar & fundamental tambahan ── */
export interface Ekstra { eps: number | null; peg: number | null; ebitda: number | null; yieldDiv: number | null; avgVol: number | null; beta: number | null; fwdPe: number | null; hi52: number | null; lo52: number | null; target1y: number | null; sumber: string }
export async function ambilEkstra(s: string, ctx: { per?: number | null; epsCagr3?: number | null; revGrowth?: number | null }): Promise<Ekstra> {
    return simpan(`ek:${s}`, 12 * 3600_000, async () => {
        const [sum, fin] = await Promise.all([
            nasdaq(`https://api.nasdaq.com/api/quote/${sym(s)}/summary?assetclass=stocks`).catch(() => null),
            nasdaq(`https://api.nasdaq.com/api/company/${sym(s)}/financials?frequency=1`).catch(() => null)
        ]);
        if (!sum && !fin) throw new Error('Nasdaq tidak menjawab');
        const sm = sum?.summaryData || {};
        const pick = (...k: string[]) => { for (const x of k) { const v = nilai(sm[x]); if (v != null) return v; } return null; };
        const hl = String(sm.FiftTwoWeekHighLow?.value || sm.FiftyTwoWeekHighLow?.value || '').split('/').map((x) => nilai(x));
        const pe = ctx.per ?? pick('PERatio');
        // PEG = PER ÷ pertumbuhan laba tahunan (%). Pakai pertumbuhan laba 3 tahun; kalau tidak ada, pertumbuhan pendapatan.
        const tumbuh = ctx.epsCagr3 ?? ctx.revGrowth ?? null;
        const peg = pe != null && pe > 0 && tumbuh != null && tumbuh > 0 ? pe / tumbuh : null;
        // EBITDA = laba operasi + penyusutan & amortisasi (laporan tahunan terbaru, angka Nasdaq dalam ribuan USD).
        const is = tabel(fin?.incomeStatementTable), cf = tabel(fin?.cashFlowTable);
        const oi = cari(is, /^operating income/, /^earnings before interest and tax/, /^ebit$/)[0] ?? null;
        const dep = cari(cf, /^depreciation/)[0] ?? null;
        const ebitda = oi != null ? Math.round(((oi + (dep ?? 0)) * 1000) / 1e6) : null; // juta USD
        return {
            eps: pick('EarningsPerShare'), peg: r2(peg), ebitda, yieldDiv: pick('Yield'), avgVol: pick('AverageVolume'), beta: pick('Beta'), fwdPe: pick('ForwardPE1Yr'),
            hi52: hl[0] ?? null, lo52: hl[1] ?? null, target1y: pick('OneYrTarget'), sumber: 'Nasdaq'
        };
    });
}

/* ── Pendapat analis ── */
export interface Analis { buy: number; hold: number; sell: number; n: number; konsensus: 'BUY' | 'HOLD' | 'SELL'; target: number | null; tinggi: number | null; rendah: number | null; bank: Array<{ nama: string; analis: string; rating: string; arah: 'buy' | 'hold' | 'sell'; tgl: string; target: number | null }>; sumber: string }
const arahDari = (t: string): 'buy' | 'hold' | 'sell' => /sell|under|reduce|negative/i.test(t) ? 'sell' : /buy|outperform|overweight|positive|accumulate|add/i.test(t) ? 'buy' : 'hold';
/** Cari semua objek di dalam JSON (Nasdaq kadang mengubah susunan) — dipakai untuk mengambil angka & tabel secara longgar. */
function jelajah(x: any, fn: (o: any) => void, d = 0) { if (!x || d > 6 || typeof x !== 'object') return; if (!Array.isArray(x)) fn(x); for (const v of Object.values(x)) jelajah(v, fn, d + 1); }
export async function ambilAnalis(s: string): Promise<Analis | null> {
    return simpan(`an:${s}`, 12 * 3600_000, async () => {
        const [tp, rt] = await Promise.all([
            nasdaq(`https://api.nasdaq.com/api/analyst/${sym(s)}/targetprice`).catch(() => null),
            nasdaq(`https://api.nasdaq.com/api/analyst/${sym(s)}/ratings`).catch(() => null)
        ]);
        let buy: number | null = null, hold: number | null = null, sell: number | null = null, target: number | null = null, tinggi: number | null = null, rendah: number | null = null;
        jelajah(tp, (o) => {
            const k = Object.keys(o);
            const ambil = (re: RegExp) => { const key = k.find((x) => re.test(x)); return key ? nilai(o[key]) : null; };
            if (buy == null && k.some((x) => /^buy$/i.test(x))) { buy = ambil(/^buy$/i); hold = ambil(/^hold$/i); sell = ambil(/^sell$/i); }
            if (target == null) target = ambil(/^(pricetarget|meanpricetarget|consensusPriceTarget)$/i);
            if (tinggi == null) tinggi = ambil(/^highpricetarget$/i);
            if (rendah == null) rendah = ambil(/^lowpricetarget$/i);
        });
        const bank: Analis['bank'] = [];
        jelajah(rt, (o) => {
            for (const v of Object.values(o)) {
                if (!Array.isArray(v) || !v.length || typeof v[0] !== 'object') continue;
                const k = Object.keys(v[0] || {});
                const kf = k.find((x) => /firm|broker|institution|company/i.test(x)) || k.find((x) => /analyst/i.test(x));
                const ka = k.find((x) => x !== kf && /analyst|person|name/i.test(x));
                const kr = [/rating/i, /grade/i, /recommend/i, /action/i].map((re) => k.find((x) => re.test(x) && !/date|prior|from/i.test(x))).find(Boolean);
                if (!kf || !kr) continue;
                const kt = k.find((x) => /date/i.test(x)), kp = k.find((x) => /target|price/i.test(x) && !/date|prior|from|old/i.test(x));
                for (const r of v.slice(0, 60)) {
                    const nama = String(r[kf] || '').trim(), rating = String(r[kr] || '').replace(/.*(?:to|→)\s*/i, '').trim();
                    if (!nama || !rating || bank.some((b) => b.nama === nama)) continue;
                    const tg = kp ? nilai(String(r[kp] ?? '').split(/to|→/i).pop()) : null;
                    bank.push({ nama, analis: ka ? String(r[ka] || '').trim() : '', rating, arah: arahDari(rating), tgl: String(r[kt!] || ''), target: tg && tg > 0 ? tg : null });
                }
            }
        });
        // Hitungan Buy/Hold/Sell: dari ringkasan; kalau tidak ada, dari rating terakhir tiap bank.
        if (buy == null && bank.length) { buy = bank.filter((b) => b.arah === 'buy').length; hold = bank.filter((b) => b.arah === 'hold').length; sell = bank.filter((b) => b.arah === 'sell').length; }
        const B = buy ?? 0, Hh = hold ?? 0, S = sell ?? 0, n = B + Hh + S;
        if (!n && target == null) return null;
        const konsensus = B >= Hh && B >= S ? 'BUY' : S > B && S >= Hh ? 'SELL' : 'HOLD';
        return { buy: B, hold: Hh, sell: S, n, konsensus, target, tinggi, rendah, bank: bank.slice(0, 30), sumber: 'Nasdaq' };
    });
}

/* ── Sentimen berita 7/14/30 hari ── */
export interface Sentimen { at: number; jendela: Record<'7' | '14' | '30', { n: number; pos: number; neg: number; netral: number; skor: number | null }>; sumber: string }
export async function ambilSentimen(s: string): Promise<Sentimen> {
    return simpan(`se:${s}`, 3 * 3600_000, async () => {
        const q = encodeURIComponent(`${s.replace('-', '.')} stock`);
        const res = await fetch(`https://news.google.com/rss/search?q=${q}+when:30d&hl=en-US&gl=US&ceid=US:en`, { headers: { 'User-Agent': UA_BROWSER }, signal: AbortSignal.timeout(15_000) });
        if (!res.ok) throw new Error(`Google News HTTP ${res.status}`);
        const xml = await res.text();
        const tag = (it: string, t: string) => (it.match(new RegExp(`<${t}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${t}>`)) || [])[1]?.trim() || '';
        const un = (x: string) => x.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
        const item = (xml.match(/<item>[\s\S]*?<\/item>/g) || []).map((it) => ({ at: Date.parse(tag(it, 'pubDate')) || 0, s: sentimen(un(tag(it, 'title'))) })).filter((x) => x.at);
        const jendela = {} as Sentimen['jendela'];
        for (const h of ['7', '14', '30'] as const) {
            const xs = item.filter((x) => x.at >= Date.now() - +h * 86400_000);
            const pos = xs.filter((x) => x.s > 0).length, neg = xs.filter((x) => x.s < 0).length;
            // 0–100: 50 = seimbang; tiap berita positif/negatif menggeser ke arahnya (berita netral meredam).
            jendela[h] = { n: xs.length, pos, neg, netral: xs.length - pos - neg, skor: xs.length ? Math.round(50 + 50 * (pos - neg) / xs.length) : null };
        }
        return { at: Date.now(), jendela, sumber: 'Google News' };
    });
}

/* ── Musiman ── */
export interface Musiman { tahun: Array<{ th: number; bulan: Array<number | null> }>; rata: Array<number | null>; naik: Array<number | null>; sumber: string }
export async function ambilMusiman(s: string): Promise<Musiman> {
    return simpan(`mu:${s}`, 24 * 3600_000, async () => {
        // Penutupan akhir tiap bulan.
        let akhirBulan: Array<{ ym: string; c: number }> = [];
        let sumber = 'Yahoo';
        try {
            const r = await yahooChart(s, '10y', '1mo');
            const ts: number[] = r.timestamp || [], c: number[] = r.indicators?.adjclose?.[0]?.adjclose || r.indicators?.quote?.[0]?.close || [];
            akhirBulan = ts.map((t, i) => ({ ym: new Date((t + (r.meta?.gmtoffset || 0)) * 1000).toISOString().slice(0, 7), c: c[i] })).filter((x) => Number.isFinite(x.c));
        } catch {
            sumber = 'Nasdaq';
            const rows = await hargaPanjang(s, 6);
            const m = new Map<string, number>(); for (const b of rows) m.set(b.t.slice(0, 7), b.c);
            akhirBulan = [...m.entries()].map(([ym, c]) => ({ ym, c }));
        }
        const uniq = new Map<string, number>(); for (const x of akhirBulan) uniq.set(x.ym, x.c);
        const urut = [...uniq.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        const ret = new Map<string, number>();
        for (let i = 1; i < urut.length; i++) ret.set(urut[i][0], +((urut[i][1] / urut[i - 1][1] - 1) * 100).toFixed(2));
        const thIni = new Date().getUTCFullYear();
        const tahun = Array.from({ length: 6 }, (_, k) => thIni - k).map((th) => ({ th, bulan: Array.from({ length: 12 }, (_, m) => ret.get(`${th}-${String(m + 1).padStart(2, '0')}`) ?? null) })).filter((t) => t.bulan.some((x) => x != null));
        const rata: Array<number | null> = [], naik: Array<number | null> = [];
        for (let m = 0; m < 12; m++) {
            const xs = tahun.map((t) => t.bulan[m]).filter((x): x is number => x != null);
            rata.push(xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : null);
            naik.push(xs.length ? Math.round((xs.filter((x) => x > 0).length / xs.length) * 100) : null);
        }
        if (!tahun.length) throw new Error('riwayat bulanan kosong');
        return { tahun, rata, naik, sumber };
    });
}

/* ── Weekly Insight (AI, dibuat manual, tersimpan 7 hari) ── */
export interface Insight { s: string; judul: string; ringkas: string; fundTek: string; pantau: string; dibuat: number; model: string }
const dirInsight = (dataDir: string) => path.join(dataDir, 'insight');
export function bacaInsight(dataDir: string, s: string): Insight | null {
    try { const x = JSON.parse(fs.readFileSync(path.join(dirInsight(dataDir), `${s}.json`), 'utf8')) as Insight; return Date.now() - x.dibuat < 7 * 86400_000 ? x : null; } catch { return null; }
}
type Llm = { complete(system: string, user: string, maxTokens?: number, attempts?: number): Promise<string | null> } | null | undefined;
export async function buatInsight(dataDir: string, s: string, fakta: string, llm: Llm): Promise<Insight> {
    if (!llm) throw new Error('AI belum tersedia');
    // Format berlabel (lebih tahan untuk AI gratis daripada JSON): JUDUL / RINGKAS / FUNDTEK / PANTAU. Dicoba hingga 2×.
    const sistem = 'Kamu analis saham di kantor Pak Rico. Tulis "Weekly Insight" untuk satu saham AS dalam bahasa Indonesia yang jelas untuk orang awam. ' +
        'Pakai HANYA angka dan fakta dari data yang diberikan; jangan mengarang angka, tanggal, atau berita. Kalau suatu data tidak ada, jangan disebut. Bulatkan angka ke 2 desimal. ' +
        'Balas PERSIS dengan 4 bagian berlabel berikut, tanpa teks lain:\n' +
        'JUDUL: satu kalimat judul ringkas minggu ini (maks 14 kata)\n' +
        'RINGKAS: 3–4 kalimat tentang apa yang terjadi minggu ini (harga, berita penting)\n' +
        'FUNDTEK: 3–4 kalimat posisi teknikal (tren, MA, RSI) dan fundamental (valuasi, laba) dengan angkanya\n' +
        'PANTAU: 2–3 kalimat yang perlu dipantau ke depan (level harga penting, jadwal laporan bila ada di data, risiko)\n' +
        'Bukan saran beli/jual.';
    const bagian = (t: string, label: string) => {
        const m = t.match(new RegExp(`(?:^|\\n)\\W*${label}\\W*:?\\**\\s*([\\s\\S]*?)(?=\\n\\W*(?:JUDUL|RINGKAS|FUNDTEK|PANTAU)\\W*:|$)`, 'i'));
        return (m?.[1] || '').replace(/\*\*/g, '').trim();
    };
    let j: any = null, kosong = 0;
    for (let coba = 0; coba < 2 && !j; coba++) {
        const out = String((await llm.complete(sistem, fakta, 1400, 2)) || '');
        if (!out.trim()) { kosong++; continue; }
        const r = { judul: bagian(out, 'JUDUL'), ringkas: bagian(out, 'RINGKAS'), fundTek: bagian(out, 'FUNDTEK'), pantau: bagian(out, 'PANTAU') };
        if (r.ringkas) { j = r; break; }
        // Cadangan: AI membalas JSON.
        try { const m = out.match(/\{[\s\S]*\}/); const x = m ? JSON.parse(m[0]) : null; if (x?.ringkas) j = x; } catch { /* coba lagi */ }
    }
    if (!j) throw new Error(kosong === 2 ? 'AI gratis sedang penuh. Coba lagi beberapa menit lagi.' : 'AI tidak memberi jawaban yang bisa dibaca. Coba lagi sebentar.');
    const x: Insight = { s, judul: String(j.judul || '').slice(0, 160), ringkas: String(j.ringkas || ''), fundTek: String(j.fundTek || ''), pantau: String(j.pantau || ''), dibuat: Date.now(), model: 'AI kantor' };
    fs.mkdirSync(dirInsight(dataDir), { recursive: true });
    fs.writeFileSync(path.join(dirInsight(dataDir), `${s}.json`), JSON.stringify(x));
    return x;
}
