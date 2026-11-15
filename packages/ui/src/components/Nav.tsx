import React, { useEffect, useState } from 'react';
import { useKantor } from '../kantor/store';
import { useSubNavState } from '../kantor/subnav';
import { eventBus } from '../events';

export type PageKey = 'home' | 'kantor' | 'keuangan' | 'trading' | 'tugas' | 'jadwal' | 'obrolan' | 'catatan' | 'berkas';
export type SidePanel = 'org' | 'activity' | null;

const ALL: Array<{ key: PageKey | 'org' | 'activity'; ico: string; label: string; ket?: string }> = [
    { key: 'home', ico: '🏠', label: 'Beranda', ket: 'Ringkasan hari ini' },
    { key: 'obrolan', ico: '💬', label: 'Chat', ket: 'Ngobrol dengan tim AI' },
    { key: 'keuangan', ico: '💰', label: 'Keuangan', ket: 'Pengeluaran, anggaran, transaksi' },
    { key: 'trading', ico: '📈', label: 'Trading', ket: 'Watchlist, sinyal, peta pasar' },
    { key: 'catatan', ico: '📓', label: 'Catatan', ket: 'Buku catatan & gambar' },
    { key: 'berkas', ico: '☁️', label: 'Berkas', ket: 'Cloud pribadi 5 GB' },
    { key: 'tugas', ico: '📋', label: 'Tugas', ket: 'Pekerjaan tim' },
    { key: 'jadwal', ico: '📅', label: 'Jadwal', ket: 'Kalender & pengingat' },
    { key: 'kantor', ico: '🏢', label: 'Kantor', ket: 'Kantor 2D, bagan, aktivitas' },
    { key: 'org', ico: '🧭', label: 'Bagan' },
    { key: 'activity', ico: '⚡', label: 'Aktivitas' }
];
/** Di HP, Bagan & Aktivitas jadi menu bawah halaman Kantor, jadi tidak perlu ada di menu samping. */
const LACI = ALL.filter((i) => i.key !== 'org' && i.key !== 'activity');
const MAKS_BAWAH = 5;

export function Nav({ page, panel, onGo }: { page: PageKey; panel: SidePanel; onGo: (k: PageKey | 'org' | 'activity') => void }) {
    const tasks = useKantor((s) => s.tasks);
    const activeTasks = tasks.filter((t) => t.status === 'in_progress' || t.status === 'blocked').length;
    const sub = useSubNavState();
    const [laci, setLaci] = useState(false);
    const [kecil, setKecilS] = useState(() => { try { return localStorage.getItem('kantor:menu-kecil') === '1'; } catch { return false; } });
    const setKecil = (v: boolean) => { setKecilS(v); try { localStorage.setItem('kantor:menu-kecil', v ? '1' : '0'); } catch { /* */ } };
    useEffect(() => { document.body.classList.toggle('menu-kecil', kecil); }, [kecil]);
    const [more, setMore] = useState(false);
    const badge = (k: string) => (k === 'tugas' ? activeTasks : 0);
    const isActive = (k: string) => (k === 'org' || k === 'activity' ? page === 'kantor' && panel === k : page === k && !(k === 'kantor' && panel));

    useEffect(() => {
        // ☰: di HP membuka laci menu, di laptop memperkecil/melebarkan menu samping.
        const buka = () => { if (window.innerWidth >= 768) setKecilS((k) => { const v = !k; try { localStorage.setItem('kantor:menu-kecil', v ? '1' : '0'); } catch { /* */ } return v; }); else setLaci(true); };
        eventBus.addEventListener('buka-menu', buka);
        return () => eventBus.removeEventListener('buka-menu', buka);
    }, []);
    useEffect(() => { setMore(false); setLaci(false); }, [page]);
    useEffect(() => { document.body.classList.toggle('tanpa-subnav', !sub || sub.items.length < 2); }, [sub]);

    const N = (n: number) => (n > 9 ? '9+' : n);
    const utama = sub ? (sub.items.length <= MAKS_BAWAH ? sub.items : sub.items.slice(0, MAKS_BAWAH - 1)) : [];
    const sisa = sub && sub.items.length > MAKS_BAWAH ? sub.items.slice(MAKS_BAWAH - 1) : [];
    const subBtn = (it: { k: string; ico: string; label: string; badge?: number }) => (
        <button key={it.k} className={`dock-btn ${sub?.aktif === it.k ? 'active' : ''}`} onClick={() => { setMore(false); sub?.pilih(it.k); }}>
            <span className="ico">{it.ico}</span>
            <span className="dock-lbl">{it.label}</span>
            {!!it.badge && <span className="badge">{N(it.badge)}</span>}
        </button>
    );

    return (
        <>
            {/* Laptop: menu samping lebar (bisa diperkecil jadi ikon saja lewat ☰) */}
            <nav className={`sidebar interactive ${kecil ? 'kecil' : ''}`}>
                {LACI.map((it) => (
                    <React.Fragment key={it.key}>
                        <button className={`sb-item ${isActive(it.key) ? 'on' : ''}`} onClick={() => onGo(it.key)} title={it.label}>
                            <span className="sb-ico">{it.ico}</span>
                            <span className="sb-t"><b>{it.label}</b>{it.ket && <small>{it.ket}</small>}</span>
                            {badge(it.key) > 0 && <span className="sb-badge">{N(badge(it.key))}</span>}
                        </button>
                        {it.key === 'kantor' && page === 'kantor' && ALL.filter((x) => x.key === 'org' || x.key === 'activity').map((x) => (
                            <button key={x.key} className={`sb-item sb-anak ${isActive(x.key) ? 'on' : ''}`} onClick={() => onGo(x.key)} title={x.label}>
                                <span className="sb-ico">{x.ico}</span><span className="sb-t"><b>{x.label}</b></span>
                            </button>
                        ))}
                    </React.Fragment>
                ))}
                <span className="sb-spacer" />
                <button className="sb-item sb-kecilkan" onClick={() => setKecil(!kecil)} title={kecil ? 'Lebarkan menu' : 'Perkecil menu'}>
                    <span className="sb-ico">{kecil ? '»' : '«'}</span><span className="sb-t"><b>Perkecil menu</b></span>
                </button>
            </nav>

            {/* HP: menu bawah = bagian-bagian dari halaman yang sedang dibuka */}
            {sub && sub.items.length > 1 && (
                <nav className="dock dock-sub interactive">
                    {utama.map(subBtn)}
                    {sisa.length > 0 && (
                        <button className={`dock-btn ${more || sisa.some((i) => i.k === sub.aktif) ? 'active' : ''}`} onClick={() => setMore(!more)}>
                            <span className="ico">⋯</span>
                            <span className="dock-lbl">{sisa.some((i) => i.k === sub.aktif) ? sisa.find((i) => i.k === sub.aktif)!.label : 'Lainnya'}</span>
                            {sisa.some((i) => i.badge) && <span className="badge">{N(sisa.reduce((a, i) => a + (i.badge || 0), 0))}</span>}
                        </button>
                    )}
                </nav>
            )}
            {more && sub && (
                <div className="more-sheet interactive" onClick={() => setMore(false)}>
                    <div className="more-grid" onClick={(e) => e.stopPropagation()}>{sisa.map(subBtn)}</div>
                </div>
            )}

            {/* HP: menu samping (laci) berisi semua menu utama */}
            {laci && (
                <div className="laci interactive" onClick={() => setLaci(false)}>
                    <aside className="laci-in" onClick={(e) => e.stopPropagation()}>
                        <div className="laci-h"><b>Menu</b><button className="icon-btn" onClick={() => setLaci(false)} aria-label="Tutup menu">✕</button></div>
                        {LACI.map((it) => (
                            <button key={it.key} className={`laci-btn ${page === it.key ? 'on' : ''}`} onClick={() => { setLaci(false); onGo(it.key); }}>
                                <span className="laci-ico">{it.ico}</span>
                                <span className="laci-t"><b>{it.label}</b>{it.ket && <small>{it.ket}</small>}</span>
                                {badge(it.key) > 0 && <span className="laci-badge">{N(badge(it.key))}</span>}
                            </button>
                        ))}
                    </aside>
                </div>
            )}
        </>
    );
}
