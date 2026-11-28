/**
 * Acara besar pasar AS yang sering membuat harga bergerak liar:
 *   FOMC (keputusan suku bunga The Fed, diumumkan hari kedua 14:00 ET) — federalreserve.gov/monetarypolicy/fomccalendars.htm
 *   CPI (inflasi) & Employment Situation / NFP (lapangan kerja), 08:30 ET — bls.gov/schedule
 * Jadwal resmi, dicek 23 Nov 2026. Jadwal FOMC 2027 masih "tentatif" sampai dikonfirmasi The Fed.
 * Laporan laba per saham diambil terpisah dari kalender Nasdaq (sahamEkstra.petaLaba).
 */
export type JenisMakro = 'fomc' | 'cpi' | 'nfp';
export interface AcaraMakro { jenis: JenisMakro; tgl: string; judul: string; jamWib: string; catatan?: string }

// Hari keputusan FOMC = hari kedua rapat.
const FOMC: Array<[string, string?]> = [
    ['2026-12-09'],
    ['2027-01-27'], ['2027-03-17'], ['2027-04-28'], ['2027-06-09'], ['2027-07-28'], ['2027-09-15'],
    ['2027-10-27', 'Rapat strategi kebijakan (bukan rapat keputusan suku bunga biasa)'], ['2027-11-17']
];
const CPI = ['2026-12-10', '2027-01-13', '2027-02-11', '2027-03-10', '2027-04-13', '2027-05-12', '2027-06-10', '2027-07-14', '2027-08-11', '2027-09-14', '2027-10-14', '2027-11-10', '2027-12-10'];
const NFP = ['2026-12-04', '2027-01-08', '2027-02-05', '2027-03-05', '2027-04-02', '2027-05-07', '2027-06-04', '2027-07-02', '2027-08-06', '2027-09-03', '2027-10-08', '2027-11-05', '2027-12-03'];

/** Musim panas AS (EDT, UTC−4): Minggu ke-2 Maret s.d. Minggu pertama November; selain itu EST (UTC−5). */
function selisihEt(tgl: string) {
    const [y, m, d] = tgl.split('-').map(Number);
    const minggu = (bulan: number, ke: number) => { const awal = new Date(Date.UTC(y, bulan - 1, 1)).getUTCDay(); return 1 + ((7 - awal) % 7) + (ke - 1) * 7; };
    const mulai = minggu(3, 2), akhir = minggu(11, 1);
    const musimPanas = (m > 3 && m < 11) || (m === 3 && d >= mulai) || (m === 11 && d < akhir);
    return musimPanas ? 4 : 5;
}
/** Jam ET → teks WIB (bisa lewat tengah malam = tanggal berikutnya). */
function keWib(tgl: string, jam: number, menit: number) {
    const utc = Date.UTC(+tgl.slice(0, 4), +tgl.slice(5, 7) - 1, +tgl.slice(8, 10), jam + selisihEt(tgl), menit);
    const w = new Date(utc + 7 * 3600_000);
    const hh = String(w.getUTCHours()).padStart(2, '0'), mm = String(w.getUTCMinutes()).padStart(2, '0');
    const t = w.toISOString().slice(0, 10);
    return t === tgl ? `${hh}:${mm} WIB` : `${hh}:${mm} WIB (${Number(t.slice(8, 10))}/${Number(t.slice(5, 7))})`;
}

export function semuaMakro(): AcaraMakro[] {
    return [
        ...FOMC.map(([tgl, cat]) => ({ jenis: 'fomc' as const, tgl, judul: cat ? 'Rapat strategi The Fed' : 'Keputusan suku bunga The Fed (FOMC)', jamWib: keWib(tgl, 14, 0), ...(cat ? { catatan: cat } : {}) })),
        ...CPI.map((tgl) => ({ jenis: 'cpi' as const, tgl, judul: 'Data inflasi AS (CPI)', jamWib: keWib(tgl, 8, 30) })),
        ...NFP.map((tgl) => ({ jenis: 'nfp' as const, tgl, judul: 'Data lapangan kerja AS (NFP)', jamWib: keWib(tgl, 8, 30) }))
    ].sort((a, b) => a.tgl.localeCompare(b.tgl));
}

const hariIniEt = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
/** Acara makro dari hari ini (waktu AS) sampai `hari` hari ke depan. */
export function makroMendatang(hari = 14): AcaraMakro[] {
    const dari = hariIniEt(), sampai = new Date(Date.now() + hari * 86400_000).toISOString().slice(0, 10);
    return semuaMakro().filter((a) => a.tgl >= dari && a.tgl <= sampai);
}
/** Selisih hari kalender dari hari ini (waktu AS) ke tanggal. */
export function hariLagi(tgl: string) { return Math.round((Date.parse(`${tgl}T00:00:00Z`) - Date.parse(`${hariIniEt()}T00:00:00Z`)) / 86400_000); }

/** Waktu pengumuman (UTC ms): FOMC 14:00 ET, CPI & NFP 08:30 ET. */
export function waktuMakro(a: AcaraMakro): number {
    const [jam, menit] = a.jenis === 'fomc' ? [14, 0] : [8, 30];
    return Date.UTC(+a.tgl.slice(0, 4), +a.tgl.slice(5, 7) - 1, +a.tgl.slice(8, 10), jam + selisihEt(a.tgl), menit);
}
