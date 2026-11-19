import { TombolPasang } from '../kantor/pasang';
import { useKembali } from '../kantor/kembali';
import React, { useEffect, useState } from 'react';
import { useKantor } from '../kantor/store';
import { useSubNavState } from '../kantor/subnav';
import { eventBus } from '../events';

import { Ikon } from './Ikon';
export type PageKey = 'home' | 'kantor' | 'keuangan' | 'trading' | 'sosmed' | 'tugas' | 'jadwal' | 'obrolan' | 'catatan' | 'berkas' | 'kr';
export type SidePanel = 'org' | 'activity' | 'papan' | null;
export type KunciPanel = 'org' | 'activity' | 'papan';
const PANEL = new Set(['org', 'activity', 'papan']);

/** Ketuk menu yang sedang dibuka sekali lagi = kembali ke paling atas (seperti IG). */
const keAtas = () => document.querySelectorAll<HTMLElement>('.page:not([hidden]), .page:not([hidden]) .pg, .page:not([hidden]) .kr-feed, .page:not([hidden]) .wa-items').forEach((el) => el.scrollTo({ top: 0, behavior: 'smooth' }));
/** Menu bawah di HP: halaman yang paling sering dibuka. */
const BAWAH = ['home', 'obrolan', 'kr', 'trading'] as const;
const ALL: Array<{ key: PageKey | KunciPanel; ico: string; label: string; ket?: string }> = [
    { key: 'home', ico: '🏠', label: 'Beranda', ket: 'Ringkasan hari ini' },
    { key: 'obrolan', ico: '💬', label: 'Chat', ket: 'Ngobrol dengan tim AI' },
    { key: 'kr', ico: '🧠', label: 'Knowledge Reels', ket: 'Bacaan harian, pengganti scroll' },
    { key: 'keuangan', ico: '💰', label: 'Keuangan', ket: 'Pengeluaran, anggaran, transaksi' },
    { key: 'trading', ico: '📈', label: 'Trading', ket: 'Watchlist, sinyal, peta pasar' },
    { key: 'sosmed', ico: '🎬', label: 'Konten', ket: 'Social media: rencana & prompt' },
    { key: 'catatan', ico: '📓', label: 'Catatan', ket: 'Buku catatan & gambar' },
    { key: 'berkas', ico: '☁️', label: 'Berkas', ket: 'Cloud pribadi 5 GB' },
    { key: 'tugas', ico: '📋', label: 'Tugas', ket: 'Pekerjaan tim' },
    { key: 'jadwal', ico: '📅', label: 'Jadwal', ket: 'Kalender & pengingat' },
    { key: 'kantor', ico: '🏢', label: 'Kantor', ket: 'Kantor 2D, papan kerja AI' },
    { key: 'papan', ico: '🗂️', label: 'Papan kerja' },
    { key: 'org', ico: '🧭', label: 'Bagan' },
    { key: 'activity', ico: '⚡', label: 'Aktivitas' }
];
/** Di HP, Bagan & Aktivitas jadi menu bawah halaman Kantor, jadi tidak perlu ada di menu samping. */
const LACI = ALL.filter((i) => !PANEL.has(i.key));

export function Nav({ page, panel, onGo, hidup = [] }: { page: PageKey; panel: SidePanel; onGo: (k: PageKey | KunciPanel) => void; hidup?: PageKey[] }) {
    const tasks = useKantor((s) => s.tasks);
    const activeTasks = tasks.filter((t) => t.status === 'in_progress' || t.status === 'blocked').length;
    const sub = useSubNavState();
    const [laci, setLaci] = useState(false);
    useKembali(laci, () => setLaci(false));
    const [kecil, setKecilS] = useState(() => { try { return localStorage.getItem('kantor:menu-kecil') === '1'; } catch { return false; } });
    const setKecil = (v: boolean) => { setKecilS(v); try { localStorage.setItem('kantor:menu-kecil', v ? '1' : '0'); } catch { /* */ } };
    useEffect(() => { document.body.classList.toggle('menu-kecil', kecil); }, [kecil]);
    const badge = (k: string) => (k === 'tugas' ? activeTasks : 0);
    const isActive = (k: string) => (PANEL.has(k) ? page === 'kantor' && panel === k : page === k && !(k === 'kantor' && panel));

    useEffect(() => {
        // ☰: di HP membuka laci menu, di laptop memperkecil/melebarkan menu samping.
        const buka = () => { if (window.innerWidth >= 768) setKecilS((k) => { const v = !k; try { localStorage.setItem('kantor:menu-kecil', v ? '1' : '0'); } catch { /* */ } return v; }); else setLaci(true); };
        eventBus.addEventListener('buka-menu', buka);
        return () => eventBus.removeEventListener('buka-menu', buka);
    }, []);
    useEffect(() => { setLaci(false); }, [page]);
    useEffect(() => { document.body.classList.toggle('tanpa-subnav', !sub || sub.items.length < 2); }, [sub]);

    const N = (n: number) => (n > 9 ? '9+' : n);
    return (
        <>
            {/* Laptop: menu samping lebar (bisa diperkecil jadi ikon saja lewat ☰) */}
            <nav className={`sidebar interactive ${kecil ? 'kecil' : ''}`}>
                {LACI.map((it) => (
                    <React.Fragment key={it.key}>
                        <button className={`sb-item ${isActive(it.key) ? 'on' : ''}`} onClick={() => onGo(it.key)} title={it.label}>
                            <span className="sb-ico"><Ikon e={it.ico} /></span>
                            <span className="sb-t"><b>{it.label}</b>{it.ket && <small>{it.ket}</small>}</span>
                            {badge(it.key) > 0 && <span className="sb-badge">{N(badge(it.key))}</span>}
                            {hidup.includes(it.key as PageKey) && page !== it.key && <i className="sb-hidup" title="Masih terbuka — kembali tanpa memuat ulang" />}
                        </button>
                        {it.key === 'kantor' && page === 'kantor' && ALL.filter((x) => PANEL.has(x.key)).map((x) => (
                            <button key={x.key} className={`sb-item sb-anak ${isActive(x.key) ? 'on' : ''}`} onClick={() => onGo(x.key)} title={x.label}>
                                <span className="sb-ico"><Ikon e={x.ico} /></span><span className="sb-t"><b>{x.label}</b></span>
                            </button>
                        ))}
                    </React.Fragment>
                ))}
                <span className="sb-spacer" />
                <TombolPasang className="sb-item" kecil />
                <button className="sb-item sb-kecilkan" onClick={() => setKecil(!kecil)} title={kecil ? 'Lebarkan menu' : 'Perkecil menu'}>
                    <span className="sb-ico">{kecil ? '»' : '«'}</span><span className="sb-t"><b>Perkecil menu</b></span>
                </button>
            </nav>

            {/* HP: bagian-bagian halaman = tab geser di atas (bukan di bawah lagi) */}
            {sub && sub.items.length > 1 && (
                <nav className="subtab interactive" aria-label="Bagian halaman">
                    {sub.items.map((it) => (
                        <button key={it.k} className={sub.aktif === it.k ? 'on' : ''} aria-current={sub.aktif === it.k ? 'page' : undefined} onClick={() => sub.pilih(it.k)}>
                            {it.label}{!!it.badge && <span className="badge">{N(it.badge)}</span>}
                        </button>
                    ))}
                </nav>
            )}
            {/* HP: menu bawah = menu utama (satu ketukan), sisanya di "Menu" */}
            <nav className="dock dock-utama interactive" aria-label="Menu utama">
                {BAWAH.map((k) => { const it = ALL.find((x) => x.key === k)!; return (
                    <button key={k} className={`dock-btn ${page === k ? 'active' : ''}`} aria-current={page === k ? 'page' : undefined} onClick={() => (page === k ? keAtas() : onGo(k))}>
                        <span className="ico"><Ikon e={it.ico} /></span><span className="dock-lbl">{k === 'kr' ? 'Reels' : it.label}</span>
                        {badge(k) > 0 && <span className="badge">{N(badge(k))}</span>}
                    </button>
                ); })}
                <button className={`dock-btn ${!BAWAH.includes(page as any) ? 'active' : ''}`} onClick={() => setLaci(true)}>
                    <span className="ico"><Ikon e="☰" /></span><span className="dock-lbl">{!BAWAH.includes(page as any) ? (ALL.find((x) => x.key === page)?.label || 'Menu') : 'Menu'}</span>
                </button>
            </nav>

            {/* HP: menu samping (laci) berisi semua menu utama */}
            {laci && (
                <div className="laci interactive" onClick={() => setLaci(false)}>
                    <aside className="laci-in" onClick={(e) => e.stopPropagation()}>
                        <div className="laci-h"><b>Menu</b><button className="icon-btn" onClick={() => setLaci(false)} aria-label="Tutup menu">✕</button></div>
                        {LACI.map((it) => (
                            <button key={it.key} className={`laci-btn ${page === it.key ? 'on' : ''}`} onClick={() => { setLaci(false); onGo(it.key); }}>
                                <span className="laci-ico"><Ikon e={it.ico} /></span>
                                <span className="laci-t"><b>{it.label}</b>{it.ket && <small>{it.ket}</small>}</span>
                                {badge(it.key) > 0 && <span className="laci-badge">{N(badge(it.key))}</span>}
                            </button>
                        ))}
                        <TombolPasang className="laci-btn laci-pasang" />
                    </aside>
                </div>
            )}
        </>
    );
}
