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

export interface Position {
    symbol: string;
    shares: number;
    entry: number;
    stop: number;
    target: number;
    openedAt: string;
    planId?: number;
    notified?: { stop?: string; target?: string };
    closedAt?: string;
    exit?: number;
    pnl?: number;
}

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
    lastPlansDate?: string;
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

const UA = 'Mozilla/5.0 (compatible; kantor-virtual/1.0)';

export interface Candle { t: number; o: number; h: number; l: number; c: number }

export async function fetchDaily(symbol: string): Promise<{ candles: Candle[]; price: number }> {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=6mo&interval=1d`;
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' } });
    if (!res.ok) throw new Error(`Harga ${symbol} gagal diambil (HTTP ${res.status})`);
    const data: any = await res.json();
    const r = data?.chart?.result?.[0];
    if (!r) throw new Error(`Saham ${symbol} tidak ditemukan`);
    const q = r.indicators?.quote?.[0] || {};
    const candles: Candle[] = (r.timestamp || []).map((t: number, i: number) => ({ t, o: q.open?.[i], h: q.high?.[i], l: q.low?.[i], c: q.close?.[i] }))
        .filter((k: Candle) => [k.o, k.h, k.l, k.c].every((v) => typeof v === 'number' && Number.isFinite(v)));
    const price = Number(r.meta?.regularMarketPrice) || candles[candles.length - 1]?.c;
    if (!candles.length || !price) throw new Error(`Data ${symbol} kosong`);
    return { candles, price };
}

export async function fetchPrice(symbol: string): Promise<number> {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m`;
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' } });
    if (!res.ok) throw new Error(`Harga ${symbol} gagal diambil (HTTP ${res.status})`);
    const data: any = await res.json();
    const p = Number(data?.chart?.result?.[0]?.meta?.regularMarketPrice);
    if (!p) throw new Error(`Harga ${symbol} kosong`);
    return p;
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
        for (const p of st.positions) {
            let price: number;
            try { price = await fetchPrice(p.symbol); } catch { continue; }
            p.notified = p.notified || {};
            const pl = (price - p.entry) * (p.shares || 0);
            const plTxt = p.shares ? ` · ${pl >= 0 ? 'untung' : 'rugi'} ±$${Math.abs(r2(pl))}` : '';
            if (price >= p.target && !p.notified.target) {
                p.notified.target = new Date().toISOString(); rang++;
                await this.notify(`🟢 TARGET ${p.symbol} tercapai: $${r2(price)} (target $${p.target})${plTxt}\nKalau sudah jual, balas: "jual ${p.symbol} di ${r2(price)}"`);
            } else if (price <= p.stop && !p.notified.stop) {
                p.notified.stop = new Date().toISOString(); rang++;
                await this.notify(`🔴 STOP LOSS ${p.symbol} kena: $${r2(price)} (stop $${p.stop})${plTxt}\nKalau sudah jual, balas: "jual ${p.symbol} di ${r2(price)}"`);
            }
            await new Promise((r) => setTimeout(r, 500));
        }
        // Simpan tanda "sudah diberi tahu" tanpa menimpa perubahan dari perintah lain.
        if (rang) {
            const fresh = this.load();
            for (const p of fresh.positions) {
                const mine = st.positions.find((x) => x.symbol === p.symbol && x.openedAt === p.openedAt);
                if (mine) p.notified = mine.notified;
            }
            this.save(fresh);
        }
        return rang;
    }

    start(strategyHourWib = -1) {
        console.log('[Trading] Pemantau harga aktif (tiap 5 menit saat bursa AS buka).');
        setInterval(() => this.check().catch((e) => console.error('[Trading]', e?.message || e)), 5 * 60_000);
        // Strategi harian: hari kerja, jam 20.00 WIB (sebelum bursa AS buka), hanya kalau watchlist tidak kosong.
        setInterval(async () => {
            const wib = new Date(Date.now() + 7 * 3600_000);
            const today = wib.toISOString().slice(0, 10);
            const st = this.load();
            const weekday = wib.getUTCDay() >= 1 && wib.getUTCDay() <= 5;
            if (strategyHourWib < 0 || !weekday || wib.getUTCHours() < strategyHourWib || st.lastPlansDate === today || !st.watchlist.length) return;
            try { await this.notify(await this.strategi()); } catch (e: any) { console.error('[Trading] strategi:', e?.message || e); }
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
        default: return 'Perintah: strategi | rencana | eksekusi | pasang | jual | posisi | modal | watchlist | cek';
    }
}
