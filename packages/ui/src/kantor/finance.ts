/** Hitungan laporan keuangan (meniru Dashboard di Google Sheets "Keuangan Rico"). */
export interface Tx { d: string; t: string; bank: string; jenis: string; n: number; pihak: string; kat: string; ket: string; status: string }

export const BANKS = ['Mandiri', 'BCA', 'Krom', 'Jago'];
export const KAT_COLORS: Record<string, string> = {
    'Makan & Minum': '#f97316', 'Transport': '#0ea5e9', 'Belanja': '#ec4899', 'Tagihan & Langganan': '#8b5cf6',
    'Pulsa & Internet': '#14b8a6', 'Kesehatan': '#22c55e', 'Hiburan': '#f59e0b', 'Investasi': '#6366f1',
    'Transfer Keluarga': '#e11d48', 'Lainnya': '#64748b'
};
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export const rp = (n: number) => `${n < 0 ? '−' : ''}Rp${Math.abs(Math.round(n)).toLocaleString('id-ID')}`;
export const rpShort = (n: number) => {
    const a = Math.abs(n);
    if (a >= 1e9) return `${(n / 1e9).toFixed(1).replace('.', ',')} M`;
    if (a >= 1e6) return `${(n / 1e6).toFixed(1).replace('.', ',')} jt`;
    if (a >= 1e3) return `${Math.round(n / 1e3)} rb`;
    return String(Math.round(n));
};
export const monthLabel = (ym: string) => `${BULAN[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
export const dateLabel = (d: string) => { const x = new Date(`${d}T00:00:00Z`); return `${HARI[x.getUTCDay()]}, ${x.getUTCDate()} ${BULAN[x.getUTCMonth()].slice(0, 3)}`; };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return iso(x); };
export const todayWib = () => iso(new Date(Date.now() + 7 * 3600_000));
const mondayOf = (d: string) => { const x = new Date(`${d}T00:00:00Z`); return addDays(d, -((x.getUTCDay() + 6) % 7)); };
const shiftMonth = (ym: string, k: number) => { const y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + k; const d = new Date(Date.UTC(y, m, 1)); return iso(d).slice(0, 7); };

export function monthsAvailable(tx: Tx[]): string[] {
    const set = new Set(tx.map((t) => t.d.slice(0, 7)));
    set.add(todayWib().slice(0, 7));
    return Array.from(set).sort().reverse();
}

export function compute(all: Tx[], ym: string, bank: string) {
    const tx = bank === 'Semua' ? all : all.filter((t) => t.bank === bank);
    const today = todayWib();
    const start = `${ym}-01`, end = `${shiftMonth(ym, 1)}-01`;
    const inMonth = tx.filter((t) => t.d >= start && t.d < end);
    const out = inMonth.filter((t) => t.jenis === 'Keluar');
    const sum = (xs: Tx[]) => xs.reduce((a, t) => a + t.n, 0);
    const keluar = sum(out), masuk = sum(inMonth.filter((t) => t.jenis === 'Masuk'));

    // Pembanding: periode yang sama bulan lalu
    const lastDay = today < end ? today : addDays(end, -1);
    const daysElapsed = Math.max(1, Math.round((Date.parse(lastDay) - Date.parse(start)) / 86400_000) + 1);
    const pStart = `${shiftMonth(ym, -1)}-01`;
    const pEnd = addDays(pStart, daysElapsed) < start ? addDays(pStart, daysElapsed) : start;
    const prev = tx.filter((t) => t.d >= pStart && t.d < pEnd);
    const prevKeluar = sum(prev.filter((t) => t.jenis === 'Keluar')), prevMasuk = sum(prev.filter((t) => t.jenis === 'Masuk'));

    // 12 minggu terakhir (Senin–Minggu)
    const thisMon = mondayOf(today);
    const weeks = Array.from({ length: 12 }, (_, i) => {
        const s = addDays(thisMon, -7 * (11 - i)), e = addDays(s, 7);
        const v = sum(tx.filter((t) => t.jenis === 'Keluar' && t.d >= s && t.d < e));
        return { start: s, label: `${+s.slice(8, 10)}/${+s.slice(5, 7)}`, value: v, current: i === 11 };
    });
    const done = weeks.filter((w) => !w.current && w.value > 0);
    const avgWeek = done.length ? sum(done.map((w) => ({ n: w.value } as Tx))) / done.length : 0;
    const worst = weeks.reduce((a, w) => (w.value > a.value ? w : a), weeks[0]);

    const byKey = (key: (t: Tx) => string) => {
        const m = new Map<string, number>();
        out.forEach((t) => m.set(key(t), (m.get(key(t)) || 0) + t.n));
        return Array.from(m.entries()).map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v);
    };
    const kategori = byKey((t) => t.kat || 'Lainnya');
    const perBank = byKey((t) => t.bank);
    const hariMap = new Map<number, number>();
    out.forEach((t) => { const wd = new Date(`${t.d}T00:00:00Z`).getUTCDay(); hariMap.set(wd, (hariMap.get(wd) || 0) + t.n); });
    const hari = [1, 2, 3, 4, 5, 6, 0].map((wd) => ({ k: HARI[wd], v: hariMap.get(wd) || 0 }));
    const borosHari = hari.reduce((a, h) => (h.v > a.v ? h : a), hari[0]);

    const nDays = Math.round((Date.parse(end) - Date.parse(start)) / 86400_000);
    const daily = Array.from({ length: nDays }, (_, i) => {
        const d = addDays(start, i);
        return { d, day: i + 1, value: sum(out.filter((t) => t.d === d)), future: d > today };
    });

    const top = [...out].sort((a, b) => b.n - a.n).slice(0, 5);
    const perluCek = tx.filter((t) => t.status === 'Perlu dicek');

    return {
        keluar, masuk, sisa: masuk - keluar, rasio: masuk > 0 ? (masuk - keluar) / masuk : null,
        prevKeluar, prevMasuk, jumlah: out.length, perHari: keluar / daysElapsed, perTx: out.length ? keluar / out.length : 0,
        weeks, avgWeek, worst, thisWeek: weeks[11].value, kategori, perBank, hari, borosHari, daily, top,
        perluCek, list: [...inMonth].sort((a, b) => (b.d + b.t).localeCompare(a.d + a.t))
    };
}

export const delta = (cur: number, prev: number) => (prev > 0 ? cur / prev - 1 : null);
