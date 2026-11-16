import React from 'react';

/**
 * Horison posisi: sinyal dihitung khusus untuk berapa lama posisi mau dipegang.
 * Satuan = hari bursa AS (Senin–Jumat, di luar hari libur NYSE).
 */
export type ModeH = 'scalping' | 'daytrade' | 'swingpendek' | 'swing' | 'posisi' | 'investasi' | 'tanggal';
export interface Horison { mode: ModeH; tanggal?: string }
export const PRESET: Array<{ k: Exclude<ModeH, 'tanggal'>; label: string; ket: string; H: number; info: string }> = [
    { k: 'scalping', label: 'Scalping', ket: 'menit–jam', H: 1, info: 'Masuk-keluar dalam hitungan menit sampai jam, ditutup sebelum bursa tutup. Yang menentukan: momentum & berita detik ini. Paling berisiko & paling butuh dipantau.' },
    { k: 'daytrade', label: 'Day trading', ket: 'tutup hari ini', H: 1, info: 'Dibuka & ditutup di hari bursa yang sama (tidak menginap). Teknikal jangka sangat pendek + berita.' },
    { k: 'swingpendek', label: 'Swing pendek', ket: '2–5 hari', H: 5, info: 'Menangkap satu ayunan harga dalam beberapa hari: pantulan dari jenuh jual, pola pendek, lonjakan volume.' },
    { k: 'swing', label: 'Swing', ket: '1–4 minggu', H: 20, info: 'Mengikuti satu gelombang tren beberapa minggu. Teknikal + whales paling berbobot, fundamental mulai dihitung.' },
    { k: 'posisi', label: 'Posisi', ket: '1–3 bulan', H: 60, info: 'Ikut tren besar beberapa bulan. Fundamental & tren MA50/MA200 jadi penentu utama.' },
    { k: 'investasi', label: 'Investasi', ket: '6 bulan+', H: 120, info: 'Pegang lama berdasarkan kualitas perusahaan. Fundamental paling berbobot; naik-turun harian diabaikan.' }
];
/** Nama lama (sebelum pembaruan) → mode baru. */
export const MODE_LAMA: Record<string, ModeH> = { kilat: 'daytrade', harian: 'swingpendek', mingguan: 'swing', bulanan: 'posisi' };
// Hari libur NYSE (tanggal bursa tutup penuh).
const LIBUR = new Set([
    '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
    '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24'
]);
const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Tanggal "hari ini" menurut bursa New York. */
export function hariIniNY() { return iso(new Date(Date.now() - 5 * 3600_000)); }
export const hariBursa = (t: string) => { const d = new Date(t + 'T12:00:00Z'); const w = d.getUTCDay(); return w !== 0 && w !== 6 && !LIBUR.has(t); };
/** Jumlah hari bursa SETELAH hari ini sampai tanggal (inklusif). */
export function hitungHari(sampai: string): number {
    let n = 0; const d = new Date(hariIniNY() + 'T12:00:00Z');
    for (let i = 0; i < 400; i++) { d.setUTCDate(d.getUTCDate() + 1); const t = iso(d); if (t > sampai) break; if (hariBursa(t)) n++; }
    return n;
}
/** Tanggal bursa ke-H dari hari ini. */
export function tanggalKe(H: number): string {
    const d = new Date(hariIniNY() + 'T12:00:00Z'); let n = 0;
    while (n < H) { d.setUTCDate(d.getUTCDate() + 1); if (hariBursa(iso(d))) n++; }
    return iso(d);
}
export function nilaiH(h: Horison): number {
    if (h.mode === 'tanggal' && h.tanggal) return Math.max(1, Math.min(120, hitungHari(h.tanggal)));
    return PRESET.find((p) => p.k === h.mode)?.H ?? 5;
}
/** Parameter API: H + mode (scalping dibedakan dari day trading). */
export const paramH = (h: Horison) => `h=${nilaiH(h)}${h.mode === 'scalping' ? '&m=scalping' : ''}`;
export const fmtTgl = (t: string) => new Date(t + 'T12:00:00Z').toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export function HorisonBar({ h, setH, bobot }: { h: Horison; setH: (h: Horison) => void; bobot?: Record<string, number> }) {
    const H = nilaiH(h);
    const batas = h.mode === 'tanggal' && h.tanggal ? h.tanggal : tanggalKe(H);
    const min = tanggalKe(1), max = tanggalKe(120);
    const NAMA: Record<string, string> = { teknikal: 'Teknikal', fundamental: 'Fundamental', berita: 'Berita', whales: 'Whales' };
    return (
        <section className="hz">
            <div className="hz-row">
                <span className="hz-l">Rencana pegang posisi</span>
                <div className="sb-seg scroll">
                    {PRESET.map((p) => <button key={p.k} title={p.info} className={h.mode === p.k ? 'on' : ''} onClick={() => setH({ mode: p.k })}>{p.label} <small>{p.ket}</small></button>)}
                    <label className={`hz-tgl ${h.mode === 'tanggal' ? 'on' : ''}`}>
                        📅 {h.mode === 'tanggal' && h.tanggal ? `s/d ${fmtTgl(h.tanggal)}` : 'Pilih tanggal'}
                        <input type="date" min={min} max={max} value={h.tanggal || ''} onClick={(e) => { try { (e.currentTarget as any).showPicker?.(); } catch { /* */ } }} onChange={(e) => e.target.value && setH({ mode: 'tanggal', tanggal: e.target.value })} />
                    </label>
                </div>
            </div>
            <p className="hz-ket">
                {h.mode !== 'tanggal' && <>{PRESET.find((p) => p.k === h.mode)?.info} </>}
                {H === 1 ? <>Sinyal khusus untuk posisi yang <b>ditutup sebelum bursa tutup hari ini</b>.</> : <>Sinyal di bawah khusus untuk posisi yang <b>ditutup paling lambat {fmtTgl(batas)}</b> ({H} hari bursa).</>} Target & peluang dihitung dari pergerakan {H} hari dalam 1 tahun terakhir.
                {bobot && <> Bobot: {Object.entries(bobot).filter(([, v]) => v > 0).map(([k, v]) => `${NAMA[k] || k} ${Math.round(v * 100)}%`).join(' · ')}{bobot.fundamental === 0 ? ' (fundamental tidak berpengaruh untuk posisi sependek ini)' : ''}.</>}
            </p>
        </section>
    );
}
