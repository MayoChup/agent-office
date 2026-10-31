import React from 'react';
import { useKantor } from '../kantor/store';
import { Panel } from './Panel';

const ICON: Record<string, string> = {
    task: '📋', hiring: '🎉', conversation: '💬', high_risk: '⚠️', chaos: '📦', scenario: '🏢'
};

function ago(at: number) {
    const s = Math.round((Date.now() - at) / 1000);
    if (s < 60) return 'baru saja';
    if (s < 3600) return `${Math.round(s / 60)} menit lalu`;
    return `${Math.round(s / 3600)} jam lalu`;
}

export function ActivityPanel({ onClose }: { onClose: () => void }) {
    const highlights = useKantor((s) => s.highlights);
    return (
        <Panel title="⚡ Aktivitas" sub="Kejadian penting di kantor" onClose={onClose}>
            {highlights.length === 0 && <div className="empty">Belum ada kejadian. Agen akan mulai beraktivitas sebentar lagi.</div>}
            {highlights.map((h) => (
                <div key={h.id} className="feed-item">
                    <div className="feed-ico">{ICON[h.type] || '✨'}</div>
                    <div style={{ minWidth: 0 }}>
                        <div className="feed-title">{h.title}</div>
                        <div className="feed-body">{h.body}</div>
                        <div className="feed-time">{ago(h.at)}</div>
                    </div>
                </div>
            ))}
        </Panel>
    );
}
