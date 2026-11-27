import { Tx } from '../../kantor/finance';
export type { Tx };

export const IKON: Record<string, string> = {
    'Makan & Minum': '🍜', 'Transport': '🚗', 'Belanja': '🛒', 'Tagihan & Langganan': '🧾', 'Pulsa & Internet': '📱', 'Kesehatan': '💊',
    'Hiburan': '🎬', 'Investasi': '📈', 'Transfer Keluarga': '👨‍👩‍👧', 'Pendapatan': '💼', 'Gaji': '💼', 'Lainnya': '🔖'
};
export const WARNA: Record<string, string> = {
    'Makan & Minum': '#f97316', 'Transport': '#0ea5e9', 'Belanja': '#ec4899', 'Tagihan & Langganan': '#8b5cf6', 'Pulsa & Internet': '#14b8a6',
    'Kesehatan': '#22c55e', 'Hiburan': '#f59e0b', 'Investasi': '#6366f1', 'Transfer Keluarga': '#e11d48', 'Lainnya': '#64748b'
};
const PALET = ['#2563eb', '#f97316', '#10b981', '#ec4899', '#8b5cf6', '#eab308', '#06b6d4', '#ef4444', '#84cc16', '#64748b'];
export const warnaDari = (k: string, i: number) => WARNA[k] || PALET[i % PALET.length];
export const ikon = (k: string) => IKON[k] || '🔖';
export const rp = (n: number) => `${n < 0 ? '−' : ''}Rp${Math.abs(Math.round(n)).toLocaleString('id-ID')}`;
export const rpk = (n: number) => { const a = Math.abs(n); return a >= 1e9 ? `${(n / 1e9).toFixed(1)}M` : a >= 1e6 ? `${(n / 1e6).toFixed(1)}jt` : a >= 1e3 ? `${Math.round(n / 1e3)}rb` : String(Math.round(n)); };

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const iso = (d: Date) => d.toISOString().slice(0, 10);
export const hariIni = () => iso(new Date(Date.now() + 7 * 3600_000));
export const tglPanjang = (d: string) => { const x = new Date(`${d}T00:00:00Z`); return `${HARI[x.getUTCDay()]}, ${x.getUTCDate()} ${BULAN[x.getUTCMonth()]} ${x.getUTCFullYear()}`; };
export const tglPendek = (d: string) => { const x = new Date(`${d}T00:00:00Z`); return `${x.getUTCDate()} ${BULAN[x.getUTCMonth()]}`; };

/** Periode mengikuti tanggal gajian (mis. 25 Okt – 24 Nov). k = geser periode (−1 = sebelumnya). */
export function periode(mulai: number, k = 0, acuan = hariIni()) {
    const d = new Date(`${acuan}T00:00:00Z`);
    let y = d.getUTCFullYear(), m = d.getUTCMonth();
    if (d.getUTCDate() < mulai) m -= 1;
    m += k;
    const start = new Date(Date.UTC(y, m, mulai));
    const end = new Date(Date.UTC(y, m + 1, mulai - 1));
    return { start: iso(start), end: iso(end), label: mulai === 1 ? `${['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'][start.getUTCMonth()]} ${start.getUTCFullYear()}` : `${tglPendek(iso(start))} – ${tglPendek(iso(end))} ${end.getUTCFullYear()}`, pendek: BULAN[(mulai >= 15 ? end : start).getUTCMonth()] + ` '${String((mulai >= 15 ? end : start).getUTCFullYear()).slice(2)}` };
}
export const dalam = (t: Tx, p: { start: string; end: string }) => t.d >= p.start && t.d <= p.end;
export const keluar = (t: Tx) => t.jenis === 'Keluar';
export const masuk = (t: Tx) => t.jenis === 'Masuk';
/** Pindah dana antar rekening sendiri: bukan pengeluaran/pemasukan; arahnya disimpan di kategori. */
export const transfer = (t: Tx) => t.jenis === 'Antar Rekening';
export const transferMasuk = (t: Tx) => transfer(t) && /masuk/i.test(t.kat || '');
/** Pengaruh satu transaksi ke saldo rekeningnya sendiri. */
export const efekSaldo = (t: Tx) => (t.jenis === 'Masuk' || transferMasuk(t) ? t.n : -t.n);
/** Rekening tujuan/asal dari keterangan "ke Mandiri" / "dari BCA" (diisi saat transfer sendiri dipasangkan). */
export const tujuanTransfer = (t: Tx) => (t.ket || '').match(/(?:^|\s)(?:ke|dari)\s+([^·]+?)\s*(?:·|$)/i)?.[1]?.trim() || '';
const samaAkun = (a: string, b: string) => a.toLowerCase().replace(/\s/g, '') === b.toLowerCase().replace(/\s/g, '');
/**
 * Saldo rekening = patokan (mutasi PDF) + semua transaksi rekening itu sesudah tanggal patokan,
 * termasuk dana pindahan dari rekening sendiri lain yang baru tercatat di sisi pengirim ("ke Mandiri" tanpa pasangan masuk di Mandiri).
 */
export function saldoKini(akun: string, patokan: { nilai: number; tanggal: string }, tx: Tx[]) {
    const sesudah = tx.filter((t) => t.d > patokan.tanggal);
    const milik = sesudah.filter((t) => samaAkun(t.bank, akun));
    let n = patokan.nilai + milik.reduce((a, t) => a + efekSaldo(t), 0);
    const hari = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400_000;
    for (const t of sesudah) {
        if (samaAkun(t.bank, akun) || !transfer(t) || transferMasuk(t) || !samaAkun(tujuanTransfer(t), akun)) continue;
        const adaPasangan = milik.some((m) => transferMasuk(m) && Math.abs(m.n - t.n) <= 1 && hari(m.d, t.d) <= 1);
        if (!adaPasangan) n += t.n;
    }
    return n;
}
export const sum = (xs: Tx[]) => xs.reduce((a, t) => a + t.n, 0);
export function kelompok<T>(xs: T[], key: (x: T) => string) {
    const m = new Map<string, T[]>();
    for (const x of xs) { const k = key(x); m.set(k, [...(m.get(k) || []), x]); }
    return m;
}
