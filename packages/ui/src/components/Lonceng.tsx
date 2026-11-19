import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useApi } from '../kantor/api';
import { apiPost } from '../kantor/connection';
import { useKembali } from '../kantor/kembali';
import { eventBus } from '../events';
import { Ikon } from './Ikon';

/** U18 · Riwayat notifikasi: semua kabar yang pernah dikirim kantor (Telegram & HP), bisa dibaca ulang. */
interface Notif { id: string; at: number; saluran: 'telegram' | 'hp'; judul: string; isi: string; url?: string; jenis: string }
const JENIS: Array<[string, string]> = [['', 'Semua'], ['chat', 'Chat'], ['trading', 'Trading'], ['keuangan', 'Keuangan'], ['konten', 'Konten'], ['jadwal', 'Jadwal'], ['tim', 'Tim']];
const HALAMAN: Record<string, string> = { trading: 'trading', keuangan: 'keuangan', konten: 'sosmed', jadwal: 'jadwal', tim: 'tugas' };
const jam = (t: number) => new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
const hariLabel = (t: number) => {
    const d = new Date(t + 7 * 3600_000).toISOString().slice(0, 10), kini = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    const kmr = new Date(Date.now() + 7 * 3600_000 - 86400_000).toISOString().slice(0, 10);
    return d === kini ? 'Hari ini' : d === kmr ? 'Kemarin' : new Date(t).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Jakarta' });
};

export function TombolLonceng() {
    const r = useApi<{ item: Notif[]; dibacaAt: number; belum: number }>('/api/kantor/notifikasi?n=150', 60_000);
    const [buka, setBuka] = useState(false);
    const [dibacaAt, setDibacaAt] = useState(0);
    useKembali(buka, () => setBuka(false));
    const n = buka ? 0 : r.data?.belum || 0;
    const bukaLembar = () => { setDibacaAt(r.data?.dibacaAt || 0); setBuka(true); if (r.data?.belum) apiPost('/api/kantor/notifikasi/baca', {}).then(() => r.reload()).catch(() => undefined); };
    return (
        <>
            <button className="icon-btn kp-btn" aria-label={`Notifikasi${n ? ` (${n} baru)` : ''}`} title="Riwayat notifikasi" onClick={bukaLembar}>
                <Ikon e="🔔" />{n > 0 && <span className="kp-badge">{n > 99 ? '99+' : n}</span>}
            </button>
            {buka && createPortal(<Lembar item={r.data?.item || []} dibacaAt={dibacaAt} memuat={!r.data && !r.error} tutup={() => setBuka(false)} />, document.body)}
        </>
    );
}

function Lembar({ item, dibacaAt, memuat, tutup }: { item: Notif[]; dibacaAt: number; memuat: boolean; tutup: () => void }) {
    const [jenis, setJenis] = useState('');
    const [buka, setBuka] = useState<string | null>(null);
    const tampil = item.filter((x) => !jenis || x.jenis === jenis);
    const ke = (x: Notif) => {
        tutup();
        const chat = x.url?.match(/[?&]chat=([^&]+)/)?.[1];
        if (chat) setTimeout(() => eventBus.dispatchEvent(new CustomEvent('buka-chat-global', { detail: { id: decodeURIComponent(chat) } })), 60);
        else if (HALAMAN[x.jenis]) setTimeout(() => eventBus.dispatchEvent(new CustomEvent('go-page', { detail: { page: HALAMAN[x.jenis] } })), 60);
    };
    let hariLalu = '';
    return (
        <div className="kp-latar" onClick={tutup}>
            <aside className="kp-lembar" role="dialog" aria-label="Riwayat notifikasi" onClick={(e) => e.stopPropagation()}>
                <header className="kp-h"><div><h2>Notifikasi</h2><small>Kabar dari tim yang dikirim ke Telegram & HP</small></div><button className="icon-btn" aria-label="Tutup" onClick={tutup}>✕</button></header>
                <div className="ln-filter" role="tablist">{JENIS.map(([k, l]) => <button key={k} role="tab" aria-selected={jenis === k} className={jenis === k ? 'on' : ''} onClick={() => setJenis(k)}>{l}</button>)}</div>
                <div className="kp-isi">
                    {memuat && <div className="pg-skel" style={{ height: 120 }} />}
                    {!memuat && !tampil.length && <div className="ln-kosong">{jenis ? 'Belum ada notifikasi jenis ini.' : 'Belum ada notifikasi. Kabar dari tim akan tercatat di sini.'}</div>}
                    {tampil.map((x) => {
                        const h = hariLabel(x.at), kepala = h !== hariLalu ? h : ''; hariLalu = h;
                        const panjang = x.isi.length > 160, terbuka = buka === x.id;
                        return (
                            <React.Fragment key={x.id}>
                                {kepala && <div className="ln-hari">{kepala}</div>}
                                <article className={`ln-item ${x.at > dibacaAt ? 'baru' : ''}`}>
                                    <div className="ln-atas"><b>{x.judul}</b><time>{jam(x.at)}</time></div>
                                    {x.isi && <p className={terbuka ? '' : 'ringkas'}>{x.isi}</p>}
                                    <div className="ln-aksi">
                                        <small>{x.saluran === 'hp' ? 'Notifikasi HP' : 'Telegram'}</small>
                                        {panjang && <button onClick={() => setBuka(terbuka ? null : x.id)}>{terbuka ? 'Ringkas' : 'Baca semua'}</button>}
                                        {(x.url || HALAMAN[x.jenis]) && <button onClick={() => ke(x)}>Buka</button>}
                                    </div>
                                </article>
                            </React.Fragment>
                        );
                    })}
                </div>
            </aside>
        </div>
    );
}
