import { eventBus } from '../events';
import React, { useEffect, useRef, useState } from 'react';
import { apiGet, apiPost, serverBase, tokenLogin } from '../kantor/connection';

import { Ikon } from '../components/Ikon';
import { konfirmasi } from '../components/Konfirmasi';
interface Item { nama: string; path: string; folder: boolean; size: number; mtime: number; jenis: string }
interface Daftar { path: string; items: Item[]; terpakai: number; kuota: number; disk: { bebas: number; total: number } | null }
interface Unggah { id: string; nama: string; persen: number; error?: string; selesai?: boolean }

const IKON: Record<string, string> = { folder: '📁', gambar: '🖼️', video: '🎬', audio: '🎵', pdf: '📕', dokumen: '📄', tabel: '📊', presentasi: '📽️', arsip: '🗜️', teks: '📝', lain: '📦' };
const ukuran = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} B`);
const tgl = (ms: number) => new Date(ms).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });

export function BerkasPage() {
    const [p, setP] = useState<string>(() => { try { return localStorage.getItem('kantor:berkas-p') || ''; } catch { return ''; } });
    useEffect(() => { const f = (e: Event) => { const d = (e as CustomEvent).detail?.dir; if (typeof d === 'string') setP(d); }; eventBus.addEventListener('buka-berkas', f); return () => eventBus.removeEventListener('buka-berkas', f); }, []);
    const [d, setD] = useState<Daftar | null>(null);
    const [err, setErr] = useState('');
    const [mode, setMode] = useState<'grid' | 'list'>(() => { try { return (localStorage.getItem('kantor:berkas-mode') as any) || 'grid'; } catch { return 'grid'; } });
    const [q, setQ] = useState('');
    const [hasil, setHasil] = useState<Item[] | null>(null);
    const [antre, setAntre] = useState<Unggah[]>([]);
    const [lihat, setLihat] = useState<{ it: Item; url: string } | null>(null);
    const [menu, setMenu] = useState<string | null>(null);
    const [seret, setSeret] = useState(false);
    const input = useRef<HTMLInputElement>(null);

    const muat = (x = p) => apiGet<Daftar>(`/api/kantor/berkas/daftar?p=${encodeURIComponent(x)}`).then((r) => { setD(r); setErr(''); }).catch((e) => { setErr(String(e.message || e)); if (x) setP(''); });
    useEffect(() => { muat(p); try { localStorage.setItem('kantor:berkas-p', p); } catch { /* */ } }, [p]);
    useEffect(() => { try { localStorage.setItem('kantor:berkas-mode', mode); } catch { /* */ } }, [mode]);
    useEffect(() => {
        if (q.trim().length < 2) { setHasil(null); return; }
        const t = setTimeout(() => apiGet<{ items: Item[] }>(`/api/kantor/berkas/cari?q=${encodeURIComponent(q)}`).then((r) => setHasil(r.items)).catch(() => setHasil([])), 300);
        return () => clearTimeout(t);
    }, [q]);

    const unggah = (files: FileList | File[]) => {
        for (const f of Array.from(files)) {
            const id = `${Date.now()}-${Math.random()}`;
            setAntre((a) => [...a, { id, nama: f.name, persen: 0 }]);
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${serverBase()}/api/kantor/berkas/unggah?p=${encodeURIComponent(p)}&nama=${encodeURIComponent(f.name)}&ukuran=${f.size}`);
            xhr.setRequestHeader('Authorization', `Bearer ${tokenLogin()}`);
            xhr.setRequestHeader('Content-Type', 'application/octet-stream');
            xhr.upload.onprogress = (e) => { if (e.lengthComputable) setAntre((a) => a.map((u) => (u.id === id ? { ...u, persen: Math.round((e.loaded / e.total) * 100) } : u))); };
            xhr.onload = () => {
                let r: any = {}; try { r = JSON.parse(xhr.responseText); } catch { /* */ }
                setAntre((a) => a.map((u) => (u.id === id ? { ...u, persen: 100, selesai: xhr.status < 300, error: xhr.status < 300 ? undefined : r.error || `HTTP ${xhr.status}` } : u)));
                muat();
                setTimeout(() => setAntre((a) => a.filter((u) => u.id !== id || u.error)), 4000);
            };
            xhr.onerror = () => setAntre((a) => a.map((u) => (u.id === id ? { ...u, error: 'Koneksi terputus' } : u)));
            xhr.send(f);
        }
    };
    const aksi = async (fn: () => Promise<any>) => { setMenu(null); try { await fn(); await muat(); } catch (e: any) { alert(String(e.message || e)); } };
    const buka = async (it: Item) => {
        if (it.folder) { setP(it.path); setQ(''); return; }
        const r = await apiPost<{ url: string }>('/api/kantor/berkas/tautan', { p: it.path, unduh: false });
        const url = `${serverBase()}${r.url}`;
        if (['gambar', 'video', 'audio', 'pdf', 'teks'].includes(it.jenis)) setLihat({ it, url }); else unduh(it);
    };
    const unduh = async (it: Item) => {
        const r = await apiPost<{ url: string }>('/api/kantor/berkas/tautan', { p: it.path, unduh: true });
        const a = document.createElement('a'); a.href = `${serverBase()}${r.url}`; a.download = it.nama; document.body.appendChild(a); a.click(); a.remove();
    };
    const remah = ['', ...(d?.path ? d.path.split('/') : [])];
    const items = hasil ?? d?.items ?? [];
    const pct = d ? Math.min(100, (d.terpakai / d.kuota) * 100) : 0;

    return (
        <div className={`pg br ${seret ? 'seret' : ''}`} onDragOver={(e) => { e.preventDefault(); setSeret(true); }} onDragLeave={() => setSeret(false)} onDrop={(e) => { e.preventDefault(); setSeret(false); if (e.dataTransfer.files.length) unggah(e.dataTransfer.files); }}>
            <section className="sb-hero row-hero">
                <div><h1>Berkas</h1><p>Cloud pribadi di VPS kantor — buka berkas yang sama dari HP maupun laptop.</p></div>
                {d && (
                    <div className="br-kuota">
                        <div className="br-kuota-top"><b className="mono">{ukuran(d.terpakai)}</b><span>dari {ukuran(d.kuota)}</span></div>
                        <div className="k-meter"><i style={{ width: `${pct}%`, background: pct > 90 ? 'var(--down)' : pct > 75 ? '#f59e0b' : 'var(--up)' }} /></div>
                        {d.disk && <small>Disk VPS tersisa {ukuran(d.disk.bebas)}</small>}
                    </div>
                )}
            </section>
            <div className="sb-tools">
                <div className="sb-search"><span><Ikon e="⌕" /></span><input placeholder="Cari nama berkas di semua folder" value={q} onChange={(e) => setQ(e.target.value)} /></div>
                <button className="btn primary" onClick={() => input.current?.click()}><Ikon e="⬆" /> Unggah</button>
                <button className="btn" onClick={() => { const n = prompt('Nama folder baru'); if (n) aksi(() => apiPost('/api/kantor/berkas/folder', { p, nama: n })); }}>＋ Folder</button>
                <div className="sb-seg icons"><button className={mode === 'grid' ? 'on' : ''} onClick={() => setMode('grid')}><Ikon e="▦" /></button><button className={mode === 'list' ? 'on' : ''} onClick={() => setMode('list')}><Ikon e="☰" /></button></div>
                <input ref={input} type="file" multiple hidden onChange={(e) => { if (e.target.files) unggah(e.target.files); e.target.value = ''; }} />
            </div>
            {!hasil && (
                <nav className="br-crumbs">{remah.map((r, i) => {
                    const to = remah.slice(1, i + 1).join('/');
                    return <React.Fragment key={i}>{i > 0 && <span>›</span>}<button className={i === remah.length - 1 ? 'on' : ''} onClick={() => setP(to)}>{i === 0 ? <><Ikon e="☁" /> {'Berkas saya'}</> : r}</button></React.Fragment>;
                })}</nav>
            )}
            {hasil && <div className="sb-meta"><b>{hasil.length} hasil</b> untuk “{q}”</div>}
            {antre.length > 0 && (
                <div className="br-antre">{antre.map((u) => (
                    <div key={u.id} className={u.error ? 'err' : u.selesai ? 'ok' : ''}><span>{u.error ? <Ikon e="⚠" /> : u.selesai ? '✓' : <Ikon e="⬆" />} {u.nama}</span><div className="k-meter"><i style={{ width: `${u.persen}%`, background: u.error ? 'var(--down)' : 'var(--up)' }} /></div><small>{u.error || `${u.persen}%`}</small>{u.error && <button onClick={() => setAntre((a) => a.filter((x) => x.id !== u.id))}>✕</button>}</div>
                ))}</div>
            )}
            {err && <div className="error">{err}</div>}
            {d && items.length === 0 && <div className="sb-card fin-empty br-empty">{hasil ? 'Tidak ditemukan.' : <>Folder ini kosong.<br />Tekan <b><Ikon e="⬆" /> Unggah</b> atau seret berkas ke sini.</>}</div>}
            <div className={mode === 'grid' ? 'br-grid' : 'br-list'}>
                {items.map((it) => (
                    <div key={it.path} className="br-item" onClick={() => buka(it)}>
                        <div className="br-ico"><Ikon e={IKON[it.jenis] || '📦'} size={28} /></div>
                        <div className="br-info"><b title={it.nama}>{it.nama}</b><small>{it.folder ? 'Folder' : ukuran(it.size)} · {tgl(it.mtime)}{hasil ? ` · ${it.path.split('/').slice(0, -1).join('/') || 'Berkas saya'}` : ''}</small></div>
                        <button className="br-more" onClick={(e) => { e.stopPropagation(); setMenu(menu === it.path ? null : it.path); }}>⋯</button>
                        {menu === it.path && (
                            <div className="wl-menu br-menu" onClick={(e) => e.stopPropagation()}>
                                {!it.folder && <button onClick={() => { setMenu(null); unduh(it); }}><Ikon e="⬇" /> Unduh</button>}
                                <button onClick={() => { const n = prompt('Nama baru', it.nama); if (n && n !== it.nama) aksi(() => apiPost('/api/kantor/berkas/pindah', { dari: it.path, ke: it.path.split('/').slice(0, -1).join('/'), nama: n })); }}><Ikon e="✏" /> Ganti nama</button>
                                <button onClick={() => { const k = prompt('Pindah ke folder (kosongkan = Berkas saya), mis. Dokumen/Pajak', ''); if (k !== null) aksi(() => apiPost('/api/kantor/berkas/pindah', { dari: it.path, ke: k })); }}><Ikon e="📂" /> Pindahkan</button>
                                <button onClick={async () => { if ((await konfirmasi(`Hapus "${it.nama}"? (Disimpan di sampah 30 hari di VPS)`))) aksi(() => apiPost('/api/kantor/berkas/hapus', { p: it.path })); }}><Ikon e="🗑" /> Hapus</button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
            <p className="sb-note">Bukan pengganti backup: dokumen penting tetap simpan juga di Google Drive. Berkas bisa dibuka lewat tautan sementara (10 menit).</p>
            {lihat && (
                <div className="k-sheet br-view" onClick={() => setLihat(null)}>
                    <div className="br-view-in" onClick={(e) => e.stopPropagation()}>
                        <div className="k-sheet-h"><b>{lihat.it.nama}</b><div className="row" style={{ gap: 6 }}><button className="btn small" onClick={() => unduh(lihat.it)}><Ikon e="⬇" /> Unduh</button><button onClick={() => setLihat(null)}>✕</button></div></div>
                        {lihat.it.jenis === 'gambar' && <img src={lihat.url} alt={lihat.it.nama} />}
                        {lihat.it.jenis === 'video' && <video src={lihat.url} controls autoPlay playsInline />}
                        {lihat.it.jenis === 'audio' && <audio src={lihat.url} controls autoPlay />}
                        {(lihat.it.jenis === 'pdf' || lihat.it.jenis === 'teks') && <iframe src={lihat.url} title={lihat.it.nama} />}
                    </div>
                </div>
            )}
        </div>
    );
}
