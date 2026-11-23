import React, { useState } from 'react';
import { useApi } from '../../kantor/api';
import { apiPost } from '../../kantor/connection';
import { Info } from './InfoI';

/**
 * Penanda acara besar: laporan laba per saham (≤ 7 hari) + acara pasar (FOMC, CPI, NFP) dalam 7 hari,
 * saringan "sembunyikan yang laporan labanya ≤ 5 hari", dan pengaturan Laporan sinyal pagi.
 */
interface Makro { jenis: 'fomc' | 'cpi' | 'nfp'; tgl: string; judul: string; jamWib: string; catatan?: string }
interface DataAcara { makro: Makro[]; laba: Record<string, { tgl: string; waktu: string }> }
export function useAcara() { return useApi<DataAcara>('/api/kantor/acara', 1_800_000); }
const hariIniEt = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
export const hariLagi = (tgl: string) => Math.round((Date.parse(`${tgl}T00:00:00Z`) - Date.parse(`${hariIniEt()}T00:00:00Z`)) / 86400_000);
const kapan = (n: number) => (n <= 0 ? 'hari ini' : n === 1 ? 'besok' : `${n} hari lagi`);
const tglId = (t: string) => new Date(`${t}T00:00:00Z`).toLocaleDateString('id-ID', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const INFO_LABA = 'Perusahaan akan mengumumkan laporan keuangan kuartalan. Di hari-hari sekitar tanggal ini harga sering naik/turun tajam (bisa ±5–15% dalam sehari), apa pun sinyalnya.\n\nBukan berarti jangan beli — tapi pertimbangkan ukuran posisi lebih kecil atau tunggu sesudah laporan keluar.';

/** Tanda kuning "Laporan laba n hari lagi" untuk satu saham (hanya bila ≤ 7 hari). */
export function TandaLaba({ s }: { s: string }) {
    const a = useAcara();
    const l = a.data?.laba?.[s]; if (!l) return null;
    const n = hariLagi(l.tgl); if (n < 0 || n > 7) return null;
    return <span className="ac-tanda" title={`${INFO_LABA}\n\n${tglId(l.tgl)}${l.waktu ? `, ${l.waktu}` : ''}`}>Laporan laba {kapan(n)}</span>;
}

/* Saringan: sembunyikan saham yang laporan labanya ≤ 5 hari (diingat per perangkat). */
const LS = 'kantor:sembunyiLaba';
let sembunyi = (() => { try { return localStorage.getItem(LS) === '1'; } catch { return false; } })();
const dengar = new Set<() => void>();
export function useSembunyiLaba(): [boolean, (v: boolean) => void] {
    const [, setV] = useState(0);
    React.useEffect(() => { const f = () => setV((x) => x + 1); dengar.add(f); return () => { dengar.delete(f); }; }, []);
    return [sembunyi, (v) => { sembunyi = v; try { localStorage.setItem(LS, v ? '1' : '0'); } catch { /* */ } dengar.forEach((f) => f()); }];
}
/** Dipakai daftar Sinyal & Pantul: true = saham ini disembunyikan karena laporan laba ≤ 5 hari. */
export function useSaringLaba() {
    const a = useAcara(); const [aktif] = useSembunyiLaba();
    return (s: string) => { if (!aktif) return false; const l = a.data?.laba?.[s]; if (!l) return false; const n = hariLagi(l.tgl); return n >= 0 && n <= 5; };
}

/** Pita acara pasar 7 hari ke depan + saklar saringan laporan laba. */
export function PitaAcara() {
    const a = useAcara();
    const [aktif, setAktif] = useSembunyiLaba();
    const mk = (a.data?.makro || []).filter((x) => { const n = hariLagi(x.tgl); return n >= 0 && n <= 7; });
    const nLaba = Object.values(a.data?.laba || {}).filter((l) => { const n = hariLagi(l.tgl); return n >= 0 && n <= 5; }).length;
    if (!a.data) return null;
    return (
        <div className="ac-pita">
            <div className="ac-makro">
                {mk.length ? mk.map((x) => (
                    <span key={x.jenis + x.tgl} className={`ac-m ${x.jenis}`} title={x.catatan || ''}><b>{x.jenis === 'fomc' ? 'FOMC' : x.jenis === 'cpi' ? 'CPI' : 'NFP'}</b> {kapan(hariLagi(x.tgl))} · {tglId(x.tgl)}, {x.jamWib}</span>
                )) : <span className="ac-kosong">Tidak ada acara besar pasar (FOMC, CPI, NFP) 7 hari ke depan.</span>}
                <Info judul="Acara besar pasar" teks={'FOMC = keputusan suku bunga The Fed. CPI = data inflasi AS. NFP = data lapangan kerja AS.\n\nDi hari-hari ini seluruh pasar sering bergerak tajam dalam hitungan menit. Jadwal resmi dari The Fed & Biro Statistik Tenaga Kerja AS (BLS).'} />
            </div>
            <label className="ac-saring">
                <input type="checkbox" checked={aktif} onChange={(e) => setAktif(e.target.checked)} />
                <span>Sembunyikan yang laporan labanya ≤ 5 hari{nLaba ? ` (${nLaba})` : ''}</span>
            </label>
        </div>
    );
}

/** Acara pasar di tab Corporate actions. */
export function AcaraPasar() {
    const a = useAcara();
    const mk = (a.data?.makro || []).filter((x) => hariLagi(x.tgl) >= 0);
    if (!mk.length) return null;
    return (
        <div className="ac-pasar">
            <h4>Acara pasar 14 hari ke depan <small>berlaku untuk semua saham</small></h4>
            {mk.map((x) => <div key={x.jenis + x.tgl} className="ac-pasar-r"><span className="mono">{tglId(x.tgl)}</span><span><b>{x.judul}</b> · {x.jamWib}{x.catatan ? ` · ${x.catatan}` : ''}</span></div>)}
        </div>
    );
}

/* ── Pengaturan Laporan sinyal pagi ── */
interface AturPagi { nyala: boolean; jam: string; hari: number[]; terakhir: string }
const HARI = [[1, 'Sen'], [2, 'Sel'], [3, 'Rab'], [4, 'Kam'], [5, 'Jum'], [6, 'Sab'], [0, 'Min']] as const;
const ringkasHari = (h: number[]) => { const s = [...h].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)); if (s.length === 7) return 'tiap hari'; if (s.join() === '1,2,3,4,5') return 'Sen–Jum'; if (s.join() === '2,3,4,5,6') return 'Sel–Sab'; return s.map((x) => HARI.find((y) => y[0] === x)![1]).join(', '); };
export function LaporanPagiAtur() {
    const r = useApi<{ atur: AturPagi }>('/api/kantor/laporan-pagi', 0);
    const [lokal, setLokal] = useState<Partial<AturPagi> | null>(null);
    const [pesan, setPesan] = useState(''), [sibuk, setSibuk] = useState(false), [buka, setBuka] = useState(false);
    // Bisa berubah lewat chat ("laporan pagi jam 06.30") → muat ulang saat kembali ke halaman ini.
    React.useEffect(() => { const f = () => { if (document.visibilityState === 'visible') r.reload(); }; document.addEventListener('visibilitychange', f); return () => document.removeEventListener('visibilitychange', f); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    if (!r.data) return null;
    const a: AturPagi = { ...r.data.atur, ...(lokal || {}) }; if (!Array.isArray(a.hari)) a.hari = [2, 3, 4, 5, 6];
    const ubah = async (b: Partial<AturPagi>) => { setPesan(''); setLokal({ ...(lokal || {}), ...b }); try { await apiPost('/api/kantor/laporan-pagi', b); await r.reload(); } catch (e: any) { setPesan(String(e?.message || e)); } setLokal(null); };
    const kirim = async () => { setSibuk(true); setPesan(''); try { await apiPost('/api/kantor/laporan-pagi/kirim', {}); setPesan('Laporan terkirim ke chat Dito.'); } catch (e: any) { setPesan(String(e?.message || e)); } setSibuk(false); };
    return (
        <section className={`pw ${a.nyala ? 'nyala' : ''}`}>
            <div className="pw-atas">
                <label className="pw-saklar"><input type="checkbox" role="switch" checked={a.nyala} onChange={(e) => ubah({ nyala: e.target.checked })} /><span aria-hidden /><b>Laporan sinyal pagi</b></label>
                <small className="pw-ringkas">{a.nyala ? <>Laporan {ringkasHari(a.hari)} · {a.jam} WIB ke chat Dito</> : 'Mati — tidak ada laporan pagi'} <Info judul="Laporan sinyal pagi" teks={'Di hari & jam yang Bapak pilih (bawaan Selasa–Sabtu 07:00, setelah bursa AS tutup), Dito mengirim ringkasan ke chat + notifikasi HP:\n\n• Pasar semalam (S&P 500, sektor terkuat & terlemah)\n• Beli kuat dengan keempat faktor lengkap (maks 5)\n• Pantul tahap Zona beli / Mulai berbalik (maks 5)\n• Watchlist & portofolio: gerakan ±3%, tanda ambil untung, Jual kuat pada saham yang Bapak pegang\n• Acara pekan ini: laporan laba & FOMC/CPI/NFP\n\nDisusun dari data kantor tanpa AI, jadi cepat dan tidak memakai kuota.'} /></small>
                <div className="pw-aksi"><button className="btn small" onClick={() => setBuka(!buka)} aria-expanded={buka}>{buka ? 'Tutup' : 'Atur'}</button><button className="btn small" onClick={kirim} disabled={sibuk}>{sibuk ? 'Menyusun…' : 'Kirim sekarang'}</button></div>
            </div>
            {buka && (
                <div className="pw-atur">
                    <div className="pw-baris"><span>Hari</span><div className="pw-hari">{HARI.map(([k, l]) => <button key={k} className={a.hari.includes(k) ? 'on' : ''} aria-pressed={a.hari.includes(k)} onClick={() => { const h = a.hari.includes(k) ? a.hari.filter((x) => x !== k) : [...a.hari, k]; if (h.length) ubah({ hari: h }); else setPesan('Pilih minimal satu hari, atau matikan laporannya.'); }}>{l}</button>)}</div></div>
                    <div className="pw-baris"><span>Jam (WIB)</span><input type="time" value={a.jam} onChange={(e) => e.target.value && ubah({ jam: e.target.value })} /></div>
                    <small className="pw-catatan">Bisa juga lewat chat, mis. "laporan pagi jam 06.30, Selasa sampai Jumat" atau "matikan laporan pagi". Keduanya tersinkron.</small>
                </div>
            )}
            {(pesan || a.terakhir) && <small className="pw-catatan">{pesan || `Terakhir dikirim ${tglId(a.terakhir)}`}</small>}
        </section>
    );
}
