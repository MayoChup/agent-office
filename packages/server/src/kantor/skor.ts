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
export interface Faktor { skor: number; label: Label; alasan: string[] }
export interface Target { nama: 'Konservatif' | 'Moderat' | 'Agresif'; harga: number; pct: number; peluang: number; nilai: number }
export interface Proyeksi { horizon: number; target: Target[]; stop: { harga: number; pct: number; peluang: number }; peluangNaik: number; terbaik: Target['nama']; rr: number }
export interface Ekstra {
    spark: number[]; mom: { w1: number; m1: number; m3: number }; atr: number; cmf: number; obv: number; trenLabel: string; proyeksi: Proyeksi | null;
}
export interface Berita { skor: number | null; n: number; judul: Array<{ t: string; s: number; tgl: string; url: string }>; at: number }
export interface Orang { net: number; beli: number; jual: number; n: number; at: number }

export function label(s: number): Label {
    return s >= 0.45 ? 'Beli kuat' : s >= 0.15 ? 'Beli' : s > -0.15 ? 'Tahan' : s > -0.45 ? 'Jual' : 'Jual kuat';
}
const clamp = (x: number) => Math.max(-1, Math.min(1, x));
const pct = (a: number, b: number) => (b ? (a / b - 1) * 100 : 0);

/* ── Ekstra dari OHLCV ─────────────────────────────────────── */
export function ekstra(o: number[], h: number[], l: number[], c: number[], v: number[], ma50: number | null, ma200: number | null): Ekstra {
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
    return { spark, mom, atr: +atr.toFixed(3), cmf: +cmf.toFixed(3), obv: +obvN.toFixed(3), trenLabel, proyeksi: proyeksi(h, l, c, atr) };
}

/** Peluang historis: dari setiap hari dalam ±1 tahun terakhir, seberapa jauh harga sempat naik/turun dalam 20 sesi berikutnya. */
export function proyeksi(h: number[], l: number[], c: number[], atr: number, H = 20): Proyeksi | null {
    const n = c.length;
    const ups: number[] = [], downs: number[] = []; let naik = 0;
    for (let i = Math.max(0, n - 1 - 250); i < n - H; i++) {
        let mx = -Infinity, mn = Infinity;
        for (let k = i + 1; k <= i + H; k++) { if (h[k] > mx) mx = h[k]; if (l[k] < mn) mn = l[k]; }
        ups.push(mx / c[i] - 1); downs.push(mn / c[i] - 1);
        if (c[i + H] > c[i]) naik++;
    }
    if (ups.length < 60) return null;
    const sorted = [...ups].sort((a, b) => a - b);
    const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))];
    const peluang = (g: number) => ups.filter((u) => u >= g).length / ups.length;
    const last = c[n - 1];
    const mk = (nama: Target['nama'], p: number): Target => {
        const g = Math.max(0.005, q(p));
        const pl = peluang(g);
        return { nama, harga: +(last * (1 + g)).toFixed(2), pct: +(g * 100).toFixed(1), peluang: Math.round(pl * 100), nilai: +(pl * g * 100).toFixed(2) };
    };
    const target = [mk('Konservatif', 0.3), mk('Moderat', 0.5), mk('Agresif', 0.72)];
    const risk = Math.min(0.25, (2 * atr) / last);
    const stopHit = downs.filter((d) => d <= -risk).length / downs.length;
    const terbaik = target.reduce((a, t) => (t.nilai > a.nilai ? t : a), target[0]);
    return {
        horizon: H, target,
        stop: { harga: +(last * (1 - risk)).toFixed(2), pct: +(-risk * 100).toFixed(1), peluang: Math.round(stopHit * 100) },
        peluangNaik: Math.round((naik / ups.length) * 100), terbaik: terbaik.nama, rr: +(terbaik.pct / (risk * 100)).toFixed(2)
    };
}

/* ── Skor per faktor ───────────────────────────────────────── */
export function skorTeknikal(b: any): Faktor {
    const s = b.sinyal, a: string[] = []; let x = 0;
    const add = (v: number, why: string) => { x += v; a.push(`${v > 0 ? '+' : '−'} ${why}`); };
    if (s.tren === 'naik') add(0.3, 'tren naik rapi (harga > MA50 > MA200)'); else if (s.tren === 'turun') add(-0.3, 'tren turun (harga < MA50 < MA200)');
    if (s.diAtasMa200) add(0.12, 'di atas MA200'); else if (b.ma200) add(-0.12, 'di bawah MA200');
    if (s.goldenCross != null) add(0.25, `golden cross ${s.goldenCross} hari lalu`);
    if (s.deathCross != null) add(-0.25, `death cross ${s.deathCross} hari lalu`);
    if (s.macdBullish != null) add(0.12, 'MACD memotong naik'); if (s.macdBearish != null) add(-0.12, 'MACD memotong turun');
    if (s.doubleBottom) add(s.doubleBottom === 'terkonfirmasi' ? 0.3 : 0.15, `double bottom ${s.doubleBottom}`);
    if (s.doubleTop) add(s.doubleTop === 'terkonfirmasi' ? -0.3 : -0.15, `double top ${s.doubleTop}`);
    if (s.breakout52) add(0.18, 'tembus tertinggi 52 minggu');
    if (s.dekat52Low) add(-0.08, 'dekat terendah 52 minggu');
    if (b.rsi != null && b.rsi < 30) add(0.1, `RSI ${b.rsi} jenuh jual (peluang memantul)`);
    if (b.rsi != null && b.rsi > 75) add(-0.12, `RSI ${b.rsi} jenuh beli`);
    if (b.chg1m > 8) add(0.08, `naik ${b.chg1m}% sebulan`); else if (b.chg1m < -8) add(-0.08, `turun ${Math.abs(b.chg1m)}% sebulan`);
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
    if (x.cmf > 0.08) add(Math.min(0.35, x.cmf * 2), `dana masuk (CMF ${x.cmf})`); else if (x.cmf < -0.08) add(Math.max(-0.35, x.cmf * 2), `dana keluar (CMF ${x.cmf})`);
    if (x.obv > 0.15) add(0.15, 'volume hari naik > hari turun (OBV naik)'); else if (x.obv < -0.15) add(-0.15, 'volume hari turun > hari naik (OBV turun)');
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

export function gabung(f: Record<string, Faktor | null>): Faktor {
    const W: Record<string, number> = { teknikal: 0.35, fundamental: 0.25, berita: 0.15, whales: 0.25 };
    let s = 0, w = 0;
    for (const k of Object.keys(W)) if (f[k]) { s += f[k]!.skor * W[k]; w += W[k]; }
    const sk = w ? clamp(s / w) : 0;
    const ada = Object.keys(W).filter((k) => f[k]).length;
    return { skor: +sk.toFixed(2), label: label(sk), alasan: [`gabungan ${ada} faktor`] };
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
export async function ambilBerita(simbol: string): Promise<Berita> {
    const res = await fetch(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(simbol)}&region=US&lang=en-US`, { headers: { 'User-Agent': 'Mozilla/5.0 (KantorRico)' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const tag = (s: string, t: string) => (s.match(new RegExp(`<${t}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${t}>`)) || [])[1]?.trim() || '';
    const un = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
    const batas = Date.now() - 7 * 86400_000;
    const judul = (xml.match(/<item>[\s\S]*?<\/item>/g) || []).map((it) => {
        const t = un(tag(it, 'title')).slice(0, 200);
        const at = Date.parse(tag(it, 'pubDate')) || Date.now();
        return { t, s: sentimen(`${t} ${un(tag(it, 'description')).slice(0, 200)}`), tgl: new Date(at).toISOString().slice(0, 10), url: tag(it, 'link'), at };
    }).filter((j) => j.t && j.at >= batas).slice(0, 12);
    // Berita baru lebih berbobot.
    let sum = 0, w = 0;
    for (const j of judul) { const bobot = 1 + (j.at - batas) / (7 * 86400_000); sum += j.s * bobot; w += bobot; }
    return { skor: judul.length ? +(sum / w).toFixed(2) : null, n: judul.length, judul: judul.slice(0, 6).map(({ at, ...r }) => r), at: Date.now() };
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
