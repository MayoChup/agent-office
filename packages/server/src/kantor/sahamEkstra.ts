import fs from 'node:fs';
import path from 'node:path';
import { j as nasdaq, sym, tabel, cari, nilai } from './nasdaq';
import { yahooChart, hargaPanjang } from './harga';
import { sentimen, UA_BROWSER } from './skor';
import { secJson } from './screener';
import { kalenderLaba } from './nasdaq';

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
/* Yahoo quoteSummary butuh cookie + "crumb" (seperti yfinance). Disimpan 6 jam. */
let yahooSesi: { at: number; cookie: string; crumb: string } | null = null;
async function sesiYahoo(): Promise<{ cookie: string; crumb: string }> {
    if (yahooSesi && Date.now() - yahooSesi.at < 6 * 3600_000) return yahooSesi;
    const h = { 'User-Agent': UA_BROWSER, Accept: 'text/html,application/json,*/*' };
    const r1 = await fetch('https://fc.yahoo.com/', { headers: h, redirect: 'manual', signal: AbortSignal.timeout(12_000) }).catch(() => null);
    const sc: string[] = (r1?.headers as any)?.getSetCookie?.() || [];
    const cookie = sc.map((c) => c.split(';')[0]).filter(Boolean).join('; ');
    if (!cookie) throw new Error('Yahoo: cookie tidak didapat');
    const r2 = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', { headers: { ...h, Cookie: cookie }, signal: AbortSignal.timeout(12_000) });
    const crumb = (await r2.text()).trim();
    if (!r2.ok || !crumb || crumb.length > 40 || /</.test(crumb)) throw new Error(`Yahoo: crumb gagal (HTTP ${r2.status})`);
    yahooSesi = { at: Date.now(), cookie, crumb };
    return yahooSesi;
}
async function yahooRingkasan(s: string, modules: string): Promise<any> {
    for (let coba = 0; coba < 2; coba++) {
        const { cookie, crumb } = await sesiYahoo();
        const r = await fetch(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(s)}?modules=${modules}&crumb=${encodeURIComponent(crumb)}`, { headers: { 'User-Agent': UA_BROWSER, Cookie: cookie, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
        if (r.status === 401 || r.status === 403) { yahooSesi = null; continue; }
        if (!r.ok) throw new Error(`Yahoo quoteSummary HTTP ${r.status}`);
        const j: any = await r.json();
        const x = j?.quoteSummary?.result?.[0];
        if (!x) throw new Error('Yahoo: data analis kosong');
        return x;
    }
    throw new Error('Yahoo menolak sesi');
}
const raw = (v: any): number | null => { const n = typeof v === 'object' && v ? v.raw : v; return typeof n === 'number' && Number.isFinite(n) ? n : null; };
/** Analis dari Yahoo: hitungan rekomendasi bulan ini, target rata-rata, dan rating terakhir tiap bank (12 bulan). */
async function analisYahoo(s: string): Promise<Analis | null> {
    const x = await yahooRingkasan(s, 'recommendationTrend,financialData,upgradeDowngradeHistory');
    const tr = (x.recommendationTrend?.trend || []).find((t: any) => t.period === '0m') || x.recommendationTrend?.trend?.[0];
    const fd = x.financialData || {};
    const buy = tr ? (tr.strongBuy || 0) + (tr.buy || 0) : 0, hold = tr ? tr.hold || 0 : 0, sell = tr ? (tr.sell || 0) + (tr.strongSell || 0) : 0;
    const setahun = Date.now() / 1000 - 365 * 86400;
    const bank: Analis['bank'] = [];
    for (const h of (x.upgradeDowngradeHistory?.history || []).slice().sort((a: any, b: any) => b.epochGradeDate - a.epochGradeDate)) {
        if (h.epochGradeDate < setahun) break;
        const nama = String(h.firm || '').trim(), rating = String(h.toGrade || '').trim();
        if (!nama || !rating || bank.some((b) => b.nama === nama)) continue;
        const tg = raw(h.currentPriceTarget);
        const aksi = ({ up: 'Upgrade', down: 'Downgrade', main: 'Pertahankan', init: 'Mulai meliput', reit: 'Tegaskan ulang' } as Record<string, string>)[String(h.action || '')] || '';
        bank.push({ nama, analis: '', rating: aksi ? `${rating} (${aksi})` : rating, arah: arahDari(rating), tgl: new Date(h.epochGradeDate * 1000).toISOString().slice(0, 10), target: tg && tg > 0 ? tg : null });
    }
    const n = buy + hold + sell;
    if (!n && !bank.length) return null;
    const B = n ? buy : bank.filter((b) => b.arah === 'buy').length, Hh = n ? hold : bank.filter((b) => b.arah === 'hold').length, S = n ? sell : bank.filter((b) => b.arah === 'sell').length;
    return { buy: B, hold: Hh, sell: S, n: B + Hh + S, konsensus: B >= Hh && B >= S ? 'BUY' : S > B && S >= Hh ? 'SELL' : 'HOLD', target: raw(fd.targetMeanPrice), tinggi: raw(fd.targetHighPrice), rendah: raw(fd.targetLowPrice), bank: bank.slice(0, 30), sumber: 'Yahoo Finance' };
}
export async function ambilAnalis(s: string): Promise<Analis | null> {
    return simpan(`an:${s}`, 12 * 3600_000, async () => {
        // Yahoo dulu (ada rincian per bank); kalau gagal / tanpa rincian bank, Nasdaq.
        let y: Analis | null = null;
        try { y = await analisYahoo(s); } catch (e: any) { console.warn('[Analis] Yahoo:', String(e?.message || e).slice(0, 120)); }
        if (y && y.bank.length) return y;
        const nq = await analisNasdaq(s).catch(() => null);
        if (!nq) return y;
        if (y) return { ...y, bank: nq.bank.length ? nq.bank : y.bank };
        return nq;
    });
}
async function analisNasdaq(s: string): Promise<Analis | null> {
    {
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
    }
}

/* ── Sentimen berita 7/14/30 hari ── */
export interface Sentimen { at: number; jendela: Record<'7' | '14' | '30', { n: number; pos: number; neg: number; netral: number; skor: number | null }>; sumber: string; judul?: Array<{ t: string; tgl: string; media: string; nada: number }> }
export async function ambilSentimen(s: string): Promise<Sentimen> {
    return simpan(`se:${s}`, 3 * 3600_000, async () => {
        const q = encodeURIComponent(`${s.replace('-', '.')} stock`);
        const res = await fetch(`https://news.google.com/rss/search?q=${q}+when:30d&hl=en-US&gl=US&ceid=US:en`, { headers: { 'User-Agent': UA_BROWSER }, signal: AbortSignal.timeout(15_000) });
        if (!res.ok) throw new Error(`Google News HTTP ${res.status}`);
        const xml = await res.text();
        const tag = (it: string, t: string) => (it.match(new RegExp(`<${t}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${t}>`)) || [])[1]?.trim() || '';
        const un = (x: string) => x.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
        const item = (xml.match(/<item>[\s\S]*?<\/item>/g) || []).map((it) => { const t = un(tag(it, 'title')); const media = un((it.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1] || ''); return { at: Date.parse(tag(it, 'pubDate')) || 0, s: sentimen(t), t: media ? t.replace(new RegExp(`\\s+-\\s+${media.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '') : t, media }; }).filter((x) => x.at);
        const jendela = {} as Sentimen['jendela'];
        for (const h of ['7', '14', '30'] as const) {
            const xs = item.filter((x) => x.at >= Date.now() - +h * 86400_000);
            const pos = xs.filter((x) => x.s > 0).length, neg = xs.filter((x) => x.s < 0).length;
            // 0–100: 50 = seimbang; tiap berita positif/negatif menggeser ke arahnya (berita netral meredam).
            jendela[h] = { n: xs.length, pos, neg, netral: xs.length - pos - neg, skor: xs.length ? Math.round(50 + 50 * (pos - neg) / xs.length) : null };
        }
        const judul = item.filter((x) => x.at >= Date.now() - 8 * 86400_000).sort((a, b) => b.at - a.at).slice(0, 18).map((x) => ({ t: x.t, tgl: new Date(x.at).toISOString().slice(0, 10), media: x.media, nada: x.s }));
        return { at: Date.now(), jendela, sumber: 'Google News', judul };
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
export interface Insight { s: string; judul: string; ringkas: string; berita?: string[]; fundTek: string; pantau: string; saran?: string; dibuat: number; model: string }
const dirInsight = (dataDir: string) => path.join(dataDir, 'insight');
export function bacaInsight(dataDir: string, s: string): Insight | null {
    try { const x = JSON.parse(fs.readFileSync(path.join(dirInsight(dataDir), `${s}.json`), 'utf8')) as Insight; return Date.now() - x.dibuat < 7 * 86400_000 ? x : null; } catch { return null; }
}
type Llm = { complete(system: string, user: string, maxTokens?: number, attempts?: number): Promise<string | null> } | null | undefined;
export async function buatInsight(dataDir: string, s: string, fakta: string, llm: Llm, cadangan?: (prompt: string) => Promise<string>): Promise<Insight> {
    if (!llm && !cadangan) throw new Error('AI belum tersedia');
    // Format berlabel (lebih tahan untuk AI gratis daripada JSON): JUDUL / RINGKAS / FUNDTEK / PANTAU. Dicoba hingga 2×.
    const sistem = [
        'Kamu analis saham senior di kantor Pak Rico. Tulis "Weekly Insight" untuk satu saham AS dalam bahasa Indonesia: hidup, bercerita, dan bisa ditindaklanjuti — seperti catatan analis untuk klien, bukan daftar angka.',
        '',
        'GAYA (wajib):',
        '- Ceritakan SEBAB-AKIBAT: apa yang terjadi, kenapa (sebut peristiwa/berita/pihaknya dengan nama), dan apa artinya bagi pemegang saham. Contoh nada: "Harga turun 8,7% minggu ini, terseret aturan ekspor chip baru ke China dan aksi ambil untung di saham AI."',
        '- Angka selalu dengan satuan yang benar: harga pakai $ (mis. $457,01), perubahan pakai % (bukan "poin"). Bulatkan 2 desimal.',
        '- Bandingkan dengan konteks: kinerja vs S&P 500 & sektor, posisi terhadap MA50/MA200 dalam %, jarak dari puncak/dasar 52 minggu.',
        '- Berita: pilih yang PALING berdampak (laporan laba, regulasi, pergantian pimpinan, akuisisi, kontrak besar, langkah institusi/orang dalam, perubahan rating analis). Jelaskan dampaknya, jangan menghitung jumlah berita positif/negatif.',
        '- Yang perlu dipantau: kalimat arahan yang jelas ("Pantau…", "Waspadai jika…", "Konfirmasi naik kalau…"), dengan TANGGAL katalis bila ada di data (laporan laba, ex-dividend) dan LEVEL harga dari data (penyangga/hambatan dari MA, terendah/tertinggi 20 & 52 hari, target analis). Beri skenario: "kalau tembus $X → …, kalau jatuh di bawah $Y → …".',
        '- Saran kantor: sikap praktis untuk dua orang — yang BELUM punya dan yang SUDAH pegang — dikaitkan dengan sinyal 4 faktor kantor, tahap pantul (bila ada), dan risikonya. Singkat, tegas, tanpa janji untung.',
        '',
        'KEJUJURAN (wajib): pakai HANYA fakta & angka dari DATA. Jangan mengarang peristiwa, nama, tanggal, atau angka. Klaim dari judul berita tulis sebagai "menurut berita …". Kalau suatu data tidak ada, lewati — jangan menebak.',
        '',
        'Balas PERSIS dengan bagian berlabel berikut, tanpa teks lain:',
        'JUDUL: satu kalimat headline yang menangkap inti minggu ini (sebab → akibat), maks 16 kata',
        'RINGKAS: 4–5 kalimat cerita minggu ini: gerak harga (minggu & bulan), pemicu utamanya, gerak institusi/orang dalam/analis bila ada, dan konteks sektor/pasar',
        'BERITA: 2–4 butir, tiap butir diawali "- ": judul peristiwa singkat → dampaknya bagi saham (1 kalimat)',
        'FUNDTEK: 4–5 kalimat: posisi teknikal (MA50/MA200 dalam %, golden/death cross, RSI, MACD, volume) lalu valuasi & kualitas (PER/forward PER/PEG, ROE, margin, pertumbuhan, utang) dibanding wajar',
        'PANTAU: 3–4 kalimat arahan: katalis bertanggal, level harga kunci + skenario tembus/jatuh, dan risiko utama',
        'SARAN: 2–3 kalimat sikap kantor: "Belum punya: …" dan "Sudah pegang: …", plus satu syarat yang membatalkan pandangan ini',
        'Ini analisis, bukan saran keuangan.'
    ].join('\n');
    const bagian = (t: string, label: string) => {
        const m = t.match(new RegExp(`(?:^|\\n)[*#\\s-]*${label}\\**\\s*:\\s*\\**\\s*([\\s\\S]*?)(?=\\n\\W*(?:JUDUL|RINGKAS|BERITA|FUNDTEK|PANTAU|SARAN)\\W*:|$)`, 'i'));
        return (m?.[1] || '').replace(/\*\*/g, '').trim();
    };
    let j: any = null, kosong = 0, galatCadangan = '';
    // Percobaan 1: AI gratis. Percobaan 2: AI tim trading lewat Hermes (jalur chat) — tidak bergantung kuota AI gratis.
    for (let coba = 0; coba < 2 && !j; coba++) {
        let out = '';
        if (coba === 0 && llm) out = String((await llm.complete(sistem, fakta, 2200, 2)) || '');
        else if (cadangan) { try { out = await cadangan(`${sistem}\n\nDATA:\n${fakta}`); } catch (e: any) { galatCadangan = String(e?.message || e).slice(0, 160); } }
        else if (llm) out = String((await llm.complete(sistem, fakta, 2200, 2)) || '');
        if (!out.trim()) { kosong++; continue; }
        const r = { judul: bagian(out, 'JUDUL'), ringkas: bagian(out, 'RINGKAS'), berita: bagian(out, 'BERITA').split('\n').map((x) => x.replace(/^[\s*•\-–]+/, '').trim()).filter(Boolean).slice(0, 5), fundTek: bagian(out, 'FUNDTEK'), pantau: bagian(out, 'PANTAU'), saran: bagian(out, 'SARAN') };
        if (r.ringkas) { j = r; break; }
        // Cadangan: AI membalas JSON.
        try { const m = out.match(/\{[\s\S]*\}/); const x = m ? JSON.parse(m[0]) : null; if (x?.ringkas) j = x; } catch { /* coba lagi */ }
    }
    if (!j) throw new Error(galatCadangan ? `AI gratis penuh dan AI tim trading gagal (${galatCadangan}). Coba lagi beberapa menit lagi.` : kosong === 2 ? 'AI sedang penuh. Coba lagi beberapa menit lagi.' : 'AI tidak memberi jawaban yang bisa dibaca. Coba lagi sebentar.');
    const x: Insight = { s, judul: String(j.judul || '').slice(0, 180), ringkas: String(j.ringkas || ''), berita: Array.isArray(j.berita) ? j.berita.map(String) : [], fundTek: String(j.fundTek || ''), pantau: String(j.pantau || ''), saran: String(j.saran || ''), dibuat: Date.now(), model: 'AI kantor' };
    fs.mkdirSync(dirInsight(dataDir), { recursive: true });
    fs.writeFileSync(path.join(dirInsight(dataDir), `${s}.json`), JSON.stringify(x));
    return x;
}

/* ── Corporate actions: akan datang & 12 bulan terakhir ── */
export interface Aksi { jenis: 'dividen' | 'split' | 'laba' | 'akuisisi' | 'perjanjian' | 'direksi' | 'saham' | 'utang' | 'restrukturisasi' | 'rups' | 'lain'; tgl: string; judul: string; detail: string; url?: string }
export interface AksiData { akanDatang: Aksi[]; lampau: Aksi[]; dividen12: number | null; sumber: string[] }
const tglIso = (x: any) => {
    const v = String(x || '').trim(), m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // format Nasdaq MM/DD/YYYY — dibaca apa adanya, tanpa zona waktu
    if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    const t = Date.parse(v); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : '';
};
const ITEM_8K: Record<string, [Aksi['jenis'], string]> = {
    '1.01': ['perjanjian', 'Perjanjian material'], '1.02': ['perjanjian', 'Perjanjian material diakhiri'], '2.01': ['akuisisi', 'Akuisisi / penjualan aset selesai'],
    '2.02': ['laba', 'Laporan laba kuartalan'], '2.03': ['utang', 'Utang / kewajiban baru'], '2.05': ['restrukturisasi', 'Restrukturisasi / PHK'],
    '3.02': ['saham', 'Penerbitan saham baru'], '3.03': ['saham', 'Perubahan hak pemegang saham'], '5.01': ['akuisisi', 'Perubahan pengendali perusahaan'],
    '5.02': ['direksi', 'Pergantian direksi / eksekutif'], '5.03': ['lain', 'Perubahan anggaran dasar'], '5.07': ['rups', 'Hasil rapat pemegang saham (RUPS)']
};
let cikCache: { at: number; m: Map<string, number> } | null = null;
async function cikDari(s: string): Promise<number | null> {
    if (!cikCache || Date.now() - cikCache.at > 7 * 86400_000) {
        const map = await secJson('https://www.sec.gov/files/company_tickers.json');
        if (map) { const m = new Map<string, number>(); for (const k of Object.keys(map)) m.set(String(map[k].ticker).toUpperCase().replace('.', '-'), Number(map[k].cik_str)); cikCache = { at: Date.now(), m }; }
    }
    return cikCache?.m.get(s) ?? null;
}
let labaCache: { at: number; m: Map<string, { tgl: string; waktu: string }> } | null = null;
let labaJalan: Promise<void> | null = null;
/** Kalender laba 3 minggu (±15 permintaan) diambil di latar; halaman menunggu paling lama 3 detik. */
async function labaUntuk(s: string) {
    if ((!labaCache || Date.now() - labaCache.at > 12 * 3600_000) && !labaJalan) {
        labaJalan = kalenderLaba(21).then((m) => { labaCache = { at: Date.now(), m }; }).catch(() => { /* coba lagi lain kali */ }).finally(() => { labaJalan = null; });
    }
    if (!labaCache && labaJalan) await Promise.race([labaJalan, new Promise((r) => setTimeout(r, 3000))]);
    return labaCache?.m.get(s) ?? null;
}
export async function ambilAksi(s: string, harga: number | null): Promise<AksiData> {
    return simpan(`ak:${s}`, 6 * 3600_000, async () => {
        const kini = new Date().toISOString().slice(0, 10), setahun = new Date(Date.now() - 365 * 86400_000).toISOString().slice(0, 10);
        const akan: Aksi[] = [], lampau: Aksi[] = [], sumber: string[] = [];
        const usd = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
        // Dividen (Nasdaq: termasuk yang sudah diumumkan tapi belum dibayar).
        const dividenTgl = new Set<string>();
        try {
            const d = await nasdaq(`https://api.nasdaq.com/api/quote/${sym(s)}/dividends?assetclass=stocks`);
            for (const r of d?.dividends?.rows || []) {
                const ex = tglIso(r.exOrEffDate), bayar = tglIso(r.paymentDate), umum = tglIso(r.declarationDate), v = nilai(r.amount);
                if (!ex || v == null) continue;
                const it: Aksi = { jenis: 'dividen', tgl: ex, judul: `Dividen ${usd(v)} per lembar`, detail: [`Ex-dividend ${ex}`, bayar && `dibayar ${bayar}`, umum && `diumumkan ${umum}`, r.type && String(r.type).toLowerCase() !== 'cash' && String(r.type)].filter(Boolean).join(' · ') };
                if (ex >= kini || (bayar && bayar >= kini)) akan.push(it); else if (ex >= setahun) lampau.push(it);
                dividenTgl.add(ex);
            }
            sumber.push('Nasdaq');
        } catch { /* cadangan Yahoo di bawah */ }
        // Dividen & split lampau (Yahoo, 1 tahun).
        try {
            const r = await yahooChart(s, '1y', '1d');
            for (const x of Object.values<any>(r.events?.dividends || {})) {
                const t = new Date(x.date * 1000).toISOString().slice(0, 10);
                if (!dividenTgl.has(t) && t >= setahun) lampau.push({ jenis: 'dividen', tgl: t, judul: `Dividen ${usd(x.amount)} per lembar`, detail: `Ex-dividend ${t}` });
            }
            for (const x of Object.values<any>(r.events?.splits || {})) {
                const t = new Date(x.date * 1000).toISOString().slice(0, 10), rev = x.numerator < x.denominator;
                lampau.push({ jenis: 'split', tgl: t, judul: `${rev ? 'Reverse split' : 'Stock split'} ${x.numerator} : ${x.denominator}`, detail: rev ? `${x.denominator} lembar digabung jadi ${x.numerator}; harga per lembar naik sebanding.` : `1 lembar menjadi ${x.numerator / x.denominator}; harga per lembar turun sebanding.` });
            }
            if (!sumber.includes('Yahoo')) sumber.push('Yahoo');
        } catch { /* lewati */ }
        // Split yang akan datang (kalender split Nasdaq).
        try {
            const c = await nasdaq('https://api.nasdaq.com/api/calendar/splits');
            for (const r of c?.rows || []) {
                if (String(r.symbol || '').toUpperCase().replace('.', '-') !== s) continue;
                const t = tglIso(r.executionDate || r.payableDate);
                if (t && t >= kini) akan.push({ jenis: 'split', tgl: t, judul: `Stock split ${r.ratio || ''}`.trim(), detail: [`Berlaku ${t}`, tglIso(r.announcedDate) && `diumumkan ${tglIso(r.announcedDate)}`].filter(Boolean).join(' · ') });
            }
        } catch { /* lewati */ }
        // Jadwal laporan laba berikutnya (kalender Nasdaq 3 minggu, disimpan 12 jam untuk semua saham).
        try {
            const l = await labaUntuk(s);
            if (l) akan.push({ jenis: 'laba', tgl: l.tgl, judul: 'Laporan laba kuartalan', detail: `Diumumkan ${l.tgl}${l.waktu ? `, ${l.waktu}` : ''}. Harga biasanya bergerak lebih liar di sekitar tanggal ini.` });
        } catch { /* lewati */ }
        // Peristiwa resmi 8-K (SEC), 12 bulan.
        try {
            const cik = await cikDari(s);
            if (cik) {
                const f: any = (await secJson(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, '0')}.json`))?.filings?.recent;
                if (f) {
                    for (let i = 0; i < (f.form || []).length && i < 400; i++) {
                        if (f.form[i] !== '8-K' || f.filingDate[i] < setahun) continue;
                        const items = String(f.items?.[i] || '').split(',').map((x: string) => x.trim()).filter((x: string) => ITEM_8K[x]);
                        if (!items.length) continue;
                        const [jenis] = ITEM_8K[items[0]];
                        const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${String(f.accessionNumber[i]).replace(/-/g, '')}/${f.primaryDocument[i]}`;
                        lampau.push({ jenis, tgl: f.filingDate[i], judul: items.map((x: string) => ITEM_8K[x][1]).join(' · '), detail: `Laporan 8-K ke SEC`, url });
                    }
                    sumber.push('SEC');
                }
            }
        } catch { /* lewati */ }
        akan.sort((a, b) => a.tgl.localeCompare(b.tgl)); lampau.sort((a, b) => b.tgl.localeCompare(a.tgl));
        const tot = lampau.filter((x) => x.jenis === 'dividen').reduce((a, x) => a + (nilai(x.judul.match(/\$[\d.,]+/)?.[0]) ?? 0), 0);
        return { akanDatang: akan, lampau: lampau.slice(0, 60), dividen12: tot > 0 ? +tot.toFixed(4) : null, sumber };
    });
}
