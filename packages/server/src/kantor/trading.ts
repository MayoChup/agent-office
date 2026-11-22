/**
 * Divisi Trading — mesin TANPA AI.
 *
 * 1. Menyusun strategi untuk saham di watchlist: harga masuk, stop loss (2× ATR),
 *    target (rasio untung:rugi), dan ukuran posisi sesuai modal & risiko.
 * 2. Mencatat eksekusi yang dilaporkan pemilik ("eksekusi #1 di 251").
 * 3. Memantau harga posisi terbuka tiap 5 menit selama bursa AS buka, lalu
 *    mengirim pesan Telegram saat target / stop loss tersentuh.
 *
 * Tidak pernah tersambung ke broker dan tidak pernah membeli/menjual apa pun.
 * Kalender NYSE & aturan jam musim panas diambil dari trader-skill (MIT, Jake Schincariol).
 */
import fs from 'fs';
import path from 'path';

export interface Plan {
    id: number;
    symbol: string;
    entry: number;
    stop: number;
    target: number;
    atr: number;
    shares: number;          // boleh pecahan (broker seperti Gotrade/Pluang mendukung)
    dollars: number;
    riskDollars: number;
    trend: string;
    createdAt: string;
}

/** Hari bursa (Senin–Jumat, waktu New York) yang sudah lewat sejak posisi dibuka — hari buka tidak dihitung. Libur bursa belum dikurangi. */
export function hariBursaSejak(openedAt: string, kini = Date.now()): number {
    const ny = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
    const awal = ny(Date.parse(openedAt)), akhir = ny(kini);
    let n = 0;
    for (let t = Date.parse(`${awal}T12:00:00Z`) + 86400_000; ; t += 86400_000) {
        const d = new Date(t).toISOString().slice(0, 10); if (d > akhir) break;
        const w = new Date(t).getUTCDay(); if (w !== 0 && w !== 6) n++;
        if (n > 400) break;
    }
    return n;
}
/** Status masa pegang sesuai gaya sinyal saat beli (H hari bursa). */
export function masaPegang(p: { openedAt: string; ai?: { H?: number } }) {
    const H = p.ai?.H; if (!H) return null;
    const hari = hariBursaSejak(p.openedAt);
    return { H, hari, sisa: Math.max(0, H - hari), status: hari > H ? 'lewat' as const : hari === H ? 'terakhir' as const : 'jalan' as const };
}

export interface Position {
    symbol: string;
    shares: number;
    entry: number;
    stop: number;
    target: number;
    openedAt: string;
    planId?: number;
    notified?: { stop?: string; target?: string; durasi?: string };
    /** Trailing stop: stop awal saat beli, dan catatan kenaikan terakhir. */
    stopAwal?: number;
    trail?: { at: string; n: number; puncak: number; atr: number; mult: number };
    closedAt?: string;
    exit?: number;
    pnl?: number;
    /** Portofolio: profil target, catatan sinyal AI saat beli (untuk menilai "hasil pakai AI"). */
    profil?: 'konservatif' | 'moderat' | 'agresif' | 'kustom';
    ai?: { label?: string; skor?: number; mode?: string; H?: number; pt?: string; pf?: string };
    catatan?: string;
}

/** Arus dana portofolio: modal awal, suntik dana (setor), tarik dana. */
export interface Dana { id: string; tgl: string; jenis: 'awal' | 'setor' | 'tarik'; jumlah: number; catatan?: string }

export interface TradingState {
    capital: number;          // USD
    riskPct: number;          // % modal yang siap hilang per transaksi
    maxPositionPct: number;   // batas satu saham terhadap modal
    atrMult: number;
    rewardRisk: number;
    watchlist: string[];
    plans: Plan[];
    positions: Position[];
    history: Position[];
    dana?: Dana[];
    lastPlansDate?: string;
    lastTrailDate?: string;
}

const DEFAULT_STATE: TradingState = {
    capital: 1000,
    riskPct: 1,
    maxPositionPct: 25,
    atrMult: 2,
    rewardRisk: 2,
    watchlist: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'KO', 'JPM', 'V', 'COST'],
    plans: [],
    positions: [],
    history: []
};

// ───────────────────────── Kalender NYSE ─────────────────────────

const NYSE_HOLIDAYS = new Set([
    '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
    '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24'
]);
const NYSE_EARLY_CLOSE = new Set(['2026-11-27', '2026-12-24', '2027-11-26']);

function nthSunday(year: number, month: number, n: number): number {
    const first = new Date(Date.UTC(year, month - 1, 1));
    const offset = (7 - first.getUTCDay()) % 7;
    return 1 + offset + 7 * (n - 1);
}

/** Selisih jam New York terhadap UTC: -4 saat musim panas, -5 selain itu. */
export function easternOffset(utcMs: number): number {
    const d = new Date(utcMs);
    const y = d.getUTCFullYear();
    const start = Date.UTC(y, 2, nthSunday(y, 3, 2), 7);
    const end = Date.UTC(y, 10, nthSunday(y, 11, 1), 6);
    return utcMs >= start && utcMs < end ? -4 : -5;
}

export function marketOpen(utcMs = Date.now()): boolean {
    const et = new Date(utcMs + easternOffset(utcMs) * 3600_000);
    const day = et.getUTCDay();
    if (day === 0 || day === 6) return false;
    const iso = et.toISOString().slice(0, 10);
    if (NYSE_HOLIDAYS.has(iso)) return false;
    const mins = et.getUTCHours() * 60 + et.getUTCMinutes();
    const close = NYSE_EARLY_CLOSE.has(iso) ? 13 * 60 : 16 * 60;
    return mins >= 9 * 60 + 30 && mins < close;
}

/** Jam buka-tutup bursa hari ini dalam WIB, untuk ditampilkan. */
export function sessionWib(utcMs = Date.now()): string {
    const off = easternOffset(utcMs);
    const open = (9.5 - off + 7) % 24, close = (16 - off + 7) % 24;
    const f = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}.${h % 1 ? '30' : '00'}`;
    return `${f(open)}–${f(close)} WIB`;
}

// ───────────────────────── Data harga (Yahoo, gratis, tertunda ±15 menit) ─────────────────────────

import { yahooChart } from './screener';
import { hargaHarian } from './harga';

export interface Candle { t: number; o: number; h: number; l: number; c: number }

export async function fetchDaily(symbol: string): Promise<{ candles: Candle[]; price: number }> {
    let r: any;
    try { r = await yahooChart(symbol, '6mo', '1d'); } catch {
        const h = await hargaHarian(symbol);
        const rows = h.rows.slice(-130);
        return { candles: rows.map((x) => ({ t: Date.parse(x.t + 'T00:00:00Z') / 1000, o: x.o, h: x.h, l: x.l, c: x.c })), price: rows[rows.length - 1].c };
    }
    if (!r) throw new Error(`Saham ${symbol} tidak ditemukan`);
    const q = r.indicators?.quote?.[0] || {};
    const candles: Candle[] = (r.timestamp || []).map((t: number, i: number) => ({ t, o: q.open?.[i], h: q.high?.[i], l: q.low?.[i], c: q.close?.[i] }))
        .filter((k: Candle) => [k.o, k.h, k.l, k.c].every((v) => typeof v === 'number' && Number.isFinite(v)));
    const price = Number(r.meta?.regularMarketPrice) || candles[candles.length - 1]?.c;
    if (!candles.length || !price) throw new Error(`Data ${symbol} kosong`);
    return { candles, price };
}

export async function fetchPrice(symbol: string): Promise<number> {
    let p = 0;
    try { const r = await yahooChart(symbol, '1d', '1m'); p = Number(r?.meta?.regularMarketPrice); } catch { const h = await hargaHarian(symbol); p = h.rows[h.rows.length - 1].c; }
    if (!p) throw new Error(`Harga ${symbol} kosong`);
    return p;
}

/** Hitungan trailing stop (lihat TradingDesk.trailing). null = stop belum perlu dinaikkan. */
export function hitungTrailing(p: Pick<Position, 'entry' | 'stop' | 'openedAt' | 'ai'> & { target?: number }, candles: Candle[], harga: number) {
    const sejak = Date.parse(p.openedAt) / 1000 - 12 * 3600;
    const pasca = candles.filter((k) => k.t >= sejak);
    const a = atr(candles, 14);
    if (!pasca.length || !(a > 0)) return null;
    const H = p.ai?.H || 20, mult = H <= 5 ? 2 : H <= 20 ? 2.5 : 3;
    const puncak = Math.max(...pasca.map((k) => k.h));
    // Sudah 70% jalan ke target = sama kuatnya dengan naik 1,5 ATR: stop minimal di harga beli.
    const jarakT = p.target && p.target > p.entry ? p.target - p.entry : Infinity;
    if (puncak < p.entry + Math.min(a, 0.7 * jarakT)) return null;
    let calon = puncak - mult * a;
    const impas = puncak >= p.entry + Math.min(1.5 * a, 0.7 * jarakT);
    if (impas) calon = Math.max(calon, p.entry);
    calon = Math.min(calon, harga - 0.5 * a);
    // Impas tetap dipasang selama harga masih di atas harga beli (walau jaraknya < 0,5 ATR).
    if (impas && harga > p.entry) calon = Math.max(calon, p.entry);
    calon = r2(calon);
    if (calon <= p.stop + Math.max(0.25 * a, p.entry * 0.005)) return null;
    return { calon, puncak, a, mult };
}

export function atr(candles: Candle[], n = 14): number {
    const trs: number[] = [];
    for (let i = 1; i < candles.length; i++) {
        const k = candles[i], prev = candles[i - 1].c;
        trs.push(Math.max(k.h - k.l, Math.abs(k.h - prev), Math.abs(k.l - prev)));
    }
    const last = trs.slice(-n);
    return last.reduce((a, b) => a + b, 0) / Math.max(1, last.length);
}

const sma = (xs: number[], n: number) => xs.slice(-n).reduce((a, b) => a + b, 0) / Math.min(n, xs.length);
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Susun satu rencana trading dari data harian. Mengembalikan null kalau tren tidak mendukung. */
export function buildPlan(symbol: string, candles: Candle[], price: number, st: TradingState, id: number, ignoreTrend = false): Plan | null {
    const closes = candles.map((k) => k.c);
    const sma20 = sma(closes, 20), sma50 = sma(closes, 50);
    // Hanya beli saat tren naik: harga di atas rata-rata 50 hari dan rata-rata 20 di atas 50.
    const upTrend = price > sma50 && sma20 > sma50;
    if (!upTrend && !ignoreTrend) return null;
    const a = atr(candles);
    const riskPerShare = st.atrMult * a;
    if (!(riskPerShare > 0)) return null;
    const entry = r2(price);
    const stop = r2(entry - riskPerShare);
    const target = r2(entry + st.rewardRisk * riskPerShare);
    const riskDollars = (st.capital * st.riskPct) / 100;
    let shares = riskDollars / riskPerShare;
    const maxDollars = (st.capital * st.maxPositionPct) / 100;
    if (shares * entry > maxDollars) shares = maxDollars / entry;
    shares = Math.floor(shares * 100) / 100;
    if (shares <= 0) return null;
    const strength = (price / sma50 - 1) * 100;
    return {
        id, symbol, entry, stop, target, atr: r2(a), shares, dollars: r2(shares * entry),
        riskDollars: r2(shares * riskPerShare),
        trend: upTrend ? `naik (+${strength.toFixed(1)}% di atas rata-rata 50 hari)` : `⚠️ TIDAK naik (${strength >= 0 ? '+' : ''}${strength.toFixed(1)}% vs rata-rata 50 hari) — berisiko`,
        createdAt: new Date().toISOString()
    };
}

// ───────────────────────── Penyimpanan & perintah ─────────────────────────

export class TradingDesk {
    private file: string;
    /** Selain Telegram, kabar posisi juga masuk ke chat pribadi Dito di aplikasi (diisi index.ts). */
    keChat?: (text: string) => void;
    private async kabar(text: string) { try { this.keChat?.(text); } catch { /* */ } await this.notify(text); }
    constructor(dataDir: string, private notify: (text: string) => Promise<void>, private deskDir = '') {
        this.file = path.join(dataDir, 'trading.json');
    }

    load(): TradingState {
        try { return { ...DEFAULT_STATE, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) }; } catch { return { ...DEFAULT_STATE }; }
    }
    save(st: TradingState) {
        fs.writeFileSync(this.file + '.tmp', JSON.stringify(st, null, 2));
        fs.renameSync(this.file + '.tmp', this.file);
        // Salin posisi ke folder kerja trader-skill (dipakai skill news/alerts/budget milik AI).
        if (this.deskDir) {
            try {
                const dir = path.join(this.deskDir, 'trader');
                fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(path.join(dir, 'portfolio.json'), JSON.stringify({
                    cash: null,
                    positions: st.positions.map((p) => ({ ticker: p.symbol, shares: p.shares, entry: p.entry, target: p.target, stop: p.stop, opened: p.openedAt.slice(0, 10) }))
                }, null, 2));
            } catch { /* tidak penting */ }
        }
    }

    async strategi(maxPlans = 3): Promise<string> {
        const st = this.load();
        const candidates: Plan[] = [];
        const errors: string[] = [];
        for (const sym of st.watchlist) {
            if (st.positions.some((p) => p.symbol === sym)) continue;   // sudah dipegang
            try {
                const { candles, price } = await fetchDaily(sym);
                const p = buildPlan(sym, candles, price, st, 0);
                if (p) candidates.push(p);
            } catch (e: any) { errors.push(`${sym}: ${e?.message || e}`); }
            await new Promise((r) => setTimeout(r, 500));
        }
        candidates.sort((a, b) => parseFloat(b.trend.match(/\+([\d.]+)/)?.[1] || '0') - parseFloat(a.trend.match(/\+([\d.]+)/)?.[1] || '0'));
        st.plans = candidates.slice(0, maxPlans).map((p, i) => ({ ...p, id: i + 1 }));
        st.lastPlansDate = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
        this.save(st);
        if (!st.plans.length) {
            return `📉 Hari ini belum ada saham di watchlist yang trennya naik dengan rapi. Lebih baik menunggu.` + (errors.length ? `\n(${errors.length} saham gagal diambil datanya)` : '');
        }
        const lines = st.plans.map((p) => {
            const up = ((p.target / p.entry - 1) * 100).toFixed(1), down = ((1 - p.stop / p.entry) * 100).toFixed(1);
            return `📈 Strategi #${p.id} – ${p.symbol}\n` +
                `Masuk ±$${p.entry} · Target $${p.target} (+${up}%) · Stop $${p.stop} (−${down}%)\n` +
                `Ukuran: ${p.shares} lembar (≈$${p.dollars}) · risiko maks $${p.riskDollars}\n` +
                `Tren ${p.trend}`;
        });
        return `🧭 Strategi trading (modal $${st.capital}, risiko ${st.riskPct}%/transaksi, rasio 1:${st.rewardRisk})\n` +
            `Bursa AS buka ${sessionWib()}.\n\n${lines.join('\n\n')}\n\n` +
            `Sudah beli? Balas: "eksekusi #1 di 251" (ganti nomor & harga belinya).\n` +
            `Ini rumus, bukan jaminan untung. Pasang juga stop loss di aplikasi broker.`;
    }

    /** Hitung rencana untuk saham pilihan (dipakai AI setelah menganalisis). */
    async rencana(symbols: string[]): Promise<string> {
        const st = this.load();
        const out: string[] = [];
        let nextId = Math.max(0, ...st.plans.map((p) => p.id)) + 1;
        for (const raw of symbols.slice(0, 5)) {
            const sym = raw.toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
            if (!sym) continue;
            try {
                const { candles, price } = await fetchDaily(sym);
                const forced = buildPlan(sym, candles, price, st, nextId)
                    || buildPlan(sym, candles, price, { ...st }, nextId, true);
                if (!forced) { out.push(`${sym}: tidak bisa dihitung (data kurang)`); continue; }
                st.plans = st.plans.filter((p) => p.symbol !== sym).concat(forced);
                nextId++;
                const up = ((forced.target / forced.entry - 1) * 100).toFixed(1), down = ((1 - forced.stop / forced.entry) * 100).toFixed(1);
                out.push(`#${forced.id} ${sym} · masuk ±$${forced.entry} · target $${forced.target} (+${up}%) · stop $${forced.stop} (−${down}%) · ${forced.shares} lembar (≈$${forced.dollars}, risiko maks $${forced.riskDollars}) · tren ${forced.trend}`);
            } catch (e: any) { out.push(`${sym}: ${e?.message || e}`); }
            await new Promise((r) => setTimeout(r, 500));
        }
        st.lastPlansDate = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
        this.save(st);
        return out.join('\n') + `\n(modal $${st.capital}, risiko ${st.riskPct}%/transaksi, rasio 1:${st.rewardRisk}; bursa buka ${sessionWib()})`;
    }

    eksekusi(ref: string, price: number, shares?: number): string {
        const st = this.load();
        const n = Number(ref.replace('#', ''));
        const plan = Number.isFinite(n) && n > 0 ? st.plans.find((p) => p.id === n) : st.plans.find((p) => p.symbol === ref.toUpperCase());
        if (!plan) return `❌ Strategi "${ref}" tidak ditemukan. Lihat daftar dengan: strategi`;
        const riskDist = plan.entry - plan.stop, rewardDist = plan.target - plan.entry;
        const pos: Position = {
            symbol: plan.symbol, shares: shares || plan.shares, entry: r2(price),
            stop: r2(price - riskDist), target: r2(price + rewardDist), openedAt: new Date().toISOString(), planId: plan.id, notified: {}
        };
        st.positions = st.positions.filter((p) => p.symbol !== pos.symbol).concat(pos);
        this.save(st);
        return `✅ Tercatat: ${pos.symbol} ${pos.shares} lembar @ $${pos.entry}\n` +
            `Alert aktif → 🟢 target $${pos.target} · 🔴 stop $${pos.stop}\n` +
            `Dipantau tiap 5 menit saat bursa buka (${sessionWib()}).`;
    }

    pasang(symbol: string, price: number, target: number, stop: number, shares = 0): string {
        const st = this.load();
        const pos: Position = { symbol: symbol.toUpperCase(), shares, entry: r2(price), stop: r2(stop), target: r2(target), openedAt: new Date().toISOString(), notified: {} };
        st.positions = st.positions.filter((p) => p.symbol !== pos.symbol).concat(pos);
        this.save(st);
        return `✅ Tercatat: ${pos.symbol}${shares ? ` ${shares} lembar` : ''} @ $${pos.entry} · target $${pos.target} · stop $${pos.stop}`;
    }

    jual(symbol: string, price: number): string {
        const st = this.load();
        const i = st.positions.findIndex((p) => p.symbol === symbol.toUpperCase());
        if (i < 0) return `❌ Tidak ada posisi ${symbol.toUpperCase()} yang terbuka.`;
        const p = st.positions[i];
        const pnl = r2((price - p.entry) * (p.shares || 0));
        st.positions.splice(i, 1);
        st.history.push({ ...p, closedAt: new Date().toISOString(), exit: r2(price), pnl });
        this.save(st);
        const total = r2(st.history.reduce((a, h) => a + (h.pnl || 0), 0));
        return `${pnl >= 0 ? '🟢' : '🔴'} ${p.symbol} ditutup @ $${r2(price)} · ${pnl >= 0 ? 'untung' : 'rugi'} $${Math.abs(pnl)} (${((price / p.entry - 1) * 100).toFixed(1)}%)\n` +
            `Total hasil semua transaksi: $${total}`;
    }

    async posisi(): Promise<string> {
        const st = this.load();
        if (!st.positions.length) return 'Belum ada posisi terbuka.';
        const out: string[] = [];
        for (const p of st.positions) {
            let now = '';
            try {
                const price = await fetchPrice(p.symbol);
                const pl = (price - p.entry) * (p.shares || 0);
                now = ` · sekarang $${r2(price)} (${pl >= 0 ? '+' : '−'}$${Math.abs(r2(pl))})`;
            } catch { /* harga tidak wajib */ }
            out.push(`• ${p.symbol} ${p.shares} lembar @ $${p.entry} · target $${p.target} · stop $${p.stop}${now}`);
        }
        return `📊 Posisi terbuka:\n${out.join('\n')}`;
    }

    modal(capital?: number, riskPct?: number): string {
        const st = this.load();
        if (capital && capital > 0) st.capital = capital;
        if (riskPct && riskPct > 0 && riskPct <= 5) st.riskPct = riskPct;
        this.save(st);
        return `✅ Modal $${st.capital}, risiko ${st.riskPct}% per transaksi (maks $${r2(st.capital * st.riskPct / 100)}).`;
    }

    watchlist(action: 'tambah' | 'hapus' | 'lihat', symbols: string[] = []): string {
        const st = this.load();
        const up = symbols.map((s) => s.toUpperCase().replace(/[^A-Z0-9.\-]/g, '')).filter(Boolean);
        if (action === 'tambah') st.watchlist = Array.from(new Set([...st.watchlist, ...up]));
        if (action === 'hapus') st.watchlist = st.watchlist.filter((s) => !up.includes(s));
        if (action !== 'lihat') this.save(st);
        return `👀 Watchlist (${st.watchlist.length}): ${st.watchlist.join(', ')}`;
    }

    /** Cek posisi terbuka; kirim pesan sekali saat target/stop tersentuh. */
    async check(force = false): Promise<number> {
        if (!force && !marketOpen()) return 0;
        const st = this.load();
        let rang = 0;
        const impas: Array<{ symbol: string; openedAt: string; lama: number }> = [];
        for (const p of st.positions) {
            let price: number;
            try { price = await fetchPrice(p.symbol); } catch { continue; }
            p.notified = p.notified || {};
            const pl = (price - p.entry) * (p.shares || 0);
            const plTxt = p.shares ? ` · ${pl >= 0 ? 'untung' : 'rugi'} ±$${Math.abs(r2(pl))}` : '';
            if (price >= p.target && !p.notified.target) {
                p.notified.target = new Date().toISOString(); rang++;
                await this.kabar(`🟢 TARGET ${p.symbol} tercapai: $${r2(price)} (target $${p.target})${plTxt}\nKalau sudah jual, balas: "jual ${p.symbol} di ${r2(price)}"`);
            } else if (price <= p.stop && !p.notified.stop) {
                p.notified.stop = new Date().toISOString(); rang++;
                if (p.stop >= p.entry) await this.kabar(`🟡 TRAILING STOP ${p.symbol} kena: $${r2(price)} (stop $${p.stop}, di atas harga beli $${p.entry})${plTxt}. Untung yang sudah dikunci terpakai.\nKalau sudah jual, balas: "jual ${p.symbol} di ${r2(price)}"`);
                else await this.kabar(`🔴 STOP LOSS ${p.symbol} kena: $${r2(price)} (stop $${p.stop})${plTxt}\nKalau sudah jual, balas: "jual ${p.symbol} di ${r2(price)}"`);
            }
            // Sudah 70% jalan ke target → stop langsung dinaikkan ke harga beli (tidak menunggu pagi), supaya tidak balik jadi rugi.
            const jarakT = p.target - p.entry;
            if (!p.notified.target && !p.notified.stop && p.stop < p.entry && jarakT > 0 && price >= p.entry + 0.7 * jarakT) {
                impas.push({ symbol: p.symbol, openedAt: p.openedAt, lama: p.stop });
                p.stopAwal ??= p.stop; p.stop = p.entry; rang++;
                await this.kabar([
                    `🟡 ${p.symbol} sudah 70% jalan ke target: $${r2(price)} (beli $${p.entry}, target $${p.target}).`,
                    `Stop dinaikkan dari $${impas[impas.length - 1].lama} ke harga beli $${p.entry}: kalau harga balik turun, posisi ini paling buruk impas, tidak rugi.`,
                    'Ubah juga order stop di broker Bapak. Bukan saran keuangan.'
                ].join('\n'));
            }
            const mp = masaPegang(p);
            if (mp?.status === 'lewat' && !p.notified.durasi && !p.notified.target && !p.notified.stop) {
                p.notified.durasi = new Date().toISOString(); rang++;
                await this.kabar(`🟠 ${p.symbol} LEWAT DURASI: sudah ${mp.hari} hari bursa (rencana ${mp.H} hari) tanpa kena target/stop. Harga $${r2(price)}${plTxt}.\nSesuai rencana: tutup posisi, atau cek sinyal terbaru — kalau masih Beli boleh dianggap strategi baru; stop awal tetap dipakai. Bukan saran keuangan.`);
            }
            await new Promise((r) => setTimeout(r, 500));
        }
        // Simpan tanda "sudah diberi tahu" tanpa menimpa perubahan dari perintah lain.
        if (rang) {
            const fresh = this.load();
            for (const p of fresh.positions) {
                const mine = st.positions.find((x) => x.symbol === p.symbol && x.openedAt === p.openedAt);
                if (mine) p.notified = mine.notified;
                const im = impas.find((x) => x.symbol === p.symbol && x.openedAt === p.openedAt);
                if (im && mine && p.stop === im.lama) { p.stopAwal ??= im.lama; p.stop = mine.stop; }
            }
            this.save(fresh);
        }
        return rang;
    }

    /**
     * Trailing stop berbasis ATR (gaya Chandelier), sekali sehari setelah bursa AS tutup:
     *  stop baru = harga tertinggi sejak beli − k × ATR-14 (k: 2 untuk ≤5 hari, 2,5 untuk ≤20 hari, 3 untuk lebih lama).
     *  - Baru mulai mengikuti setelah harga sempat naik ≥1 ATR dari harga beli (supaya tidak terlempar oleh goyangan biasa).
     *  - Setelah naik ≥1,5 ATR, stop minimal di harga beli (impas): posisi tidak bisa rugi lagi.
     *  - Stop hanya NAIK, tidak pernah turun; jarak minimal 0,5 ATR di bawah harga terakhir.
     * Stop di catatan kantor diperbarui + Bapak dikabari untuk mengubah order stop di broker (kantor tidak pernah jual-beli).
     */
    async trailing(): Promise<number> {
        const st = this.load();
        const ubah: Array<{ symbol: string; openedAt: string; lama: number; baru: number; trail: NonNullable<Position['trail']>; stopAwal: number }> = [];
        for (const p of st.positions) {
            if (p.notified?.stop || p.notified?.target) continue;
            let d: { candles: Candle[]; price: number };
            try { d = await fetchDaily(p.symbol); } catch { continue; }
            const t = hitungTrailing(p, d.candles, d.price);
            if (!t) continue;
            const { calon, puncak, a, mult } = t, harga = d.price;
            ubah.push({ symbol: p.symbol, openedAt: p.openedAt, lama: p.stop, baru: calon, stopAwal: p.stopAwal ?? p.stop, trail: { at: new Date().toISOString(), n: (p.trail?.n || 0) + 1, puncak: r2(puncak), atr: r2(a), mult } });
            const kunci = p.shares ? (calon - p.entry) * p.shares : 0;
            await this.kabar([
                `📈 Naikkan stop ${p.symbol}: $${p.stop} → $${calon}`,
                `Harga $${r2(harga)}, tertinggi sejak beli $${r2(puncak)}. Stop baru = tertinggi − ${mult}×ATR ($${r2(a)}).`,
                calon >= p.entry ? `Posisi ini sekarang tidak bisa rugi lagi${kunci > 0 ? `: minimal untung ±$${r2(kunci)}` : ' (stop di harga beli)'}.` : `Risiko kalau kena stop turun dari ±$${r2((p.entry - p.stop) * (p.shares || 0))} jadi ±$${r2((p.entry - calon) * (p.shares || 0))}.`,
                'Stop di kantor sudah diperbarui. Ubah juga order stop di broker Bapak. Bukan saran keuangan.'
            ].join('\n'));
            await new Promise((r) => setTimeout(r, 400));
        }
        // Simpan tanpa menimpa perubahan lain: hanya kalau stop di catatan belum diubah orang lain sejak dibaca.
        const fresh = this.load();
        for (const u of ubah) {
            const p = fresh.positions.find((x) => x.symbol === u.symbol && x.openedAt === u.openedAt);
            if (!p || p.stop !== u.lama) continue;
            p.stopAwal = u.stopAwal; p.stop = u.baru; p.trail = u.trail;
        }
        fresh.lastTrailDate = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
        this.save(fresh);
        return ubah.length;
    }

    /** Pembungkus pekerjaan rutin supaya tercatat di Papan kerja atas nama Dito (diisi index.ts). */
    bungkus?: <T>(judul: string, kerja: () => Promise<T>) => Promise<T>;
    start(strategyHourWib = -1) {
        // Trailing stop: sekali sehari, Selasa–Sabtu pukul ≥05.00 WIB (bursa AS sudah tutup, candle harian sudah final).
        setInterval(() => {
            const wib = new Date(Date.now() + 7 * 3600_000), hari = wib.getUTCDay();
            if (hari < 2 || wib.getUTCHours() < 5 || this.load().lastTrailDate === wib.toISOString().slice(0, 10) || !this.load().positions.length) return;
            (this.bungkus ? this.bungkus('Menaikkan trailing stop posisi (ATR)', () => this.trailing()) : this.trailing()).catch((e) => console.error('[Trading] trailing:', e?.message || e));
        }, 30 * 60_000);
        console.log('[Trading] Pemantau harga aktif (tiap 5 menit saat bursa AS buka).');
        setInterval(() => this.check().catch((e) => console.error('[Trading]', e?.message || e)), 5 * 60_000);
        // Strategi harian: hari kerja, jam 20.00 WIB (sebelum bursa AS buka), hanya kalau watchlist tidak kosong & ada setup beli.
        setInterval(async () => {
            const wib = new Date(Date.now() + 7 * 3600_000);
            const today = wib.toISOString().slice(0, 10);
            const st = this.load();
            const weekday = wib.getUTCDay() >= 1 && wib.getUTCDay() <= 5;
            if (strategyHourWib < 0 || !weekday || wib.getUTCHours() < strategyHourWib || st.lastPlansDate === today || !st.watchlist.length) return;
            // Hanya dikabarkan kalau ada saham yang benar-benar masuk kondisi beli (tidak lagi "belum ada" tiap hari).
            try { const t = await this.strategi(); if (this.load().plans.length) await this.notify(t); } catch (e: any) { console.error('[Trading] strategi:', e?.message || e); }
        }, 10 * 60_000);
    }
}

/** Jalankan perintah dari baris perintah: node kantor-server.js --trading <perintah> ... */
export async function tradingCli(desk: TradingDesk, args: string[]): Promise<string> {
    const [cmd, ...rest] = args;
    const num = (s?: string) => (s === undefined ? NaN : Number(String(s).replace(',', '.').replace(/[^\d.\-]/g, '')));
    const opt = (name: string) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? num(rest[i + 1]) : NaN; };
    switch ((cmd || '').toLowerCase()) {
        case 'strategi': return desk.strategi();
        case 'rencana': return rest.length ? desk.rencana(rest) : 'Format: rencana <SAHAM> [SAHAM ...]';
        case 'eksekusi': {
            const price = num(rest[1]);
            if (!rest[0] || !(price > 0)) return 'Format: eksekusi <nomor strategi> <harga beli> [lembar]';
            const sh = num(rest[2]);
            return desk.eksekusi(rest[0], price, sh > 0 ? sh : undefined);
        }
        case 'pasang': {
            const price = num(rest[1]), t = opt('target'), s = opt('stop'), l = opt('lembar');
            if (!rest[0] || !(price > 0) || !(t > 0) || !(s > 0)) return 'Format: pasang <SAHAM> <harga> --target <x> --stop <y> [--lembar n]';
            return desk.pasang(rest[0], price, t, s, l > 0 ? l : 0);
        }
        case 'jual': {
            const price = num(rest[1]);
            if (!rest[0] || !(price > 0)) return 'Format: jual <SAHAM> <harga jual>';
            return desk.jual(rest[0], price);
        }
        case 'posisi': return desk.posisi();
        case 'modal': return desk.modal(num(rest[0]), num(rest[1]));
        case 'watchlist': return desk.watchlist((rest[0] as any) || 'lihat', rest.slice(1));
        case 'cek': { const n = await desk.check(true); return n ? `${n} alert terkirim.` : 'Belum ada target/stop yang tersentuh.'; }
        case 'trail': { const n = await desk.trailing(); return n ? `${n} stop dinaikkan.` : 'Belum ada stop yang perlu dinaikkan.'; }
        default: return 'Perintah: strategi | rencana | eksekusi | pasang | jual | posisi | modal | watchlist | cek';
    }
}
