import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useApi } from '../kantor/api';
import { apiPost } from '../kantor/connection';
import { useKembali } from '../kantor/kembali';
import { eventBus } from '../events';
import { Ikon } from './Ikon';

interface Item { kode: string; jenis: 'tugas' | 'posting' | 'balasan' | 'rem'; judul: string; detail: string; dari: string; at: number; buka?: { halaman: string }; setuju?: { url: string; body?: any; label: string }; tolak?: { url: string; body?: any; label: string } }
interface RemAi { id: string; nama: string; peran: string; status: 'normal' | 'tegur' | 'batasi' | 'henti'; sebab: string; persen: { jam5: number; hari: number; minggu: number } }
const JENIS: Record<Item['jenis'], string> = { tugas: 'Tugas', posting: 'Posting', balasan: 'Balasan', rem: 'Rem AI' };
const sejak = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `${Math.max(1, m)} mnt` : m < 1440 ? `${Math.round(m / 60)} jam` : `${Math.round(m / 1440)} hari`; };

/** Tombol kotak keputusan di bilah atas + lembar daftarnya (semua persetujuan di satu tempat). */
export function TombolKeputusan() {
    const r = useApi<{ item: Item[] }>('/api/kantor/keputusan', 30_000);
    const [buka, setBuka] = useState(false);
    useKembali(buka, () => setBuka(false));
    const n = r.data?.item.length || 0;
    return (
        <>
            <button className="icon-btn kp-btn" aria-label={`Perlu keputusan Bapak (${n})`} title="Perlu keputusan Bapak" onClick={() => setBuka(true)}>
                <Ikon e="📥" />{n > 0 && <span className="kp-badge">{n > 99 ? '99+' : n}</span>}
            </button>
            {buka && createPortal(<Lembar item={r.data?.item || []} muat={() => r.reload()} tutup={() => setBuka(false)} />, document.body)}
        </>
    );
}

function Lembar({ item, muat, tutup }: { item: Item[]; muat: () => void; tutup: () => void }) {
    const [busy, setBusy] = useState(''); const [err, setErr] = useState(''); const [selesai, setSelesai] = useState<string[]>([]);
    const rem = useApi<{ ai: RemAi[] }>('/api/kantor/rem', 60_000);
    const aksi = async (it: Item, a: NonNullable<Item['setuju']>) => {
        setBusy(it.kode); setErr('');
        try { await apiPost(a.url, a.body || {}); setSelesai((s) => [...s, it.kode]); muat(); rem.reload(); } catch (e: any) { setErr(`${it.kode}: ${String(e.message || e)}`); }
        setBusy('');
    };
    const tampil = item.filter((x) => !selesai.includes(x.kode));
    const perhatian = (rem.data?.ai || []).filter((a) => a.status !== 'normal');
    return (
        <div className="kp-latar" onClick={tutup}>
            <aside className="kp-lembar" role="dialog" aria-label="Perlu keputusan Bapak" onClick={(e) => e.stopPropagation()}>
                <header className="kp-h"><div><h2>Perlu keputusan Bapak</h2><small>{tampil.length ? `${tampil.length} menunggu` : 'Tidak ada yang menunggu'}</small></div><button className="icon-btn" onClick={tutup} aria-label="Tutup">✕</button></header>
                {err && <div className="error">{err}</div>}
                <div className="kp-isi">
                    {!tampil.length && <div className="fin-empty">Semua sudah diputuskan. Usulan tugas, posting, balasan komentar, dan AI yang direm akan muncul di sini.</div>}
                    {tampil.map((it) => (
                        <article key={it.kode} className="kp-item">
                            <div className="kp-meta"><span className="kp-kode mono">{it.kode}</span><span className={`kp-jenis j-${it.jenis}`}>{JENIS[it.jenis]}</span><small>{it.dari} · {sejak(it.at)} lalu</small></div>
                            <b>{it.judul}</b>
                            {it.detail && <p>{it.detail}</p>}
                            <div className="kp-aksi">
                                {it.setuju && <button className="btn primary small" disabled={busy === it.kode} onClick={() => aksi(it, it.setuju!)}>{busy === it.kode ? 'Memproses…' : it.setuju.label}</button>}
                                {it.tolak && <button className="btn small" disabled={busy === it.kode} onClick={() => aksi(it, it.tolak!)}>{it.tolak.label}</button>}
                                {it.buka && <button className="btn small" onClick={() => { eventBus.dispatchEvent(new CustomEvent('go-page', { detail: { page: it.buka!.halaman } })); tutup(); }}>Lihat</button>}
                            </div>
                        </article>
                    ))}
                    {!!perhatian.length && (
                        <section className="kp-rem">
                            <h3>Rem otonomi</h3>
                            {perhatian.map((a) => (
                                <div key={a.id} className={`kp-rem-baris s-${a.status}`}>
                                    <span><b>{a.nama}</b><small>{a.status === 'tegur' ? 'Ditegur' : a.status === 'batasi' ? 'Dibatasi' : 'Dihentikan'} · {a.sebab}</small></span>
                                    <span className="mono">{a.persen.hari}% hari ini</span>
                                    {a.status !== 'tegur' && <button className="btn small" onClick={async () => { await apiPost(`/api/kantor/rem/${a.id}/lanjutkan`, {}).catch(() => undefined); rem.reload(); muat(); }}>Lanjutkan</button>}
                                </div>
                            ))}
                        </section>
                    )}
                </div>
            </aside>
        </div>
    );
}
