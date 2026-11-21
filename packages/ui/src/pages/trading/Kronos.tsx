import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { apiGet, apiPost } from '../../kantor/connection';
import { Ikon } from '../../components/Ikon';

/**
 * Kronos di daftar saham: antrean latar belakang (bisa ditinggal), hasil tersimpan, lencana di Watchlist / Sinyal / Portofolio.
 * Satu sumber data bersama untuk semua halaman Trading (disegarkan tiap 5 detik saat antrean berjalan, tiap menit selain itu).
 */
export interface RingkasK { s: string; mode: string; H: number; label: string; at: number; harga: number; medianPct: number | null; pNaik: number | null; targetPct: number; stopPct: number; pTarget: number; pStop: number; rr: number; harapan: number; hariTarget: number | null; basi: boolean }
export interface AntreK { antre: string[]; jalan: { s: string; label: string; detik: number } | null; selesai: number; gagal: Array<{ s: string; galat: string }>; total: number; sisaDetik: number; rataDetik: number; malam: boolean; jadwal?: { jam: string; hari: number[] }; malamKe?: string; terpasang: boolean; gaya: { mode: string; H: number; label: string; tanggal?: string } }
interface DataK { gaya: { mode: string; H: number; label: string }; aktif: Record<string, RingkasK>; lain: Record<string, Array<{ label: string; at: number }>>; antre: AntreK }

let data: DataK | null = null;
const pendengar = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
async function muat() {
    try { data = await apiGet<DataK>('/api/kantor/kronos/hasil'); pendengar.forEach((f) => f()); } catch { /* jaringan: coba lagi nanti */ }
    if (timer) clearTimeout(timer);
    const aktif = !!(data?.antre.jalan || data?.antre.antre.length);
    if (pendengar.size) timer = setTimeout(muat, aktif ? 5000 : 60_000);
}
export const muatKronos = () => { void muat(); };
function langgan(f: () => void) { pendengar.add(f); if (pendengar.size === 1) void muat(); return () => { pendengar.delete(f); if (!pendengar.size && timer) { clearTimeout(timer); timer = null; } }; }
export function useKronos() { return useSyncExternalStore(langgan, () => data); }
if (typeof window !== 'undefined') window.addEventListener('kantor:gaya', () => { void muat(); });

const tgl = (at: number) => new Date(at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const pct = (v: number | null | undefined) => (v == null ? '–' : `${v > 0 ? '+' : ''}${v.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`);
const kelasRR = (r: RingkasK) => (r.rr >= 2 && r.pTarget >= r.pStop ? 'bagus' : r.rr >= 1.2 ? 'sedang' : 'lemah');
const menit = (d: number) => (d < 60 ? `${d} dtk` : `±${Math.round(d / 60)} menit`);
async function antrekan(simbol: string[]) { await apiPost('/api/kantor/kronos/antre', { simbol }); muatKronos(); }

/** Pita di atas Watchlist: Kronos semua + progres antrean + otomatis tiap pagi. */
export function PitaKronos({ simbol }: { simbol: string[] }) {
    const d = useKronos();
    const [err, setErr] = useState('');
    if (!d) return null;
    const a = d.antre, g = d.gaya;
    const belum = simbol.filter((s) => !d.aktif[s] || d.aktif[s].basi);
    const jalan = !!(a.jalan || a.antre.length);
    const selesai = a.total ? Math.min(a.total, a.selesai + a.gagal.length) : 0;
    const kirim = async (p: Promise<any>) => { setErr(''); try { await p; muatKronos(); } catch (e: any) { setErr(String(e.message || e)); } };
    return (
        <section className={`kr-pita ${jalan ? 'jalan' : ''}`} aria-label="Kronos untuk watchlist">
            <div className="kr-pita-a">
                <div className="kr-pita-j"><b><Ikon e="🔮" /> Kronos</b><small>gaya {g.label} · {simbol.length - belum.length}/{simbol.length} saham sudah dihitung</small></div>
                {!a.terpasang ? <small className="sb-note">Kronos belum terpasang — buka prediksi salah satu saham untuk memasang.</small> : jalan ? (
                    <button className="btn small" onClick={() => kirim(apiPost('/api/kantor/kronos/antre/batal', {}))}>Hentikan sisa antrean</button>
                ) : (
                    <div className="kr-pita-t">
                        <button className="btn small primary" disabled={!belum.length} onClick={() => kirim(antrekan(belum))}>{belum.length ? `🔮 Kronos semua · ${g.label} (${belum.length})` : '✓ Semua sudah dihitung'}</button>
                        {belum.length < simbol.length && <button className="btn small" onClick={() => kirim(antrekan(simbol))} title="Hitung ulang semua dengan data terbaru">Hitung ulang semua</button>}
                    </div>
                )}
            </div>
            {jalan && (
                <div className="kr-progres">
                    <div className="kr-bar"><i style={{ width: `${a.total ? (selesai / a.total) * 100 : 0}%` }} /></div>
                    <small>{selesai}/{a.total} selesai{a.jalan ? ` · sedang ${a.jalan.s}` : ''} · sisa {menit(a.sisaDetik)} · <b>boleh ditinggal</b> — Dito mengabari di chat saat selesai</small>
                </div>
            )}
            {!jalan && a.gagal.length > 0 && a.total > 0 && <small className="sb-note">Gagal terakhir: {a.gagal.map((x) => x.s).join(', ')} — {a.gagal[0].galat}</small>}
            {a.terpasang && <JadwalKronos a={a} kirim={kirim} />}
            {err && <div className="error">{err}</div>}
        </section>
    );
}

const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
/** Kronos otomatis: nyalakan sendiri, pilih jam & hari (WIB). */
function JadwalKronos({ a, kirim }: { a: AntreK; kirim: (p: Promise<any>) => void }) {
    const j = a.jadwal || { jam: '06:00', hari: [2, 3, 4, 5, 6] };
    const [buka, setBuka] = useState(false);
    const simpan = (x: { nyala?: boolean; jam?: string; hari?: number[] }) => kirim(apiPost('/api/kantor/kronos/malam', { nyala: x.nyala ?? a.malam, jadwal: { jam: x.jam ?? j.jam, hari: x.hari ?? j.hari } }));
    const ringkas = j.hari.length === 7 ? 'tiap hari' : j.hari.map((h) => HARI[h]).join(', ');
    return (
        <div className={`kr-jadwal ${a.malam ? 'on' : ''}`}>
            <div className="kr-jadwal-a">
                <label className="kr-saklar"><input type="checkbox" role="switch" checked={a.malam} onChange={(e) => simpan({ nyala: e.target.checked })} /><span aria-hidden /> Kronos otomatis</label>
                <small>{a.malam ? <>watchlist Utama · <b>{j.jam} WIB</b> · {ringkas}</> : 'mati — nyalakan kalau mau dihitung sendiri terjadwal'}</small>
                <button className="btn-link" onClick={() => setBuka(!buka)} aria-expanded={buka}>{buka ? 'Tutup' : 'Atur jadwal'}</button>
            </div>
            {buka && (
                <div className="kr-jadwal-isi">
                    <label>Jam (WIB)<input type="time" value={j.jam} onChange={(e) => e.target.value && simpan({ jam: e.target.value })} /></label>
                    <div role="group" aria-label="Hari" className="kr-hari">{HARI.map((h, i) => <button key={h} type="button" aria-pressed={j.hari.includes(i)} className={j.hari.includes(i) ? 'on' : ''} onClick={() => { const b = j.hari.includes(i) ? j.hari.filter((x) => x !== i) : [...j.hari, i]; if (b.length) simpan({ hari: b }); }}>{h}</button>)}</div>
                    <small className="sb-note">Saran: <b>06:00 WIB, Sel–Sab</b> — bursa AS tutup ±04:00 WIB dan data harian sudah diperbarui; Minggu & Senin pagi tidak ada sesi baru. Gaya yang dihitung = gaya posisi aktif.</small>
                </div>
            )}
        </div>
    );
}

/** Status satu saham di antrean. */
function posisiAntre(d: DataK, s: string) {
    if (d.antre.jalan?.s === s) return { jalan: true, ke: 0, detik: d.antre.jalan.detik };
    const i = d.antre.antre.indexOf(s); return i >= 0 ? { jalan: false, ke: i + 1, detik: 0 } : null;
}

/** Panel ringkas Kronos di kartu saham (Watchlist). */
export function PanelKronos({ s }: { s: string }) {
    const d = useKronos();
    if (!d) return null;
    const r = d.aktif[s], pos = posisiAntre(d, s), lain = d.lain[s];
    const henti = (e: React.MouseEvent) => e.stopPropagation();
    if (pos) return <div className="kr-panel antre" onClick={henti}><span className="kr-judul"><Ikon e="🔮" /> {pos.jalan ? <>Sedang dihitung… <small>{menit(pos.detik)}</small></> : <>Dalam antrean ke-{pos.ke}</>}</span>{pos.jalan && <span className="kr-denyut" aria-hidden />}</div>;
    if (!r) return (
        <div className="kr-panel kosong" onClick={henti}>
            <span className="kr-judul"><Ikon e="🔮" /> Kronos {d.gaya.label}: belum{lain?.length ? <small> · ada untuk {lain.map((x) => x.label).join(', ')}</small> : null}</span>
            {d.antre.terpasang && <button className="btn small" onClick={() => antrekan([s])}>Hitung</button>}
        </div>
    );
    // Rentang stop → harga sekarang → target (skala gabungan).
    const lebar = Math.max(0.1, r.targetPct - r.stopPct), posNol = (-r.stopPct / lebar) * 100;
    return (
        <div className={`kr-panel ${r.basi ? 'basi' : ''}`} onClick={henti} title="Prediksi statistik Kronos, bukan saran beli/jual">
            <div className="kr-atas">
                <span className="kr-judul"><Ikon e="🔮" /> Kronos · {r.label} <small>{tgl(r.at)}{r.basi ? ' · kedaluwarsa' : ''}</small></span>
                <span className={`kr-rr ${kelasRR(r)}`}>R:R 1:{r.rr.toLocaleString('id-ID', { maximumFractionDigits: 1 })}</span>
            </div>
            <div className="kr-arah"><span className={(r.medianPct ?? 0) >= 0 ? 'up' : 'down'}>{(r.medianPct ?? 0) >= 0 ? '▲' : '▼'} {pct(r.medianPct)}</span><small>median · peluang naik {r.pNaik ?? '–'}%</small></div>
            <div className="kr-rentang" aria-hidden><i className="stop" style={{ width: `${posNol}%` }} /><i className="tgt" style={{ width: `${100 - posNol}%` }} /><b style={{ left: `${posNol}%` }} /></div>
            <div className="kr-angka">
                <div><small>Stop</small><b className="mono down">{pct(r.stopPct)}</b><em>kena {r.pStop}%</em></div>
                <div><small>Target</small><b className="mono up">{pct(r.targetPct)}</b><em>kena {r.pTarget}%{r.hariTarget ? ` · ±${r.hariTarget} hr` : ''}</em></div>
                <div><small>Harapan</small><b className={`mono ${r.harapan >= 0 ? 'up' : 'down'}`}>{pct(r.harapan)}</b><em>per posisi</em></div>
            </div>
            {r.basi && d.antre.terpasang && <button className="btn small kr-ulang" onClick={() => antrekan([s])}>Hitung ulang</button>}
        </div>
    );
}

/** Lencana kecil untuk daftar Sinyal / Portofolio / detail: 🔮 R:R + tanggal; gaya lain ditandai. */
export function LencanaKronos({ s }: { s: string }) {
    const d = useKronos();
    if (!d) return null;
    const r = d.aktif[s], lain = d.lain[s], pos = posisiAntre(d, s);
    if (pos) return <span className="kr-len antre" title={pos.jalan ? 'Kronos sedang menghitung' : `Antrean Kronos ke-${pos.ke}`}>🔮 {pos.jalan ? '…' : `#${pos.ke}`}</span>;
    if (r) return <span className={`kr-len ${kelasRR(r)} ${r.basi ? 'basi' : ''}`} title={`Kronos ${r.label} · ${tgl(r.at)} · target ${pct(r.targetPct)} (kena ${r.pTarget}%) · stop ${pct(r.stopPct)} (kena ${r.pStop}%)${r.basi ? ' · kedaluwarsa' : ''}`}>🔮 1:{r.rr.toLocaleString('id-ID', { maximumFractionDigits: 1 })} <small>{new Date(r.at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</small></span>;
    if (lain?.length) return <span className="kr-len lain" title={`Kronos sudah dihitung untuk gaya ${lain.map((x) => x.label).join(', ')}`}>🔮 {lain[0].label}</span>;
    return null;
}

/** Urutan & saring watchlist berdasarkan Kronos. */
export type UrutK = 'bawaan' | 'rr' | 'target' | 'belum';
export function urutkanKronos(simbol: string[], urut: UrutK, d: DataK | null) {
    if (!d || urut === 'bawaan') return simbol;
    if (urut === 'belum') return simbol.filter((s) => !d.aktif[s] || d.aktif[s].basi);
    const v = (s: string) => { const r = d.aktif[s]; return r ? (urut === 'rr' ? r.rr : r.pTarget - r.pStop) : -1e9; };
    return [...simbol].sort((a, b) => v(b) - v(a));
}
export function PilihUrut({ urut, setUrut }: { urut: UrutK; setUrut: (u: UrutK) => void }) {
    return (
        <label className="kr-urut">Urutkan
            <select value={urut} onChange={(e) => setUrut(e.target.value as UrutK)}>
                <option value="bawaan">Bawaan</option><option value="rr">🔮 R:R terbaik</option><option value="target">🔮 Peluang target − stop</option><option value="belum">🔮 Belum dihitung</option>
            </select>
        </label>
    );
}
/** Sinkronkan gaya posisi ke server (sama di semua perangkat). */
export function useGayaServer(mode: string, tanggal: string | undefined, H: number, setDariServer: (m: string, t?: string) => void) {
    const [siap, setSiap] = useState(false);
    useEffect(() => { apiGet<{ gaya: { mode: string; tanggal?: string }; tersimpan?: boolean }>('/api/kantor/trading/gaya').then((r) => { if (r.tersimpan && r.gaya && (r.gaya.mode !== mode || r.gaya.tanggal !== tanggal)) setDariServer(r.gaya.mode, r.gaya.tanggal); }).catch(() => undefined).finally(() => setSiap(true)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { if (!siap) return; apiPost('/api/kantor/trading/gaya', { mode, tanggal, H }).then(() => window.dispatchEvent(new Event('kantor:gaya'))).catch(() => undefined); }, [siap, mode, tanggal, H]);
}
