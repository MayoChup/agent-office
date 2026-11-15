import React, { useState } from 'react';
import { useKantor } from '../kantor/store';

export type PageKey = 'home' | 'kantor' | 'keuangan' | 'trading' | 'tugas' | 'jadwal' | 'obrolan';
export type SidePanel = 'org' | 'activity' | null;

const ALL: Array<{ key: PageKey | 'org' | 'activity'; ico: string; label: string }> = [
    { key: 'home', ico: '🏠', label: 'Beranda' },
    { key: 'kantor', ico: '🏢', label: 'Kantor' },
    { key: 'keuangan', ico: '💰', label: 'Keuangan' },
    { key: 'trading', ico: '📈', label: 'Trading' },
    { key: 'tugas', ico: '📋', label: 'Tugas' },
    { key: 'jadwal', ico: '📅', label: 'Jadwal' },
    { key: 'obrolan', ico: '💬', label: 'Chat' },
    { key: 'org', ico: '🧭', label: 'Bagan' },
    { key: 'activity', ico: '⚡', label: 'Aktivitas' }
];
const MOBILE_MAIN = ['home', 'obrolan', 'keuangan', 'trading'];

export function Nav({ page, panel, onGo }: { page: PageKey; panel: SidePanel; onGo: (k: PageKey | 'org' | 'activity') => void }) {
    const tasks = useKantor((s) => s.tasks);
    const activeTasks = tasks.filter((t) => t.status === 'in_progress' || t.status === 'blocked').length;
    const [more, setMore] = useState(false);
    const badge = (k: string) => (k === 'tugas' ? activeTasks : 0);
    const isActive = (k: string) => (k === 'org' || k === 'activity' ? page === 'kantor' && panel === k : page === k && !(k === 'kantor' && panel));
    const btn = (it: (typeof ALL)[number], extra = '') => (
        <button key={it.key} className={`dock-btn ${extra} ${isActive(it.key) ? 'active' : ''}`} onClick={() => { setMore(false); onGo(it.key); }}>
            <span className="ico">{it.ico}</span>
            {it.label}
            {badge(it.key) > 0 && <span className="badge">{badge(it.key) > 9 ? '9+' : badge(it.key)}</span>}
        </button>
    );
    const moreItems = ALL.filter((i) => !MOBILE_MAIN.includes(i.key));
    const moreBadge = moreItems.reduce((a, i) => a + badge(i.key), 0);
    return (
        <>
            <nav className="dock interactive">
                {ALL.map((it) => btn(it, MOBILE_MAIN.includes(it.key) ? '' : 'desk-only'))}
                <button className={`dock-btn mobile-only ${more || moreItems.some((i) => isActive(i.key)) ? 'active' : ''}`} onClick={() => setMore(!more)}>
                    <span className="ico">☰</span>
                    Lainnya
                    {moreBadge > 0 && <span className="badge">{moreBadge > 9 ? '9+' : moreBadge}</span>}
                </button>
            </nav>
            {more && (
                <div className="more-sheet interactive" onClick={() => setMore(false)}>
                    <div className="more-grid" onClick={(e) => e.stopPropagation()}>
                        {moreItems.map((it) => btn(it))}
                    </div>
                </div>
            )}
        </>
    );
}
