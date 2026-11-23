import { UA } from './harga';
import type { Fund } from './preset';

/**
 * Data perusahaan dari Nasdaq.com (gratis, tanpa kunci; terbukti bisa diakses dari VPS saat SEC memblokir):
 *  - laporan keuangan tahunan (±4 tahun): laba rugi, neraca, arus kas
 *  - ringkasan (PER, dividen, kapitalisasi)
 *  - profil perusahaan (deskripsi & situs web)
 */
const H = { 'User-Agent': UA, Accept: 'application/json, text/plain, */*', 'Accept-Language': 'en-US,en;q=0.9', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' };
export async function j(url: string): Promise<any> {
    const res = await fetch(url, { headers: H, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Nasdaq HTTP ${res.status}`);
    const d: any = await res.json();
    if (d?.status?.rCode && d.status.rCode !== 200) throw new Error(`Nasdaq: ${d.status?.bCodeMessage?.[0]?.errorMessage || 'tidak ada data'}`);
    return d?.data;
}
export const sym = (s: string) => encodeURIComponent(s.replace('-', '.'));
/** "$1,234,000" / "-$5" / "(12)" / "36.6%" / "--" → angka */
export function nilai(v: any): number | null {
    if (v == null) return null;
    let s = String(typeof v === 'object' ? v.value ?? '' : v).trim();
    if (!s || /^-+$|^n\/?a$/i.test(s)) return null;
    const neg = /^-|^\(.*\)$/.test(s);
    s = s.replace(/[$,%()\s]/g, '').replace(/^-/, '');
    const n = Number(s);
    return Number.isFinite(n) ? (neg ? -n : n) : null;
}
/** Tabel Nasdaq {headers:{value1..}, rows:[{value1: label, value2: thn terbaru, ...}]} → Map label → [terbaru, ..., terlama] */
export function tabel(t: any): Map<string, Array<number | null>> {
    const m = new Map<string, Array<number | null>>();
    for (const r of t?.rows || []) {
        const keys = Object.keys(r).filter((k) => /^value\d+$/.test(k)).sort((a, b) => +a.slice(5) - +b.slice(5));
        if (!keys.length) continue;
        m.set(String(r[keys[0]]).trim().toLowerCase(), keys.slice(1).map((k) => nilai(r[k])));
    }
    return m;
}
export const cari = (m: Map<string, Array<number | null>>, ...pola: RegExp[]) => { for (const p of pola) for (const [k, v] of m) if (p.test(k)) return v; return [] as Array<number | null>; };

export async function profil(s: string): Promise<{ nama: string; deskripsi: string; situs: string; sektor: string; industri: string; alamat: string }> {
    const d = await j(`https://api.nasdaq.com/api/company/${sym(s)}/company-profile`);
    const v = (k: string) => String(d?.[k]?.value ?? '').trim();
    let situs = v('CompanyUrl');
    if (situs && !/^https?:\/\//i.test(situs)) situs = `https://${situs}`;
    return { nama: v('CompanyName'), deskripsi: v('CompanyDescription'), situs, sektor: v('Sector'), industri: v('Industry'), alamat: [v('Address'), v('City'), v('State')].filter(Boolean).join(', ') };
}

export async function fundamentalNasdaq(s: string, mcapJuta: number | null): Promise<Fund & { _cek?: any }> {
    const [fin, sum] = await Promise.all([
        j(`https://api.nasdaq.com/api/company/${sym(s)}/financials?frequency=1`),
        j(`https://api.nasdaq.com/api/quote/${sym(s)}/summary?assetclass=stocks`).catch(() => null)
    ]);
    const is = tabel(fin?.incomeStatementTable), bs = tabel(fin?.balanceSheetTable), cf = tabel(fin?.cashFlowTable), fr = tabel(fin?.financialRatiosTable);
    const rev = cari(is, /^total revenue/, /^revenue/);
    const ni = cari(is, /^net income$/, /^net income applicable to common/, /^net income/);
    const gp = cari(is, /^gross profit/);
    const ta = cari(bs, /^total assets/);
    const tl = cari(bs, /^total liabilities$/, /^total liabilities/);
    const te = cari(bs, /^total equity/, /^total stockholders.? equity/, /^total shareholders.? equity/);
    const ca = cari(bs, /^total current assets/), cl = cari(bs, /^total current liabilities/);
    const ltd = cari(bs, /^long-term debt/, /^long term debt/);
    const cfo = cari(cf, /^net cash flow.?operating/, /operating activities/);
    const capex = cari(cf, /^capital expenditures?/);
    const sm = sum?.summaryData || {};
    const pe = nilai(sm.PERatio), div = nilai(sm.AnnualizedDividend) ?? nilai(sm.Yield);
    const mcapUsd = mcapJuta ? mcapJuta * 1e6 : nilai(sm.MarketCap);
    const i0 = (a: Array<number | null>, k = 0) => (a.length > k ? a[k] : null);
    const bagi = (a: number | null, b: number | null) => (a != null && b != null && b !== 0 ? a / b : null);
    const r1 = (x: number | null, k = 1) => (x == null || !Number.isFinite(x) ? null : +x.toFixed(k));
    // Skala angka laporan (Nasdaq biasanya ribuan USD): dicek dari PER ringkasan bila ada.
    let skala = 1000;
    if (pe && mcapUsd && i0(ni)) { const per1 = mcapUsd / (i0(ni)! * 1); const per1000 = mcapUsd / (i0(ni)! * 1000); skala = Math.abs(Math.log(per1 / pe)) < Math.abs(Math.log(per1000 / pe)) ? 1 : 1000; }
    const roa = bagi(i0(ni), i0(ta)), roaPrev = bagi(i0(ni, 1), i0(ta, 1));
    const lev = bagi(i0(ltd) ?? i0(tl), i0(ta)), levPrev = bagi(i0(ltd, 1) ?? i0(tl, 1), i0(ta, 1));
    const npmAll = rev.map((r, k) => bagi(ni[k] ?? null, r)).filter((x): x is number => x != null);
    const nis = ni.filter((x): x is number => x != null);
    const cagr = (() => { const a = i0(ni), b = i0(ni, 3) ?? i0(ni, 2); const yrs = i0(ni, 3) != null ? 3 : 2; return a != null && b != null && a > 0 && b > 0 ? (Math.pow(a / b, 1 / yrs) - 1) * 100 : null; })();
    const fcf = i0(cfo) != null ? i0(cfo)! + (i0(capex) != null ? -Math.abs(i0(capex)!) : 0) : null;
    const roeR = cari(fr, /after tax roe/);
    const crR = cari(fr, /^current ratio/);
    const f: Fund = {
        roe: r1(i0(roeR) ?? ((bagi(i0(ni), i0(te)) ?? NaN) * 100)), roa: r1(roa != null ? roa * 100 : null), roaPrev: r1(roaPrev != null ? roaPrev * 100 : null),
        per: r1(pe ?? (mcapUsd && i0(ni) ? mcapUsd / (i0(ni)! * skala) : null)),
        pbv: r1(mcapUsd && i0(te) ? mcapUsd / (i0(te)! * skala) : null, 2),
        ps: r1(mcapUsd && i0(rev) ? mcapUsd / (i0(rev)! * skala) : null, 2),
        der: r1(bagi(i0(tl), i0(te)), 2),
        npm: r1(npmAll.length ? npmAll[0] * 100 : null), npmRata: r1(npmAll.length ? (npmAll.reduce((a, b) => a + b, 0) / npmAll.length) * 100 : null),
        gm: r1(bagi(i0(gp), i0(rev)) != null ? bagi(i0(gp), i0(rev))! * 100 : null), gmPrev: r1(bagi(i0(gp, 1), i0(rev, 1)) != null ? bagi(i0(gp, 1), i0(rev, 1))! * 100 : null),
        revGrowth: r1(i0(rev) && i0(rev, 1) ? (i0(rev)! / i0(rev, 1)! - 1) * 100 : null), epsCagr3: r1(cagr),
        fcf: fcf != null ? Math.round(fcf * skala / 1e6) : null, cfo: i0(cfo) != null ? Math.round(i0(cfo)! * skala / 1e6) : null, ni: i0(ni) != null ? Math.round(i0(ni)! * skala / 1e6) : null,
        cr: r1(i0(crR) != null ? i0(crR)! / (i0(crR)! > 20 ? 100 : 1) : bagi(i0(ca), i0(cl)), 2), crPrev: r1(i0(crR, 1) != null ? i0(crR, 1)! / (i0(crR, 1)! > 20 ? 100 : 1) : bagi(i0(ca, 1), i0(cl, 1)), 2),
        lev: r1(lev, 3), levPrev: r1(levPrev, 3),
        at: r1(bagi(i0(rev), i0(ta)), 3), atPrev: r1(bagi(i0(rev, 1), i0(ta, 1)), 3),
        labaPositifSemua: nis.length >= 2 ? nis.every((x) => x > 0) : null,
        dividen: div, mcap: mcapUsd ? Math.round(mcapUsd / 1e6) : null, sumber: 'Nasdaq'
    };
    if (!rev.length && !ni.length) throw new Error('Nasdaq: laporan keuangan kosong');
    return { ...f, _cek: { baris: { laba: [...is.keys()].slice(0, 6), neraca: [...bs.keys()].slice(0, 6), kas: [...cf.keys()].slice(0, 4), rasio: [...fr.keys()].slice(0, 6) }, skala } };
}

/**
 * Kalender laporan keuangan (earnings) Nasdaq untuk n hari bursa ke depan → Map simbol → { tgl, waktu }.
 * waktu: 'sebelum buka' / 'setelah tutup' / '' (belum diumumkan).
 */
export async function kalenderLaba(hari = 8): Promise<Map<string, { tgl: string; waktu: string }>> {
    const out = new Map<string, { tgl: string; waktu: string }>();
    for (let i = 0; i < hari; i++) {
        const d = new Date(Date.now() + i * 86400_000), dow = d.getUTCDay();
        if (dow === 0 || dow === 6) continue;
        const tgl = d.toISOString().slice(0, 10);
        try {
            const r = await j(`https://api.nasdaq.com/api/calendar/earnings?date=${tgl}`);
            for (const x of r?.rows || []) {
                const s = String(x.symbol || '').toUpperCase().replace('.', '-'); if (!s || out.has(s)) continue;
                const w = String(x.time || ''); out.set(s, { tgl, waktu: /pre/i.test(w) ? 'sebelum bursa buka' : /after/i.test(w) ? 'setelah bursa tutup' : '' });
            }
        } catch { /* satu hari gagal: lewati */ }
        await new Promise((r) => setTimeout(r, 400));
    }
    return out;
}
