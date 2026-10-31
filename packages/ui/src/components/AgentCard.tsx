import React from 'react';
import { useKantor, statusOf } from '../kantor/store';
import { eventBus } from '../events';
import { Avatar } from './Avatar';

export function AgentCard({ id, onClose, onOpenDivision }: { id: string; onClose: () => void; onOpenDivision: (divId: string) => void }) {
    const agent = useKantor((s) => s.agents.find((a) => a.id === id));
    const divisions = useKantor((s) => s.divisions);
    if (!agent) return null;
    const division = id === 'default' ? null : divisions.find((d) => d.memberIds.includes(id));
    const st = statusOf(agent.action);
    return (
        <div className="agent-card interactive">
            <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
                <Avatar skin={agent.skin} size={56} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <b style={{ fontSize: 16 }}>{agent.name}</b>
                        <span className="chip" style={{ ['--c' as any]: st.color }}>● {st.label}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        {agent.role}{division ? ` · ${division.icon} ${division.name}` : id === 'default' ? ' · 👑 Kepala Kantor' : ''}
                    </div>
                    {agent.currentTask && <div className="member-task">💼 {agent.currentTask}</div>}
                    {agent.thought && agent.thought !== `Mengerjakan: ${agent.currentTask}` && <div className="thought">💭 {agent.thought}</div>}
                </div>
                <button className="icon-btn" onClick={onClose} title="Tutup">✕</button>
            </div>
            <div className="member-actions" style={{ marginTop: 12 }}>
                <button className="btn small" onClick={() => eventBus.dispatchEvent(new CustomEvent('open-chat', { detail: { text: `@${agent.name} ` } }))}>💬 Sapa</button>
                <button className="btn small" onClick={() => eventBus.dispatchEvent(new CustomEvent('focus-agent', { detail: { id } }))}>📍 Ikuti</button>
                <button className="btn small" onClick={() => onOpenDivision(division ? division.id : 'default')}>🧭 Lihat {division ? 'divisi' : 'bagan'}</button>
            </div>
        </div>
    );
}
