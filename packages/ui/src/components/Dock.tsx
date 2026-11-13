import React from 'react';
import { useKantor } from '../kantor/store';
import { eventBus } from '../events';

export type PanelKey = 'org' | 'tasks' | 'finance' | 'chat' | 'activity' | null;

export function Dock({ active, onSelect }: { active: PanelKey; onSelect: (k: PanelKey) => void }) {
    const unread = useKantor((s) => s.unreadChat);
    const tasks = useKantor((s) => s.tasks);
    const activeTasks = tasks.filter((t) => t.status === 'in_progress' || t.status === 'blocked').length;
    const items: Array<{ key: Exclude<PanelKey, null>; ico: string; label: string; badge?: number }> = [
        { key: 'org', ico: '🧭', label: 'Bagan' },
        { key: 'tasks', ico: '📋', label: 'Tugas', badge: activeTasks },
        { key: 'finance', ico: '💰', label: 'Keuangan' },
        { key: 'chat', ico: '💬', label: 'Obrolan', badge: unread },
        { key: 'activity', ico: '⚡', label: 'Aktivitas' }
    ];
    return (
        <div className="dock interactive">
            {items.map((it) => (
                <button key={it.key} className={`dock-btn ${active === it.key ? 'active' : ''}`} onClick={() => onSelect(active === it.key ? null : it.key)}>
                    <span className="ico">{it.ico}</span>
                    {it.label}
                    {Boolean(it.badge) && <span className="badge">{it.badge! > 9 ? '9+' : it.badge}</span>}
                </button>
            ))}
            <div className="dock-sep" />
            <button className="dock-btn" title="Lihat seluruh kantor" onClick={() => eventBus.dispatchEvent(new CustomEvent('camera-fit'))}>
                <span className="ico">🗺️</span>
                Semua
            </button>
        </div>
    );
}
