import React, { useState } from 'react';
import { useApi } from '../../kantor/api';
import { apiPost } from '../../kantor/connection';
import { Info } from './InfoI';

/**
 * Pantauan AI untuk satu folder watchlist: nyala/mati, hari & jam laporan (WIB), dan isi laporan.
 * Laporan dikirim Dito lewat chat (+ notifikasi HP): perubahan penting dulu, lalu satu baris per saham.
 */
interface Isi { sinyal: boolean; berita: boolean; whales: boolean; fundamental: boolean; kronos: boolean }
interface Atur { nyala: boolean; hari: number[]; jam: string; isi: Isi }
interface Baris { id: string; nama: string; n: number; atur: Atur; terakhir: number }
const HARI = [[1, 'Sen'], [2, 'Sel'], [3, 'Rab'], [4, 'Kam'], [5, 'Jum'], [6, 'Sab'], [0, 'Min']] as const;
const ISI: Array<[keyof Isi, string, string]> = [
    ['sinyal', 'Sinyal & diskon', 'Perubahan label/skor sinyal dan tahap "lagi diskon" (Dito)'],
    ['berita', 'Berita', 'Berita baru positif/negatif 7 hari (Nina)'],
    ['whales', 'Whales', 'Arus uang besar & transaksi orang dalam (Sari)'],
    ['fundamental', 'Fundamental', 'Perubahan penilaian fundamental & ringkas PER/ROE (Raka)'],
    ['kronos', 'Kronos', 'Hasil Kronos tersimpan: R:R & harapan profil terbaik']
];
const INFO = 'Di jadwal yang Bapak pilih, Dito mengirim laporan folder ini ke chat (dan notifikasi HP). Yang paling atas selalu "yang berubah sejak laporan lalu": sinyal naik/turun, saham masuk Zona beli / Mulai berbalik, berita baru, transaksi orang dalam, perubahan fundamental, dan laporan keuangan dalam 7 hari. Kalau tidak ada yang berubah, cukup satu baris — tidak spam.';

function ringkasHari(h: number[]) {
    const s = [...h].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    if (s.length === 7) return 'tiap hari';
    if (s.join() === '1,2,3,4,5') return 'Sen–Jum';
    return s.map((x) => HARI.find((y) => y[0] === x)![1]).join(', ');
}

export function PantauFolder({ id }: { id: string }) {
    const r = useApi<{ folder: Baris[] }>('/api/kantor/pantau-watch', 0);
    const f = r.data?.folder.find((x) => x.id === id);
    const [buka, setBuka] = useState(false), [pesan, setPesan] = useState(''), [sibuk, setSibuk] = useState(false);
    // Folder baru dibuat / berganti folder → muat ulang daftar pantauan.
    React.useEffect(() => { if (r.data && !f) r.reload(); setPesan(''); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
    React.useEffect(() => { const g = () => r.reload(); window.addEventListener('kantor:watchlist', g); return () => window.removeEventListener('kantor:watchlist', g); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    const [lokal, setLokal] = useState<Partial<Atur> | null>(null);
    if (!f) return null;
    const a: Atur = { ...f.atur, ...(lokal || {}) };
    // Optimis: tampilan langsung berubah, lalu disimpan ke server (dikembalikan kalau gagal).
    const ubah = async (b: Partial<Atur>) => { setPesan(''); setLokal({ ...(lokal || {}), ...b }); try { await apiPost('/api/kantor/pantau-watch', { id, ...b }); await r.reload(); setLokal(null); } catch (e: any) { setLokal(null); setPesan(String(e?.message || e)); } };
    const kirim = async () => { setSibuk(true); setPesan(''); try { await apiPost('/api/kantor/pantau-watch/kirim', { id }); setPesan('Laporan terkirim ke chat Dito.'); r.reload(); } catch (e: any) { setPesan(String(e?.message || e)); } finally { setSibuk(false); } };
    const isiAktif = ISI.filter(([k]) => a.isi[k]).map(([, l]) => l.toLowerCase()).join(', ');
    return (
        <section className={`pw ${a.nyala ? 'nyala' : ''}`}>
            <div className="pw-atas">
                <label className="pw-saklar">
                    <input type="checkbox" role="switch" checked={a.nyala} onChange={(e) => ubah({ nyala: e.target.checked })} />
                    <span aria-hidden />
                    <b>Dipantau AI</b>
                </label>
                <small className="pw-ringkas">{a.nyala ? <>Laporan {ringkasHari(a.hari)} · {a.jam} WIB · {isiAktif || 'belum ada isi'}</> : 'Mati — tidak ada laporan terjadwal'} <Info judul="Pantauan AI per folder" teks={INFO} /></small>
                <div className="pw-aksi">
                    <button className="btn small" onClick={() => setBuka(!buka)} aria-expanded={buka}>{buka ? 'Tutup' : 'Atur'}</button>
                    <button className="btn small" onClick={kirim} disabled={sibuk || !f.n}>{sibuk ? 'Menyusun…' : 'Kirim laporan sekarang'}</button>
                </div>
            </div>
            {buka && (
                <div className="pw-atur">
                    <div className="pw-baris"><span>Hari</span><div className="pw-hari">{HARI.map(([k, l]) => <button key={k} className={a.hari.includes(k) ? 'on' : ''} aria-pressed={a.hari.includes(k)} onClick={() => ubah({ hari: a.hari.includes(k) ? a.hari.filter((x) => x !== k) : [...a.hari, k] })}>{l}</button>)}</div></div>
                    <div className="pw-baris"><span>Jam (WIB)</span><input type="time" value={a.jam} onChange={(e) => e.target.value && ubah({ jam: e.target.value })} /></div>
                    <div className="pw-baris atas"><span>Isi laporan</span><div className="pw-isi">{ISI.map(([k, l, ket]) => (
                        <label key={k}><input type="checkbox" checked={a.isi[k]} onChange={(e) => ubah({ isi: { ...a.isi, [k]: e.target.checked } })} /><span><b>{l}</b><small>{ket}</small></span></label>
                    ))}</div></div>
                </div>
            )}
            {(pesan || f.terakhir > 0) && <small className="pw-catatan">{pesan || `Laporan terakhir ${new Date(f.terakhir).toLocaleString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}</small>}
        </section>
    );
}
