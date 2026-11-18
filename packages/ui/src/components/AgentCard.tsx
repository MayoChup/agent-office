import React from 'react';
import { useKantor, statusOf } from '../kantor/store';
import { fullName } from '../kantor/store';
import { eventBus } from '../events';
import { Avatar } from './Avatar';

import { Ikon } from './Ikon';
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
                        <span className="who"><b style={{ fontSize: 16 }}>{agent.name}</b>{agent.title && <small className="who-role">{agent.title}</small>}</span>
                        <span className="chip" style={{ ['--c' as any]: st.color }}>● {st.label}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        {agent.role}{division ? ` · $<Ikon e={division.icon} /> ${division.name}` : id === 'default' ? ' · 👑 Kepala Kantor' : ''}
                    </div>
                    {agent.currentTask && <div className="member-task"><Ikon e="💼" /> {agent.currentTask}</div>}
                    {agent.thought && agent.thought !== `Mengerjakan: ${agent.currentTask}` && <div className="thought"><Ikon e="💭" /> {agent.thought}</div>}
                </div>
                <button className="icon-btn" onClick={onClose} title="Tutup">✕</button>
            </div>
            <div className="member-actions" style={{ marginTop: 12 }}>
                <button className="btn small" onClick={() => eventBus.dispatchEvent(new CustomEvent('open-chat', { detail: { text: `@${agent.name} ` } }))}><Ikon e="💬" /> Sapa</button>
                <button className="btn small" onClick={() => eventBus.dispatchEvent(new CustomEvent('focus-agent', { detail: { id } }))}><Ikon e="📍" /> Ikuti</button>
                <button className="btn small" onClick={() => onOpenDivision(division ? division.id : 'default')}><Ikon e="🧭" /> Lihat {division ? 'divisi' : 'bagan'}</button>
            </div>
        </div>
    );
}
