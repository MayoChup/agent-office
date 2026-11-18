import React, { useState } from 'react';
import { useApi } from '../../kantor/api';
import { apiPost } from '../../kantor/connection';
import { FaktorKey, ScreenerData } from './types';
import { Kartu } from './PilihanView';

import { Ikon } from '../../components/Ikon';
export interface Folder { id: string; nama: string; ikon: string; simbol: string[] }
export interface FolderData { folders: Folder[]; utama: string[] }
const IKON = ['📁', '⭐', '💰', '🚀', '🏦', '🤖', '⚡', '🛢️', '💊', '🛒', '👀', '🎯'];

export function WatchlistView({ data, faktor, onOpen }: { data: ScreenerData; faktor: FaktorKey; onOpen: (s: string) => void }) {
    const fd = useApi<FolderData>('/api/kantor/watchlist-folder', 0);
    React.useEffect(() => { const f = () => fd.reload(); window.addEventListener('kantor:watchlist', f); return () => window.removeEventListener('kantor:watchlist', f); }, []);
    const [aktif, setAktif] = useState<string>('utama');
    const [baru, setBaru] = useState<{ nama: string; ikon: string } | null>(null);
    const [tambah, setTambah] = useState('');
    const [err, setErr] = useState('');
    const folders = fd.data?.folders || [];
    const cur = folders.find((f) => f.id === aktif);
    const simbol = aktif === 'utama' ? fd.data?.utama || [] : cur?.simbol || [];

    const kirim = async (body: any) => {
        setErr('');
        try { const r = await apiPost<FolderData>('/api/kantor/watchlist-folder', body); fd.reload(); return r; } catch (e: any) { setErr(String(e.message || e)); return null; }
    };
    const tambahSaham = async () => {
        const s = tambah.trim().toUpperCase(); if (!s) return;
        if (aktif === 'utama') { try { await apiPost('/api/kantor/trading/watchlist', { simbol: s, aksi: 'tambah' }); fd.reload(); } catch (e: any) { setErr(String(e.message || e)); } }
        else await kirim({ aksi: 'tambah', id: aktif, simbol: s });
        setTambah('');
    };
    const buang = async (s: string) => {
        if (aktif === 'utama') { await apiPost('/api/kantor/trading/watchlist', { simbol: s, aksi: 'hapus' }).catch(() => undefined); fd.reload(); }
        else await kirim({ aksi: 'buang', id: aktif, simbol: s });
    };

    return (
        <>
            <section className="sb-hero row-hero">
                <div><h1>Watchlist</h1><p>Kelompokkan saham ke folder. Folder <b>Utama</b> dipantau Dito (strategi harian, investigasi otomatis, data orang dalam).</p></div>
            </section>
            <div className="wl-folders">
                <button className={aktif === 'utama' ? 'on' : ''} onClick={() => setAktif('utama')}><span><Ikon e="⭐" /></span>Utama <small>{fd.data?.utama.length ?? 0}</small></button>
                {folders.map((f) => <button key={f.id} className={aktif === f.id ? 'on' : ''} onClick={() => setAktif(f.id)}><span><Ikon e={f.ikon} /></span>{f.nama} <small>{f.simbol.length}</small></button>)}
                <button className="add" onClick={() => setBaru({ nama: '', ikon: '📁' })}>＋ Folder baru</button>
            </div>
            {baru && (
                <section className="sb-card wl-new">
                    <div className="wl-icons">{IKON.map((i) => <button key={i} className={baru.ikon === i ? 'on' : ''} onClick={() => setBaru({ ...baru, ikon: i })}>{i}</button>)}</div>
                    <form className="row" style={{ gap: 8 }} onSubmit={async (e) => { e.preventDefault(); const r = await kirim({ aksi: 'buat', ...baru }); if (r) { setAktif(r.folders[r.folders.length - 1].id); setBaru(null); } }}>
                        <input className="input" autoFocus placeholder="Nama folder, mis. Dividen, AI, Pantau minggu ini" value={baru.nama} onChange={(e) => setBaru({ ...baru, nama: e.target.value })} />
                        <button className="btn primary" disabled={!baru.nama.trim()}>Buat</button>
                        <button type="button" className="btn" onClick={() => setBaru(null)}>Batal</button>
                    </form>
                </section>
            )}
            <div className="sb-tools">
                <form className="sb-search" onSubmit={(e) => { e.preventDefault(); tambahSaham(); }}><span>＋</span><input placeholder={`Tambah saham ke ${aktif === 'utama' ? 'Utama' : cur?.nama || ''} (kode, mis. NVDA)`} value={tambah} onChange={(e) => setTambah(e.target.value.toUpperCase())} /></form>
                {cur && (
                    <>
                        <button className="btn" onClick={() => { const n = prompt('Nama baru folder', cur.nama); if (n) kirim({ aksi: 'ubah', id: cur.id, nama: n }); }}>Ganti nama</button>
                        <button className="btn" onClick={() => { if (confirm(`Hapus folder "${cur.nama}"? Sahamnya tidak terhapus dari data.`)) { kirim({ aksi: 'hapus', id: cur.id }); setAktif('utama'); } }}>Hapus folder</button>
                    </>
                )}
            </div>
            {err && <div className="error">{err}</div>}
            {simbol.length === 0 && <div className="sb-card fin-empty">Folder ini masih kosong. Tambahkan kode saham di atas, atau dari halaman detail saham (tombol + Watchlist).</div>}
            <div className="sb-grid">
                {simbol.map((s) => {
                    const b = data.baris.find((x) => x.s === s);
                    return (
                        <div key={s} className="wl-item">
                            {b ? <Kartu b={b} faktor={faktor} onOpen={onOpen} /> : (
                                <article className="sb-cardx" onClick={() => onOpen(s)}><header><div><b className="mono">{s}</b><small>{data.baris.length ? 'Di luar S&P 500 — ketuk untuk grafik & sinyal' : 'Data pasar belum diambil — ketuk untuk grafik'}</small></div></header></article>
                            )}
                            <button className="wl-x" title="Keluarkan dari folder" onClick={() => buang(s)}>✕</button>
                        </div>
                    );
                })}
            </div>
        </>
    );
}
