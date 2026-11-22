import { ALIAS_SAHAM } from '../pages/trading/aliasSaham';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiGet } from '../kantor/connection';
import { simpanApi } from '../kantor/api';
import { useKembali } from '../kantor/kembali';
import { eventBus } from '../events';
import { Ikon } from './Ikon';

/** Pencarian global (Ctrl/⌘K atau ikon cari): menu, chat, saham, catatan, berkas — satu kotak. */
type Hasil = { jenis: 'Menu' | 'Chat' | 'Saham' | 'Catatan' | 'Berkas' | 'Ingatan tim'; judul: string; sub?: string; ikon: string; buka: () => void };
const MENU: Array<[string, string, string]> = [['home', 'Beranda', '🏠'], ['obrolan', 'Chat', '💬'], ['kr', 'Knowledge Reels', '🧠'], ['keuangan', 'Keuangan', '💰'], ['trading', 'Trading', '📈'], ['sosmed', 'Konten', '🎬'], ['catatan', 'Catatan', '📓'], ['berkas', 'Berkas', '☁'], ['tugas', 'Tugas', '📋'], ['jadwal', 'Jadwal', '📅'], ['kantor', 'Kantor', '🏢']];
const ke = (page: string) => eventBus.dispatchEvent(new CustomEvent('go-page', { detail: { page } }));

export function TombolCari() {
    const [buka, setBuka] = useState(false);
    useKembali(buka, () => setBuka(false));
    useEffect(() => {
        const f = (e: KeyboardEvent) => {
            const ketik = /input|textarea|select/i.test((e.target as HTMLElement)?.tagName || '') || (e.target as HTMLElement)?.isContentEditable;
            if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !ketik)) { e.preventDefault(); setBuka(true); }
        };
        window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f);
    }, []);
    return (
        <>
            <button className="icon-btn cari-btn" aria-label="Cari (Ctrl+K)" title="Cari (Ctrl+K atau /)" onClick={() => setBuka(true)}><Ikon e="🔍" /></button>
            {buka && createPortal(<Palet tutup={() => setBuka(false)} />, document.body)}
        </>
    );
}

function Palet({ tutup }: { tutup: () => void }) {
    const [q, setQ] = useState('');
    const [jauh, setJauh] = useState<Hasil[]>([]);
    const [pilih, setPilih] = useState(0);
    const masuk = useRef<HTMLInputElement>(null);
    useEffect(() => { masuk.current?.focus(); }, []);
    const [chat, setChat] = useState<Array<{ id: string; nama: string; peran: string }>>([]);
    useEffect(() => { apiGet<{ thread: Array<{ id: string; nama: string; peran: string }> }>('/api/kantor/chat').then((d) => setChat(d.thread)).catch(() => undefined); }, []);
    // Daftar saham dari data trading yang sudah pernah dimuat (tanpa permintaan baru).
    const saham = useMemo(() => {
        const set = new Set<string>();
        for (const k of Object.keys(localStorage)) if (k.startsWith('kantor:api:/api/kantor/screener')) { const d: any = simpanApi(k.slice('kantor:api:'.length)); for (const b of d?.baris || []) set.add(b.s); }
        return [...set];
    }, []);
    const lokal = useMemo<Hasil[]>(() => {
        const k = q.trim().toLowerCase();
        const out: Hasil[] = [];
        for (const [id, nama, ikon] of MENU) if (!k || nama.toLowerCase().includes(k)) out.push({ jenis: 'Menu', judul: nama, ikon, buka: () => ke(id) });
        if (k) {
            for (const t of chat) if (`${t.nama} ${t.peran}`.toLowerCase().includes(k)) out.push({ jenis: 'Chat', judul: t.nama, sub: t.peran, ikon: '💬', buka: () => eventBus.dispatchEvent(new CustomEvent('buka-chat-global', { detail: { id: t.id } })) });
            const K = k.toUpperCase();
            for (const s of saham.filter((x) => x.startsWith(K)).slice(0, 6)) out.push({ jenis: 'Saham', judul: s, ikon: '📈', buka: () => { ke('trading'); setTimeout(() => eventBus.dispatchEvent(new CustomEvent('buka-saham', { detail: { s } })), 50); } });
            { const al = ALIAS_SAHAM[k]; if (al && !out.some((x) => x.judul === al)) out.push({ jenis: 'Saham', judul: al, sub: `${k} → ${al} · buka detail saham`, ikon: '📈', buka: () => { ke('trading'); setTimeout(() => eventBus.dispatchEvent(new CustomEvent('buka-saham', { detail: { s: al } })), 50); } }); }
            if (/^[A-Z.]{1,6}$/.test(K) && !saham.includes(K)) out.push({ jenis: 'Saham', judul: K, sub: 'Buka detail saham', ikon: '📈', buka: () => { ke('trading'); setTimeout(() => eventBus.dispatchEvent(new CustomEvent('buka-saham', { detail: { s: K } })), 50); } });
        }
        return out;
    }, [q, chat, saham]);
    useEffect(() => {
        const k = q.trim(); setJauh([]); if (k.length < 2) return;
        const t = setTimeout(async () => {
            const [c, b, m] = await Promise.all([
                apiGet<{ hasil: Array<{ path: string; cuplikan: string }> }>(`/api/kantor/catatan/cari?q=${encodeURIComponent(k)}`).catch(() => ({ hasil: [] })),
                apiGet<{ items: Array<{ nama: string; path: string; folder: boolean }> }>(`/api/kantor/berkas/cari?q=${encodeURIComponent(k)}`).catch(() => ({ items: [] })),
                apiGet<{ hasil: Array<{ ai: string; nama: string; berkas: string; cuplikan: string }> }>(`/api/kantor/memori/cari?q=${encodeURIComponent(k)}`).catch(() => ({ hasil: [] }))
            ]);
            setJauh([
                ...c.hasil.slice(0, 6).map((h): Hasil => ({ jenis: 'Catatan', judul: h.path.split('/').pop()!.replace(/\.md$/, ''), sub: h.cuplikan, ikon: '📓', buka: () => { ke('catatan'); setTimeout(() => eventBus.dispatchEvent(new CustomEvent('buka-catatan', { detail: { path: h.path } })), 80); } })),
                ...m.hasil.slice(0, 6).map((h): Hasil => ({ jenis: 'Ingatan tim', judul: `${h.nama} ingat`, sub: h.cuplikan, ikon: '🧠', buka: () => eventBus.dispatchEvent(new CustomEvent('buka-chat-global', { detail: { id: h.ai } })) })),
                ...b.items.slice(0, 6).map((h): Hasil => ({ jenis: 'Berkas', judul: h.nama, sub: h.path, ikon: h.folder ? '📁' : '📄', buka: () => { ke('berkas'); setTimeout(() => eventBus.dispatchEvent(new CustomEvent('buka-berkas', { detail: { dir: h.folder ? h.path : h.path.split('/').slice(0, -1).join('/') } })), 80); } }))
            ]);
        }, 250);
        return () => clearTimeout(t);
    }, [q]);
    const semua = [...lokal, ...jauh];
    useEffect(() => { setPilih(0); }, [q]);
    const jalankan = (h?: Hasil) => { if (!h) return; h.buka(); tutup(); };
    let jenisLalu = '';
    return (
        <div className="cari-latar" onClick={tutup}>
            <div className="cari" role="dialog" aria-label="Cari" onClick={(e) => e.stopPropagation()}>
                <div className="cari-masuk">
                    <Ikon e="🔍" size={18} />
                    <input ref={masuk} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari menu, chat, saham, catatan, berkas, ingatan tim…" aria-label="Kata pencarian"
                        onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setPilih((p) => Math.min(semua.length - 1, p + 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setPilih((p) => Math.max(0, p - 1)); } else if (e.key === 'Enter') jalankan(semua[pilih]); else if (e.key === 'Escape') tutup(); }} />
                    <kbd>Esc</kbd>
                </div>
                <div className="cari-daftar" role="listbox">
                    {!semua.length && <div className="cari-kosong">{q.trim().length < 2 ? 'Ketik minimal 2 huruf.' : `Tidak ada hasil untuk "${q}".`}</div>}
                    {semua.map((h, i) => {
                        const kepala = h.jenis !== jenisLalu ? h.jenis : ''; jenisLalu = h.jenis;
                        return (
                            <React.Fragment key={`${h.jenis}-${h.judul}-${i}`}>
                                {kepala && <div className="cari-grup">{kepala}</div>}
                                <button role="option" aria-selected={i === pilih} className={i === pilih ? 'on' : ''} onMouseEnter={() => setPilih(i)} onClick={() => jalankan(h)}>
                                    <Ikon e={h.ikon} /><span><b>{h.judul}</b>{h.sub && <small>{h.sub}</small>}</span>
                                </button>
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
