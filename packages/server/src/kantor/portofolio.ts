/**
 * Portofolio pribadi (pencatatan saja — eksekusi tetap di broker Pak Rico, kantor tidak pernah membeli/menjual).
 * Menghitung: nilai portofolio, untung/rugi berjalan & terealisasi, kurva nilai harian/mingguan/bulanan,
 * pembanding "kalau dana yang sama ditaruh di S&P 500", statistik transaksi, dan hasil per sinyal AI saat beli.
 */
import fs from 'fs';
import path from 'path';
import type { TradingDesk, TradingState, Position, Dana } from './trading';
import { masaPegang } from './trading';
import { hargaHarian, Bar } from './harga';

const r2 = (x: number) => Math.round(x * 100) / 100;
const r4 = (x: number) => Math.round(x * 10000) / 10000;
const hari = (iso: string) => iso.slice(0, 10);
const gid = () => Math.random().toString(36).slice(2, 10);

/** Dana tercatat; kalau belum pernah diatur, modal di pengaturan trading dianggap modal awal (ditandai otomatis). */
export function danaDari(st: TradingState): { dana: Dana[]; otomatis: boolean } {
    if (st.dana?.length) return { dana: [...st.dana].sort((a, b) => a.tgl.localeCompare(b.tgl)), otomatis: false };
    const awal = [...st.positions, ...st.history].map((p) => p.openedAt).sort()[0] || new Date().toISOString();
    return { dana: [{ id: 'otomatis', tgl: hari(awal), jenis: 'awal', jumlah: st.capital, catatan: 'dari pengaturan modal' }], otomatis: true };
}
const nilaiDana = (d: Dana) => (d.jenis === 'tarik' ? -1 : 1) * d.jumlah;

/* ── Ubah data ── */
export function buka(desk: TradingDesk, x: { symbol: string; entry: number; shares?: number; modal?: number; target: number; stop: number; profil?: Position['profil']; ai?: Position['ai']; tgl?: string; catatan?: string }) {
    const st = desk.load();
    const symbol = String(x.symbol || '').toUpperCase().trim();
    if (!/^[A-Z][A-Z.-]{0,9}$/.test(symbol)) throw new Error('Kode saham tidak valid.');
    const entry = +x.entry;
    if (!(entry > 0)) throw new Error('Harga beli harus lebih dari 0.');
    const shares = x.shares && x.shares > 0 ? +x.shares : x.modal && x.modal > 0 ? x.modal / entry : 0;
    if (!(shares > 0)) throw new Error('Isi modal (USD) atau jumlah lembar.');
    if (!(+x.target > entry)) throw new Error('Target harus di atas harga beli.');
    if (!(+x.stop < entry) || !(+x.stop > 0)) throw new Error('Stop loss harus di bawah harga beli.');
    if (st.positions.some((p) => p.symbol === symbol)) throw new Error(`${symbol} sudah dipegang — ubah atau tutup posisinya dulu.`);
    const tgl = x.tgl && /^\d{4}-\d{2}-\d{2}$/.test(x.tgl) ? new Date(`${x.tgl}T15:00:00Z`).toISOString() : new Date().toISOString();
    const pos: Position = { symbol, shares: r4(shares), entry: r2(entry), target: r2(+x.target), stop: r2(+x.stop), openedAt: tgl, notified: {}, profil: x.profil || 'kustom', ai: x.ai, catatan: x.catatan?.slice(0, 300) };
    st.positions.push(pos);
    desk.save(st);
    return pos;
}
export function ubah(desk: TradingDesk, symbol: string, x: Partial<Pick<Position, 'entry' | 'shares' | 'target' | 'stop' | 'catatan'>> & { tgl?: string }) {
    const st = desk.load();
    const p = st.positions.find((q) => q.symbol === symbol.toUpperCase());
    if (!p) throw new Error('Posisi tidak ditemukan.');
    if (x.entry != null && +x.entry > 0) p.entry = r2(+x.entry);
    if (x.shares != null && +x.shares > 0) p.shares = r4(+x.shares);
    if (x.target != null && +x.target > 0) { p.target = r2(+x.target); if (p.notified) delete p.notified.target; }
    if (x.stop != null && +x.stop > 0) { p.stop = r2(+x.stop); if (p.notified) delete p.notified.stop; }
    if (x.catatan != null) p.catatan = String(x.catatan).slice(0, 300);
    if (x.tgl && /^\d{4}-\d{2}-\d{2}$/.test(x.tgl)) p.openedAt = new Date(`${x.tgl}T15:00:00Z`).toISOString();
    // Stop boleh di atas harga beli kalau sudah dinaikkan (trailing stop mengunci untung).
    if (!(p.stop < p.target && p.target > p.entry)) throw new Error('Harus: stop < target, dan target > harga beli.');
    desk.save(st);
    return p;
}
/** Tutup posisi (jual), boleh sebagian. */
export function tutup(desk: TradingDesk, symbol: string, harga: number, shares?: number, tgl?: string) {
    const st = desk.load();
    const i = st.positions.findIndex((q) => q.symbol === symbol.toUpperCase());
    if (i < 0) throw new Error('Posisi tidak ditemukan.');
    if (!(harga > 0)) throw new Error('Harga jual harus lebih dari 0.');
    const p = st.positions[i];
    const jual = shares && shares > 0 && shares < p.shares - 1e-6 ? r4(shares) : p.shares;
    const closedAt = tgl && /^\d{4}-\d{2}-\d{2}$/.test(tgl) ? new Date(`${tgl}T20:00:00Z`).toISOString() : new Date().toISOString();
    const pnl = r2((harga - p.entry) * jual);
    st.history.push({ ...p, shares: jual, closedAt, exit: r2(harga), pnl });
    if (jual === p.shares) st.positions.splice(i, 1); else p.shares = r4(p.shares - jual);
    desk.save(st);
    return { pnl, sisa: jual === p.shares ? 0 : p.shares };
}
/** Hapus catatan yang salah input (posisi terbuka atau riwayat). */
export function hapus(desk: TradingDesk, jenis: 'posisi' | 'riwayat', symbol: string, openedAt: string, closedAt?: string) {
    const st = desk.load();
    const cocok = (p: Position) => p.symbol === symbol.toUpperCase() && p.openedAt === openedAt && (jenis === 'posisi' || p.closedAt === closedAt);
    if (jenis === 'posisi') st.positions = st.positions.filter((p) => !cocok(p)); else st.history = st.history.filter((p) => !cocok(p));
    desk.save(st);
}
export function aturDana(desk: TradingDesk, x: { aksi: 'tambah' | 'hapus'; id?: string; jenis?: Dana['jenis']; jumlah?: number; tgl?: string; catatan?: string }) {
    const st = desk.load();
    const { dana, otomatis } = danaDari(st);
    let list = otomatis ? dana.map((d) => ({ ...d, id: gid() })) : dana;
    if (x.aksi === 'hapus') list = list.filter((d) => d.id !== x.id);
    else {
        const jumlah = +(x.jumlah || 0);
        if (!(jumlah > 0)) throw new Error('Jumlah harus lebih dari 0.');
        const jenis = x.jenis === 'tarik' || x.jenis === 'awal' ? x.jenis : 'setor';
        const tgl = x.tgl && /^\d{4}-\d{2}-\d{2}$/.test(x.tgl) ? x.tgl : hari(new Date().toISOString());
        if (jenis === 'awal') list = list.filter((d) => d.jenis !== 'awal');
        list.push({ id: gid(), tgl, jenis, jumlah: r2(jumlah), catatan: x.catatan?.slice(0, 120) });
    }
    st.dana = list.sort((a, b) => a.tgl.localeCompare(b.tgl));
    // Modal untuk hitungan ukuran posisi Dito ikut total dana bersih.
    const bersih = st.dana.reduce((a, d) => a + nilaiDana(d), 0);
    if (bersih > 0) st.capital = r2(bersih);
    desk.save(st);
}

/* ── Harga harian bertanggal (cache 6 jam) ── */
const cacheHarga = new Map<string, { at: number; rows: Bar[] }>();
export async function harian(dir: string, s: string): Promise<Bar[]> {
    const c = cacheHarga.get(s);
    if (c && Date.now() - c.at < 6 * 3600_000) return c.rows;
    const f = path.join(dir, `${s}.json`);
    try {
        const d = JSON.parse(fs.readFileSync(f, 'utf8'));
        if (Date.now() - d.at < 6 * 3600_000) { cacheHarga.set(s, d); return d.rows; }
    } catch { /* */ }
    try {
        const r = await hargaHarian(s);
        const rows = r.rows.map((b) => ({ ...b, t: hari(b.t) }));
        const v = { at: Date.now(), rows };
        cacheHarga.set(s, v); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(f, JSON.stringify(v));
        return rows;
    } catch {
        try { const d = JSON.parse(fs.readFileSync(f, 'utf8')); cacheHarga.set(s, { at: Date.now() - 5 * 3600_000, rows: d.rows }); return d.rows; } catch { return []; }
    }
}
/** Penutupan terakhir ≤ tanggal t (pencarian biner). */
function tutupPada(rows: Bar[], t: string): number | null {
    let lo = 0, hi = rows.length - 1, ans = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m].t <= t) { ans = m; lo = m + 1; } else hi = m - 1; }
    return ans >= 0 ? rows[ans].c : null;
}

export type Resolusi = 'harian' | 'mingguan' | 'bulanan';
export async function laporan(desk: TradingDesk, dataDir: string, hargaKini: (s: string) => Promise<number | null>, res: Resolusi = 'harian') {
    const st = desk.load();
    const { dana, otomatis } = danaDari(st);
    const semuaPos = [...st.positions, ...st.history];
    const dir = path.join(dataDir, 'portofolio-harga');
    const simbol = Array.from(new Set(semuaPos.map((p) => p.symbol)));
    const [spy, ...seri] = await Promise.all([harian(dir, 'SPY'), ...simbol.map((s) => harian(dir, s))]);
    const H = new Map(simbol.map((s, i) => [s, seri[i]]));
    const kini = new Map<string, number | null>(await Promise.all(st.positions.map(async (p) => [p.symbol, await hargaKini(p.symbol).catch(() => null)] as [string, number | null])));
    const hariIni = hari(new Date().toISOString());

    // Posisi terbuka (harga kini)
    const posisi = st.positions.map((p) => {
        const harga = kini.get(p.symbol) ?? (H.get(p.symbol)?.length ? H.get(p.symbol)!.at(-1)!.c : null);
        const modal = r2(p.entry * p.shares), nilai = harga != null ? r2(harga * p.shares) : null;
        const pnl = nilai != null ? r2(nilai - modal) : null;
        return { ...p, modal, harga, nilai, pnl, pnlPct: harga != null ? r2((harga / p.entry - 1) * 100) : null, keTarget: harga != null ? r2((p.target / harga - 1) * 100) : null, keStop: harga != null ? r2((p.stop / harga - 1) * 100) : null, hari: Math.max(0, Math.round((Date.now() - Date.parse(p.openedAt)) / 86400_000)), masa: masaPegang(p) };
    });
    const riwayat = [...st.history].sort((a, b) => (b.closedAt || '').localeCompare(a.closedAt || '')).map((p) => ({ ...p, modal: r2(p.entry * p.shares), pnlPct: p.exit ? r2((p.exit / p.entry - 1) * 100) : null, hari: p.closedAt ? Math.max(0, Math.round((Date.parse(p.closedAt) - Date.parse(p.openedAt)) / 86400_000)) : null }));

    // Ringkasan
    const totalDana = r2(dana.reduce((a, d) => a + nilaiDana(d), 0));
    const disetor = r2(dana.filter((d) => d.jenis !== 'tarik').reduce((a, d) => a + d.jumlah, 0));
    const ditarik = r2(dana.filter((d) => d.jenis === 'tarik').reduce((a, d) => a + d.jumlah, 0));
    const terealisasi = r2(st.history.reduce((a, h) => a + (h.pnl || 0), 0));
    const berjalan = r2(posisi.reduce((a, p) => a + (p.pnl || 0), 0));
    const modalTerpakai = r2(posisi.reduce((a, p) => a + p.modal, 0));
    const nilaiSaham = r2(posisi.reduce((a, p) => a + (p.nilai ?? p.modal), 0));
    const kas = r2(totalDana + terealisasi - modalTerpakai);
    const nilaiTotal = r2(kas + nilaiSaham);
    const untung = r2(terealisasi + berjalan);

    // Kurva nilai portofolio per hari bursa (+ hari ini dengan harga terkini)
    const mulai = [dana[0]?.tgl, ...semuaPos.map((p) => hari(p.openedAt))].filter(Boolean).sort()[0] || hariIni;
    const kalender = spy.map((b) => b.t).filter((t) => t >= mulai && t < hariIni);
    kalender.push(hariIni);
    let unitSpy = 0, danaJalan = 0, iDana = 0;
    const danaUrut = [...dana].sort((a, b) => a.tgl.localeCompare(b.tgl));
    const titik = kalender.map((t) => {
        const spyC = t === hariIni ? (spy.at(-1)?.c ?? null) : tutupPada(spy, t);
        while (iDana < danaUrut.length && danaUrut[iDana].tgl <= t) {
            const d = danaUrut[iDana++]; const v = nilaiDana(d); danaJalan += v;
            if (spyC) unitSpy += v / spyC; // pembanding: dana yang sama dibelikan S&P 500 di hari itu
        }
        let real = 0, unreal = 0;
        for (const h of st.history) if (h.closedAt && hari(h.closedAt) <= t) real += h.pnl || 0;
        for (const p of semuaPos) {
            if (hari(p.openedAt) > t || (p.closedAt && hari(p.closedAt) <= t)) continue;
            const c = t === hariIni && !p.closedAt ? kini.get(p.symbol) ?? tutupPada(H.get(p.symbol) || [], t) : tutupPada(H.get(p.symbol) || [], t);
            if (c != null) unreal += (c - p.entry) * p.shares;
        }
        const nilai = danaJalan + real + unreal;
        return { t, nilai: r2(nilai), dana: r2(danaJalan), untung: r2(real + unreal), spy: spyC ? r2(unitSpy * spyC) : null };
    });
    const ambilTerakhir = (kunci: (t: string) => string) => { const m = new Map<string, typeof titik[0]>(); for (const x of titik) m.set(kunci(x.t), x); return Array.from(m.values()); };
    const kurva = res === 'bulanan' ? ambilTerakhir((t) => t.slice(0, 7))
        : res === 'mingguan' ? ambilTerakhir((t) => { const d = new Date(`${t}T00:00:00Z`); const s = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400_000); return hari(s.toISOString()); })
            : titik;
    const akhir = titik.at(-1);
    const spyUntung = akhir?.spy != null ? r2(akhir.spy - akhir.dana) : null;

    // Statistik transaksi tertutup
    const tutupList = st.history.filter((h) => h.pnl != null);
    const menang = tutupList.filter((h) => (h.pnl || 0) > 0), kalah = tutupList.filter((h) => (h.pnl || 0) < 0);
    const pct = (h: Position) => (h.exit ? (h.exit / h.entry - 1) * 100 : 0);
    const rata = (a: number[]) => (a.length ? r2(a.reduce((x, y) => x + y, 0) / a.length) : null);
    const statistik = {
        transaksi: tutupList.length, terbuka: posisi.length,
        menangPct: tutupList.length ? r2((menang.length / tutupList.length) * 100) : null,
        rataMenangPct: rata(menang.map(pct)), rataKalahPct: rata(kalah.map(pct)),
        profitFactor: kalah.length ? r2(menang.reduce((a, h) => a + (h.pnl || 0), 0) / Math.abs(kalah.reduce((a, h) => a + (h.pnl || 0), 0))) : null,
        terbaik: tutupList.length ? [...tutupList].sort((a, b) => pct(b) - pct(a))[0] : null,
        terburuk: tutupList.length ? [...tutupList].sort((a, b) => pct(a) - pct(b))[0] : null,
        rataHari: rata(tutupList.map((h) => (Date.parse(h.closedAt!) - Date.parse(h.openedAt)) / 86400_000)),
        turunTerdalam: (() => { let puncak = -Infinity, dd = 0; for (const x of titik) { puncak = Math.max(puncak, x.nilai); if (puncak > 0) dd = Math.min(dd, (x.nilai / puncak - 1) * 100); } return r2(dd); })()
    };
    // Hasil menurut sinyal AI saat beli
    const perLabel = new Map<string, { n: number; pnl: number; pcts: number[] }>();
    for (const p of [...posisi.map((x) => ({ ...x, pnlX: x.pnl || 0, pctX: x.pnlPct || 0 })), ...riwayat.map((x) => ({ ...x, pnlX: x.pnl || 0, pctX: x.pnlPct || 0 }))]) {
        const k = p.ai?.label || 'tanpa catatan sinyal';
        const e = perLabel.get(k) || { n: 0, pnl: 0, pcts: [] }; e.n++; e.pnl += p.pnlX; e.pcts.push(p.pctX); perLabel.set(k, e);
    }
    return {
        ringkasan: { nilaiTotal, untung, untungPct: totalDana > 0 ? r2((untung / totalDana) * 100) : null, terealisasi, berjalan, kas, nilaiSaham, modalTerpakai, totalDana, disetor, ditarik, spyUntung, spyUntungPct: spyUntung != null && totalDana > 0 ? r2((spyUntung / totalDana) * 100) : null, mulai, danaOtomatis: otomatis },
        posisi, riwayat, dana, kurva, res, statistik,
        perLabel: Array.from(perLabel.entries()).map(([label, e]) => ({ label, n: e.n, pnl: r2(e.pnl), rataPct: rata(e.pcts) }))
    };
}
