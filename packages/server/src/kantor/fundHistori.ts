/**
 * Fundamental "per tanggal" untuk uji mundur Preset by AI: pada tanggal t, hanya laporan yang SUDAH terbit saat itu yang dipakai.
 * Sumber: SEC XBRL frames (satu permintaan = satu angka untuk semua perusahaan dalam satu periode), disimpan di data/sec-frames.
 * Perkiraan tanggal terbit (konservatif): laporan tahunan tahun Y dianggap tersedia mulai 31 Maret Y+1;
 * neraca kuartal dianggap tersedia 60 hari setelah akhir kuartal.
 */
import fs from 'fs';
import path from 'path';
import { frame, secJson } from './screener';
import type { RasioF } from './presetAi';

type Peta = Map<number, number>;
async function frameSimpan(dir: string, tax: string, konsep: string, unit: string, periode: string, segarHari: number | null): Promise<Peta> {
    const f = path.join(dir, `${tax}_${konsep}_${unit}_${periode}.json`);
    try {
        const st = fs.statSync(f);
        if (segarHari == null || Date.now() - st.mtimeMs < segarHari * 86400_000) return new Map(JSON.parse(fs.readFileSync(f, 'utf8')));
    } catch { /* belum ada */ }
    const m = await frame(tax, konsep, unit, periode);
    if (m.size) fs.writeFileSync(f, JSON.stringify([...m.entries()]));
    return m;
}

export async function bangunFundHistori(dataDir: string, dariTahun: number, progres?: (t: string) => void): Promise<((s: string, tgl: string, harga: number) => RasioF | null) | null> {
    const dir = path.join(dataDir, 'sec-frames'); fs.mkdirSync(dir, { recursive: true });
    let map: any = null;
    const fMap = path.join(dir, 'company_tickers.json');
    try { if (Date.now() - fs.statSync(fMap).mtimeMs < 30 * 86400_000) map = JSON.parse(fs.readFileSync(fMap, 'utf8')); } catch { /* */ }
    if (!map) { map = await secJson('https://www.sec.gov/files/company_tickers.json'); if (map) fs.writeFileSync(fMap, JSON.stringify(map)); }
    if (!map) return null;
    const cikOf = new Map<string, number>();
    for (const k of Object.keys(map)) cikOf.set(String(map[k].ticker).toUpperCase().replace(/\./g, '-'), Number(map[k].cik_str));

    const kini = new Date(); const yNow = kini.getUTCFullYear();
    // Periode yang "masih bisa berubah" (≤ 15 bulan lalu) diambil ulang tiap 7 hari; yang lebih lama disimpan permanen.
    const segar = (akhir: Date) => (Date.now() - akhir.getTime() < 460 * 86400_000 ? 7 : null);
    const tahunan: Record<number, { ni: Peta; rev: Peta }> = {};
    for (let Y = dariTahun - 2; Y <= yNow - 1; Y++) {
        progres?.(`fundamental lampau: laporan tahunan ${Y}`);
        const sg = segar(new Date(Date.UTC(Y + 1, 2, 31)));
        const ni = await frameSimpan(dir, 'us-gaap', 'NetIncomeLoss', 'USD', `CY${Y}`, sg);
        const r1 = await frameSimpan(dir, 'us-gaap', 'Revenues', 'USD', `CY${Y}`, sg);
        const r2 = await frameSimpan(dir, 'us-gaap', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'USD', `CY${Y}`, sg);
        const rev = new Map(r2); r1.forEach((v, k) => rev.set(k, v));
        tahunan[Y] = { ni, rev };
    }
    const kuartal: Array<{ akhir: string; tersedia: string; eq: Peta; li: Peta; sh: Peta }> = [];
    for (let Y = dariTahun - 1; Y <= yNow; Y++) for (let q = 1; q <= 4; q++) {
        const akhir = new Date(Date.UTC(Y, q * 3, 0));
        const tersedia = new Date(akhir.getTime() + 60 * 86400_000);
        if (tersedia.getTime() > Date.now()) continue;
        progres?.(`fundamental lampau: neraca ${Y} Q${q}`);
        const per = `CY${Y}Q${q}I`, sg = segar(akhir);
        kuartal.push({
            akhir: akhir.toISOString().slice(0, 10), tersedia: tersedia.toISOString().slice(0, 10),
            eq: await frameSimpan(dir, 'us-gaap', 'StockholdersEquity', 'USD', per, sg),
            li: await frameSimpan(dir, 'us-gaap', 'Liabilities', 'USD', per, sg),
            sh: await frameSimpan(dir, 'dei', 'EntityCommonStockSharesOutstanding', 'shares', per, sg)
        });
    }
    const pct = (a: number | undefined, b: number | undefined) => (a != null && b ? +((a / b) * 100).toFixed(1) : null);
    return (s: string, tgl: string, harga: number): RasioF | null => {
        const cik = cikOf.get(s); if (!cik) return null;
        // Laporan tahunan terbaru yang sudah terbit pada tgl.
        const Y = (() => { for (let y = +tgl.slice(0, 4) - 1; y >= dariTahun - 2; y--) if (`${y + 1}-03-31` <= tgl && tahunan[y]) return y; return null; })();
        if (Y == null) return null;
        const ni = tahunan[Y].ni.get(cik) ?? tahunan[Y - 1]?.ni.get(cik);
        const rv = tahunan[Y].rev.get(cik) ?? tahunan[Y - 1]?.rev.get(cik);
        const rvPrev = tahunan[Y].rev.has(cik) ? tahunan[Y - 1]?.rev.get(cik) : tahunan[Y - 2]?.rev.get(cik);
        // Neraca kuartal terbaru yang sudah terbit (cari mundur sampai 4 kuartal per angka).
        const siap = kuartal.filter((k) => k.tersedia <= tgl);
        const ambil = (key: 'eq' | 'li' | 'sh') => { for (let i = siap.length - 1; i >= Math.max(0, siap.length - 4); i--) { const v = siap[i][key].get(cik); if (v != null) return v; } return undefined; };
        const eq = ambil('eq'), li = ambil('li'), sh = ambil('sh');
        const mcap = sh ? harga * sh : null;
        const r: RasioF = {
            roe: eq && eq > 0 && ni != null ? pct(ni, eq) : null,
            pbv: mcap && eq && eq > 0 ? +(mcap / eq).toFixed(2) : null,
            per: mcap && ni && ni > 0 ? +(mcap / ni).toFixed(1) : null,
            der: li != null && eq && eq > 0 ? +(li / eq).toFixed(2) : null,
            npm: ni != null && rv ? pct(ni, rv) : null,
            revGrowth: rv && rvPrev ? +((rv / rvPrev - 1) * 100).toFixed(1) : null
        };
        return Object.values(r).filter((v) => v != null).length >= 3 ? r : null;
    };
}
